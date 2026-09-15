"""
Service Records route — GET /api/engine/{engine_id}/service-history
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.config import MONGODB_COLLECTION_SERVICE_RECORDS
from backend.database import get_collection

router = APIRouter(prefix="/api/engine", tags=["service-records"])


@router.get("/{engine_id}/service-history")
async def get_service_history(engine_id: str):
    """
    Return the maintenance service history for a single engine.

    Records are sorted by cycle_at_service descending (most recent first).

    Response shape::

        [
            {
                "id":                  "uuid4-string",
                "engine_id":           42,
                "date":                "2024-08-15T00:00:00",
                "type":                "Hot Section Inspection",
                "components_serviced": ["HPT", "LPT", "Combustor"],
                "technician_notes":    "HPT blade tip clearances checked...",
                "cycle_at_service":    310
            },
            ...
        ]

    Returns an empty list (not 404) when the engine exists but has no service history.
    Returns 404 only when *engine_id* does not correspond to any known fleet engine.
    """
    # Validate engine exists in the fleet
    try:
        from backend.data_simulator import get_engine_detail
        detail = get_engine_detail(engine_id)
    except Exception:  # noqa: BLE001
        detail = None

    if detail is None:
        raise HTTPException(status_code=404, detail=f"Engine {engine_id} not found")

    # Resolve engine_id to int where possible (fleet engines are integers)
    try:
        eid_query = int(engine_id)
    except (ValueError, TypeError):
        eid_query = engine_id  # uploaded engines may have string IDs

    col = get_collection(MONGODB_COLLECTION_SERVICE_RECORDS)
    cursor = col.find(
        {"engine_id": eid_query},
        {"_id": 0},  # exclude Mongo internal _id
    ).sort("cycle_at_service", -1)

    records = []
    for doc in cursor:
        # Serialise datetime to ISO string for JSON transport
        if "date" in doc and hasattr(doc["date"], "isoformat"):
            doc = {**doc, "date": doc["date"].isoformat()}
        records.append(doc)

    return records
