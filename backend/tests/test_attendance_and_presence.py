import os
import unittest
import numpy as np
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import (
    Base,
    Person,
    EmployeeFace,
    AttendanceLog,
    Workstation,
    WorkstationSession,
    PresenceInterval,
    AuditEvent,
    now_local,
    LOCAL_TZ,
)
from db.crud import (
    upsert_person,
    log_attendance,
    is_duplicate_attendance,
    manual_mark_attendance,
    open_presence_interval,
    close_presence_interval,
    calculate_total_active_seconds_today,
    recalculate_session_active_seconds,
    recover_unclosed_sessions,
)
from core.presence_engine import WorkstationPresenceEngine
from core.enrollment import EnrollmentManager


class ControllableClock:
    """Controllable monotonic clock for deterministic timer testing."""
    def __init__(self, start_time: float = 1000.0):
        self.current_time = start_time

    def __call__(self) -> float:
        return self.current_time

    def advance(self, seconds: float):
        self.current_time += seconds


class TestEmployeeAttendanceAndWorkstationPresence(unittest.TestCase):
    def setUp(self):
        # Create fresh in-memory SQLite database for test isolation
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed test employee
        self.person = upsert_person(
            self.db,
            employee_id="EMP001",
            name="Mira Patel",
            department="Engineering",
        )

        # Seed test workstation
        self.workstation = Workstation(
            code="WS-TEST-01",
            name="Testing Desk",
            absence_grace_seconds=60,
            roi_x1=0.2,
            roi_y1=0.2,
            roi_x2=0.8,
            roi_y2=0.8,
            is_active=True,
        )
        self.db.add(self.workstation)
        self.db.commit()
        self.db.refresh(self.workstation)

    def tearDown(self):
        self.db.close()

    # =========================================================================
    # 1. Directory Structure & Face Enrollment Tests
    # =========================================================================

    def test_enrollment_discovery_and_folder_parsing(self):
        """Tests parsing of employee IDs and names from various folder formats."""
        manager = EnrollmentManager.__new__(EnrollmentManager)
        
        # Test format: EMP001_mira
        emp_id, name = manager._parse_folder_name("EMP001_mira")
        self.assertEqual(emp_id, "EMP001")
        self.assertEqual(name, "Mira")

        # Test format: EMP002_rahul_sharma
        emp_id, name = manager._parse_folder_name("EMP002_rahul_sharma")
        self.assertEqual(emp_id, "EMP002")
        self.assertEqual(name, "Rahul Sharma")

        # Test format: EMP003
        emp_id, name = manager._parse_folder_name("EMP003")
        self.assertEqual(emp_id, "EMP003")
        self.assertEqual(name, "Employee EMP003")

    def test_matching_enrolled_identities_and_rejecting_unknowns(self):
        """Tests cosine similarity matching and rejection of unknown faces."""
        manager = EnrollmentManager.__new__(EnrollmentManager)
        
        # Setup mock embeddings
        emb1 = np.zeros(512, dtype=np.float32)
        emb1[0] = 1.0  # unit vector along dim 0
        emb2 = np.zeros(512, dtype=np.float32)
        emb2[1] = 1.0  # unit vector along dim 1

        manager.embeddings = {
            "EMP001": ("Mira", emb1),
            "EMP002": ("Rahul", emb2),
        }

        # Query matching EMP001
        match_id, name, sim = manager.match(emb1, threshold=0.7)
        self.assertEqual(match_id, "EMP001")
        self.assertEqual(name, "Mira")
        self.assertAlmostEqual(sim, 1.0, places=4)

        # Query unknown (orthogonal vector along dim 2)
        unknown_emb = np.zeros(512, dtype=np.float32)
        unknown_emb[2] = 1.0
        match_id, name, sim = manager.match(unknown_emb, threshold=0.7)
        self.assertIsNone(match_id)
        self.assertEqual(name, "Unknown")
        self.assertLess(sim, 0.7)

    # =========================================================================
    # 2. Attendance & Duplicate Prevention Tests
    # =========================================================================

    def test_prevent_duplicate_daily_attendance(self):
        """Verifies duplicate check-ins on the same calendar day are prevented/flagged."""
        # First check-in
        rec1 = log_attendance(self.db, self.person, confidence=0.92, track_id=1)
        self.assertFalse(rec1.is_duplicate)
        self.assertEqual(rec1.status, "VERIFIED")

        # Verify duplicate flag on second check-in today
        self.assertTrue(is_duplicate_attendance(self.db, "EMP001"))
        rec2 = log_attendance(self.db, self.person, confidence=0.88, track_id=2)
        self.assertTrue(rec2.is_duplicate)

    def test_manual_attendance_correction_with_audit(self):
        """Verifies authorized manual attendance recording and audit logging."""
        rec = manual_mark_attendance(
            self.db,
            employee_id="EMP001",
            operator="supervisor_alice",
            notes="Camera hardware replacement during entry",
        )
        self.assertEqual(rec.status, "MANUAL_CORRECTION")
        self.assertEqual(rec.confidence, 1.0)

        # Verify audit trail
        audit = self.db.query(AuditEvent).filter(AuditEvent.employee_id == "EMP001").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.event_type, "ATTENDANCE_MANUAL_ENTRY")
        self.assertEqual(audit.operator, "supervisor_alice")

    # =========================================================================
    # 3. Workstation Presence & Timer Tests
    # =========================================================================

    def test_start_timer_on_confirmed_presence(self):
        """Timer starts when presence in ROI is confirmed."""
        clock = ControllableClock(1000.0)
        engine = WorkstationPresenceEngine(clock_fn=clock)
        engine.min_confirmation_frames = 1
        engine.start_monitoring(self.db, self.workstation.id, "EMP001")

        self.assertEqual(engine.status, "PAUSED")

        # Mock frame and presence detection
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        engine.detector.detect = MagicMock(return_value=[(100, 300, 200, 200)])  # inside ROI
        engine.enrollment.get_embedding = MagicMock(return_value=np.ones(512))
        engine.enrollment.match = MagicMock(return_value=("EMP001", "Mira Patel", 0.95))

        # Process frame
        _, telemetry = engine.process_workstation_frame(frame, self.db)
        self.assertEqual(engine.status, "ACTIVE")
        self.assertIsNotNone(engine.current_interval_id)

    def test_delay_pause_until_grace_period_expires(self):
        """Timer keeps running in PENDING_ABSENCE during grace period, then pauses when grace expires."""
        clock = ControllableClock(1000.0)
        engine = WorkstationPresenceEngine(clock_fn=clock)
        engine.min_confirmation_frames = 1
        engine.start_monitoring(self.db, self.workstation.id, "EMP001")

        # 1. Establish presence
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        engine.detector.detect = MagicMock(return_value=[(150, 350, 250, 250)])
        engine.enrollment.get_embedding = MagicMock(return_value=np.ones(512))
        engine.enrollment.match = MagicMock(return_value=("EMP001", "Mira Patel", 0.95))

        engine.process_workstation_frame(frame, self.db)
        self.assertEqual(engine.status, "ACTIVE")

        # 2. Advance clock 30 seconds while present
        clock.advance(30.0)
        engine.process_workstation_frame(frame, self.db)

        # 3. Employee steps away (empty detection)
        engine.detector.detect = MagicMock(return_value=[])
        clock.advance(1.0)
        engine.process_workstation_frame(frame, self.db)
        self.assertEqual(engine.status, "PENDING_ABSENCE")

        # Advance 40s (within 60s grace period)
        clock.advance(40.0)
        engine.process_workstation_frame(frame, self.db)
        self.assertEqual(engine.status, "PENDING_ABSENCE")  # Still not paused!

        # Advance another 25s (total absence 66s > 60s grace)
        clock.advance(25.0)
        engine.process_workstation_frame(frame, self.db)
        self.assertEqual(engine.status, "PAUSED")  # Now paused!

        # Check interval was closed at last confirmed presence time (30s duration)
        interval = self.db.query(PresenceInterval).filter(PresenceInterval.id == engine.current_interval_id).first()
        self.assertIsNone(engine.current_interval_id)  # Interval closed

    def test_cancel_pending_absence_when_employee_returns(self):
        """Cancels pending absence when employee returns before grace expires without pausing interval."""
        clock = ControllableClock(1000.0)
        engine = WorkstationPresenceEngine(clock_fn=clock)
        engine.min_confirmation_frames = 1
        engine.start_monitoring(self.db, self.workstation.id, "EMP001")

        # Present
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        engine.detector.detect = MagicMock(return_value=[(150, 350, 250, 250)])
        engine.enrollment.get_embedding = MagicMock(return_value=np.ones(512))
        engine.enrollment.match = MagicMock(return_value=("EMP001", "Mira Patel", 0.95))
        engine.process_workstation_frame(frame, self.db)
        initial_interval_id = engine.current_interval_id

        # Away for 20s (less than 60s grace)
        engine.detector.detect = MagicMock(return_value=[])
        clock.advance(20.0)
        engine.process_workstation_frame(frame, self.db)
        self.assertEqual(engine.status, "PENDING_ABSENCE")

        # Employee returns!
        engine.detector.detect = MagicMock(return_value=[(150, 350, 250, 250)])
        clock.advance(5.0)
        engine.process_workstation_frame(frame, self.db)

        # Status restored to ACTIVE without closing or splitting the interval
        self.assertEqual(engine.status, "ACTIVE")
        self.assertEqual(engine.current_interval_id, initial_interval_id)

    def test_calculate_total_active_time_from_multiple_intervals(self):
        """Computes total active time across discrete intervals without double counting."""
        session = WorkstationSession(
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date="2026-10-23",
            session_start=datetime(2026, 10, 23, 9, 0, 0, tzinfo=LOCAL_TZ),
            status="PAUSED",
        )
        self.db.add(session)
        self.db.commit()

        # Interval 1: 09:00 - 09:30 (30 mins = 1800s)
        i1 = PresenceInterval(
            session_id=session.id,
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date="2026-10-23",
            start_time=datetime(2026, 10, 23, 9, 0, 0, tzinfo=LOCAL_TZ),
            end_time=datetime(2026, 10, 23, 9, 30, 0, tzinfo=LOCAL_TZ),
            duration_seconds=1800.0,
            is_uncertain=False,
        )
        # Interval 2: 10:00 - 11:15 (75 mins = 4500s)
        i2 = PresenceInterval(
            session_id=session.id,
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date="2026-10-23",
            start_time=datetime(2026, 10, 23, 10, 0, 0, tzinfo=LOCAL_TZ),
            end_time=datetime(2026, 10, 23, 11, 15, 0, tzinfo=LOCAL_TZ),
            duration_seconds=4500.0,
            is_uncertain=False,
        )
        self.db.add_all([i1, i2])
        self.db.commit()

        total = calculate_total_active_seconds_today(self.db, self.workstation.id, "EMP001", "2026-10-23")
        self.assertEqual(total, 6300.0)  # 1800 + 4500 = 6300s (1h 45m)
        self.assertEqual(WorkstationPresenceEngine.format_seconds(total), "01h 45m 00s")

    def test_session_recovery_after_restart_and_uncertain_intervals(self):
        """Unclosed intervals from crashes or power outages are closed cleanly with is_uncertain=True."""
        session = WorkstationSession(
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date="2026-10-23",
            session_start=datetime(2026, 10, 23, 14, 0, 0, tzinfo=LOCAL_TZ),
            last_presence_time=datetime(2026, 10, 23, 14, 45, 0, tzinfo=LOCAL_TZ),
            status="ACTIVE",
        )
        self.db.add(session)
        self.db.commit()

        unclosed = PresenceInterval(
            session_id=session.id,
            workstation_id=self.workstation.id,
            employee_id="EMP001",
            date="2026-10-23",
            start_time=datetime(2026, 10, 23, 14, 0, 0, tzinfo=LOCAL_TZ),
            end_time=None,  # Left open when app crashed
            duration_seconds=0.0,
            is_uncertain=False,
        )
        self.db.add(unclosed)
        self.db.commit()

        # Run recovery
        recover_unclosed_sessions(self.db, operator="crash_recovery")

        # Verify interval was closed at last_presence_time (14:45) with is_uncertain=True
        self.db.refresh(unclosed)
        self.assertIsNotNone(unclosed.end_time)
        self.assertTrue(unclosed.is_uncertain)
        self.assertEqual(unclosed.duration_seconds, 2700.0)  # 45 minutes

        self.db.refresh(session)
        self.assertEqual(session.status, "STOPPED")


if __name__ == "__main__":
    unittest.main()
