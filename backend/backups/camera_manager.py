import asyncio
import threading
import time
import json
import logging
from typing import List, Optional, Dict, Any
import cv2
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from core.config import (
    CAMERA_SOURCE,
    WORKSTATION_CAMERA_SOURCE,
    PROJECT_ROOT,
)
from core.enrollment import EnrollmentManager
from core.attendance_engine import AttendanceEngine
from core.presence_engine import WorkstationPresenceEngine
from db.models import SessionLocal
from db.crud import get_or_create_default_workstation, recover_unclosed_sessions

logger = logging.getLogger("camera_manager")


class SafeCameraCapture:
    """
    Thread-safe camera frame capture.
    Reads frames in a dedicated thread to ensure frames are never read concurrently,
    avoiding race conditions, frame loss, and OpenCV device locks.
    """

    def __init__(self, source):
        self.source = source
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.is_connected = False
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.thread.start()

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        with self.lock:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.is_connected = False
            self.latest_frame = None
            self.latest_jpeg = None

    def _open_camera(self) -> bool:
        src = self.source
        # Handle string numbers like "0"
        if isinstance(src, str) and src.isdigit():
            src = int(src)

        if isinstance(src, int):
            # Try DirectShow first on Windows for fast laptop webcam capture
            try:
                import sys
                if sys.platform.startswith("win"):
                    self.cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
                    if self.cap.isOpened():
                        self.is_connected = True
                        return True
            except Exception:
                pass
            self.cap = cv2.VideoCapture(src)
        else:
            self.cap = cv2.VideoCapture(src)

        if self.cap and self.cap.isOpened():
            self.is_connected = True
            return True
        self.is_connected = False
        return False

    def _capture_worker(self):
        if not self._open_camera():
            logger.warning(f"[Camera] Failed to open source: {self.source}")

        while self.is_running:
            if not self.cap or not self.cap.isOpened():
                time.sleep(1.0)
                self._open_camera()
                continue

            ret, frame = self.cap.read()
            if not ret or frame is None:
                # If reading video file and reaches end, loop video
                if isinstance(self.source, str) and not self.source.isdigit():
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    time.sleep(0.05)
                    continue
                else:
                    self.is_connected = False
                    time.sleep(0.5)
                    continue

            self.is_connected = True
            with self.lock:
                self.latest_frame = frame

            time.sleep(0.03)  # ~30 FPS

    def read_frame(self) -> Optional[np.ndarray]:
        with self.lock:
            return self.latest_frame.copy() if self.latest_frame is not None else None


class AttendanceCameraManager:
    """Manages attendance camera pipeline and WebSocket broadcasts."""

    def __init__(self):
        self.camera_source = CAMERA_SOURCE
        self.capture: Optional[SafeCameraCapture] = None
        self.enrollment = EnrollmentManager()
        self.engine = AttendanceEngine(self.enrollment)
        self.active_websockets: List[WebSocket] = []
        self.annotated_jpeg: Optional[bytes] = None
        self.is_running = False
        self.started_at: float = 0.0
        self.has_streamed_frame = False
        self.lock = threading.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_websockets.append(websocket)
        try:
            await self.send_message({
                "type": "system",
                "status": "running" if self.is_running else "stopped",
                "camera_connected": self.capture.is_connected if self.capture else False,
            })
        except Exception:
            self.disconnect(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_websockets:
            self.active_websockets.remove(websocket)

    async def send_message(self, message: dict):
        dead_sockets = []
        for ws in list(self.active_websockets):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead_sockets.append(ws)
        for ws in dead_sockets:
            self.disconnect(ws)

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.started_at = time.time()
        self.has_streamed_frame = False
        self.capture = SafeCameraCapture(self.camera_source)
        self.capture.start()
        logger.info(f"[AttendanceCamera] Started laptop camera on source {self.camera_source}")

    def stop(self):
        self.is_running = False
        self.has_streamed_frame = False
        if self.capture:
            self.capture.stop()
            self.capture = None
        with self.lock:
            self.annotated_jpeg = None
        logger.info("[AttendanceCamera] Stopped.")

    async def process_loop(self):
        """Main async pipeline loop."""
        while True:
            if not self.is_running or not self.capture:
                await asyncio.sleep(0.3)
                continue

            frame = self.capture.read_frame()
            if frame is None:
                # Allow a 5-second grace window for camera hardware to initialize
                # without emitting false disconnect errors
                elapsed = time.time() - self.started_at
                if elapsed > 5.0 and not self.capture.is_connected:
                    await self.send_message({
                        "type": "system",
                        "status": "error",
                        "message": "Laptop camera disconnected or unavailable. Please ensure camera access is allowed.",
                    })
                await asyncio.sleep(0.1)
                continue

            # First frame received after starting
            if not self.has_streamed_frame:
                self.has_streamed_frame = True
                await self.send_message({
                    "type": "system",
                    "status": "running",
                    "camera_connected": True,
                })

            db = SessionLocal()
            try:
                events, annotated, debug_info = self.engine.process_frame(frame, db)
                
                # Update annotated JPEG frame for video stream
                ret, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ret:
                    with self.lock:
                        self.annotated_jpeg = jpeg.tobytes()

                # Broadcast events
                for ev in events:
                    await self.send_message(ev)

            except Exception as e:
                logger.error(f"[AttendanceCamera] Process error: {e}")
            finally:
                db.close()

            await asyncio.sleep(0.04)  # ~25 FPS

    def get_frame(self) -> Optional[bytes]:
        with self.lock:
            return self.annotated_jpeg


class WorkstationCameraManager:
    """Manages workstation presence camera pipeline, timer, and WebSocket broadcasts."""

    def __init__(self, enrollment_manager: EnrollmentManager):
        self.camera_source = WORKSTATION_CAMERA_SOURCE
        self.capture: Optional[SafeCameraCapture] = None
        self.engine = WorkstationPresenceEngine(enrollment_manager)
        self.active_websockets: List[WebSocket] = []
        self.annotated_jpeg: Optional[bytes] = None
        self.is_running = False
        self.started_at: float = 0.0
        self.lock = threading.Lock()
        self.latest_telemetry: Dict[str, Any] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_websockets.append(websocket)
        db = SessionLocal()
        try:
            status = self.engine.get_status_telemetry(db)
            await websocket.send_text(json.dumps({"type": "telemetry", **status}))
        except (WebSocketDisconnect, Exception):
            self.disconnect(websocket)
        finally:
            db.close()

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_websockets:
            self.active_websockets.remove(websocket)

    async def send_message(self, message: dict):
        dead_sockets = []
        for ws in list(self.active_websockets):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead_sockets.append(ws)
        for ws in dead_sockets:
            self.disconnect(ws)

    def start_camera(self):
        if self.is_running:
            return
        self.is_running = True
        self.started_at = time.time()
        self.capture = SafeCameraCapture(self.camera_source)
        self.capture.start()
        logger.info(f"[WorkstationCamera] Started on source {self.camera_source}")

    def stop_camera(self):
        self.is_running = False
        if self.capture:
            self.capture.stop()
            self.capture = None
        with self.lock:
            self.annotated_jpeg = None
        logger.info("[WorkstationCamera] Stopped.")

    async def process_loop(self):
        while True:
            if not self.is_running or not self.capture:
                await asyncio.sleep(0.3)
                continue

            frame = self.capture.read_frame()
            db = SessionLocal()
            try:
                if frame is None:
                    elapsed = time.time() - self.started_at
                    if elapsed > 5.0 and not self.capture.is_connected:
                        self.engine.handle_camera_disconnection(db, "Camera disconnected")
                        await self.send_message({
                            "type": "camera_error",
                            "message": "Workstation camera disconnected",
                        })
                    await asyncio.sleep(0.1)
                    continue

                annotated, telemetry = self.engine.process_workstation_frame(frame, db)
                self.latest_telemetry = telemetry

                # Encode frame
                ret, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ret:
                    with self.lock:
                        self.annotated_jpeg = jpeg.tobytes()

                # Broadcast telemetry to connected clients
                await self.send_message({
                    "type": "telemetry",
                    **telemetry,
                })

            except Exception as e:
                logger.error(f"[WorkstationCamera] Process error: {e}")
            finally:
                db.close()

            await asyncio.sleep(0.08)  # ~12 FPS for presence tracking (efficient CPU use)

    def get_frame(self) -> Optional[bytes]:
        with self.lock:
            return self.annotated_jpeg


# Singleton instances
attendance_manager = AttendanceCameraManager()
workstation_manager = WorkstationCameraManager(attendance_manager.enrollment)
manager = attendance_manager  # Backward compatibility alias
