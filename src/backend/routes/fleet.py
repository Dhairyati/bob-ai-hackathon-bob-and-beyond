"""Fleet overview and timeline routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.data_simulator import (
    get_fleet_status, get_analytics, get_timeline,
    schedule_maintenance, delete_maintenance, load_fleet_data,
)

router = APIRouter(prefix="/api/fleet", tags=["fleet"])


class ScheduleRequest(BaseModel):
    engine_id: str
    start_cycle: int
    end_cycle: int
    type: str = "Inspection"
    notes: str = ""


@router.get("/status")
async def fleet_status():
    """Fleet overview: summary counts + all engine cards."""
    return get_fleet_status()


@router.get("/analytics")
async def fleet_analytics():
    """Aggregated analytics: RUL distribution, health breakdown, dataset stats."""
    return get_analytics()


@router.get("/timeline")
async def fleet_timeline():
    """Timeline data for the Gantt chart: engines with lifecycle + maintenance blocks."""
    return get_timeline()


@router.post("/schedule")
async def create_schedule(req: ScheduleRequest):
    """Schedule a maintenance block for an engine."""
    try:
        block = schedule_maintenance(
            engine_id=req.engine_id,
            start_cycle=req.start_cycle,
            end_cycle=req.end_cycle,
            mtype=req.type,
            notes=req.notes,
        )
        return block
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/schedule/{block_id}")
async def remove_schedule(block_id: int):
    """Remove a scheduled maintenance block."""
    success = delete_maintenance(block_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Maintenance block {block_id} not found")
    return {"deleted": True}


@router.post("/rebuild-cache")
async def rebuild_cache():
    """Force recompute predictions and rebuild the disk cache."""
    try:
        load_fleet_data(force_rebuild=True)
        return {"status": "ok", "engines": len(get_fleet_status()["engines"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
