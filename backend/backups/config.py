import os
from dotenv import load_dotenv

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# =========================
# Camera
# =========================

CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")
try:
    CAMERA_SOURCE = int(CAMERA_SOURCE)
except ValueError:
    pass
# =========================
# YOLO Face Detection
# =========================

YOLO_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "yolov8n-face.pt")

YOLO_CONF_THRESHOLD = 0.5
YOLO_IOU_THRESHOLD = 0.4

# Keep these if other files in your project use them
YOLO_CONF = YOLO_CONF_THRESHOLD
YOLO_IOU = YOLO_IOU_THRESHOLD

MIN_FACE_SIZE = 30


# =========================
# FaceNet
# =========================

FACENET_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "facenet.pt")

EMBEDDING_SIMILARITY_THRESHOLD = 0.7

KNOWN_FACES_DIR = os.path.join(PROJECT_ROOT, "data", "known_faces")
EMBEDDINGS_CACHE = os.path.join(PROJECT_ROOT, "data", "embeddings")


# =========================
# DeepSORT
# =========================

MAX_AGE = 30
N_INIT = 3

DEEPSORT_MAX_AGE = MAX_AGE
DEEPSORT_N_INIT = N_INIT
DEEPSORT_MAX_DIST = 0.2


# =========================
# Neon PostgreSQL / SQLite Local Database
# =========================

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    local_sqlite_path = os.path.join(PROJECT_ROOT, "data", "attendance.db").replace("\\", "/")
    DATABASE_URL = f"sqlite:///{local_sqlite_path}"
    print(f"[Config] DATABASE_URL not set in .env — using local SQLite: {DATABASE_URL}")

# =========================
# Attendance & Multi-Frame Confirmation
# =========================

DUPLICATE_WINDOW_SECONDS = int(os.getenv("DUPLICATE_WINDOW_SECONDS", "60"))
ATTENDANCE_CONFIRMATION_FRAMES = int(os.getenv("ATTENDANCE_CONFIRMATION_FRAMES", "3"))
ATTENDANCE_CONFIRMATION_WINDOW_SEC = float(os.getenv("ATTENDANCE_CONFIRMATION_WINDOW_SEC", "2.0"))

# =========================
# Liveness & Anti-Spoofing
# =========================

LIVENESS_ENABLED = os.getenv("LIVENESS_ENABLED", "True").lower() in ("true", "1", "yes")
LIVENESS_MIN_VARIANCE = float(os.getenv("LIVENESS_MIN_VARIANCE", "10.0"))

# =========================
# Workstation Presence Monitoring
# =========================

WORKSTATION_CAMERA_SOURCE = os.getenv("WORKSTATION_CAMERA_SOURCE", str(CAMERA_SOURCE))
# Handle integer camera sources (e.g. "0")
try:
    WORKSTATION_CAMERA_SOURCE = int(WORKSTATION_CAMERA_SOURCE)
except ValueError:
    pass

WORKSTATION_ABSENCE_GRACE_SECONDS = int(os.getenv("WORKSTATION_ABSENCE_GRACE_SECONDS", "60"))
WORKSTATION_PRESENCE_FRAMES = int(os.getenv("WORKSTATION_PRESENCE_FRAMES", "3"))
WORKSTATION_DETECTION_INTERVAL = float(os.getenv("WORKSTATION_DETECTION_INTERVAL", "0.2"))  # 5 FPS check

# Default Workstation ROI (Normalized: x1, y1, x2, y2 from 0.0 to 1.0)
DEFAULT_WORKSTATION_ROI = [0.0, 0.0, 1.0, 1.0]

# Timezone string
TIMEZONE_NAME = os.getenv("TIMEZONE_NAME", "Asia/Kolkata")