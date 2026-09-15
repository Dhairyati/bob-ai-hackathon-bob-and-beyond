"""Copilot routes — mission readiness, per-engine explanation, maintenance plan."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.mission import get_readiness
from backend.copilot_service import generate_explanation
from backend.data_simulator import get_fleet_status, get_engine_detail
from backend.component_mapping import get_component, label_sensor

router = APIRouter(prefix="/api/copilot", tags=["copilot"])


# ── Internal helpers ──────────────────────────────────────────────────────────

def _top_sensors_from_detail(detail: dict) -> list[str]:
    """
    Return the top 3 sensor names ordered by the magnitude of their final
    cumulative-degradation value.  Falls back to attention weights if cumdeg
    is unavailable, then to an empty list.
    """
    cumdeg = detail.get("cumdeg_data") or {}
    if cumdeg:
        # Each entry is a list of values; take the absolute of the last value
        scored = []
        for sensor, values in cumdeg.items():
            if values:
                scored.append((sensor, abs(values[-1])))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [s for s, _ in scored[:3]]

    # Fallback: use attention weights (high weight = important timestep, not sensor,
    # so we cannot directly label sensors this way — return empty in that case)
    return []


def _annotate_sensors(top_sensors: list[str]) -> tuple[list[str], list[str]]:
    """
    Given a list of raw sensor names, return:
    - annotated_sensors : list of ``"sensor_N (Component)"`` labels (or plain
                          ``"sensor_N"`` for unmapped sensors)
    - at_risk_components: deduplicated list of mapped component names,
                          preserving the order of first appearance.
                          Empty if all sensors are unmapped.
    """
    annotated: list[str] = []
    components_seen: list[str] = []
    for s in top_sensors:
        label = label_sensor(s)
        annotated.append(label)
        comp = get_component(s)
        if comp != "Unmapped" and comp not in components_seen:
            components_seen.append(comp)
    return annotated, components_seen


def _get_service_context(engine_id: str, current_cycle: int) -> tuple[int | None, str | None]:
    """
    Look up the most recent service record for *engine_id* and return
    ``(cycles_since_last_service, last_service_type)``.

    Returns ``(None, None)`` if:
    - No service records exist for this engine, or
    - MongoDB is unavailable (degrades gracefully).
    """
    try:
        from backend.config import MONGODB_COLLECTION_SERVICE_RECORDS
        from backend.database import get_collection

        try:
            eid = int(engine_id)
        except (ValueError, TypeError):
            eid = engine_id

        col = get_collection(MONGODB_COLLECTION_SERVICE_RECORDS)
        latest = col.find_one(
            {"engine_id": eid},
            {"_id": 0, "cycle_at_service": 1, "type": 1},
            sort=[("cycle_at_service", -1)],
        )
        if latest is None:
            return None, None

        cycles_since = max(0, current_cycle - int(latest["cycle_at_service"]))
        return cycles_since, latest.get("type")
    except Exception:  # noqa: BLE001
        return None, None


# ── /api/copilot/readiness ────────────────────────────────────────────────────

@router.get("/readiness")
async def fleet_readiness():
    """
    Mission readiness assessment for every engine in the fleet.
    Returns a fleet summary and per-engine readiness records.
    """
    fleet = get_fleet_status()
    engines_raw = fleet.get("engines", [])

    results = []
    counts = {"ready": 0, "at_risk": 0, "not_ready": 0}

    for eng in engines_raw:
        current_cycle = int(eng.get("cycles", 0))
        rul = float(eng.get("rul", 0))
        confidence_std = float(eng.get("confidence_std", 0))

        readiness = get_readiness(
            rul=rul,
            confidence_std=confidence_std,
        )

        if readiness["status"] == "READY":
            counts["ready"] += 1
        elif readiness["status"] == "AT_RISK":
            counts["at_risk"] += 1
        else:
            counts["not_ready"] += 1

        results.append({
            "engine_id": eng["engine_id"],
            "status": readiness["status"],
            "cycles_to_mission": readiness["cycles_to_mission"],
            "fails_before_mission": readiness["fails_before_mission"],
            "rul": rul,
            "current_cycle": current_cycle,
            "health_status": eng.get("health_status", "Unknown"),
            "confidence_std": confidence_std,
        })

    total = len(results)
    ready_pct = round((counts["ready"] / total * 100) if total > 0 else 0.0, 1)

    return {
        "fleet_summary": {
            "total": total,
            "ready": counts["ready"],
            "at_risk": counts["at_risk"],
            "not_ready": counts["not_ready"],
            "ready_pct": ready_pct,
        },
        "engines": results,
    }


# ── /api/copilot/explain/{engine_id} ─────────────────────────────────────────

@router.get("/explain/{engine_id}")
async def explain_engine(engine_id: str):
    """
    Natural-language readiness explanation for a single engine.
    Uses the same detail record as /api/engine/{id}/detail.
    Enriched with service-history context and sensor→component annotations.
    """
    detail = get_engine_detail(engine_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Engine {engine_id} not found")

    current_cycle = int(detail.get("cycles", 0))
    rul = float(detail.get("rul", 0))
    confidence_std = float(detail.get("confidence_std", 0))
    health_probs = detail.get("health_probs", [0.0, 0.0, 0.0])

    readiness = get_readiness(
        rul=rul,
        confidence_std=confidence_std,
    )

    # Sensor degradation + component annotation
    raw_top_sensors = _top_sensors_from_detail(detail)
    annotated_sensors, at_risk_components = _annotate_sensors(raw_top_sensors)

    # Service history context (optional — degrades to None/None if unavailable)
    cycles_since_last_service, last_service_type = _get_service_context(engine_id, current_cycle)

    explanation = generate_explanation(
        engine_id=engine_id,
        rul=rul,
        health_probs=health_probs,
        top_sensors=annotated_sensors,
        readiness=readiness,
        cycles_since_last_service=cycles_since_last_service,
        last_service_type=last_service_type,
        at_risk_components=at_risk_components if at_risk_components else None,
    )

    return {
        "engine_id": engine_id,
        "explanation": explanation,
        "readiness": readiness,
        "top_sensors": annotated_sensors,     # annotated: "sensor_3 (HPC)"
        "at_risk_components": at_risk_components,
        "cycles_since_last_service": cycles_since_last_service,
        "last_service_type": last_service_type,
    }


# ── /api/copilot/maintenance-plan ─────────────────────────────────────────────

@router.get("/maintenance-plan")
async def maintenance_plan():
    """
    Prioritised maintenance plan for all non-READY engines.
    Ranked by urgency = (cycles_to_mission - rul); most negative (overdue) first.
    """
    fleet = get_fleet_status()
    engines_raw = fleet.get("engines", [])

    candidates = []
    for eng in engines_raw:
        current_cycle = int(eng.get("cycles", 0))
        rul = float(eng.get("rul", 0))
        confidence_std = float(eng.get("confidence_std", 0))
        health_probs = eng.get("health_probs", [0.0, 0.0, 0.0])

        readiness = get_readiness(
            rul=rul,
            confidence_std=confidence_std,
        )

        if readiness["status"] == "READY":
            continue

        # Urgency: positive means mission comes after failure (most urgent)
        urgency_score = round(readiness["cycles_to_mission"] - rul, 1)

        # Recommended action
        if readiness["status"] == "NOT_READY" and readiness["fails_before_mission"]:
            recommended_action = "Immediate Overhaul"
        elif readiness["status"] == "NOT_READY":
            recommended_action = "Priority Inspection"
        else:  # AT_RISK
            recommended_action = "Schedule Inspection"

        # Service context for maintenance plan entries
        cycles_since_last_service, last_service_type = _get_service_context(
            str(eng["engine_id"]), current_cycle
        )

        # Short explanation (no cumdeg lookup needed here — keep it light)
        explanation = generate_explanation(
            engine_id=eng["engine_id"],
            rul=rul,
            health_probs=health_probs,
            top_sensors=[],
            readiness=readiness,
            cycles_since_last_service=cycles_since_last_service,
            last_service_type=last_service_type,
        )

        candidates.append({
            "engine_id": eng["engine_id"],
            "status": readiness["status"],
            "urgency_score": urgency_score,
            "recommended_action": recommended_action,
            "explanation": explanation,
            "rul": rul,
            "cycles_to_mission": readiness["cycles_to_mission"],
            "fails_before_mission": readiness["fails_before_mission"],
            "health_status": eng.get("health_status", "Unknown"),
            "cycles_since_last_service": cycles_since_last_service,
            "last_service_type": last_service_type,
        })

    # Sort: most urgent (highest urgency_score) first
    candidates.sort(key=lambda x: x["urgency_score"], reverse=True)

    # Add rank
    plan = []
    for rank, item in enumerate(candidates, start=1):
        plan.append({"rank": rank, **item})

    return plan
