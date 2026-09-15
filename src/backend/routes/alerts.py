"""Alert management routes."""
from fastapi import APIRouter, HTTPException
from typing import Optional
from backend.data_simulator import get_alerts, acknowledge_alert

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(severity: Optional[str] = None, acknowledged: Optional[bool] = None):
    """List alerts, optionally filtered by severity and/or acknowledged status."""
    return get_alerts(severity=severity, acknowledged=acknowledged)


@router.post("/{alert_id}/acknowledge")
async def ack_alert(alert_id: int):
    """Mark an alert as acknowledged."""
    success = acknowledge_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    return {"status": "acknowledged", "alert_id": alert_id}
