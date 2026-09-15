#!/usr/bin/env python
"""
RUL Dashboard MCP Server
========================
A minimal stdio MCP server that wraps the three RUL Dashboard copilot HTTP
endpoints as four MCP tools.  It is a thin HTTP relay only — no backend logic
is reimplemented here.

Prerequisites
-------------
The FastAPI backend must already be running (default http://localhost:8000).
Start it with:

    .venv/Scripts/python -m uvicorn backend.main:app --port 8000

Environment variables
---------------------
BACKEND_URL   Base URL of the FastAPI server.  Default: http://localhost:8000
"""
import asyncio
import json
import os

import httpx
from mcp.server.mcpserver import MCPServer

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BACKEND_URL: str = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")

# ---------------------------------------------------------------------------
# MCP server instance
# ---------------------------------------------------------------------------
mcp = MCPServer(
    name="rul-dashboard-copilot",
    version="1.0.0",
)


# ---------------------------------------------------------------------------
# Shared HTTP helper
# ---------------------------------------------------------------------------
async def _get(path: str) -> str:
    """
    Perform a GET request to the FastAPI backend.

    Returns a JSON string on success.  On any connection or HTTP error,
    returns a human-readable error string (never raises).
    """
    url = f"{BACKEND_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)
    except httpx.ConnectError:
        return (
            f"ERROR: Could not connect to backend at {BACKEND_URL}. "
            "Make sure the FastAPI server is running before calling this tool."
        )
    except httpx.TimeoutException:
        return f"ERROR: Request to {url} timed out after 30 s."
    except httpx.HTTPStatusError as exc:
        # Surface the API's own error message when available
        try:
            detail = exc.response.json().get("detail", exc.response.text)
        except Exception:
            detail = exc.response.text
        return f"ERROR {exc.response.status_code}: {detail}"
    except Exception as exc:  # noqa: BLE001
        return f"ERROR: Unexpected error calling {url}: {exc}"


# httpx async client cannot be used synchronously from a sync context.
# MCPServer.tool() supports async handlers natively, so we keep everything async.

# ---------------------------------------------------------------------------
# Tool 1 — get_fleet_readiness
# ---------------------------------------------------------------------------
@mcp.tool(
    description=(
        "Return the mission-readiness assessment for the entire engine fleet. "
        "Includes a fleet_summary (total, ready, at_risk, not_ready, ready_pct) "
        "and a per-engine list with status, RUL, cycles_to_mission, and "
        "fails_before_mission flag."
    )
)
async def get_fleet_readiness() -> str:
    """Call GET /api/copilot/readiness and return the full response."""
    return await _get("/api/copilot/readiness")


# ---------------------------------------------------------------------------
# Tool 2 — get_engine_readiness
# ---------------------------------------------------------------------------
@mcp.tool(
    description=(
        "Return the mission-readiness status for a single engine. "
        "Includes status (READY / AT_RISK / NOT_READY), cycles_to_mission, "
        "and fails_before_mission."
    )
)
async def get_engine_readiness(engine_id: int) -> str:
    """
    Call GET /api/copilot/explain/{engine_id} and return the readiness portion.

    Args:
        engine_id: Numeric engine ID (e.g. 1, 42).
    """
    raw = await _get(f"/api/copilot/explain/{engine_id}")
    if raw.startswith("ERROR"):
        return raw
    try:
        data = json.loads(raw)
        return json.dumps(
            {
                "engine_id": data.get("engine_id"),
                "readiness": data.get("readiness"),
            },
            indent=2,
        )
    except Exception as exc:  # noqa: BLE001
        return f"ERROR: Could not parse response: {exc}"


# ---------------------------------------------------------------------------
# Tool 3 — explain_engine
# ---------------------------------------------------------------------------
@mcp.tool(
    description=(
        "Return a natural-language readiness explanation for a single engine, "
        "together with the top degraded sensors identified by the model."
    )
)
async def explain_engine(engine_id: int) -> str:
    """
    Call GET /api/copilot/explain/{engine_id} and return the explanation text
    and top_sensors list.

    Args:
        engine_id: Numeric engine ID (e.g. 1, 42).
    """
    raw = await _get(f"/api/copilot/explain/{engine_id}")
    if raw.startswith("ERROR"):
        return raw
    try:
        data = json.loads(raw)
        return json.dumps(
            {
                "engine_id": data.get("engine_id"),
                "explanation": data.get("explanation"),
                "top_sensors": data.get("top_sensors"),
            },
            indent=2,
        )
    except Exception as exc:  # noqa: BLE001
        return f"ERROR: Could not parse response: {exc}"


# ---------------------------------------------------------------------------
# Tool 4 — get_maintenance_plan
# ---------------------------------------------------------------------------
@mcp.tool(
    description=(
        "Return the prioritised maintenance plan for all non-ready engines, "
        "ranked by urgency (most critical first). "
        "Each entry includes rank, engine_id, status, recommended_action "
        "(Immediate Overhaul / Priority Inspection / Schedule Inspection), "
        "urgency_score, and a plain-language explanation."
    )
)
async def get_maintenance_plan() -> str:
    """Call GET /api/copilot/maintenance-plan and return the ranked list."""
    return await _get("/api/copilot/maintenance-plan")


# ---------------------------------------------------------------------------
# Tool 5 — get_service_history
# ---------------------------------------------------------------------------
@mcp.tool(
    description=(
        "Return the maintenance service history for a single engine. "
        "Records are sorted most-recent-first and include the service date, "
        "type (e.g. 'Hot Section Inspection'), components serviced, "
        "technician notes, and the cycle count at the time of service."
    )
)
async def get_service_history(engine_id: int) -> str:
    """
    Call GET /api/engine/{engine_id}/service-history and return the records.

    Args:
        engine_id: Numeric engine ID (e.g. 1, 42).
    """
    return await _get(f"/api/engine/{engine_id}/service-history")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    asyncio.run(mcp.run_stdio_async())
