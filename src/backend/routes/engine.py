"""Individual engine routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.data_simulator import get_engine_detail, simulate_what_if

class SimulateRequest(BaseModel):
    start_cycle: int
    alt_offset: float = 0.0
    mach_offset: float = 0.0
    tra_offset: float = 0.0

router = APIRouter(prefix="/api/engine", tags=["engine"])


@router.get("/{engine_id}/detail")
async def engine_detail(engine_id: str):
    """Full engine detail: sensors, cumdeg, attention, RUL history."""
    detail = get_engine_detail(engine_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Engine {engine_id} not found")
    return detail


@router.get("/{engine_id}/history")
async def engine_history(engine_id: str):
    """RUL prediction history over cycles."""
    detail = get_engine_detail(engine_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Engine {engine_id} not found")
    return {
        "engine_id": engine_id,
        "history": detail.get("rul_history", []),
    }


@router.post("/{engine_id}/simulate")
async def simulate_engine(engine_id: str, req: SimulateRequest):
    """Simulate RUL trajectory with operating condition offsets."""
    try:
        sim_history = simulate_what_if(
            engine_id=engine_id,
            start_cycle=req.start_cycle,
            alt_offset=req.alt_offset,
            mach_offset=req.mach_offset,
            tra_offset=req.tra_offset,
        )
        return {
            "engine_id": engine_id,
            "simulated_history": sim_history,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

