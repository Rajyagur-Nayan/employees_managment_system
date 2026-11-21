import os
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.models import (
    Base,
    Person,
    AttendanceLog,
    Workstation,
    WorkstationSession,
    WorkstationAssignment,
    PresenceInterval,
    EmployeePositionAlert,
    EmployeeBreak,
    now_local,
    LOCAL_TZ,
)
from db.crud import (
    upsert_person,
    log_attendance,
    create_position_alert,
    resolve_active_alerts_for_employee,
    acknowledge_position_alert,
    resolve_position_alert_by_id,
    list_position_alerts,
    start_employee_break,
    end_employee_break,
    get_active_break_for_employee,
    assign_employee_to_workstation,
    get_employee_workstation_assignment,
    is_employee_present_for_date,
    open_presence_interval,
    close_presence_interval,
)
from core.presence_engine import WorkstationPresenceEngine


class ControllableClock:
    """Controllable monotonic clock for deterministic timing tests."""
    def __init__(self, start_time: float = 1000.0):
        self.current_time = start_time

    def __call__(self) -> float:
        return self.current_time

    def advance(self, seconds: float):
        self.current_time += seconds


class TestEmployeePositionAlertsAndMonitoring(unittest.TestCase):
    def setUp(self):
        # Create fresh in-memory SQLite database
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed employee
        self.person = upsert_person(
            self.db,
            employee_id="EMP101",
            name="John Doe",
            department="Operations",
        )

        # Seed workstation
        self.workstation = Workstation(
            code="FC-01",
            name="Fuel Counter 1",
            absence_grace_seconds=60,
            alert_threshold_seconds=900,  # 15 minutes
            roi_x1=0.1,
            roi_y1=0.1,
            roi_x2=0.9,
            roi_y2=0.9,
            is_active=True,
        )
        self.db.add(self.workstation)
        self.db.commit()
        self.db.refresh(self.workstation)

        # Setup controllable clock
        self.clock = ControllableClock(start_time=1000.0)

        # Setup mock enrollment manager
        self.mock_enrollment = MagicMock()
        self.mock_enrollment.get_embedding.return_value = [0.1] * 512
        self.mock_enrollment.match.return_value = ("EMP101", "John Doe", 0.95)

    def tearDown(self):
        self.db.close()

    def _mark_attendance_present(self, emp_id: str = "EMP101", date_str: str = None) -> AttendanceLog:
        """Helper to mark employee present for today's date."""
        today = date_str or now_local().strftime("%Y-%m-%d")
        person = self.db.query(Person).filter(Person.employee_id == emp_id).first()
        name = person.name if person else "Test Employee"
        person_id = person.id if person else None
        log = AttendanceLog(
            person_id=person_id,
            employee_id=emp_id,
            name=name,
            timestamp=now_local(),
            date=today,
            status="VERIFIED",
            confidence=0.95,
            is_duplicate=False,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    # =========================================================================
    # SCENARIO 1: Present at assigned position
    # =========================================================================
    def test_01_present_at_assigned_position(self):
        """Employee confirmed present at assigned workstation: active session, no alerts."""
        self._mark_attendance_present("EMP101")

        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101", shift_name="Morning Shift")

        self.assertTrue(engine.is_monitoring)
        self.assertEqual(engine.employee_id, "EMP101")
        self.assertEqual(engine.shift_name, "Morning Shift")

        # Simulate confirmed presence
        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        self.assertEqual(engine.status, "ACTIVE")
        self.assertIsNotNone(engine.current_interval_id)

        # Verify 0 alerts created
        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 0)

    # =========================================================================
    # SCENARIO 2: Absent for 5 minutes (< 15 min threshold)
    # =========================================================================
    def test_02_absent_for_5_minutes_no_alert(self):
        """Employee absent for 5 minutes: timer pauses after grace, NO alert generated."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Absence begins
        self.clock.advance(1.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.assertEqual(engine.status, "PENDING_ABSENCE")

        # Advance past 60s grace period (e.g. 70s)
        self.clock.advance(70.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.assertEqual(engine.status, "PAUSED")
        self.assertIsNone(engine.current_interval_id)  # Interval closed at last confirmed time

        # Advance to 5 minutes total absence (300s)
        self.clock.advance(230.0)  # total 1 + 70 + 230 = 301s (~5m)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)

        telemetry = engine.get_status_telemetry(self.db, self.clock())
        self.assertEqual(telemetry["status"], "PAUSED")
        self.assertFalse(telemetry["has_active_alert"])

        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 0)

    # =========================================================================
    # SCENARIO 3: Absent for 14 minutes (< 15 min threshold)
    # =========================================================================
    def test_03_absent_for_14_minutes_no_alert(self):
        """Employee absent for 14 minutes: NO alert generated (14m < 15m threshold)."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Trigger absence and expire grace
        self.clock.advance(70.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.assertEqual(engine.status, "PAUSED")

        # Advance to 14 minutes (840 seconds)
        self.clock.advance(770.0)  # 70 + 770 = 840s
        engine._handle_presence_absent(self.db, self.clock(), now_wall)

        telemetry = engine.get_status_telemetry(self.db, self.clock())
        self.assertEqual(telemetry["status"], "PAUSED")
        self.assertFalse(telemetry["has_active_alert"])
        self.assertGreaterEqual(telemetry["absence_duration_seconds"], 840)

        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 0)

    # =========================================================================
    # SCENARIO 4: Absent for > 15 minutes (Alert Generated)
    # =========================================================================
    def test_04_absent_exceeding_15_minutes_triggers_alert(self):
        """Continuous absence for > 15 minutes triggers automatic ACTIVE alert."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101", shift_name="Morning Shift")

        alert_callbacks = []
        engine.on_alert_callback = lambda msg: alert_callbacks.append(msg)

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Advance past 15 minutes (905 seconds)
        self.clock.advance(70.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.clock.advance(835.0)  # Total 905 seconds
        engine._handle_presence_absent(self.db, self.clock(), now_wall)

        telemetry = engine.get_status_telemetry(self.db, self.clock())
        self.assertTrue(telemetry["has_active_alert"])
        self.assertIsNotNone(engine.active_alert_id)

        # Verify DB alert record
        alerts = list_position_alerts(self.db, employee_id="EMP101", status="ACTIVE")
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert["employee_id"], "EMP101")
        self.assertEqual(alert["workstation_id"], self.workstation.id)
        self.assertEqual(alert["shift"], "Morning Shift")
        self.assertEqual(alert["status"], "ACTIVE")
        self.assertGreaterEqual(alert["absence_duration_seconds"], 900)

        # Verify callback invoked
        self.assertTrue(len(alert_callbacks) >= 1)
        self.assertEqual(alert_callbacks[0]["type"], "position_alert")
        self.assertEqual(alert_callbacks[0]["employee_id"], "EMP101")

    # =========================================================================
    # SCENARIO 5: Return before 15 minutes (Absence cancelled, NO alert)
    # =========================================================================
    def test_05_return_before_15_minutes_cancels_absence(self):
        """Employee absent for 10 minutes returns: interval re-opens, NO alert generated."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Absent for 10 minutes (600s)
        self.clock.advance(70.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.assertEqual(engine.status, "PAUSED")

        self.clock.advance(530.0)  # Total 600s
        engine._handle_presence_absent(self.db, self.clock(), now_wall)

        # Employee returns!
        self.clock.advance(1.0)
        engine._handle_presence_confirmed(self.db, self.clock(), now_local())

        self.assertEqual(engine.status, "ACTIVE")
        self.assertIsNotNone(engine.current_interval_id)
        self.assertIsNone(engine.active_alert_id)

        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 0)

    # =========================================================================
    # SCENARIO 6: Return after alert generated (Auto-resolves alert)
    # =========================================================================
    def test_06_return_after_alert_auto_resolves(self):
        """Employee returns after alert generated: alert status auto-resolves to RESOLVED."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        alert_callbacks = []
        engine.on_alert_callback = lambda msg: alert_callbacks.append(msg)

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Absent for 16 minutes (960s) -> Alert generated
        self.clock.advance(70.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.clock.advance(890.0)  # Total 960s
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        self.assertTrue(engine.active_alert_id is not None)

        # Employee returns at 980s
        self.clock.advance(20.0)
        return_wall = now_local()
        engine._handle_presence_confirmed(self.db, self.clock(), return_wall)

        self.assertEqual(engine.status, "ACTIVE")
        self.assertIsNone(engine.active_alert_id)

        # Verify DB alert is now RESOLVED
        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["status"], "RESOLVED")
        self.assertEqual(alerts[0]["resolved_by"], "auto_return")
        self.assertIsNotNone(alerts[0]["resolved_at"])

        # Verify resolve callback fired
        resolve_events = [c for c in alert_callbacks if c["type"] == "position_alert_resolved"]
        self.assertEqual(len(resolve_events), 1)
        self.assertEqual(resolve_events[0]["employee_id"], "EMP101")

    # =========================================================================
    # SCENARIO 7: Duplicate alert prevention
    # =========================================================================
    def test_07_duplicate_alert_prevention(self):
        """Continuous absence past 15 min generates only ONE alert, no duplicates on repeated checks."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Advance to 15m 1s -> triggers first alert
        self.clock.advance(905.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)
        initial_alert_id = engine.active_alert_id
        self.assertIsNotNone(initial_alert_id)

        # Advance repeatedly: 16m, 17m, 20m, 25m
        for extra_secs in [60.0, 120.0, 300.0, 600.0]:
            self.clock.advance(extra_secs)
            engine._handle_presence_absent(self.db, self.clock(), now_wall)

        # Confirm ONLY 1 alert exists in DB
        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["id"], initial_alert_id)

    # =========================================================================
    # SCENARIO 8: Detection grace period (temporary camera fluctuation)
    # =========================================================================
    def test_08_temporary_detection_grace_period(self):
        """Detection misses for 30s-45s: status is PENDING_ABSENCE, timer stays active."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)
        interval_id = engine.current_interval_id

        # Detection missed for 40 seconds (under 60s grace period)
        self.clock.advance(40.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)

        self.assertEqual(engine.status, "PENDING_ABSENCE")
        self.assertEqual(engine.current_interval_id, interval_id)  # Interval NOT closed!

        # Camera regains face
        self.clock.advance(5.0)
        engine._handle_presence_confirmed(self.db, self.clock(), now_wall)

        self.assertEqual(engine.status, "ACTIVE")
        self.assertEqual(engine.current_interval_id, interval_id)  # Same continuous interval
        self.assertIsNone(engine.absence_started_mono)

    # =========================================================================
    # SCENARIO 9: Employee on approved break (Alerts suspended)
    # =========================================================================
    def test_09_employee_on_approved_break_suspends_alerts(self):
        """Approved break suspends position monitoring; absence > 15m generates NO alerts."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        now_mono = self.clock()
        now_wall = now_local()
        engine._handle_presence_confirmed(self.db, now_mono, now_wall)

        # Start Lunch Break
        engine.start_break(self.db, break_type="Lunch Break", approved_by="Supervisor Dave", notes="30 min lunch")
        self.assertTrue(engine.is_on_break)
        self.assertEqual(engine.status, "ON_BREAK")
        self.assertIsNone(engine.current_interval_id)  # Cleanly closed working interval

        # Employee leaves workstation for 25 minutes (1500s > 900s)
        self.clock.advance(1500.0)
        engine._handle_presence_absent(self.db, self.clock(), now_wall)

        # Verify NO alert created
        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 0)
        self.assertIsNone(engine.active_alert_id)

        # End break and resume monitoring
        engine.stop_break(self.db, operator="Supervisor Dave")
        self.assertFalse(engine.is_on_break)
        self.assertEqual(engine.status, "PAUSED")

    # =========================================================================
    # SCENARIO 10: Employee without attendance rejected
    # =========================================================================
    def test_10_employee_without_attendance_rejected(self):
        """Cannot start position monitoring if employee has not checked in today."""
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)

        with self.assertRaises(ValueError) as ctx:
            engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101", validate_attendance=True)

        self.assertIn("NOT MARKED or ABSENT", str(ctx.exception))
        self.assertFalse(engine.is_monitoring)

    # =========================================================================
    # SCENARIO 11: Employee marked absent rejected
    # =========================================================================
    def test_11_employee_marked_absent_rejected(self):
        """Cannot start position monitoring if employee attendance is marked ABSENT."""
        today = now_local().strftime("%Y-%m-%d")
        absent_log = AttendanceLog(
            employee_id="EMP101",
            name="John Doe",
            timestamp=now_local(),
            date=today,
            status="ABSENT",
            confidence=0.0,
            is_duplicate=False,
            notes="Leave approved",
        )
        self.db.add(absent_log)
        self.db.commit()

        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)

        with self.assertRaises(ValueError) as ctx:
            engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101", validate_attendance=True)

        self.assertIn("NOT MARKED or ABSENT", str(ctx.exception))
        self.assertFalse(engine.is_monitoring)

    # =========================================================================
    # SCENARIO 12: Employee changes assigned position / shift
    # =========================================================================
    def test_12_position_and_shift_assignment_change(self):
        """Employee transitions from Workstation 1 (Morning) to Workstation 2 (Evening)."""
        self._mark_attendance_present("EMP101")

        # Create Workstation 2
        ws2 = Workstation(code="FC-02", name="Fuel Counter 2", is_active=True)
        self.db.add(ws2)
        self.db.commit()
        self.db.refresh(ws2)

        # Initial assignment: WS1 Morning Shift
        assign_employee_to_workstation(self.db, workstation_id=self.workstation.id, employee_id="EMP101", shift_name="Morning Shift")
        asgn1 = get_employee_workstation_assignment(self.db, "EMP101")
        self.assertIsNotNone(asgn1)
        self.assertEqual(asgn1.workstation_id, self.workstation.id)
        self.assertEqual(asgn1.shift_name, "Morning Shift")

        # Change assignment: WS2 Evening Shift
        assign_employee_to_workstation(self.db, workstation_id=ws2.id, employee_id="EMP101", shift_name="Evening Shift")
        asgn2 = get_employee_workstation_assignment(self.db, "EMP101")
        self.assertIsNotNone(asgn2)
        self.assertEqual(asgn2.workstation_id, ws2.id)
        self.assertEqual(asgn2.shift_name, "Evening Shift")

        # Start monitoring on WS2 with Evening Shift
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=ws2.id, employee_id="EMP101", shift_name="Evening Shift")

        self.assertEqual(engine.workstation_id, ws2.id)
        self.assertEqual(engine.shift_name, "Evening Shift")

    # =========================================================================
    # SCENARIO 13: Night shift crossing midnight
    # =========================================================================
    def test_13_night_shift_crossing_midnight(self):
        """Absence tracking handles midnight boundary without timestamp anomalies."""
        self._mark_attendance_present("EMP101")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101", shift_name="Night Shift")

        # Confirmed presence at 23:45
        t_before_midnight = datetime(2026, 11, 20, 23, 45, 0, tzinfo=LOCAL_TZ)
        now_mono = self.clock()
        engine._handle_presence_confirmed(self.db, now_mono, t_before_midnight)

        # Absence occurs and crosses midnight into next day 00:05 (20 minutes = 1200s)
        self.clock.advance(70.0)
        engine._handle_presence_absent(self.db, self.clock(), t_before_midnight + timedelta(seconds=70))

        # Advance past 15 min threshold across midnight
        t_after_midnight = datetime(2026, 11, 21, 0, 5, 0, tzinfo=LOCAL_TZ)
        self.clock.advance(1130.0)  # Total 1200s
        engine._handle_presence_absent(self.db, self.clock(), t_after_midnight)

        alerts = list_position_alerts(self.db, employee_id="EMP101", status="ACTIVE")
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["shift"], "Night Shift")
        self.assertGreaterEqual(alerts[0]["absence_duration_seconds"], 900)

    # =========================================================================
    # SCENARIO 14: Application restart during active absence incident
    # =========================================================================
    def test_14_restart_recovery_with_active_incident(self):
        """Existing active alert in DB is detected on startup; duplicate is not created."""
        self._mark_attendance_present("EMP101")

        # Simulate pre-existing active alert in DB prior to restart
        absent_since = now_local() - timedelta(minutes=16)
        existing_alert, _ = create_position_alert(
            self.db,
            employee_id="EMP101",
            workstation_id=self.workstation.id,
            absent_since=absent_since,
            shift="General Shift",
            duration_seconds=960.0,
        )
        self.db.commit()

        # Engine initializes after restart
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.workstation.id, employee_id="EMP101")

        # Attempt to create alert during monitoring
        alert, is_new = create_position_alert(
            self.db,
            employee_id="EMP101",
            workstation_id=self.workstation.id,
            absent_since=absent_since,
            duration_seconds=1000.0,
        )

        self.assertFalse(is_new)
        self.assertEqual(alert.id, existing_alert.id)

        # Confirm only 1 alert in DB
        alerts = list_position_alerts(self.db, employee_id="EMP101")
        self.assertEqual(len(alerts), 1)

    # =========================================================================
    # SCENARIO 15: Manager acknowledges and manually resolves alert
    # =========================================================================
    def test_15_manager_acknowledge_and_resolve_alert(self):
        """Manager workflow: acknowledge active alert then resolve with audit notes."""
        self._mark_attendance_present("EMP101")

        # Create active alert
        alert, _ = create_position_alert(
            self.db,
            employee_id="EMP101",
            workstation_id=self.workstation.id,
            absent_since=now_local() - timedelta(minutes=16),
            shift="Morning Shift",
            duration_seconds=960.0,
        )

        # 1. Manager Acknowledges
        ack_alert = acknowledge_position_alert(
            self.db,
            alert_id=alert.id,
            acknowledged_by="Manager Alice",
            notes="Checking workstation camera feed",
        )
        self.assertIsNotNone(ack_alert)
        self.assertEqual(ack_alert.status, "ACKNOWLEDGED")
        self.assertEqual(ack_alert.acknowledged_by, "Manager Alice")
        self.assertIsNotNone(ack_alert.acknowledged_at)

        # 2. Manager Resolves
        res_alert = resolve_position_alert_by_id(
            self.db,
            alert_id=alert.id,
            resolved_by="Manager Alice",
            notes="Employee returned from authorized emergency meeting",
        )
        self.assertIsNotNone(res_alert)
        self.assertEqual(res_alert.status, "RESOLVED")
        self.assertEqual(res_alert.resolved_by, "Manager Alice")
        self.assertIsNotNone(res_alert.resolved_at)
        self.assertIn("emergency meeting", res_alert.resolution_notes)


if __name__ == "__main__":
    unittest.main()
