# Smart Attendance System

A real-time face recognition attendance system that detects, tracks, and identifies people from a live camera feed, logs attendance to PostgreSQL, and sends email alerts — with a Streamlit dashboard for live monitoring and analytics.

## Features

- **Real-time face detection** via YOLOv8-face (with automatic fallback to a HOG-based detector if YOLO weights aren't available)
- **Multi-object tracking** across frames using DeepSORT, so the same person isn't logged twice per session
- **Face recognition** via FaceNet embeddings, matched against a registered database of known faces using cosine similarity
- **Duplicate-entry suppression** — won't re-log the same person within a configurable time window
- **PostgreSQL-backed attendance records** with full CRUD support
- **Email alerting** (Gmail SMTP) on recognized entries, with optional SendGrid/Twilio support
- **Streamlit dashboard** with live camera view, analytics, and per-person attendance history

## Tech Stack

- **Detection:** YOLOv8 (Ultralytics)
- **Tracking:** DeepSORT
- **Recognition:** FaceNet (facenet-pytorch)
- **Database:** PostgreSQL
- **Frontend:** Streamlit
- **Alerts:** Gmail SMTP (+ optional SendGrid / Twilio)

## Pipeline Flow

```
Camera → YOLO (detect faces) → DeepSORT (track IDs) → FaceNet (identify)
       → Duplicate check → PostgreSQL (log attendance) → Email alert
```

1. **Detection** — each frame is scanned for faces via YOLOv8-face; falls back to HOG detection if the YOLO model file isn't present
2. **Tracking** — DeepSORT assigns a persistent ID to each detected face across frames, so a person isn't processed twice per pass
3. **Recognition** — each tracked face is cropped and passed through FaceNet to generate an embedding, then compared via cosine similarity against a precomputed cache of known-face embeddings
4. **Duplicate suppression** — if the same person was already logged within `DUPLICATE_WINDOW_SECONDS`, the new detection is ignored
5. **Logging & alerting** — a new entry is written to PostgreSQL, and an email alert is sent to the configured recipient

## Project Structure

```
├── main.py                     # Pipeline entry point (camera loop)
├── app/
│   ├── main.py                  # Streamlit app entry point
│   ├── config.py                # All configuration constants (thresholds, paths, env vars)
│   └── pages/
│       ├── live.py               # Live camera view page
│       ├── dashboard.py           # Attendance dashboard
│       ├── analytics.py           # Analytics/reporting page
│       └── person_view.py         # Per-person attendance history
├── core/
│   ├── detector.py               # YOLOv8 face detection (+ HOG fallback)
│   ├── tracker.py                 # DeepSORT tracking wrapper
│   ├── recognizer.py               # FaceNet embedding + matching logic
│   └── pipeline.py                  # Orchestrates detect → track → recognize → log
├── db/
│   ├── models.py                 # DB schema / ORM models
│   ├── crud.py                    # Attendance record CRUD operations
│   └── migrations/init.sql          # Initial schema SQL
├── alerts/
│   └── notifier.py                # Email alert sender (SMTP)
├── requirements.txt
└── .env.example                    # Template for required environment variables
```

## System Requirements

| Requirement | Details |
|---|---|
| **OS** | Windows, Linux, or macOS |
| **Python** | 3.10 |
| **RAM** | 8 GB minimum |
| **GPU** | Optional — speeds up YOLO/FaceNet inference, but runs on CPU |
| **Database** | PostgreSQL 12+ |
| **Camera** | A webcam or connected camera for live detection |

## Setup & Installation

### 1. Clone the repo
```bash
git clone https://github.com/Mahesha-2005/Smart-Attendance-System.git
cd Smart-Attendance-System
```

### 2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables
Copy the example file and fill in your own values:
```bash
cp .env.example .env
```
Then edit `.env` with your actual database URL, email address, and app password. **Never commit your real `.env` file.**

For Gmail alerts, you'll need an [App Password](https://myaccount.google.com/apppasswords) (not your regular Gmail password) — 2-Step Verification must be enabled on the Google account first.

### 5. Set up PostgreSQL
Create a database, then initialize the schema:
```bash
python -c "from db.models import init_db; init_db()"
```

### 6. Register known faces
Create a `data/known_faces/` folder with one subfolder per person:
```
data/known_faces/
├── EMP001_FirstName_LastName/
│   ├── photo1.jpg
│   └── photo2.jpg
├── EMP002_FirstName_LastName/
│   └── photo1.jpg
```
Then build the embeddings cache:
```bash
python -c "from core.recognizer import FaceRecognizer; FaceRecognizer()"
```

### 7. (Optional) Add YOLO face-detection weights
Place a `yolov8n-face.pt` file at `models/yolov8n-face.pt` for GPU-accelerated face detection. Without it, the app automatically falls back to a slightly slower HOG-based detector — no setup required either way.

## Running the App

**Streamlit dashboard:**
```bash
streamlit run app/main.py
```

**Standalone pipeline (camera loop only, no UI):**
```bash
python main.py
```

## Key Configuration (`app/config.py`)

| Setting | Default | What it does |
|---|---|---|
| `YOLO_CONF_THRESHOLD` | 0.5 | Minimum detection confidence |
| `EMBEDDING_SIMILARITY_THRESHOLD` | 0.7 | Minimum cosine similarity to count as a match |
| `DUPLICATE_WINDOW_SECONDS` | 60 | Ignore re-entries within N seconds |
| `MAX_AGE` | 30 | Frames before a DeepSORT track is dropped |
| `MIN_FACE_SIZE` | 30 | Minimum face height (px) to be considered valid |

## Notes on Privacy

This system processes biometric data (face images and embeddings). The `data/known_faces/` folder and any embeddings cache are excluded from version control (`.gitignore`) since they contain personal images — each user should populate these locally with their own registered faces, not commit them to a shared/public repo.

## License

This project is licensed under the MIT License — see the LICENSE file for details.
