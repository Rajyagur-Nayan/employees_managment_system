"""
core/detector.py
Uses YOLOv8-face to detect face bounding boxes in a frame.
Falls back to face_recognition HOG detector if YOLO weights are missing.
"""

import cv2
import numpy as np
from typing import List, Tuple
from core.config import YOLO_MODEL_PATH, YOLO_CONF, YOLO_IOU, MIN_FACE_SIZE
import os

# Type alias: (top, right, bottom, left) in pixels
BBox = Tuple[int, int, int, int]


class FaceDetector:
    def __init__(self):
        self._model = None
        self._mode  = "hog"      # fallback
        self._load()

    def _load(self):
        if os.path.exists(YOLO_MODEL_PATH):
            try:
                from ultralytics import YOLO
                self._model = YOLO(YOLO_MODEL_PATH)
                self._mode  = "yolo"
                print(f"[Detector] YOLO loaded from {YOLO_MODEL_PATH}")
            except Exception as e:
                print(f"[Detector] YOLO load failed ({e}), falling back to HOG.")
        else:
            print(f"[Detector] {YOLO_MODEL_PATH} not found — using HOG fallback.")

    def detect(self, frame_bgr: np.ndarray) -> List[BBox]:
        """
        Returns list of (top, right, bottom, left) face bounding boxes.
        Filters out boxes smaller than MIN_FACE_SIZE.
        """
        if self._mode == "yolo":
            return self._detect_yolo(frame_bgr)
        return self._detect_hog(frame_bgr)

    # ── YOLO ──────────────────────────────────────────────────────────────────
    def _detect_yolo(self, frame_bgr: np.ndarray) -> List[BBox]:
        results = self._model.predict(
            frame_bgr,
            conf=YOLO_CONF,
            iou=YOLO_IOU,
            verbose=False,
        )
        boxes = []
        for r in results:
            for box in r.boxes.xyxy.cpu().numpy():
                x1, y1, x2, y2 = map(int, box[:4])
                h = y2 - y1
                if h < MIN_FACE_SIZE:
                    continue
                # Convert to (top, right, bottom, left)
                boxes.append((y1, x2, y2, x1))
        return boxes

    # ── HOG fallback ──────────────────────────────────────────────────────────
    def _detect_hog(self, frame_bgr: np.ndarray) -> List[BBox]:
        import face_recognition
        small  = cv2.resize(frame_bgr, (0, 0), fx=0.5, fy=0.5)
        rgb    = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        locs   = face_recognition.face_locations(rgb, model="hog")
        scale  = 2
        boxes  = []
        for (top, right, bottom, left) in locs:
            h = (bottom - top) * scale
            if h < MIN_FACE_SIZE:
                continue
            boxes.append((top * scale, right * scale, bottom * scale, left * scale))
        return boxes

    def crop_face(self, frame_bgr: np.ndarray, bbox: BBox, padding: int = 10) -> np.ndarray:
        """Crop a single face from the frame with optional padding."""
        top, right, bottom, left = bbox
        h, w = frame_bgr.shape[:2]
        top    = max(0, top - padding)
        left   = max(0, left - padding)
        bottom = min(h, bottom + padding)
        right  = min(w, right + padding)
        return frame_bgr[top:bottom, left:right]