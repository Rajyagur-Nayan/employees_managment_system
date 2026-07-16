from db.models import SessionLocal, AttendanceLog, Person
from datetime import datetime, timedelta, timezone
from app.config import DUPLICATE_WINDOW_SECONDS

# IST timezone
IST = timezone(timedelta(hours=5, minutes=30))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_duplicate(db, employee_id: str) -> bool:
    today = datetime.now(IST).strftime('%Y-%m-%d')  # fixed: IST
    existing = (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.date == today,
            AttendanceLog.is_duplicate == False,
        )
        .first()
    )
    return existing is not None


def log_attendance(db, person: Person, confidence: float, track_id: int):
    duplicate = is_duplicate(db, person.employee_id)
    now_ist = datetime.now(IST)  # fixed: IST
    record = AttendanceLog(
        person_id=person.id,
        employee_id=person.employee_id,
        name=person.name,
        confidence=round(confidence, 4),
        track_id=track_id,
        is_duplicate=duplicate,
        date=now_ist.strftime("%Y-%m-%d"),
        timestamp=now_ist,  # if your model has a timestamp column
    )
    db.add(record)
    db.commit()
    return record


def get_daily_attendance(db, date: str):
    return (
        db.query(AttendanceLog)
        .filter(AttendanceLog.date == date, AttendanceLog.is_duplicate == False)
        .all()
    )


def get_monthly_attendance(db, year: int, month: int):
    prefix = f"{year}-{month:02d}"
    return (
        db.query(AttendanceLog)
        .filter(AttendanceLog.date.like(f"{prefix}%"), AttendanceLog.is_duplicate == False)
        .all()
    )


def get_person_count(db, employee_id: str, start: str, end: str):
    return (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.date >= start,
            AttendanceLog.date <= end,
            AttendanceLog.is_duplicate == False,
        )
        .count()
    )


# ── NEW: required by person_view.py ──────────────────────────────────────────

def get_all_persons(db):
    return db.query(Person).order_by(Person.name).all()


def get_all_persons_with_count(db):
    today = datetime.now(IST).strftime('%Y-%m-%d')
    first_day = datetime.now(IST).strftime('%Y-%m-01')
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