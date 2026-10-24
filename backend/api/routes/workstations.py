from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from api.dependencies import get_db
from db.models import Workstation, WorkstationSession, PresenceInterval, Person
from db.crud import (
    get_or_create_default_workstation,
    get_all_workstations,
    get_workstation,
    get_daily_presence_intervals,
    calculate_total_active_seconds_today,
    close_presence_interval,
    recalculate_session_active_seconds,
    log_audit_event,
)
from api.camera_manager import workstation_manager

router = APIRouter(prefix="/workstations", tags=["workstations"])


class WorkstationCreate(BaseModel):
    code: str
    name: str
    camera_source: Optional[str] = "0"
    roi_x1: Optional[float] = 0.0
    roi_y1: Optional[float] = 0.0
    roi_x2: Optional[float] = 1.0
    roi_y2: Optional[float] = 1.0
    absence_grace_seconds: Optional[int] = 60


class WorkstationUpdate(BaseModel):
    name: Optional[str] = None
    camera_source: Optional[str] = None
    roi_x1: Optional[float] = None
    roi_y1: Optional[float] = None
    roi_x2: Optional[float] = None
    roi_y2: Optional[float] = None
    absence_grace_seconds: Optional[int] = None


class StartSessionRequest(BaseModel):
    employee_id: str
    operator: str = "supervisor"


class ManualIntervalCorrection(BaseModel):
    interval_id: int
    duration_seconds: float
    notes: str
    operator: str = "supervisor"


@router.get("")
def list_workstations(db: Session = Depends(get_db)):
    # Ensure default workstation exists
    get_or_create_default_workstation(db)
    return get_all_workstations(db)


@router.get("/{id}")
def get_workstation_by_id(id: int, db: Session = Depends(get_db)):
    ws = get_workstation(db, id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workstation not found")
    return ws


@router.post("")
def create_workstation(data: WorkstationCreate, db: Session = Depends(get_db)):
    existing = db.query(Workstation).filter(Workstation.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Workstation code already exists")
    ws = Workstation(**data.model_dump())
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


@router.put("/{id}")
def update_workstation_config(id: int, data: WorkstationUpdate, db: Session = Depends(get_db)):
    ws = get_workstation(db, id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workstation not found")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(ws, k, v)
    db.commit()
    db.refresh(ws)

    # Sync runtime engine if currently running on this workstation
    if workstation_manager.engine.workstation_id == id:
        workstation_manager.engine.grace_period_seconds = ws.absence_grace_seconds
        workstation_manager.engine.set_roi(ws.roi_x1, ws.roi_y1, ws.roi_x2, ws.roi_y2)

    return ws


@router.get("/{id}/status")
def get_workstation_telemetry(id: int, db: Session = Depends(get_db)):
    """Returns real-time session and timer telemetry for the workstation."""
    telemetry = workstation_manager.engine.get_status_telemetry(db)
    return telemetry


@router.post("/{id}/start")
def start_workstation_session(id: int, req: StartSessionRequest, db: Session = Depends(get_db)):
    """Starts monitoring for an assigned employee on the workstation."""
    ws = get_workstation(db, id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workstation not found")

    person = db.query(Person).filter(Person.employee_id == req.employee_id).first()
    if not person:
        raise HTTPException(status_code=404, detail=f"Employee {req.employee_id} not found")

    # Start camera capture if not running
    if not workstation_manager.is_running:
        workstation_manager.start_camera()

    workstation_manager.engine.start_monitoring(
        db=db,
        workstation_id=id,
        employee_id=req.employee_id,
        operator=req.operator,
    )
    return {"status": "started", "telemetry": workstation_manager.engine.get_status_telemetry(db)}


@router.post("/{id}/stop")
def stop_workstation_session(id: int, operator: str = "supervisor", db: Session = Depends(get_db)):
    """Stops the active workstation monitoring session."""
    workstation_manager.engine.stop_monitoring(db=db, operator=operator)
    return {"status": "stopped", "telemetry": workstation_manager.engine.get_status_telemetry(db)}


@router.get("/{id}/intervals")
def get_intervals(id: int, employee_id: str, date: Optional[str] = None, db: Session = Depends(get_db)):
    """Retrieves all discrete presence intervals for today's session."""
    intervals = get_daily_presence_intervals(db, workstation_id=id, employee_id=employee_id, date_str=date)
    return intervals


@router.post("/{id}/correction")
def correct_interval(id: int, req: ManualIntervalCorrection, db: Session = Depends(get_db)):
    """Authorized manual interval adjustment with full audit logging."""
    interval = db.query(PresenceInterval).filter(PresenceInterval.id == req.interval_id).first()
    if not interval:
        raise HTTPException(status_code=404, detail="Presence interval not found")

    old_duration = interval.duration_seconds
    interval.duration_seconds = req.duration_seconds
    interval.uncertain_reason = f"Corrected by {req.operator}: {req.notes} (was {old_duration}s)"
    db.commit()

    recalculate_session_active_seconds(db, interval.session_id)

    log_audit_event(
        db,
        event_type="INTERVAL_ADJUSTMENT",
        employee_id=interval.employee_id,
        workstation_id=id,
        operator=req.operator,
        details=f"Interval {interval.id} duration adjusted from {old_duration}s to {req.duration_seconds}s. Reason: {req.notes}",
    )
    return {"status": "updated", "interval_id": interval.id, "new_duration": req.duration_seconds}
