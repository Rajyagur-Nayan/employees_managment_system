"""
core/pipeline.py — Main orchestration loop.

Ties together FaceDetector (core/detector.py), FaceTracker (core/tracker.py),
and FaceRecognizer (core/recognizer.py) into a single per-frame pipeline:
detect -> track -> recognize -> log attendance -> alert.
"""
from sqlalchemy.orm import Session

from core.detector import FaceDetector
from core.recognizer import FaceRecognizer
from core.tracker import FaceTracker
from db.models import SessionLocal, Person
from db.crud import log_attendance
from alerts.notifier import send_alert


class AttendancePipeline:
    def __init__(self):
        self.detector = FaceDetector()
        self.recognizer = FaceRecognizer()
        self.tracker = FaceTracker()

    def process_frame(self, frame, db: Session):
        """
        Runs one frame through detect -> track -> recognize -> log.
        Returns (results, frame, debug_info) where results is a list of dicts
        describing each recognized face in this frame, and debug_info is a
        dict of per-stage counts useful for troubleshooting.
        """
        bboxes = self.detector.detect(frame)  # list of (top, right, bottom, left)
        tracks = self.tracker.update(frame, bboxes)  # list of (track_id, top, right, bottom, left)

        results = []
        for track_id, top, right, bottom, left in tracks:
            face_crop = frame[top:bottom, left:right]
            if face_crop.size == 0:
                continue

            embedding = self.recognizer.get_embedding(face_crop)
            if embedding is None:
                continue

            emp_id, name, conf = self.recognizer.identify(embedding)
            if emp_id:
                person = db.query(Person).filter(Person.employee_id == emp_id).first()
                if person:
                    record = log_attendance(db, person, conf, track_id)
                    if not record.is_duplicate:
                        send_alert(person, record)  # fire-and-forget
                results.append({
                    "track_id": track_id,
                    "bbox": (left, top, right, bottom),
                    "name": name,
                    "emp_id": emp_id,
                    "confidence": round(conf, 2),
                })

        debug_info = {
            "mode": self.detector._mode,
            "raw_detections": len(bboxes),
            "confirmed_tracks": len(tracks),
            "recognized": len(results),
        }
        return results, frame, debug_info
