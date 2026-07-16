import os
from dotenv import load_dotenv

load_dotenv()

CAMERA_SOURCE = 0
YOLO_MODEL_PATH = "models/yolov8n-face.pt"
YOLO_CONF_THRESHOLD = 0.5
YOLO_IOU_THRESHOLD = 0.4
YOLO_CONF = 0.5
YOLO_IOU = 0.4
MIN_FACE_SIZE = 30
FACENET_MODEL_PATH = "models/facenet.pt"
EMBEDDING_SIMILARITY_THRESHOLD = 0.7
KNOWN_FACES_DIR = "data/known_faces"
EMBEDDINGS_CACHE = "data/embeddings"
MAX_AGE = 30
N_INIT = 3
# DeepSORT tracker settings (core/tracker.py expects these exact names)
DEEPSORT_MAX_AGE = MAX_AGE
DEEPSORT_N_INIT = N_INIT
DEEPSORT_MAX_DIST = 0.2
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/attendance_db")
ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM")
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN")
TWILIO_FROM = os.getenv("TWILIO_FROM")
DUPLICATE_WINDOW_SECONDS = 60