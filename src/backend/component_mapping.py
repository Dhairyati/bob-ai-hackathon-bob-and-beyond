"""
C-MAPSS Sensor → Engine Subsystem Mapping
==========================================
Maps each of the 21 C-MAPSS sensor columns to the physical engine subsystem
it monitors, based on Table 2 of:

    Saxena, A., Goebel, K., Simon, D., & Eklund, N. (2008).
    "Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation."
    Proceedings of the 1st International Conference on Prognostics and Health
    Management (PHM08), Denver CO, Oct 2008.

Engine architecture (five rotating modules + combustor + nozzle paths):

    Inlet → Fan → LPC → HPC → Combustor → HPT → LPT → Nozzle

Column order in the data files (after engine_id, cycle, setting_1-3):
    sensor_1  … sensor_21

Sensors marked "Unmapped" are either low-variance constants in the challenge
data (sensor_1, sensor_5, sensor_6, sensor_10, sensor_16, sensor_18, sensor_19)
or have cross-cutting measurement locations that do not cleanly resolve to one
subsystem.  We do NOT guess — those are left as "Unmapped".
"""
from __future__ import annotations

# ── Primary mapping: sensor column name → subsystem label ────────────────────
#
# Source: Table 2 in the paper above, matched to the positional ordering of
# the 21 selected output variables listed there.
#
# sensor_1  = T2   — Total temperature at fan inlet       → Fan inlet
# sensor_2  = T24  — Total temperature at LPC outlet      → LPC
# sensor_3  = T30  — Total temperature at HPC outlet      → HPC
# sensor_4  = T50  — Total temperature at LPT outlet      → LPT
# sensor_5  = P2   — Pressure at fan inlet                → (near-constant across datasets)
# sensor_6  = P15  — Total pressure in bypass-duct        → (near-constant across datasets)
# sensor_7  = P30  — Total pressure at HPC outlet         → HPC
# sensor_8  = Nf   — Physical fan speed                   → Fan
# sensor_9  = Nc   — Physical core speed                  → HPC
# sensor_10 = epr  — Engine pressure ratio (P50/P2)       → (near-constant across datasets)
# sensor_11 = Ps30 — Static pressure at HPC outlet        → HPC
# sensor_12 = phi  — Fuel flow / Ps30 ratio               → Combustor
# sensor_13 = NRf  — Corrected fan speed                  → Fan
# sensor_14 = NRc  — Corrected core speed                 → HPC
# sensor_15 = BPR  — Bypass Ratio                         → Fan
# sensor_16 = farB — Burner fuel-air ratio                → (near-constant across datasets)
# sensor_17 = htBleed — Bleed Enthalpy                    → HPC
# sensor_18 = Nf_dmd  — Demanded fan speed                → (near-constant across datasets)
# sensor_19 = PCNfR_dmd — Demanded corrected fan speed    → (near-constant across datasets)
# sensor_20 = W31  — HPT coolant bleed                    → HPT
# sensor_21 = W32  — LPT coolant bleed                    → LPT

SENSOR_COMPONENT_MAP: dict[str, str] = {
    "sensor_1":  "Unmapped",     # T2  — fan inlet temperature (near-constant)
    "sensor_2":  "LPC",          # T24 — LPC outlet temperature
    "sensor_3":  "HPC",          # T30 — HPC outlet temperature
    "sensor_4":  "LPT",          # T50 — LPT outlet temperature
    "sensor_5":  "Unmapped",     # P2  — fan inlet pressure (near-constant)
    "sensor_6":  "Unmapped",     # P15 — bypass duct pressure (near-constant)
    "sensor_7":  "HPC",          # P30 — HPC outlet pressure
    "sensor_8":  "Fan",          # Nf  — physical fan speed
    "sensor_9":  "HPC",          # Nc  — physical core (HPC shaft) speed
    "sensor_10": "Unmapped",     # epr — engine pressure ratio (near-constant)
    "sensor_11": "HPC",          # Ps30 — HPC outlet static pressure
    "sensor_12": "Combustor",    # phi — fuel flow / Ps30 (combustion loading)
    "sensor_13": "Fan",          # NRf — corrected fan speed
    "sensor_14": "HPC",          # NRc — corrected core speed
    "sensor_15": "Fan",          # BPR — bypass ratio
    "sensor_16": "Unmapped",     # farB — burner fuel-air ratio (near-constant)
    "sensor_17": "HPC",          # htBleed — HPC bleed enthalpy
    "sensor_18": "Unmapped",     # Nf_dmd — demanded fan speed (near-constant)
    "sensor_19": "Unmapped",     # PCNfR_dmd — demanded corrected fan speed (near-constant)
    "sensor_20": "HPT",          # W31 — HPT coolant bleed flow
    "sensor_21": "LPT",          # W32 — LPT coolant bleed flow
}

# ── Inverse mapping: subsystem → list of sensor column names ─────────────────

def _build_inverse(mapping: dict[str, str]) -> dict[str, list[str]]:
    inv: dict[str, list[str]] = {}
    for sensor, component in mapping.items():
        inv.setdefault(component, []).append(sensor)
    return inv


COMPONENT_SENSORS: dict[str, list[str]] = _build_inverse(SENSOR_COMPONENT_MAP)

# ── Helper ────────────────────────────────────────────────────────────────────

def get_component(sensor_name: str) -> str:
    """
    Return the subsystem label for *sensor_name*, or ``"Unmapped"`` if unknown.

    >>> get_component("sensor_3")
    'HPC'
    >>> get_component("sensor_5")
    'Unmapped'
    >>> get_component("sensor_99")
    'Unmapped'
    """
    return SENSOR_COMPONENT_MAP.get(sensor_name, "Unmapped")


def label_sensor(sensor_name: str) -> str:
    """
    Return a human-readable label combining the raw sensor ID and its
    subsystem name, e.g. ``"sensor_3 (HPC)"`` or ``"sensor_5"``.

    Unmapped sensors are returned as-is (no parenthetical annotation)
    to keep the UI clean.

    >>> label_sensor("sensor_3")
    'sensor_3 (HPC)'
    >>> label_sensor("sensor_5")
    'sensor_5'
    """
    component = SENSOR_COMPONENT_MAP.get(sensor_name, "Unmapped")
    if component == "Unmapped":
        return sensor_name
    return f"{sensor_name} ({component})"
