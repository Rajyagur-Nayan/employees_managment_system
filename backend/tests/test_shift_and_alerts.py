import unittest
from datetime import datetime, time as dtime, timedelta
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
    EmployeePositionAlert,
    Shift,
    AlertConfiguration,
    LOCAL_TZ,
    now_local,
)
from db.crud import (
    upsert_person,
    update_employee,
    log_attendance,
    create_position_alert,
    resolve_active_alerts_for_employee,
    list_position_alerts,
    get_alert_configuration,
    update_alert_configuration,
    get_shift_daily_report,
    is_within_shift,
    get_effective_shift_date,
    open_presence_interval,
    close_presence_interval,
)
from core.presence_engine import WorkstationPresenceEngine


class ControllableClock:
    def __init__(self, start_time: float = 1000.0):
        self.current_time = start_time

    def __call__(self) -> float:
        return self.current_time

    def advance(self, seconds: float):
        self.current_time += seconds


class Test20ScenarioVerification(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed Shift definitions
        self.day_shift = Shift(shift_name="Day Shift", start_time="09:00", end_time="18:00", is_night_shift=False)
        self.night_shift = Shift(shift_name="Night Shift", start_time="22:00", end_time="06:00", is_night_shift=True)
        self.db.add_all([self.day_shift, self.night_shift])

        # Seed global alert config (default 15 minutes)
        self.alert_cfg = AlertConfiguration(absence_threshold_minutes=15)
        self.db.add(self.alert_cfg)

        # Seed workstation
        self.ws = Workstation(
            code="WS-01",
            name="Fuel Island 1",
            absence_grace_seconds=60,
            alert_threshold_seconds=900,
            roi_x1=0.1,
            roi_y1=0.1,
            roi_x2=0.9,
            roi_y2=0.9,
            is_active=True,
        )
        self.db.add(self.ws)

        # Seed employees
        self.emp1 = upsert_person(
            self.db,
            employee_id="EMP001",
            name="Alice Walker",
            department="Operations",
            shift_name="Day Shift",
            shift_timing="09:00 - 18:00",
        )
        self.emp2 = upsert_person(
            self.db,
            employee_id="EMP002",
            name="Bob Martin",
            department="Logistics",
            shift_name="Night Shift",
            shift_timing="22:00 - 06:00",
        )
        self.db.commit()

        self.clock = ControllableClock(start_time=1000.0)
        self.mock_enrollment = MagicMock()
        self.mock_enrollment.get_embedding.return_value = [0.1] * 512
        self.mock_enrollment.match.return_value = ("EMP001", "Alice Walker", 0.95)

    def tearDown(self):
        self.db.close()

    def _mark_present(self, emp_id: str, date_str: str = None) -> AttendanceLog:
        person = self.db.query(Person).filter(Person.employee_id == emp_id).first()
        today = date_str or now_local().strftime("%Y-%m-%d")
        existing = (
            self.db.query(AttendanceLog)
            .filter(AttendanceLog.employee_id == emp_id, AttendanceLog.date == today)
            .first()
        )
        if existing:
            return existing
        log = AttendanceLog(
            person_id=person.id,
            employee_id=person.employee_id,
            name=person.name,
            timestamp=now_local(),
            confidence=0.95,
            status="VERIFIED",
            is_duplicate=False,
            date=today,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    # =========================================================================
    # SCENARIO 1: Alert is NOT triggered if absence is < threshold (e.g., 5m, 14m)
    # =========================================================================
    def test_01_alert_not_triggered_below_threshold(self):
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")

        now_mono = self.clock()
        t0 = datetime(2026, 11, 20, 10, 0, 0, tzinfo=LOCAL_TZ)
        engine._handle_presence_confirmed(self.db, now_mono, t0)

        # Employee leaves: 14 minutes elapse (840s)
        self.clock.advance(840.0)
        engine._handle_presence_absent(self.db, self.clock(), t0 + timedelta(seconds=840))

        alerts = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts), 0, "No alert should trigger when absence < 15 minutes")

    # =========================================================================
    # SCENARIO 2: Alert IS triggered when absence exceeds threshold (15m+)
    # =========================================================================
    def test_02_alert_triggered_above_threshold(self):
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")

        t0 = datetime(2026, 11, 20, 10, 0, 0, tzinfo=LOCAL_TZ)
        engine._handle_presence_confirmed(self.db, self.clock(), t0)

        # Employee leaves: 15 minutes and 10 seconds elapse (910s)
        self.clock.advance(910.0)
        engine._handle_presence_absent(self.db, self.clock(), t0 + timedelta(seconds=910))

        alerts = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts), 1, "Alert must be triggered when absence exceeds 15 minutes")
        self.assertGreaterEqual(alerts[0]["absence_duration_seconds"], 900)

    # =========================================================================
    # SCENARIO 3: Only 1 alert is created for a single absence event
    # =========================================================================
    def test_03_single_alert_for_single_absence_event(self):
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")

        t0 = datetime(2026, 11, 20, 10, 0, 0, tzinfo=LOCAL_TZ)
        engine._handle_presence_confirmed(self.db, self.clock(), t0)

        # 16 minutes away -> 1 alert
        self.clock.advance(960.0)
        engine._handle_presence_absent(self.db, self.clock(), t0 + timedelta(seconds=960))
        alerts_16m = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts_16m), 1)

        # Additional repeated checks at 20m, 25m, 30m without returning
        for extra in [240.0, 300.0, 300.0]:
            self.clock.advance(extra)
            engine._handle_presence_absent(self.db, self.clock(), t0 + timedelta(seconds=960 + extra))

        alerts_final = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts_final), 1, "Only 1 alert must exist for a continuous absence event")

    # =========================================================================
    # SCENARIO 4: No duplicate alerts on dashboard refresh or API call
    # =========================================================================
    def test_04_idempotent_alert_creation_no_duplicates_on_api(self):
        self._mark_present("EMP001")
        t0 = datetime(2026, 11, 20, 10, 0, 0, tzinfo=LOCAL_TZ)

        # First alert generation
        alert1, is_new1 = create_position_alert(
            self.db,
            employee_id="EMP001",
            workstation_id=self.ws.id,
            absent_since=t0,
            duration_seconds=950.0,
        )
        self.assertTrue(is_new1)
        self.assertIsNotNone(alert1)

        # Second identical call (simulating page reload or duplicate API invocation)
        alert2, is_new2 = create_position_alert(
            self.db,
            employee_id="EMP001",
            workstation_id=self.ws.id,
            absent_since=t0,
            duration_seconds=1000.0,
        )
        self.assertFalse(is_new2, "Repeated call for existing active incident must not create new alert")
        self.assertEqual(alert1.id, alert2.id)

    # =========================================================================
    # SCENARIO 5: Pending alert is cancelled if employee returns within 15 minutes
    # =========================================================================
    def test_05_pending_alert_cancelled_if_employee_returns(self):
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")

        t0 = datetime(2026, 11, 20, 10, 0, 0, tzinfo=LOCAL_TZ)
        engine._handle_presence_confirmed(self.db, self.clock(), t0)

        # Employee leaves for 10 minutes (600s < 900s)
        self.clock.advance(600.0)
        engine._handle_presence_absent(self.db, self.clock(), t0 + timedelta(seconds=600))
        self.assertEqual(engine.status, "PAUSED")

        # Employee returns at minute 10
        self.clock.advance(5.0)
        engine._handle_presence_confirmed(self.db, self.clock(), t0 + timedelta(seconds=605))
        self.assertEqual(engine.status, "ACTIVE")
        self.assertIsNone(engine.absence_started_mono, "Pending absence must be cancelled")

        alerts = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts), 0)

    # =========================================================================
    # SCENARIO 6: Returning and leaving again starts a NEW absence tracking event
    # =========================================================================
    def test_06_return_and_leave_again_starts_new_absence_event(self):
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")

        t0 = datetime(2026, 11, 20, 10, 0, 0, tzinfo=LOCAL_TZ)
        engine._handle_presence_confirmed(self.db, self.clock(), t0)

        # Absence 1: 16m away -> generates Alert 1
        self.clock.advance(960.0)
        engine._handle_presence_absent(self.db, self.clock(), t0 + timedelta(seconds=960))
        alerts1 = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts1), 1)
        alert1_id = alerts1[0]["id"]

        # Employee returns! Auto-resolves Alert 1
        self.clock.advance(10.0)
        t_return = t0 + timedelta(seconds=970)
        engine._handle_presence_confirmed(self.db, self.clock(), t_return)
        self.assertEqual(engine.status, "ACTIVE")
        self.assertIsNone(engine.active_alert_id)

        # Check alert 1 is resolved
        active_alerts_after_return = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(active_alerts_after_return), 0)

        # Absence 2: Employee leaves again for 16m -> creates NEW Alert 2
        self.clock.advance(960.0)
        engine._handle_presence_absent(self.db, self.clock(), t_return + timedelta(seconds=960))
        alerts2 = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts2), 1)
        self.assertNotEqual(alerts2[0]["id"], alert1_id, "New incident must produce a new distinct alert ID")

    # =========================================================================
    # SCENARIO 7: Alerts trigger only for present employees with active shifts
    # =========================================================================
    def test_07_alerts_only_for_present_employees_with_active_shift(self):
        # EMP001 has NOT marked attendance
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        with self.assertRaises(ValueError) as ctx:
            engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", validate_attendance=True)
        self.assertIn("NOT MARKED", str(ctx.exception))
        self.assertFalse(engine.is_monitoring)

    # =========================================================================
    # SCENARIO 8: Day Shift workstation time accumulates correctly during shift hours
    # =========================================================================
    def test_08_day_shift_time_accumulation(self):
        self._mark_present("EMP001")
        sess = WorkstationSession(
            workstation_id=self.ws.id,
            employee_id="EMP001",
            date="2026-11-20",
            shift="Day Shift",
            status="ACTIVE",
        )
        self.db.add(sess)
        self.db.commit()

        # Interval 1: 09:30 to 11:30 (2 hours = 7200s)
        inv1 = open_presence_interval(
            self.db, session_id=sess.id, workstation_id=self.ws.id, employee_id="EMP001",
            start_time=datetime(2026, 11, 20, 9, 30, 0, tzinfo=LOCAL_TZ)
        )
        close_presence_interval(
            self.db, interval_id=inv1.id,
            end_time=datetime(2026, 11, 20, 11, 30, 0, tzinfo=LOCAL_TZ)
        )

        # Interval 2: 13:00 to 15:00 (2 hours = 7200s)
        inv2 = open_presence_interval(
            self.db, session_id=sess.id, workstation_id=self.ws.id, employee_id="EMP001",
            start_time=datetime(2026, 11, 20, 13, 0, 0, tzinfo=LOCAL_TZ)
        )
        close_presence_interval(
            self.db, interval_id=inv2.id,
            end_time=datetime(2026, 11, 20, 15, 0, 0, tzinfo=LOCAL_TZ)
        )

        report = get_shift_daily_report(self.db, target_date="2026-11-20", filter_shift="Day Shift")
        emp_report = next((r for r in report["records"] if r["employee_id"] == "EMP001"), None)
        self.assertIsNotNone(emp_report)
        self.assertEqual(emp_report["total_workstation_seconds"], 14400.0)
        self.assertEqual(emp_report["total_workstation_time"], "04:00:00")

    # =========================================================================
    # SCENARIO 9: Night Shift (crossing midnight) time accumulates without 00:00 reset
    # =========================================================================
    def test_09_night_shift_crossing_midnight_preserves_timer(self):
        self._mark_present("EMP002", date_str="2026-11-20")
        sess = WorkstationSession(
            workstation_id=self.ws.id,
            employee_id="EMP002",
            date="2026-11-20",
            shift="Night Shift",
            status="ACTIVE",
        )
        self.db.add(sess)
        self.db.commit()

        # Interval crosses midnight: 23:00 (Nov 20) to 02:00 (Nov 21) -> 3 hours = 10800s
        inv = open_presence_interval(
            self.db, session_id=sess.id, workstation_id=self.ws.id, employee_id="EMP002",
            start_time=datetime(2026, 11, 20, 23, 0, 0, tzinfo=LOCAL_TZ)
        )
        close_presence_interval(
            self.db, interval_id=inv.id,
            end_time=datetime(2026, 11, 21, 2, 0, 0, tzinfo=LOCAL_TZ)
        )

        # Attributed to the shift date (2026-11-20)
        report = get_shift_daily_report(self.db, target_date="2026-11-20", filter_shift="Night Shift")
        emp_report = next((r for r in report["records"] if r["employee_id"] == "EMP002"), None)
        self.assertIsNotNone(emp_report)
        self.assertEqual(emp_report["total_workstation_seconds"], 10800.0)
        self.assertEqual(emp_report["total_workstation_time"], "03:00:00")

    # =========================================================================
    # SCENARIO 10: Workstation time does NOT accumulate before shift start
    # =========================================================================
    def test_10_time_does_not_accumulate_before_shift_start(self):
        # Shift is 09:00 - 18:00. Time is 07:30 (before start)
        t_early = datetime(2026, 11, 20, 7, 30, 0, tzinfo=LOCAL_TZ)
        self.assertFalse(is_within_shift("09:00 - 18:00", t_early))

        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(
            enrollment_manager=self.mock_enrollment,
            clock_fn=self.clock,
            enforce_shift_window=True,
        )
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")
        engine._handle_presence_confirmed(self.db, self.clock(), t_early)

        self.assertEqual(engine.status, "PAUSED", "Presence before shift hours must not become ACTIVE")
        self.assertIsNone(engine.current_interval_id)

    # =========================================================================
    # SCENARIO 11: Workstation time does NOT accumulate after shift end
    # =========================================================================
    def test_11_time_does_not_accumulate_after_shift_end(self):
        # Shift is 09:00 - 18:00. Time is 18:30 (after end)
        t_late = datetime(2026, 11, 20, 18, 30, 0, tzinfo=LOCAL_TZ)
        self.assertFalse(is_within_shift("09:00 - 18:00", t_late))

        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(
            enrollment_manager=self.mock_enrollment,
            clock_fn=self.clock,
            enforce_shift_window=True,
        )
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")
        engine._handle_presence_confirmed(self.db, self.clock(), t_late)

        self.assertEqual(engine.status, "PAUSED", "Presence after shift hours must not accumulate")

    # =========================================================================
    # SCENARIO 12: Attendance is mandatory before workstation time starts counting
    # =========================================================================
    def test_12_attendance_mandatory_before_workstation_monitoring(self):
        unmarked = upsert_person(self.db, employee_id="EMP999", name="Unmarked Worker")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        with self.assertRaises(ValueError):
            engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP999", validate_attendance=True)
        self.assertFalse(engine.is_monitoring)

    # =========================================================================
    # SCENARIOS 13, 14, 15: Employee edit preserves historical attendance, sessions, and alerts
    # =========================================================================
    def test_13_14_15_employee_edit_preserves_historical_records(self):
        # Create historical records for EMP001
        att = self._mark_present("EMP001")
        sess = WorkstationSession(
            workstation_id=self.ws.id,
            employee_id="EMP001",
            date="2026-11-20",
            total_active_seconds=3600.0,
        )
        self.db.add(sess)
        self.db.commit()

        alert, _ = create_position_alert(
            self.db,
            employee_id="EMP001",
            workstation_id=self.ws.id,
            absent_since=datetime(2026, 11, 20, 11, 0, 0, tzinfo=LOCAL_TZ),
            duration_seconds=950.0,
        )

        # Update profile
        updated_person = update_employee(self.db, self.emp1, {
            "name": "Alice Walker-Smith",
            "department": "Senior Engineering",
            "phone": "+1999888777",
            "email": "alice.smith@example.com",
            "shift_name": "Evening Shift",
            "shift_timing": "14:00 - 22:00",
        })

        self.assertEqual(updated_person.name, "Alice Walker-Smith")
        self.assertEqual(updated_person.department, "Senior Engineering")

        # Verify historical records intact
        att_check = self.db.query(AttendanceLog).filter(AttendanceLog.employee_id == "EMP001").first()
        self.assertIsNotNone(att_check, "Attendance history must be preserved")

        sess_check = self.db.query(WorkstationSession).filter(WorkstationSession.employee_id == "EMP001").first()
        self.assertIsNotNone(sess_check, "Workstation session history must be preserved")

        alert_check = self.db.query(EmployeePositionAlert).filter(EmployeePositionAlert.employee_id == "EMP001").first()
        self.assertIsNotNone(alert_check, "Past alert history must be preserved")

    # =========================================================================
    # SCENARIO 16 & 17: Absence threshold configurable and custom value saved
    # =========================================================================
    def test_16_17_configurable_absence_threshold(self):
        # Default is 15 minutes
        cfg = get_alert_configuration(self.db)
        self.assertEqual(cfg.absence_threshold_minutes, 15)

        # Update to custom 25 minutes
        updated = update_alert_configuration(self.db, 25)
        self.assertEqual(updated.absence_threshold_minutes, 25)

        # Verify applied in presence engine
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(enrollment_manager=self.mock_enrollment, clock_fn=self.clock)
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001")
        self.assertEqual(engine.alert_threshold_seconds, 1500, "25 min * 60 = 1500s")

    # =========================================================================
    # SCENARIO 18: Absence alerts stop when shift ends
    # =========================================================================
    def test_18_absence_alerts_stop_when_shift_ends(self):
        self._mark_present("EMP001")
        engine = WorkstationPresenceEngine(
            enrollment_manager=self.mock_enrollment,
            clock_fn=self.clock,
            enforce_shift_window=True,
        )
        engine.start_monitoring(self.db, workstation_id=self.ws.id, employee_id="EMP001", shift_name="Day Shift")

        # Work during shift
        t_shift = datetime(2026, 11, 20, 17, 30, 0, tzinfo=LOCAL_TZ)
        engine._handle_presence_confirmed(self.db, self.clock(), t_shift)

        # Shift ends at 18:00. Time advances to 18:30 (outside shift)
        t_after_shift = datetime(2026, 11, 20, 18, 30, 0, tzinfo=LOCAL_TZ)
        self.clock.advance(3600.0)
        engine._handle_presence_absent(self.db, self.clock(), t_after_shift)

        alerts = list_position_alerts(self.db, employee_id="EMP001", status="ACTIVE")
        self.assertEqual(len(alerts), 0, "No alerts generated when shift has ended")

    # =========================================================================
    # SCENARIOS 19 & 20: UI Pure White (#FFFFFF) & Black (#111111) theme verification
    # =========================================================================
    def test_19_20_ui_theme_compliance_audit(self):
        import pathlib
        frontend_dir = pathlib.Path(__file__).parent.parent.parent / "frontend" / "src" / "app" / "dashboard"
        files_to_check = [
            frontend_dir / "layout.tsx",
            frontend_dir / "page.tsx",
            frontend_dir / "employees" / "page.tsx",
            frontend_dir / "employees" / "new" / "page.tsx",
            frontend_dir / "alerts" / "page.tsx",
            frontend_dir / "workstations" / "page.tsx",
            frontend_dir / "reports" / "page.tsx",
        ]
        for f in files_to_check:
            self.assertTrue(f.exists(), f"File {f.name} must exist")
            content = f.read_text(encoding="utf-8")
            # Verify primary black button or text styling present
            self.assertTrue(
                ("#111111" in content or "neutral-900" in content) and
                ("bg-white" in content or "#FFFFFF" in content),
                f"File {f.name} must contain high-contrast black & white styling"
            )

    # =========================================================================
    # SCENARIO 21: Next Employee ID ordered sequentially by database state
    # =========================================================================
    def test_21_next_employee_id_sequential_order(self):
        from api.routes.employees import get_next_employee_id
        # Current DB has EMP001 and EMP002 seeded in setUp
        res = get_next_employee_id(self.db)
        self.assertEqual(res["next_employee_id"], "EMP003")

        # Add EMP003
        upsert_person(self.db, employee_id="EMP003", name="Charlie Brown")
        res2 = get_next_employee_id(self.db)
        self.assertEqual(res2["next_employee_id"], "EMP004")

        # Add an employee with a higher gap like EMP010
        upsert_person(self.db, employee_id="EMP010", name="Diana Prince")
        res3 = get_next_employee_id(self.db)
        self.assertEqual(res3["next_employee_id"], "EMP011")


if __name__ == "__main__":
    unittest.main()
