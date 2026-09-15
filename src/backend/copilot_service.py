"""
Copilot service — deterministic, template-based natural-language generation.

No LLM, no external API calls, no network access.
All output is composed from formatted string templates using the ML model's
own outputs (RUL, health probabilities, sensor degradation, readiness) plus
optional service-history and component-mapping context provided by the caller.
"""
from __future__ import annotations


def generate_explanation(
    engine_id: str,
    rul: float,
    health_probs: list,
    top_sensors: list[str],
    readiness: dict,
    cycles_since_last_service: int | None = None,
    last_service_type: str | None = None,
    at_risk_components: list[str] | None = None,
) -> str:
    """
    Compose a natural-language readiness explanation for a single engine.

    Parameters
    ----------
    engine_id                : str   — engine identifier
    rul                      : float — predicted RUL (cycles)
    health_probs             : list  — [P(Healthy), P(Warning), P(Critical)]
    top_sensors              : list  — up to 3 sensor names with highest
                                       degradation magnitude; each may be a
                                       plain sensor name (``"sensor_3"``) or an
                                       annotated label (``"sensor_3 (HPC)"``).
    readiness                : dict  — output of mission.get_readiness()
    cycles_since_last_service: int | None
                                       Cycles elapsed since the most recent
                                       service record.  Omitted when no history
                                       is available.
    last_service_type        : str | None
                                       Type label of that most recent service
                                       event (e.g. "Hot Section Inspection").
    at_risk_components       : list[str] | None
                                       Deduplicated subsystem names derived from
                                       the top degraded sensors.  Omitted when
                                       all top sensors are unmapped.

    Returns
    -------
    str — human-readable explanation paragraph
    """
    status = readiness["status"]
    cycles_to_mission = readiness["cycles_to_mission"]
    fails_before_mission = readiness["fails_before_mission"]

    # Health label derived from probabilities (index 0=Healthy, 1=Warning, 2=Critical)
    health_labels = ["Healthy", "Warning", "Critical"]
    health_idx = int(max(range(len(health_probs)), key=lambda i: health_probs[i]))
    health_label = health_labels[health_idx] if health_idx < len(health_labels) else "Unknown"
    health_pct = health_probs[health_idx] * 100 if health_probs else 0.0

    # Sensor/component list text
    # Prefer component names if available; fall back to raw sensor IDs
    if at_risk_components:
        degradation_text = ", ".join(at_risk_components[:3])
    elif top_sensors:
        degradation_text = ", ".join(top_sensors[:3])
    else:
        degradation_text = "no dominant sensors identified"

    # Mission window sentence
    if fails_before_mission:
        mission_sentence = (
            f"This engine is projected to reach end-of-life in {rul:.0f} cycles, "
            f"which is before the next mission window ({cycles_to_mission} cycles away) — "
            f"immediate action is required."
        )
    elif cycles_to_mission <= 0:
        mission_sentence = (
            f"The mission window has already been reached; "
            f"the engine has {rul:.0f} cycles of predicted life remaining."
        )
    else:
        margin = rul - cycles_to_mission
        mission_sentence = (
            f"The engine is expected to survive the next mission window "
            f"({cycles_to_mission} cycles away) with a margin of approximately "
            f"{margin:.0f} cycles."
        )

    # Optional service-history sentence (appended only when data is available)
    if cycles_since_last_service is not None and last_service_type:
        service_sentence = (
            f" Last serviced {cycles_since_last_service} cycles ago "
            f"({last_service_type})."
        )
    elif cycles_since_last_service is not None:
        service_sentence = f" Last serviced {cycles_since_last_service} cycles ago."
    else:
        service_sentence = ""

    explanation = (
        f"Engine {engine_id} is classified {status}. "
        f"Predicted remaining useful life is {rul:.0f} cycles "
        f"(health state: {health_label}, {health_pct:.0f}% confidence), "
        f"with degradation concentrated in {degradation_text}. "
        f"{mission_sentence}"
        f"{service_sentence}"
    )
    return explanation
