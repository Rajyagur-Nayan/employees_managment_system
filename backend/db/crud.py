from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from db.models import (
    SessionLocal,
    Person,
    EmployeeFace,
    AttendanceLog,
    Workstation,
    WorkstationAssignment,
    WorkstationSession,
    PresenceInterval,
    AuditEvent,
    now_local,
    LOCAL_TZ,
)
from core.config import DUPLICATE_WINDOW_SECONDS


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_date_str() -> str:
    return now_local().strftime("%Y-%m-%d")


# ==============================================================================
# Person (Employee) Operations
# ==============================================================================

def get_person_by_employee_id(db: Session, employee_id: str) -> Optional[Person]:
    return db.query(Person).filter(Person.employee_id == employee_id).first()


def get_person_by_id(db: Session, person_id: int) -> Optional[Person]:
    return db.query(Person).filter(Person.id == person_id).first()


def get_all_persons(db: Session) -> List[Person]:
    return db.query(Person).filter(Person.is_active == True).order_by(Person.name).all()


def upsert_person(
    db: Session,
    employee_id: str,
    name: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    department: Optional[str] = "General",
) -> Person:
    """Inserts or updates an employee identity."""
    person = get_person_by_employee_id(db, employee_id)
    if person:
        person.name = name
        if email:
            person.email = email
        if phone:
            person.phone = phone
        if department:
            person.department = department
        person.is_active = True
    else:
        person = Person(
            employee_id=employee_id,
            name=name,
            email=email,
            phone=phone,
            department=department or "General",
            registered_at=now_local(),
            is_active=True,
        )
        db.add(person)
    db.commit()
    db.refresh(person)
    return person


def get_all_persons_with_count(db: Session) -> List[Dict[str, Any]]:
    today = current_date_str()
    first_day = now_local().strftime("%Y-%m-01")
    persons = db.query(Person).order_by(Person.name).all()
    result = []
    for p in persons:
        monthly = (
            db.query(AttendanceLog)
            .filter(
                AttendanceLog.employee_id == p.employee_id,
                AttendanceLog.date >= first_day,
                AttendanceLog.date <= today,
                AttendanceLog.is_duplicate == False,
            )
            .count()
        )
        result.append({
            "employee_id": p.employee_id,
            "name": p.name,
            "email": p.email,
            "days_this_month": monthly,
        })
    return result


# ==============================================================================
# Employee Face Reference Operations
# ==============================================================================

def add_or_update_employee_face(
    db: Session,
    employee_id: str,
    relative_path: str,
    filename: str,
    file_size: Optional[int] = None,
    is_valid: bool = True,
    error_message: Optional[str] = None,
) -> EmployeeFace:
    face = (
        db.query(EmployeeFace)
        .filter(
            EmployeeFace.employee_id == employee_id,
            EmployeeFace.relative_path == relative_path,
        )
        .first()
    )
    if face:
        face.is_valid = is_valid
        face.error_message = error_message
        face.file_size = file_size
    else:
        face = EmployeeFace(
            employee_id=employee_id,
            relative_path=relative_path,
            filename=filename,
            file_size=file_size,
            is_valid=is_valid,
            error_message=error_message,
            enrolled_at=now_local(),
        )
        db.add(face)
    db.commit()
    db.refresh(face)
    return face


def get_employee_faces(db: Session, employee_id: str) -> List[EmployeeFace]:
    return (
        db.query(EmployeeFace)
        .filter(EmployeeFace.employee_id == employee_id)
        .all()
    )


# ==============================================================================
# Attendance Operations
# ==============================================================================

def is_duplicate_attendance(db: Session, employee_id: str, date_str: Optional[str] = None) -> bool:
    """Checks if a valid attendance check-in already exists for the workday."""
    target_date = date_str or current_date_str()
    existing = (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.date == target_date,
            AttendanceLog.is_duplicate == False,
        )
        .first()
    )
    return existing is not None


def log_attendance(
    db: Session,
    person: Person,
    confidence: float,
    track_id: Optional[int] = None,
    status: str = "VERIFIED",
    notes: Optional[str] = None,
) -> AttendanceLog:
    """
    Logs an attendance check-in. Marks as duplicate if already checked in today.
    """
    now = now_local()
    today_str = now.strftime("%Y-%m-%d")
    duplicate = is_duplicate_attendance(db, person.employee_id, today_str)

    record = AttendanceLog(
        person_id=person.id,
        employee_id=person.employee_id,
        name=person.name,
        confidence=round(confidence, 4) if confidence is not None else None,
        track_id=track_id,
        status=status,
        is_duplicate=duplicate,
        date=today_str,
        timestamp=now,
        notes=notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    if not duplicate:
        log_audit_event(
            db,
            event_type="ATTENDANCE_CHECKIN",
            employee_id=person.employee_id,
            operator="facial_recognition",
            details=f"Attendance marked for {person.name} ({person.employee_id}) with confidence {round(confidence, 2) if confidence else 'N/A'}",
        )

    return record


def manual_mark_attendance(
    db: Session,
    employee_id: str,
    operator: str = "admin",
    notes: Optional[str] = None,
) -> AttendanceLog:
    """Authorized manual attendance entry when face recognition fails or camera is offline."""
    person = get_person_by_employee_id(db, employee_id)
    if not person:
        raise ValueError(f"Employee {employee_id} not found in database.")

    now = now_local()
    today_str = now.strftime("%Y-%m-%d")
    duplicate = is_duplicate_attendance(db, employee_id, today_str)

    record = AttendanceLog(
        person_id=person.id,
        employee_id=person.employee_id,
        name=person.name,
        confidence=1.0,
        track_id=None,
        status="MANUAL_CORRECTION",
        is_duplicate=duplicate,
        date=today_str,
        timestamp=now,
        notes=notes or f"Manual attendance entry by {operator}",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    log_audit_event(
        db,
        event_type="ATTENDANCE_MANUAL_ENTRY",
        employee_id=employee_id,
        operator=operator,
        details=f"Manual attendance entered by {operator}. Notes: {notes or 'None'}",
    )
    return record


def get_daily_attendance(db: Session, date: str) -> List[AttendanceLog]:
    return (
        db.query(AttendanceLog)
        .filter(AttendanceLog.date == date, AttendanceLog.is_duplicate == False)
        .order_by(AttendanceLog.timestamp.desc())
        .all()
    )


def get_monthly_attendance(db: Session, year: int, month: int) -> List[AttendanceLog]:
    prefix = f"{year}-{month:02d}"
    return (
        db.query(AttendanceLog)
        .filter(AttendanceLog.date.like(f"{prefix}%"), AttendanceLog.is_duplicate == False)
        .order_by(AttendanceLog.timestamp.desc())
        .all()
    )


# ==============================================================================
# Workstation Operations
# ==============================================================================

def get_or_create_default_workstation(db: Session) -> Workstation:
    ws = db.query(Workstation).filter(Workstation.code == "WS-01").first()
    if not ws:
        ws = Workstation(
            code="WS-01",
            name="Main Workstation Desk",
            camera_source="0",
            roi_x1=0.0,
            roi_y1=0.0,
            roi_x2=1.0,
            roi_y2=1.0,
            absence_grace_seconds=60,
            is_active=True,
        )
        db.add(ws)
        db.commit()
        db.refresh(ws)
    return ws


def get_workstation(db: Session, workstation_id: int) -> Optional[Workstation]:
    return db.query(Workstation).filter(Workstation.id == workstation_id).first()


def get_all_workstations(db: Session) -> List[Workstation]:
    return db.query(Workstation).filter(Workstation.is_active == True).order_by(Workstation.code).all()


def assign_employee_to_workstation(
    db: Session,
    workstation_id: int,
    employee_id: str,
    date_str: Optional[str] = None,
) -> WorkstationAssignment:
    target_date = date_str or current_date_str()
    assignment = (
        db.query(WorkstationAssignment)
        .filter(
            WorkstationAssignment.workstation_id == workstation_id,
            WorkstationAssignment.employee_id == employee_id,
            WorkstationAssignment.assigned_date == target_date,
        )
        .first()
    )
    if not assignment:
        assignment = WorkstationAssignment(
            workstation_id=workstation_id,
            employee_id=employee_id,
            assigned_date=target_date,
            is_active=True,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
    return assignment


# ==============================================================================
# Workstation Presence Sessions & Intervals
# ==============================================================================

def get_workstation_session(
    db: Session,
    workstation_id: int,
    employee_id: str,
    date_str: Optional[str] = None,
) -> Optional[WorkstationSession]:
    target_date = date_str or current_date_str()
    return (
        db.query(WorkstationSession)
        .filter(
            WorkstationSession.workstation_id == workstation_id,
            WorkstationSession.employee_id == employee_id,
            WorkstationSession.date == target_date,
        )
        .order_by(WorkstationSession.id.desc())
        .first()
    )


def create_or_get_workstation_session(
    db: Session,
    workstation_id: int,
    employee_id: str,
    date_str: Optional[str] = None,
) -> WorkstationSession:
    target_date = date_str or current_date_str()
    session = get_workstation_session(db, workstation_id, employee_id, target_date)
    if not session:
        session = WorkstationSession(
            workstation_id=workstation_id,
            employee_id=employee_id,
            date=target_date,
            session_start=now_local(),
            status="STOPPED",
            total_active_seconds=0.0,
            total_paused_seconds=0.0,
            created_at=now_local(),
            updated_at=now_local(),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


def open_presence_interval(
    db: Session,
    session_id: int,
    workstation_id: int,
    employee_id: str,
    start_time: Optional[datetime] = None,
) -> PresenceInterval:
    """Opens a new active presence interval."""
    now = start_time or now_local()
    date_str = now.strftime("%Y-%m-%d")

    # Close any lingering open interval for safety
    open_interval = (
        db.query(PresenceInterval)
        .filter(
            PresenceInterval.session_id == session_id,
            PresenceInterval.end_time == None,
        )
        .first()
    )
    if open_interval:
        close_presence_interval(db, open_interval.id, now, is_uncertain=True, reason="Auto-closed before opening new interval")

    interval = PresenceInterval(
        session_id=session_id,
        workstation_id=workstation_id,
        employee_id=employee_id,
        date=date_str,
        start_time=now,
        end_time=None,
        duration_seconds=0.0,
        is_uncertain=False,
    )
    db.add(interval)
    db.commit()
    db.refresh(interval)
    return interval


def close_presence_interval(
    db: Session,
    interval_id: int,
    end_time: Optional[datetime] = None,
    is_uncertain: bool = False,
    reason: Optional[str] = None,
) -> Optional[PresenceInterval]:
    """Closes an active presence interval and records elapsed duration."""
    interval = db.query(PresenceInterval).filter(PresenceInterval.id == interval_id).first()
    if not interval or interval.end_time is not None:
        return interval

    now = end_time or now_local()
    interval.end_time = now
    
    # Calculate duration
    if interval.start_time:
        # Handle naive vs aware datetime comparison safely
        st = interval.start_time
        et = now
        if st.tzinfo is None and et.tzinfo is not None:
            st = st.replace(tzinfo=et.tzinfo)
        elif st.tzinfo is not None and et.tzinfo is None:
            et = et.replace(tzinfo=st.tzinfo)
        delta = (et - st).total_seconds()
        interval.duration_seconds = max(0.0, round(delta, 2))
    
    interval.is_uncertain = is_uncertain
    interval.uncertain_reason = reason
    db.commit()
    db.refresh(interval)

    # Update session total_active_seconds
    recalculate_session_active_seconds(db, interval.session_id)
    return interval


def recalculate_session_active_seconds(db: Session, session_id: int) -> float:
    """Computes total active seconds from non-overlapping closed intervals."""
    total = (
        db.query(func.coalesce(func.sum(PresenceInterval.duration_seconds), 0.0))
        .filter(
            PresenceInterval.session_id == session_id,
            PresenceInterval.end_time != None,
        )
        .scalar()
    )
    session = db.query(WorkstationSession).filter(WorkstationSession.id == session_id).first()
    if session:
        session.total_active_seconds = round(float(total), 2)
        session.updated_at = now_local()
        db.commit()
    return float(total)


def get_daily_presence_intervals(
    db: Session,
    workstation_id: int,
    employee_id: str,
    date_str: Optional[str] = None,
) -> List[PresenceInterval]:
    target_date = date_str or current_date_str()
    return (
        db.query(PresenceInterval)
        .filter(
            PresenceInterval.workstation_id == workstation_id,
            PresenceInterval.employee_id == employee_id,
            PresenceInterval.date == target_date,
        )
        .order_by(PresenceInterval.start_time.asc())
        .all()
    )


def calculate_total_active_seconds_today(
    db: Session,
    workstation_id: int,
    employee_id: str,
    date_str: Optional[str] = None,
) -> float:
    target_date = date_str or current_date_str()
    total = (
        db.query(func.coalesce(func.sum(PresenceInterval.duration_seconds), 0.0))
        .filter(
            PresenceInterval.workstation_id == workstation_id,
            PresenceInterval.employee_id == employee_id,
            PresenceInterval.date == target_date,
            PresenceInterval.end_time != None,
        )
        .scalar()
    )
    return float(total)


def recover_unclosed_sessions(db: Session, operator: str = "startup_recovery"):
    """
    Recovers sessions and intervals left unclosed after an application restart,
    system crash, or power outage. Closes them at last_presence_time with is_uncertain=True.
    """
    open_intervals = (
        db.query(PresenceInterval)
        .filter(PresenceInterval.end_time == None)
        .all()
    )
    for interval in open_intervals:
        session = db.query(WorkstationSession).filter(WorkstationSession.id == interval.session_id).first()
        close_time = (session.last_presence_time if session and session.last_presence_time else interval.start_time) or now_local()
        close_presence_interval(
            db,
            interval.id,
            end_time=close_time,
            is_uncertain=True,
            reason="Recovered after ungraceful shutdown/restart",
        )
        if session:
            session.status = "STOPPED"
            session.session_end = close_time
            db.commit()

        log_audit_event(
            db,
            event_type="OUTAGE_RECOVERY",
            employee_id=interval.employee_id,
            workstation_id=interval.workstation_id,
            operator=operator,
            details=f"Unclosed presence interval {interval.id} closed at {close_time} due to system restart recovery.",
        )


# ==============================================================================
# Audit Event Operations
# ==============================================================================

def log_audit_event(
    db: Session,
    event_type: str,
    employee_id: Optional[str] = None,
    workstation_id: Optional[int] = None,
    operator: str = "system",
    details: Optional[str] = None,
) -> AuditEvent:
    event = AuditEvent(
        event_type=event_type,
        employee_id=employee_id,
        workstation_id=workstation_id,
        operator=operator,
        details=details,
        timestamp=now_local(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_audit_events(db: Session, limit: int = 50) -> List[AuditEvent]:
    return (
        db.query(AuditEvent)
        .order_by(AuditEvent.timestamp.desc())
        .limit(limit)
        .all()
    )