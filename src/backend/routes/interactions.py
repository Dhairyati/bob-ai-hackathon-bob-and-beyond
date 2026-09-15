"""Interactive user features: watchlist, notes, custom alerts, bulk operations, export."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from backend.data_simulator import (
    engine_details, fleet_data, alerts,
    get_watchlist, toggle_watchlist, get_engine_notes, add_engine_note,
    delete_engine_note, create_custom_alert, bulk_acknowledge_alerts,
    get_fleet_export,
)

router = APIRouter(prefix="/api", tags=["interactions"])


# ── Watchlist ──────────────────────────────────────────────────────────

@router.get("/watchlist")
async def list_watchlist():
    """Get the set of watched engine IDs."""
    return {"watched": list(get_watchlist())}


@router.post("/watchlist/{engine_id}")
async def toggle_watch(engine_id: str):
    """Toggle watchlist status for an engine."""
    is_watched = toggle_watchlist(engine_id)
    return {"engine_id": engine_id, "watched": is_watched}


# ── Engine Notes ───────────────────────────────────────────────────────

class NoteRequest(BaseModel):
    text: str


@router.get("/engine/{engine_id}/notes")
async def list_notes(engine_id: str):
    """Get all notes for an engine."""
    return get_engine_notes(engine_id)


@router.post("/engine/{engine_id}/notes")
async def post_note(engine_id: str, req: NoteRequest):
    """Add a note to an engine."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")
    note = add_engine_note(engine_id, req.text.strip())
    return note


@router.delete("/engine/{engine_id}/notes/{note_id}")
async def remove_note(engine_id: str, note_id: int):
    """Delete a note."""
    success = delete_engine_note(engine_id, note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"deleted": True}


# ── Custom Alert Creation ──────────────────────────────────────────────

class CustomAlertRequest(BaseModel):
    engine_id: str
    severity: str  # critical, warning, info
    message: str


@router.post("/alerts/create")
async def create_alert(req: CustomAlertRequest):
    """Create a custom user alert."""
    if req.severity not in ("critical", "warning", "info"):
        raise HTTPException(status_code=400, detail="Severity must be critical, warning, or info")
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    alert = create_custom_alert(req.engine_id, req.severity, req.message.strip())
    return alert


# ── Bulk Alert Acknowledge ─────────────────────────────────────────────

class BulkAckRequest(BaseModel):
    alert_ids: list[int]


@router.post("/alerts/bulk-acknowledge")
async def bulk_ack(req: BulkAckRequest):
    """Acknowledge multiple alerts at once."""
    count = bulk_acknowledge_alerts(req.alert_ids)
    return {"acknowledged": count}


# ── Fleet Export ───────────────────────────────────────────────────────

@router.get("/fleet/export")
async def export_fleet():
    """Export fleet data as JSON (for CSV generation on frontend)."""
    return get_fleet_export()
