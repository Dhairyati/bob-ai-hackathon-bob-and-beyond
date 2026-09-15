"""
Service Records Seeder
======================
Generates synthetic (but plausible) historical maintenance records for the
fleet and inserts them into the ``service_records`` MongoDB collection on
first startup.

Design notes
------------
* One record per service event; each engine gets 1–4 records.
* Engine IDs are drawn from the running fleet so foreign-key integrity holds
  even without a hard constraint.
* Dates are synthetic — generated backwards from a fixed reference so the
  records are temporally consistent (most-recent record ≤ today).
* ``cycle_at_service`` is derived from the engine's current cycle count so
  it is always ≤ current_cycle.
* Component names must stay in sync with ``backend/component_mapping.py``
  (COMPONENT_SENSORS keys).
* UUIDs are derived from the seeded RNG so records are fully deterministic
  (same fleet → same IDs every cold-start).
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

# ── Constants ────────────────────────────────────────────────────────────────

# All physical subsystems present in C-MAPSS (matches component_mapping.py)
_COMPONENTS = ["Fan", "LPC", "HPC", "HPT", "LPT", "Combustor", "Nozzle"]

# Service types with associated typical component sets
_SERVICE_PROFILES: list[dict] = [
    {
        "type": "Hot Section Inspection",
        "components": ["HPT", "LPT", "Combustor"],
        "note_templates": [
            "Hot section inspection completed. Turbine blades within tolerance.",
            "HPT blade tip clearances checked. Minor erosion noted — within limits.",
            "Combustor liner inspected. No cracks detected.",
            "LPT stage 1 vanes replaced due to oxidation.",
        ],
    },
    {
        "type": "Compressor Wash",
        "components": ["Fan", "LPC", "HPC"],
        "note_templates": [
            "Online water wash performed. Core recovered ~0.3% efficiency.",
            "Offline compressor wash. Fan and HPC stages cleaned.",
            "Compressor wash cycle completed. No FOD found.",
        ],
    },
    {
        "type": "Borescope Inspection",
        "components": ["HPC", "HPT", "Combustor"],
        "note_templates": [
            "Borescope inspection of HPC stages 1–9. No anomalies.",
            "Combustion liner borescoped. Minor scoring — acceptable.",
            "HPT shroud wear within serviceable limits.",
            "Borescope inspection completed. Deferred next inspection to 600 cycles.",
        ],
    },
    {
        "type": "Fan Blade Replacement",
        "components": ["Fan"],
        "note_templates": [
            "Fan blade set replaced due to FOD damage.",
            "Blade replacement following birdstrike event. All blades balanced.",
            "Scheduled fan blade swap — life-limit reached.",
        ],
    },
    {
        "type": "Low-Pressure Turbine Overhaul",
        "components": ["LPT", "Nozzle"],
        "note_templates": [
            "LPT fully overhauled. Stage 2 and 3 blades replaced.",
            "LPT nozzle guide vanes replaced. Clearances set to new limits.",
            "LPT overhaul per OEM schedule. Work scope: complete disassembly.",
        ],
    },
    {
        "type": "Full Engine Overhaul",
        "components": ["Fan", "LPC", "HPC", "HPT", "LPT", "Combustor", "Nozzle"],
        "note_templates": [
            "Full shop overhaul completed. Engine returned to new limits.",
            "Major overhaul — life-limited parts replaced. Engine zero-timed.",
            "Overhaul scope expanded due to HPC stage 5 damage found on disassembly.",
        ],
    },
    {
        "type": "Unscheduled Removal",
        "components": ["HPC", "HPT"],
        "note_templates": [
            "Unscheduled removal due to high EGT margin. HPC inspected.",
            "Engine removed following vibration exceedance. Bearing replaced.",
            "Unscheduled: oil contamination found. Internal inspection completed.",
        ],
    },
]

# Reference date — all synthetic records are before this date
_REFERENCE_DATE = datetime(2024, 11, 1)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_service_records(engine_ids: list[int], engine_cycles: dict[int, int]) -> list[dict]:
    """
    Generate synthetic service history for each engine in *engine_ids*.

    Parameters
    ----------
    engine_ids    : list of integer engine IDs currently in the fleet
    engine_cycles : mapping engine_id → current cycle count

    Returns
    -------
    List of record dicts ready for MongoDB insertion.
    Each record has the shape::

        {
            "id":                  str (UUID4),
            "engine_id":           int,
            "date":                datetime,
            "type":                str,
            "components_serviced": list[str],
            "technician_notes":    str,
            "cycle_at_service":    int,
        }
    """
    rng = random.Random(42)  # deterministic seed — same records every cold-start
    records: list[dict] = []

    for engine_id in engine_ids:
        current_cycle = engine_cycles.get(engine_id, 100)
        num_records = rng.randint(1, 4)

        # Generate service events spread over the engine's life
        service_cycles = sorted(
            rng.randint(max(1, current_cycle // (num_records + 1) * i),
                        max(1, current_cycle // (num_records + 1) * (i + 1)))
            for i in range(1, num_records + 1)
        )

        # Assign a rough calendar date (working backwards from reference)
        # Each cycle ≈ 1 flight hour ≈ 1 calendar day on average
        for cycle in service_cycles:
            days_ago = (current_cycle - cycle) + rng.randint(0, 10)
            service_date = _REFERENCE_DATE - timedelta(days=days_ago)

            profile = rng.choice(_SERVICE_PROFILES)
            note = rng.choice(profile["note_templates"])

            records.append({
                "id": str(uuid.uuid4()),
                "engine_id": engine_id,
                "date": service_date,
                "type": profile["type"],
                "components_serviced": profile["components"],
                "technician_notes": note,
                "cycle_at_service": cycle,
            })

    return records


def seed_service_records(db, collection_name: str, engine_ids: list[int], engine_cycles: dict[int, int]) -> int:
    """
    Insert synthetic service records into *collection_name* if it is empty.

    Returns the number of records inserted (0 if collection was already seeded).
    """
    col = db[collection_name]
    if col.count_documents({}) > 0:
        return 0  # Already seeded — idempotent

    records = generate_service_records(engine_ids, engine_cycles)
    if records:
        col.insert_many(records)
    return len(records)
