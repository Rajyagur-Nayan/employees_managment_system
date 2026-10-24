import os
from datetime import datetime, timezone, timedelta
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Float,
    Boolean,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from core.config import DATABASE_URL, PROJECT_ROOT

# Local IST timezone (UTC+5:30)
LOCAL_TZ = timezone(timedelta(hours=5, minutes=30))

Base = declarative_base()


def create_robust_engine(db_url: str):
    """Creates a database engine with automatic fallback to local SQLite if remote is unreachable."""
    if db_url.startswith("sqlite"):
        return create_engine(db_url, connect_args={"check_same_thread": False})
    try:
        eng = create_engine(db_url, pool_pre_ping=True)
        with eng.connect() as conn:
            pass
        return eng
    except Exception as e:
        local_sqlite_path = os.path.join(PROJECT_ROOT, "data", "attendance.db").replace("\\", "/")
        fallback_url = f"sqlite:///{local_sqlite_path}"
        print(f"[DB] Configured database unreachable ({e}). Falling back to local SQLite: {fallback_url}")
        return create_engine(fallback_url, connect_args={"check_same_thread": False})


engine = create_robust_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def now_local() -> datetime:
    """Returns the current timezone-aware timestamp."""
    return datetime.now(LOCAL_TZ)


class Person(Base):
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), nullable=True)
    phone = Column(String(30), nullable=True)
    department = Column(String(100), nullable=True, default="General")
    registered_at = Column(DateTime, default=now_local)
    is_active = Column(Boolean, default=True)


class EmployeeFace(Base):
    """Tracks enrolled face references for employees."""
    __tablename__ = "employee_faces"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), ForeignKey("persons.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    relative_path = Column(String(255), nullable=False)
    filename = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=True)
    is_valid = Column(Boolean, default=True)
    error_message = Column(String(255), nullable=True)
    enrolled_at = Column(DateTime, default=now_local)


class AttendanceLog(Base):
    """Daily attendance check-in records."""
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, nullable=True)
    employee_id = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=now_local, nullable=False)
    confidence = Column(Float, nullable=True)
    track_id = Column(Integer, nullable=True)
    status = Column(String(50), default="VERIFIED")  # VERIFIED, MANUAL_CORRECTION, LIVENESS_FAILED, UNKNOWN
    is_duplicate = Column(Boolean, default=False)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    notes = Column(Text, nullable=True)


class Workstation(Base):
    """Workstations configured for monitoring."""
    __tablename__ = "workstations"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # e.g. "WS-01"
    name = Column(String(100), nullable=False)
    camera_source = Column(String(255), default="0")
    roi_x1 = Column(Float, default=0.0)
    roi_y1 = Column(Float, default=0.0)
    roi_x2 = Column(Float, default=1.0)
    roi_y2 = Column(Float, default=1.0)
    absence_grace_seconds = Column(Integer, default=60)
    is_active = Column(Boolean, default=True)


class WorkstationAssignment(Base):
    """Assignment of an employee to a workstation for a specific date or active schedule."""
    __tablename__ = "workstation_assignments"

    id = Column(Integer, primary_key=True, index=True)
    workstation_id = Column(Integer, ForeignKey("workstations.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(String(50), ForeignKey("persons.employee_id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    is_active = Column(Boolean, default=True)


class WorkstationSession(Base):
    """
    Workstation presence session for an employee on a workday.
    Tracks state machine: ACTIVE, PENDING_ABSENCE, PAUSED, STOPPED.
    """
    __tablename__ = "workstation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    workstation_id = Column(Integer, ForeignKey("workstations.id"), nullable=False, index=True)
    employee_id = Column(String(50), ForeignKey("persons.employee_id"), nullable=False, index=True)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    session_start = Column(DateTime, default=now_local, nullable=False)
    session_end = Column(DateTime, nullable=True)
    status = Column(String(30), default="STOPPED")  # ACTIVE, PENDING_ABSENCE, PAUSED, STOPPED
    total_active_seconds = Column(Float, default=0.0)
    total_paused_seconds = Column(Float, default=0.0)
    last_presence_time = Column(DateTime, nullable=True)
    absence_started_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_local)
    updated_at = Column(DateTime, default=now_local, onupdate=now_local)


class PresenceInterval(Base):
    """
    Discrete, non-overlapping active presence intervals.
    Total active workstation time is calculated as the sum of these completed intervals.
    """
    __tablename__ = "presence_intervals"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("workstation_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    workstation_id = Column(Integer, nullable=False, index=True)
    employee_id = Column(String(50), nullable=False, index=True)
    date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, default=0.0)
    is_uncertain = Column(Boolean, default=False)  # Set when camera or app outage prevented reliable observation
    uncertain_reason = Column(String(255), nullable=True)


class AuditEvent(Base):
    """Audit events for manual corrections, overrides, and monitoring lifecycle."""
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # MANUAL_ATTENDANCE, ATTENDANCE_CORRECTION, SESSION_START, SESSION_STOP, INTERVAL_ADJUSTMENT, OUTAGE_RECOVERY
    employee_id = Column(String(50), nullable=True, index=True)
    workstation_id = Column(Integer, nullable=True)
    operator = Column(String(100), default="system")
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=now_local, nullable=False)


def init_db():
    Base.metadata.create_all(bind=engine)
    
    # Auto-migrate existing tables if missing columns
    from sqlalchemy import text, inspect
    try:
        insp = inspect(engine)
        if "persons" in insp.get_table_names():
            p_cols = [c["name"] for c in insp.get_columns("persons")]
            with engine.begin() as conn:
                if "department" not in p_cols:
                    conn.execute(text("ALTER TABLE persons ADD COLUMN department VARCHAR(100) DEFAULT 'General'"))
                if "is_active" not in p_cols:
                    conn.execute(text("ALTER TABLE persons ADD COLUMN is_active BOOLEAN DEFAULT TRUE"))

        if "attendance_logs" in insp.get_table_names():
            a_cols = [c["name"] for c in insp.get_columns("attendance_logs")]
            with engine.begin() as conn:
                if "status" not in a_cols:
                    conn.execute(text("ALTER TABLE attendance_logs ADD COLUMN status VARCHAR(50) DEFAULT 'VERIFIED'"))
                if "notes" not in a_cols:
                    conn.execute(text("ALTER TABLE attendance_logs ADD COLUMN notes TEXT"))
    except Exception as e:
        print(f"[DB] Migration check notice: {e}")