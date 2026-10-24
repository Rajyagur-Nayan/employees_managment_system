from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone

from api.dependencies import get_db
from db.models import AttendanceLog, Person

router = APIRouter(prefix="/analytics", tags=["analytics"])
IST = timezone(timedelta(hours=5, minutes=30))

@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    today = datetime.now(IST).strftime('%Y-%m-%d')
    total_employees = db.query(Person).count()
    present_today = db.query(AttendanceLog.employee_id).filter(
        AttendanceLog.date == today,
        AttendanceLog.is_duplicate == False
    ).distinct().count()
    
    absent_today = total_employees - present_today
    attendance_rate = (present_today / total_employees * 100) if total_employees > 0 else 0
    
    return {
        "total_employees": total_employees,
        "present_today": present_today,
        "absent_today": absent_today,
        "attendance_rate": round(attendance_rate, 1)
    }

@router.get("/daily")
def get_daily_analytics(days: int = 7, db: Session = Depends(get_db)):
    end_date = datetime.now(IST)
    start_date = end_date - timedelta(days=days-1)
    
    results = []
    for i in range(days):
        current_date = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
        present = db.query(AttendanceLog.employee_id).filter(
            AttendanceLog.date == current_date,
            AttendanceLog.is_duplicate == False
        ).distinct().count()
        results.append({
            "date": current_date,
            "present": present
        })
    return results

@router.get("/monthly")
def get_monthly_analytics(months: int = 6, db: Session = Depends(get_db)):
    # Basic implementation
    return []
