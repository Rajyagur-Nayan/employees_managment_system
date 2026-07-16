import cv2
import streamlit as st
from core.pipeline import AttendancePipeline
from db.models import SessionLocal


def render():
    st.title("Live Attendance Feed")

    pipeline_ready = st.empty()

    @st.cache_resource
    def load_pipeline():
        # Uses FaceDetector (YOLO if models/yolov8n-face.pt exists, else HOG
        # fallback), FaceTracker, and FaceRecognizer under the hood — see
        # core/pipeline.py.
        return AttendancePipeline()

    pipeline = load_pipeline()
    pipeline_ready.success("Models loaded!")

    run = st.toggle("Start Camera")
    frame_placeholder = st.empty()
    log_placeholder = st.empty()
    debug_placeholder = st.empty()

    recent_logs = []

    if run:
        from app.config import CAMERA_SOURCE
        cap = cv2.VideoCapture(CAMERA_SOURCE)
        db = SessionLocal()

        while run:
            ret, frame = cap.read()
            if not ret:
                st.error("Camera not accessible.")
                break

            results, frame, debug_info = pipeline.process_frame(frame, db)

            debug_placeholder.caption(
                f"Detector mode: {debug_info['mode']} | "
                f"Raw detections: {debug_info['raw_detections']} | "
                f"Confirmed tracks: {debug_info['confirmed_tracks']} | "
                f"Recognized: {debug_info['recognized']}"
            )

            for res in results:
                left, top, right, bottom = res["bbox"]
                if res["emp_id"]:
                    color = (0, 200, 100)
                    label = f"{res['name']} {res['confidence']:.0%}"
                    recent_logs.insert(0, f"✅ {res['name']} seen at {res['confidence']:.0%} confidence")
                else:
                    color = (0, 0, 220)
                    label = f"Unknown {res['confidence']:.0%}"

                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                cv2.putText(frame, label, (left, top - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_placeholder.image(frame_rgb, channels="RGB", use_column_width=True)

            if recent_logs:
                log_placeholder.write("\n".join(recent_logs[:5]))

        cap.release()
        db.close()
