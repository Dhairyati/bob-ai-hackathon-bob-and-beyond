"""
Mission readiness logic — pure Python, no external dependencies.

Computes per-engine READY / AT_RISK / NOT_READY status relative to the
configured mission window (MISSION_NEXT_CYCLE, MIN_RUL_FOR_MISSION).

MISSION_NEXT_CYCLE is a fixed forward horizon in cycles (e.g. 40 = "the next
mission is 40 cycles from now"), not an absolute cycle counter.
"""
from backend.config import MISSION_NEXT_CYCLE, MIN_RUL_FOR_MISSION


def get_readiness(rul: float, confidence_std: float) -> dict:
    """
    Assess mission readiness for a single engine.

    Parameters
    ----------
    rul             : float — predicted remaining useful life (cycles)
    confidence_std  : float — ensemble standard deviation (cycles), used as
                              uncertainty margin for AT_RISK determination

    Returns
    -------
    dict with keys:
        status              : "READY" | "AT_RISK" | "NOT_READY"
        cycles_to_mission   : int  — fixed forward horizon (MISSION_NEXT_CYCLE)
        fails_before_mission: bool — rul < cycles_to_mission
    """
    cycles_to_mission = MISSION_NEXT_CYCLE          # fixed horizon, not absolute
    fails_before_mission = rul < cycles_to_mission

    if rul < MIN_RUL_FOR_MISSION or fails_before_mission:
        status = "NOT_READY"
    elif (rul - confidence_std) < cycles_to_mission:
        status = "AT_RISK"
    else:
        status = "READY"

    return {
        "status": status,
        "cycles_to_mission": cycles_to_mission,
        "fails_before_mission": bool(fails_before_mission),
    }
