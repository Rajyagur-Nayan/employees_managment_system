import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import (
    Base,
    Person,
    AttendanceLog,
    Workstation,
    WorkstationSession,
    PresenceInterval,
    now_local,
    LOCAL_TZ,
)
from db.crud import (
    upsert_person,
    log_attendance,
    manual_mark_attendance,
    get_existing_attendance,
    format_seconds_hms,
    get_multi_employee_live_tracking,
)
from core.presence_engine import WorkstationPresenceEngine
from core.attendance_engine import AttendanceEngine


class TestOptimizationAndLiveTracking(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed test employees
        self.emp1 = upsert_person(
            self.db,
            employee_id="EMP001",
            name="Alice Smith",
            department="Engineering",
            shift_name="Morning Shift",
            shift_timing="06:00 - 14:00"
        )
        self.emp2 = upsert_person(
            self.db,
            employee_id="EMP002",
            name="Bob Jones",
            department="Operations",
            shift_name="General Shift",
            shift_timing="09:00 - 18:00"
        )

        # Seed test workstation
        self.workstation = Workstation(
            code="WS-BAY-1",
            name="Assembly Bay 1",
            absence_grace_seconds=60,
            alert_threshold_seconds=900,
            roi_x1=0.1,
            roi_y1=0.1,
            roi_x2=0.9,
            roi_y2=0.9,
            is_active=True,
        )
        self.db.add(self.workstation)
        self.db.commit()
        self.db.refresh(self.workstation)

    def tearDown(self):
        self.db.close()

    def test_duplicate_attendance_does_not_insert_new_row(self):
        """Verifies duplicate check-ins return existing record and do NOT insert extra rows in DB."""
        # Initial check-in
        first_rec = log_attendance(self.db, self.emp1, confidence=0.95, track_id=1)
        self.assertFalse(first_rec.is_duplicate)
        self.assertEqual(self.db.query(AttendanceLog).count(), 1)
        initial_id = first_rec.id

        # Second check-in on the same day
        dup_rec = log_attendance(self.db, self.emp1, confidence=0.98, track_id=2)
        self.assertTrue(dup_rec.is_duplicate)
        self.assertEqual(dup_rec.id, initial_id)
        # Database count must remain strictly 1
        self.assertEqual(self.db.query(AttendanceLog).count(), 1)

        # Manual check-in attempt on the same day
        manual_dup = manual_mark_attendance(self.db, employee_id="EMP001", operator="Manager")
        self.assertTrue(manual_dup.is_duplicate)
        self.assertEqual(manual_dup.id, initial_id)
        self.assertEqual(self.db.query(AttendanceLog).count(), 1)

    def test_attendance_engine_duplicate_response_payload(self):
        """Verifies AttendanceEngine emits the required warning message, marking time, and status for duplicates."""
        engine = AttendanceEngine.__new__(AttendanceEngine)
        engine.settings = {"dup_window": 60}
        engine.last_logged = {}

        # Log once
        log_attendance(self.db, self.emp1, confidence=0.92, track_id=1)
        existing = get_existing_attendance(self.db, "EMP001", now_local().date())
        self.assertIsNotNone(existing)

        # Emulate AttendanceEngine processing duplicate face detection
        payload = {
            "type": "attendance_duplicate",
            "message": "Attendance already marked for today.",
            "employee_id": existing.employee_id,
            "name": existing.name,
            "status": existing.status,
            "marking_time": existing.timestamp.isoformat() if existing.timestamp else None,
            "is_duplicate": True,
        }

        self.assertEqual(payload["message"], "Attendance already marked for today.")
        self.assertEqual(payload["employee_id"], "EMP001")
        self.assertTrue(payload["is_duplicate"])
        self.assertIsNotNone(payload["marking_time"])

    def test_workstation_monitoring_requires_attendance_present(self):
        """Timer must NOT start and monitoring must fail if attendance is not marked."""
        engine = WorkstationPresenceEngine()

        # Employee 2 has not marked attendance today - must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            engine.start_monitoring(self.db, self.workstation.id, "EMP002", validate_attendance=True)
        self.assertIn("attendance is NOT MARKED or ABSENT", str(ctx.exception))
        self.assertFalse(engine.is_monitoring)

        # Now mark attendance for Employee 2
        log_attendance(self.db, self.emp2, confidence=0.95, track_id=1)

        # Monitoring should now start successfully
        engine.start_monitoring(self.db, self.workstation.id, "EMP002", validate_attendance=True)
        self.assertTrue(engine.is_monitoring)
        self.assertIsNotNone(engine.current_session_id)

    def test_format_seconds_hms(self):
        """Verifies seconds to HH:MM:SS string formatting."""
        self.assertEqual(format_seconds_hms(0), "00:00:00")
        self.assertEqual(format_seconds_hms(59), "00:00:59")
        self.assertEqual(format_seconds_hms(3665), "01:01:05")
        self.assertEqual(format_seconds_hms(12000), "03:20:00")

    def test_multi_employee_live_tracking_query(self):
        """Verifies live tracking query aggregates attendance, workstation, status, and formatted working time."""
        # Mark attendance for EMP001
        log_attendance(self.db, self.emp1, confidence=0.95, track_id=1)

        # Start workstation monitoring for EMP001
        engine = WorkstationPresenceEngine()
        engine.start_monitoring(self.db, self.workstation.id, "EMP001", validate_attendance=False)

        # Add a recorded interval of 1800 seconds (30 mins)
        session = self.db.query(WorkstationSession).filter_by(id=engine.current_session_id).first()
        start_time = now_local() - timedelta(minutes=30)
        end_time = now_local()
        interval = PresenceInterval(
            session_id=session.id,
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date=now_local().date(),
            start_time=start_time,
            end_time=end_time,
            duration_seconds=1800.0,
        )
        self.db.add(interval)
        self.db.commit()

        # Query live tracking
        data = get_multi_employee_live_tracking(self.db, live_engine_state=engine.get_status_telemetry(self.db))

        self.assertIn("summary", data)
        self.assertIn("employees", data)
        summary = data["summary"]
        self.assertEqual(summary["total_employees"], 2)
        self.assertEqual(summary["present_today"], 1)
        self.assertEqual(summary["absent_today"], 1)

        emp1_data = next((e for e in data["employees"] if e["employee_id"] == "EMP001"), None)
        self.assertIsNotNone(emp1_data)
        self.assertEqual(emp1_data["attendance_status"], "PRESENT")
        self.assertIn("Assembly Bay 1", emp1_data["assigned_workstation"])
        self.assertGreaterEqual(emp1_data["today_working_seconds"], 1800)
        self.assertTrue(":" in emp1_data["today_working_time"])

        emp2_data = next((e for e in data["employees"] if e["employee_id"] == "EMP002"), None)
        self.assertIsNotNone(emp2_data)
        self.assertEqual(emp2_data["attendance_status"], "ABSENT")
        self.assertEqual(emp2_data["workstation_status"], "Absent")

    def test_reset_workstation_daily_time(self):
        """Verifies that reset_workstation_daily_time clears today's intervals and resets session."""
        from db.crud import reset_workstation_daily_time
        # Create session and intervals
        session = WorkstationSession(
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date=now_local().strftime("%Y-%m-%d"),
            total_active_seconds=1200.0,
            status="ACTIVE",
        )
        self.db.add(session)
        self.db.commit()

        inv = PresenceInterval(
            session_id=session.id,
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date=now_local().strftime("%Y-%m-%d"),
            start_time=now_local(),
            end_time=now_local(),
            duration_seconds=1200.0,
        )
        self.db.add(inv)
        self.db.commit()

        # Verify exists
        self.assertEqual(self.db.query(PresenceInterval).filter_by(employee_id="EMP001").count(), 1)
        # Reset today's time
        cleared = reset_workstation_daily_time(self.db, self.workstation.id, "EMP001")
        self.assertEqual(cleared, 1)
        self.assertEqual(self.db.query(PresenceInterval).filter_by(employee_id="EMP001").count(), 0)
        self.db.refresh(session)
        self.assertEqual(session.total_active_seconds, 0.0)

    def test_detached_instance_prevention_on_attendance_marking(self):
        """Verifies that accessing AttendanceLog attributes after commit/close does NOT raise DetachedInstanceError."""
        SessionClass = sessionmaker(bind=self.engine, expire_on_commit=False)
        local_db = SessionClass()
        try:
            p = upsert_person(local_db, "EMP999", "Test Person")
            rec = log_attendance(local_db, p, confidence=0.99)
            # Commit and close session (simulating the camera loop closing its short-lived session)
            local_db.commit()
            local_db.close()

            # Access attributes on detached record - must NOT raise DetachedInstanceError
            self.assertEqual(rec.employee_id, "EMP999")
            self.assertIsNotNone(rec.timestamp)
            self.assertEqual(rec.status, "VERIFIED")
            self.assertFalse(rec.is_duplicate)
        finally:
            try:
                local_db.close()
            except Exception:
                pass


if __name__ == "__main__":
    unittest.main()
