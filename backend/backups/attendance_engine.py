import time
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime
import numpy as np
import cv2
from sqlalchemy.orm import Session

from core.detector import FaceDetector
from core.tracker import FaceTracker
from core.enrollment import EnrollmentManager
from core.config import (
    EMBEDDING_SIMILARITY_THRESHOLD,
    ATTENDANCE_CONFIRMATION_FRAMES,
    ATTENDANCE_CONFIRMATION_WINDOW_SEC,
    LIVENESS_ENABLED,
    LIVENESS_MIN_VARIANCE,
)
from db.crud import log_attendance, is_duplicate_attendance, get_person_by_employee_id
from db.models import now_local

logger = logging.getLogger("attendance_engine")


class AttendanceEngine:
    """
    Facial recognition attendance engine with:
      - Face detection & DeepSORT tracking
      - Embedding matching against enrolled roster
      - Multi-frame confirmation before marking attendance
      - Lightweight anti-spoofing / liveness validation
      - Duplicate prevention per workday
    """

    def __init__(self, enrollment_manager: Optional[EnrollmentManager] = None):
        self.detector = FaceDetector()
        self.tracker = FaceTracker()
        self.enrollment = enrollment_manager or EnrollmentManager()
        
        # Multi-frame confirmation tracking:
        # emp_id -> list of timestamps [t1, t2, ...] within sliding confirmation window
        self.match_history: Dict[str, List[float]] = {}
        
        # Track confirmed attendances during the current session to avoid re-triggering notifications
        self.session_confirmed: Dict[str, float] = {}

    def check_liveness(self, face_crop_bgr: np.ndarray) -> Tuple[bool, float, str]:
        """
        Lightweight anti-spoofing check.
        Uses Laplacian variance to detect flat paper/screen images, extreme blur,
        and high-frequency Moire artifacts.
        """
        if not LIVENESS_ENABLED:
            return True, 1.0, "Liveness disabled"

        if face_crop_bgr is None or face_crop_bgr.size == 0:
            return False, 0.0, "Empty crop"

        gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        if laplacian_var < LIVENESS_MIN_VARIANCE:
            return False, laplacian_var, f"Low texture variance ({laplacian_var:.1f} < {LIVENESS_MIN_VARIANCE})"

        return True, laplacian_var, "Live face confirmed"

    def process_frame(self, frame_bgr: np.ndarray, db: Session) -> Tuple[List[Dict[str, Any]], np.ndarray, Dict[str, Any]]:
        """
        Processes a single camera frame through detection, tracking, liveness,
        recognition, and multi-frame attendance confirmation.
        """
        now_ts = time.time()
        annotated_frame = frame_bgr.copy()
        events = []

        bboxes = self.detector.detect(frame_bgr)  # (top, right, bottom, left)
        tracks = self.tracker.update(frame_bgr, bboxes)  # (track_id, top, right, bottom, left)

        for track_id, top, right, bottom, left in tracks:
            face_crop = self.detector.crop_face(frame_bgr, (top, right, bottom, left))
            if face_crop is None or face_crop.size == 0:
                continue

            # 1. Anti-spoofing check
            is_live, var_score, liveness_msg = self.check_liveness(face_crop)
            if not is_live:
                events.append({
                    "type": "liveness_failed",
                    "track_id": track_id,
                    "bbox": (left, top, right, bottom),
                    "confidence": 0.0,
                    "score": round(var_score, 1),
                    "message": f"Anti-spoofing warning: {liveness_msg}",
                })
                # Draw warning box
                cv2.rectangle(annotated_frame, (left, top), (right, bottom), (0, 0, 255), 2)
                cv2.putText(annotated_frame, "SPOOF / BLUR", (left, max(15, top - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                continue

            # 2. Extract embedding and match against enrolled roster
            embedding = self.enrollment.get_embedding(face_crop)
            if embedding is None:
                continue

            emp_id, name, sim = self.enrollment.match(embedding, threshold=EMBEDDING_SIMILARITY_THRESHOLD)

            if emp_id is None:
                # Unknown face
                events.append({
                    "type": "unknown",
                    "track_id": track_id,
                    "bbox": (left, top, right, bottom),
                    "confidence": round(sim, 2),
                    "message": "Unknown face detected",
                })
                cv2.rectangle(annotated_frame, (left, top), (right, bottom), (0, 165, 255), 2)
                cv2.putText(annotated_frame, f"Unknown ({sim:.2f})", (left, max(15, top - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)
                continue

            # 3. Known face matched — apply multi-frame confirmation
            history = self.match_history.setdefault(emp_id, [])
            # Keep only detections within sliding window
            self.match_history[emp_id] = [t for t in history if now_ts - t <= ATTENDANCE_CONFIRMATION_WINDOW_SEC]
            self.match_history[emp_id].append(now_ts)
            frame_count = len(self.match_history[emp_id])

            box_color = (255, 200, 0)  # Pending confirmation (cyan/yellow)
            label = f"{name} ({frame_count}/{ATTENDANCE_CONFIRMATION_FRAMES})"

            if frame_count >= ATTENDANCE_CONFIRMATION_FRAMES:
                box_color = (0, 255, 0)  # Confirmed (green)
                label = f"{name} [{emp_id}]"

                # Check if already logged in this session
                last_conf_time = self.session_confirmed.get(emp_id, 0)
                if now_ts - last_conf_time > 60:  # Don't spam DB within 60s
                    person = get_person_by_employee_id(db, emp_id)
                    if person:
                        record = log_attendance(db, person, confidence=sim, track_id=track_id)
                        self.session_confirmed[emp_id] = now_ts

                        events.append({
                            "type": "attendance",
                            "track_id": track_id,
                            "bbox": (left, top, right, bottom),
                            "employee_id": emp_id,
                            "employee_name": name,
                            "confidence": round(sim, 2),
                            "status": "CONFIRMED",
                            "is_duplicate": record.is_duplicate,
                            "timestamp": record.timestamp.strftime("%H:%M:%S"),
                            "date": record.date,
                            "message": "Attendance marked successfully" if not record.is_duplicate else "Already marked present today",
                        })
            else:
                events.append({
                    "type": "verifying",
                    "track_id": track_id,
                    "bbox": (left, top, right, bottom),
                    "employee_id": emp_id,
                    "employee_name": name,
                    "confidence": round(sim, 2),
                    "status": "PENDING_CONFIRMATION",
                    "frames": frame_count,
                    "required_frames": ATTENDANCE_CONFIRMATION_FRAMES,
                })

            cv2.rectangle(annotated_frame, (left, top), (right, bottom), box_color, 2)
            cv2.putText(annotated_frame, label, (left, max(15, top - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

        debug_info = {
            "mode": self.detector._mode,
            "detections": len(bboxes),
            "tracks": len(tracks),
            "events_count": len(events),
            "enrolled_count": len(self.enrollment.embeddings),
        }

        return events, annotated_frame, debug_info
