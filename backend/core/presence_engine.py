import time
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timezone, timedelta
import numpy as np
import cv2
from sqlalchemy.orm import Session

from core.detector import FaceDetector
from core.enrollment import EnrollmentManager
from core.config import (
    WORKSTATION_ABSENCE_GRACE_SECONDS,
    DEFAULT_WORKSTATION_ROI,
    EMBEDDING_SIMILARITY_THRESHOLD,
)
from db.models import (
    WorkstationSession,
    PresenceInterval,
    Workstation,
    Person,
    now_local,
    LOCAL_TZ,
)
from db.crud import (
    get_or_create_default_workstation,
    create_or_get_workstation_session,
    open_presence_interval,
    close_presence_interval,
    calculate_total_active_seconds_today,
    recalculate_session_active_seconds,
    log_audit_event,
)

logger = logging.getLogger("presence_engine")


class WorkstationPresenceEngine:
    """
    Manages workstation presence tracking and precision active time accumulation.
    Features:
      - Region of Interest (ROI) workstation area filtering
      - Person / Face recognition association with assigned employee
      - Monotonic clock for rock-solid elapsed time calculations
      - Absence grace period (configurable default 60s)
      - Non-overlapping discrete interval persistence
      - Recovery after restart & camera outage protection
    """

    def __init__(
        self,
        enrollment_manager: Optional[EnrollmentManager] = None,
        clock_fn=time.monotonic,
    ):
        self.detector = FaceDetector()
        self.enrollment = enrollment_manager or EnrollmentManager()
        self.clock = clock_fn  # Monotonic clock function (injectable for unit tests)

        # Monitored state
        self.is_monitoring: bool = False
        self.workstation_id: Optional[int] = None
        self.employee_id: Optional[str] = None
        self.employee_name: Optional[str] = None
        
        # State machine: "STOPPED", "ACTIVE", "PENDING_ABSENCE", "PAUSED"
        self.status: str = "STOPPED"
        self.current_session_id: Optional[int] = None
        self.current_interval_id: Optional[int] = None

        # Timing references
        self.interval_start_mono: Optional[float] = None
        self.last_confirmed_presence_mono: Optional[float] = None
        self.last_confirmed_presence_wall: Optional[datetime] = None
        self.absence_started_mono: Optional[float] = None
        self.grace_period_seconds: int = WORKSTATION_ABSENCE_GRACE_SECONDS

        # ROI: [x1, y1, x2, y2] normalized 0.0 to 1.0
        self.roi: List[float] = list(DEFAULT_WORKSTATION_ROI)

        # Consecutive confirmation counter to avoid single-frame flickering
        self.presence_confirmation_count: int = 0
        self.min_confirmation_frames: int = 2

        # Camera health status
        self.is_camera_connected: bool = True
        self.last_frame_time_mono: float = self.clock()

    def set_roi(self, x1: float, y1: float, x2: float, y2: float):
        """Sets normalized ROI coordinates (0.0 - 1.0)."""
        self.roi = [
            max(0.0, min(1.0, x1)),
            max(0.0, min(1.0, y1)),
            max(0.0, min(1.0, x2)),
            max(0.0, min(1.0, y2)),
        ]

    def is_box_inside_roi(self, bbox: Tuple[int, int, int, int], frame_shape: Tuple[int, int]) -> bool:
        """
        Tests if detection bounding box (left, top, right, bottom) intersects
        or has its center within the configured workstation ROI.
        """
        h, w = frame_shape[:2]
        if w == 0 or h == 0:
            return False

        left, top, right, bottom = bbox
        cx = (left + right) / 2.0 / w
        cy = (top + bottom) / 2.0 / h

        roi_x1, roi_y1, roi_x2, roi_y2 = self.roi
        # Expand slightly (tolerance) for edge detections
        return (roi_x1 - 0.05 <= cx <= roi_x2 + 0.05) and (roi_y1 - 0.05 <= cy <= roi_y2 + 0.05)

    def start_monitoring(
        self,
        db: Session,
        workstation_id: int,
        employee_id: str,
        operator: str = "admin",
    ):
        """Starts a workstation monitoring session for an assigned employee."""
        self.workstation_id = workstation_id
        self.employee_id = employee_id

        # Lookup employee name and workstation
        person = db.query(Person).filter(Person.employee_id == employee_id).first()
        self.employee_name = person.name if person else employee_id

        ws = db.query(Workstation).filter(Workstation.id == workstation_id).first()
        if ws:
            self.grace_period_seconds = ws.absence_grace_seconds or WORKSTATION_ABSENCE_GRACE_SECONDS
            if ws.roi_x2 > ws.roi_x1 and ws.roi_y2 > ws.roi_y1:
                self.roi = [ws.roi_x1, ws.roi_y1, ws.roi_x2, ws.roi_y2]

        # Get or create DB session
        session = create_or_get_workstation_session(db, workstation_id, employee_id)
        session.status = "PAUSED"  # Wait for first presence confirmation
        db.commit()
        self.current_session_id = session.id

        self.is_monitoring = True
        self.status = "PAUSED"
        self.current_interval_id = None
        self.interval_start_mono = None
        self.last_confirmed_presence_mono = None
        self.absence_started_mono = None
        self.presence_confirmation_count = 0

        log_audit_event(
            db,
            event_type="WORKSTATION_START",
            employee_id=employee_id,
            workstation_id=workstation_id,
            operator=operator,
            details=f"Monitoring started for {self.employee_name} ({employee_id}) on Workstation {ws.code if ws else workstation_id}",
        )
        logger.info(f"[Presence] Monitoring started for {employee_id} at workstation {workstation_id}")

    def stop_monitoring(self, db: Session, operator: str = "admin"):
        """Stops the active workstation monitoring session and finalizes open intervals."""
        if not self.is_monitoring:
            return

        now_wall = now_local()
        # Close any active interval at last confirmed presence time
        if self.current_interval_id is not None:
            close_time = self.last_confirmed_presence_wall or now_wall
            close_presence_interval(db, self.current_interval_id, end_time=close_time)
            self.current_interval_id = None

        if self.current_session_id:
            session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
            if session:
                session.status = "STOPPED"
                session.session_end = now_wall
                db.commit()
                recalculate_session_active_seconds(db, session.id)

        log_audit_event(
            db,
            event_type="WORKSTATION_STOP",
            employee_id=self.employee_id,
            workstation_id=self.workstation_id,
            operator=operator,
            details=f"Monitoring stopped for {self.employee_name} ({self.employee_id})",
        )

        self.is_monitoring = False
        self.status = "STOPPED"
        self.interval_start_mono = None
        self.last_confirmed_presence_mono = None
        self.absence_started_mono = None
        logger.info(f"[Presence] Monitoring stopped for {self.employee_id}")

    def process_workstation_frame(
        self,
        frame_bgr: np.ndarray,
        db: Session,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Processes camera frame for workstation presence detection, updates precision timer,
        and manages grace period state transitions.
        """
        now_mono = self.clock()
        now_wall = now_local()
        self.last_frame_time_mono = now_mono
        self.is_camera_connected = True

        annotated_frame = frame_bgr.copy()
        h, w = frame_bgr.shape[:2]

        # Draw ROI overlay on preview
        rx1, ry1, rx2, ry2 = int(self.roi[0] * w), int(self.roi[1] * h), int(self.roi[2] * w), int(self.roi[3] * h)
        cv2.rectangle(annotated_frame, (rx1, ry1), (rx2, ry2), (255, 255, 0), 2)
        cv2.putText(annotated_frame, "WORKSTATION AREA", (rx1 + 5, ry1 + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        presence_in_roi = False
        matched_identity = False
        detected_person_name = "Unknown"
        confidence_score = 0.0

        if self.is_monitoring:
            bboxes = self.detector.detect(frame_bgr)
            for top, right, bottom, left in bboxes:
                bbox_ltrb = (left, top, right, bottom)
                if not self.is_box_inside_roi(bbox_ltrb, (h, w)):
                    # Person in room but outside workstation ROI: ignore!
                    cv2.rectangle(annotated_frame, (left, top), (right, bottom), (100, 100, 100), 1)
                    continue

                # Inside workstation ROI
                presence_in_roi = True
                face_crop = self.detector.crop_face(frame_bgr, (top, right, bottom, left))
                if face_crop is not None and face_crop.size > 0:
                    emb = self.enrollment.get_embedding(face_crop)
                    if emb is not None:
                        matched_id, m_name, sim = self.enrollment.match(emb, threshold=EMBEDDING_SIMILARITY_THRESHOLD)
                        confidence_score = sim
                        if matched_id == self.employee_id:
                            matched_identity = True
                            detected_person_name = m_name
                            cv2.rectangle(annotated_frame, (left, top), (right, bottom), (0, 255, 0), 2)
                            cv2.putText(annotated_frame, f"{m_name} ({sim:.2f})", (left, max(15, top - 8)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                            break
                        else:
                            detected_person_name = m_name or "Unknown"
                            cv2.rectangle(annotated_frame, (left, top), (right, bottom), (0, 165, 255), 2)
                            cv2.putText(annotated_frame, f"Different: {detected_person_name}", (left, max(15, top - 8)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)

            # Determine confirmed presence
            is_confirmed_present = matched_identity or (presence_in_roi and self.employee_id is None)

            # -------------------------------------------------------------
            # STATE MACHINE & TIMER LOGIC
            # -------------------------------------------------------------
            if is_confirmed_present:
                self.presence_confirmation_count += 1
                if self.presence_confirmation_count >= self.min_confirmation_frames:
                    self._handle_presence_confirmed(db, now_mono, now_wall)
            else:
                self.presence_confirmation_count = max(0, self.presence_confirmation_count - 1)
                self._handle_presence_absent(db, now_mono, now_wall)

        telemetry = self.get_status_telemetry(db, now_mono)
        return annotated_frame, telemetry

    def _handle_presence_confirmed(self, db: Session, now_mono: float, now_wall: datetime):
        """Presence confirmed in workstation ROI."""
        self.last_confirmed_presence_mono = now_mono
        self.last_confirmed_presence_wall = now_wall

        if self.status == "PENDING_ABSENCE":
            # CANCEL PENDING ABSENCE! Employee returned within grace period!
            logger.info(f"[Presence] Employee returned within grace period. Pending absence cancelled.")
            self.status = "ACTIVE"
            self.absence_started_mono = None
            if self.current_session_id:
                session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
                if session:
                    session.status = "ACTIVE"
                    session.last_presence_time = now_wall
                    session.absence_started_at = None
                    db.commit()

        elif self.status in ("PAUSED", "STOPPED") and self.is_monitoring:
            # Transition from PAUSED to ACTIVE: Open a new discrete interval!
            logger.info(f"[Presence] Presence confirmed. Opening new presence interval.")
            self.status = "ACTIVE"
            self.interval_start_mono = now_mono
            self.absence_started_mono = None

            if self.current_session_id and self.workstation_id and self.employee_id:
                interval = open_presence_interval(
                    db,
                    session_id=self.current_session_id,
                    workstation_id=self.workstation_id,
                    employee_id=self.employee_id,
                    start_time=now_wall,
                )
                self.current_interval_id = interval.id
                session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
                if session:
                    session.status = "ACTIVE"
                    session.last_presence_time = now_wall
                    db.commit()

        elif self.status == "ACTIVE":
            # Keep timer running, update last presence in DB periodically (every 5s)
            if self.current_session_id:
                session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
                if session:
                    session.last_presence_time = now_wall
                    db.commit()

    def _handle_presence_absent(self, db: Session, now_mono: float, now_wall: datetime):
        """Presence not detected in workstation ROI."""
        if self.status == "ACTIVE":
            # Transition to PENDING_ABSENCE and start grace period countdown
            logger.info(f"[Presence] Employee absent from ROI. Entering PENDING_ABSENCE grace period.")
            self.status = "PENDING_ABSENCE"
            self.absence_started_mono = now_mono

            if self.current_session_id:
                session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
                if session:
                    session.status = "PENDING_ABSENCE"
                    session.absence_started_at = now_wall
                    db.commit()

        elif self.status == "PENDING_ABSENCE":
            # Check if grace period has expired
            absence_elapsed = now_mono - (self.absence_started_mono or now_mono)
            if absence_elapsed >= self.grace_period_seconds:
                # GRACE PERIOD EXPIRED! Close interval at last confirmed presence time!
                logger.info(f"[Presence] Grace period expired ({absence_elapsed:.1f}s >= {self.grace_period_seconds}s). Pausing timer.")
                self.status = "PAUSED"
                self.absence_started_mono = None

                # Close active interval at last confirmed presence time (not fabricated during absence)
                if self.current_interval_id:
                    close_time = self.last_confirmed_presence_wall or now_wall
                    close_presence_interval(db, self.current_interval_id, end_time=close_time)
                    self.current_interval_id = None
                    self.interval_start_mono = None

                if self.current_session_id:
                    session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
                    if session:
                        session.status = "PAUSED"
                        session.absence_started_at = None
                        db.commit()

    def handle_camera_disconnection(self, db: Session, reason: str = "Camera disconnected"):
        """Called if camera drops or frames stop arriving."""
        self.is_camera_connected = False
        now_wall = now_local()

        if self.status in ("ACTIVE", "PENDING_ABSENCE"):
            logger.warning(f"[Presence] Camera disconnected during active session. Closing interval as uncertain.")
            if self.current_interval_id:
                close_time = self.last_confirmed_presence_wall or now_wall
                close_presence_interval(
                    db,
                    self.current_interval_id,
                    end_time=close_time,
                    is_uncertain=True,
                    reason=reason,
                )
                self.current_interval_id = None
                self.interval_start_mono = None

            self.status = "PAUSED"
            if self.current_session_id:
                session = db.query(WorkstationSession).filter(WorkstationSession.id == self.current_session_id).first()
                if session:
                    session.status = "PAUSED"
                    db.commit()

            log_audit_event(
                db,
                event_type="CAMERA_DISCONNECTED",
                employee_id=self.employee_id,
                workstation_id=self.workstation_id,
                operator="system",
                details=f"Camera disconnection detected: {reason}",
            )

    def get_status_telemetry(self, db: Session, now_mono: Optional[float] = None) -> Dict[str, Any]:
        """Calculates accurate live telemetry for display on the workstation UI."""
        now_m = now_mono or self.clock()

        # 1. Total active seconds from saved closed intervals today
        saved_seconds = 0.0
        if self.employee_id and self.workstation_id:
            saved_seconds = calculate_total_active_seconds_today(db, self.workstation_id, self.employee_id)

        # 2. Live seconds in the currently open active interval
        current_interval_seconds = 0.0
        if self.status in ("ACTIVE", "PENDING_ABSENCE") and self.interval_start_mono is not None:
            # If pending absence, active time was locked at last_confirmed_presence_mono
            if self.status == "PENDING_ABSENCE" and self.last_confirmed_presence_mono is not None:
                current_interval_seconds = max(0.0, self.last_confirmed_presence_mono - self.interval_start_mono)
            else:
                current_interval_seconds = max(0.0, now_m - self.interval_start_mono)

        total_active_seconds = saved_seconds + current_interval_seconds

        # 3. Grace period remaining
        grace_remaining = 0
        if self.status == "PENDING_ABSENCE" and self.absence_started_mono is not None:
            elapsed_abs = now_m - self.absence_started_mono
            grace_remaining = max(0, int(self.grace_period_seconds - elapsed_abs))

        last_pres_str = (
            self.last_confirmed_presence_wall.strftime("%H:%M:%S")
            if self.last_confirmed_presence_wall
            else "None"
        )

        return {
            "is_monitoring": self.is_monitoring,
            "status": self.status,  # "ACTIVE", "PENDING_ABSENCE", "PAUSED", "STOPPED"
            "workstation_id": self.workstation_id,
            "employee_id": self.employee_id,
            "employee_name": self.employee_name,
            "live_interval_seconds": round(current_interval_seconds, 1),
            "total_active_seconds": round(total_active_seconds, 1),
            "total_active_formatted": self.format_seconds(total_active_seconds),
            "grace_remaining_seconds": grace_remaining,
            "grace_period_total": self.grace_period_seconds,
            "last_confirmed_presence": last_pres_str,
            "is_camera_connected": self.is_camera_connected,
            "roi": self.roi,
        }

    @staticmethod
    def format_seconds(seconds: float) -> str:
        s = int(seconds)
        hours = s // 3600
        minutes = (s % 3600) // 60
        secs = s % 60
        return f"{hours:02d}h {minutes:02d}m {secs:02d}s"
