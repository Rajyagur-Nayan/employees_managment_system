# Employee Facial Attendance and Workstation Presence Time Tracker

A production-grade computer vision application implementing two core operational features:
1. **Facial Recognition Employee Attendance** with multi-frame confirmation, anti-spoofing liveness verification, and duplicate check-in prevention.
2. **Workstation Presence Monitoring & Precision Timer** with Region of Interest (ROI) filtering, monotonic time tracking, absence grace periods, and non-overlapping interval persistence.

Built with **FastAPI** backend, **Next.js** modern dashboard frontend, **YOLOv8** / **DeepSORT** / **FaceNet**, and **PostgreSQL / SQLite** database with automatic failover.

---

## Architecture Overview

```
Smart-Attendance-System/
├── backend/
│   ├── api/
│   │   ├── main.py                     # FastAPI app, WebSockets & startup lifecycle
│   │   ├── camera_manager.py           # Thread-safe dual camera managers (Attendance & Workstation)
│   │   ├── dependencies.py             # DB dependency injection
│   │   ├── schemas.py                  # Pydantic request/response schemas
│   │   └── routes/
│   │       ├── attendance.py           # Attendance check-in & manual correction
│   │       ├── workstations.py         # Workstation sessions, ROI, timer & interval adjustments
│   │       ├── camera.py               # Video streaming for attendance & workstation feeds
│   │       ├── employees.py            # Roster management & enrollment reporting
│   │       ├── analytics.py            # Daily trends and stats
│   │       ├── recognition.py          # Embedding cache management
│   │       └── settings.py             # Thresholds & configuration
│   ├── core/
│   │   ├── config.py                   # Paths, thresholds & fallback database URL
│   │   ├── detector.py                 # YOLOv8n face detection (+ HOG fallback)
│   │   ├── tracker.py                  # DeepSORT tracking wrapper
│   │   ├── recognizer.py               # FaceNet embeddings extractor
│   │   ├── enrollment.py               # Multi-folder face scanner, validation & DB sync
│   │   ├── attendance_engine.py        # Multi-frame verification & anti-spoofing engine
│   │   └── presence_engine.py          # Workstation ROI, precision monotonic timer & state machine
│   ├── db/
│   │   ├── models.py                   # SQLAlchemy ORM (PostgreSQL & local SQLite support)
│   │   └── crud.py                     # Transactions, intervals, sessions & audit trail
│   ├── tests/
│   │   └── test_attendance_and_presence.py  # Automated test suite (9 passing tests)
│   ├── requirements.txt                # Python backend dependencies
│   └── .env                            # Backend configuration (DB URL, camera sources, etc.)
├── frontend/
│   ├── src/app/dashboard/
│   │   ├── live/page.tsx               # Live Facial Attendance Screen (camera, liveness, manual entry)
│   │   ├── workstations/page.tsx       # Workstation Presence & Active Timer Screen
│   │   ├── attendance/page.tsx         # Attendance History & Log
│   │   ├── employees/page.tsx          # Employee Roster & Enrollment
│   │   └── settings/page.tsx           # Sensitivity & Threshold Settings
│   ├── package.json
│   └── .env                            # API & WebSocket URLs
├── data/
│   ├── known_faces/                    # Enrolled employee face folders (e.g., EMP001_mira/)
│   ├── embeddings/                     # Precomputed embeddings cache (embeddings.npy)
│   ├── video1.mp4                      # Sample test video for camera simulation
│   └── attendance.db                   # Local SQLite database (used automatically if remote DB offline)
├── models/
│   └── yolov8n-face.pt                 # YOLOv8 face detector weights
└── venv/                               # Python 3.10 virtual environment
```

---

## System Requirements

- **Operating System:** Windows 10/11, Linux, or macOS
- **Python:** 3.10 (tested on Python 3.10.11)
- **Node.js:** v18+ or v20+ (tested on Node v22)
- **Hardware:** Standard CPU-only computer (no dedicated GPU required)
- **Camera:** Standard USB webcam, laptop camera, RTSP IP stream, or local video file

---

## Project Setup & Installation

Follow these steps for a complete, clean installation from scratch.

### 1. Clone the Repository

```bash
git clone https://github.com/Mahesha-2005/Smart-Attendance-System.git
cd Smart-Attendance-System
```

---

### 2. Backend Setup (Python)

#### 2.1 Create & Activate Virtual Environment

The project requires **Python 3.10** (tested on Python 3.10.11).

- **Windows (PowerShell):**
  ```powershell
  # If execution policy blocks scripts, allow it for this process:
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

  # Create virtual environment (if not already created)
  python -m venv venv

  # Activate virtual environment
  .\venv\Scripts\Activate.ps1
  ```

- **Windows (Command Prompt):**
  ```cmd
  python -m venv venv
  venv\Scripts\activate.bat
  ```

- **Linux / macOS:**
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

#### 2.2 Install Python Dependencies

With your virtual environment activated:

```bash
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

> **Note on Windows C++ Build Tools:**
> The primary face detector uses YOLOv8 (`ultralytics`), which runs out of the box on standard CPUs. If `face_recognition` is installed as a fallback detector, pre-built wheels are installed automatically.

#### 2.3 Configure Backend Environment (`.env`)

Create `backend/.env` from the provided example template:

- **Windows PowerShell:**
  ```powershell
  Copy-Item backend\.env.example backend\.env
  ```
- **Linux / macOS:**
  ```bash
  cp backend/.env.example backend/.env
  ```

Open `backend/.env` to customize your configuration:
```ini
# Database: Leave empty to automatically use local zero-config SQLite (data/attendance.db)
# Or provide your PostgreSQL / Neon connection string:
DATABASE_URL=

# Camera Configuration:
# Set to 0 for default webcam, 1 for secondary USB camera, or path to video file:
CAMERA_SOURCE=0
WORKSTATION_CAMERA_SOURCE=0

# Workstation absence grace period in seconds (default: 60)
WORKSTATION_ABSENCE_GRACE_SECONDS=60
```

> **Zero-Config Database Fallback:** If `DATABASE_URL` is omitted or the remote database is unreachable, the system automatically creates and connects to local SQLite at `data/attendance.db`. All tables and migrations are initialized automatically on startup.

#### 2.4 Verify AI Model Weights

The YOLOv8 face detector model is pre-included at:
```
models/yolov8n-face.pt
```
FaceNet pretrained weights (`vggface2`) download automatically on first run via `facenet-pytorch`.

---

### 3. Frontend Setup (Next.js Dashboard)

#### 3.1 Install Node Dependencies

Open a new terminal window:

```bash
cd frontend
npm install
```

#### 3.2 Configure Frontend Environment (`.env`)

Create `frontend/.env` from `.env.example`:

- **Windows PowerShell:**
  ```powershell
  Copy-Item .env.example .env
  ```
- **Linux / macOS:**
  ```bash
  cp .env.example .env
  ```

Ensure the frontend API and WebSocket endpoints point to your backend:
```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/attendance
```

Return to project root:
```bash
cd ..
```

---

### 4. Employee Face Dataset Setup

To recognize employees, place their reference photos inside `data/known_faces/`:

```
data/known_faces/
├── EMP001_Mira/
│   ├── photo1.jpg
│   └── photo2.png
├── EMP002_Rahul/
│   └── photo1.jpg
└── EMP003_Sneha/
    └── photo1.jpg
```

- Supported folder naming: `EMP<ID>_<FirstName>_<LastName>` or `EMP<ID>`.
- The system automatically computes face embeddings and caches them to `data/embeddings/embeddings.npy` on startup.

---

## Running the Application

Start both the backend and frontend servers in separate terminals:

### Terminal 1: Start Backend API Server

From the project root:

- **Windows PowerShell:**
  ```powershell
  cd backend
  ..\venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
  ```

- **Linux / macOS (or activated venv):**
  ```bash
  cd backend
  python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
  ```

The backend server starts on:
- API URL: `http://127.0.0.1:8000`
- Interactive API Docs (Swagger): `http://127.0.0.1:8000/docs`
- Health Endpoint: `http://127.0.0.1:8000/api/health`
- Attendance WebSocket: `ws://127.0.0.1:8000/ws/attendance`
- Workstation WebSocket: `ws://127.0.0.1:8000/ws/workstation`

---

### Terminal 2: Start Next.js Frontend Dashboard

From the project root:

```powershell
cd frontend
npm run dev
```

The frontend dashboard starts on `http://localhost:3000`:
- **Dashboard Home:** `http://localhost:3000`
- **Live Facial Attendance Screen:** `http://localhost:3000/dashboard/live`
- **Workstation Presence & Active Timer:** `http://localhost:3000/dashboard/workstations`
- **Attendance History & Logs:** `http://localhost:3000/dashboard/attendance`
- **Employee Roster & Enrollment:** `http://localhost:3000/dashboard/employees`
- **Sensitivity & Settings:** `http://localhost:3000/dashboard/settings`

---

## Core Functionality Details

### 1. Facial Attendance

- **Multi-Frame Confirmation:** Requires matching the same enrolled employee across 3 consecutive or majority frames within a 2-second sliding window before confirming check-in. Prevents false triggers and flickering.
- **Liveness / Anti-Spoofing:** Built-in Laplacian texture variance analysis detects static photographs and phone screen replays.
- **Duplicate Prevention:** Checks the database for existing records on the current calendar date (`YYYY-MM-DD`). Re-entries are flagged as duplicate and do not spam attendance records.
- **Manual Correction:** When camera hardware fails or recognition is impaired, supervisors can click **"Manual Check-in"** on the dashboard to register attendance with an audit note.

---

### 2. Workstation Presence & Active-Time Tracking

- **ROI Workstation Area:** Supports configuring a normalized Region of Interest `(x1, y1, x2, y2)`. Persons outside the workstation area are ignored.
- **Identity Association:** Detected faces in the ROI are matched to the enrolled employee assigned to that workstation.
- **State Machine:**
  - `ACTIVE`: Employee confirmed in workstation area. Active timer increments.
  - `PENDING_ABSENCE`: Employee steps away or is briefly occluded. A 60-second grace countdown begins.
  - `PAUSED`: Absence continues beyond 60s. The active interval is closed at the *last confirmed presence timestamp* (never fabricating presence during absence).
  - `STOPPED`: Monitoring session finalized by operator.
- **Grace Cancellation:** If the employee returns before the grace countdown reaches 0, the pending absence is cancelled and the active interval continues unbroken without interruption.
- **Precision Monotonic Timing:** All duration measurements use `time.monotonic()` to ensure immunity against system clock jumps, NTP updates, and daylight saving time changes.
- **Crash & Outage Recovery:** If the computer reboots or crashes, unclosed intervals are automatically detected on startup and cleanly closed at `last_presence_time` with `is_uncertain=True` in the database.

---

## Organizing & Enrolling Employee Face Images

Employee face photos are stored in `data/known_faces/` or `data/`:

```
data/known_faces/
├── EMP001_Mira/
│   ├── photo1.png
│   └── photo2.jpg
├── EMP002_Rahul/
│   └── photo1.png
├── EMP003_Sneha/
│   └── photo1.png
└── EMP004_Kirti/
    └── photo1.png
```

- **Naming Formats Supported:**
  - `EMP001_FirstName_LastName` -> ID: `EMP001`, Name: `FirstName LastName`
  - `EMP001` -> ID: `EMP001`, Name: `Employee EMP001`
  - `FirstName_LastName` -> ID: `FIRSTNAME_LASTNAME`, Name: `FirstName LastName`
- **Validation:** Corrupted files, unreadable formats, or images with no detectable face are reported without crashing the application.
- **Embedding Cache:** Embeddings are cached to `data/embeddings/embeddings.npy` with modification timestamp tracking. If you add or change photos, the application detects the change and automatically rebuilds the cache.

To manually trigger enrollment synchronization:
```powershell
curl -X POST http://127.0.0.1:8000/api/employees/sync
```

---

## Camera Configuration

In `backend/.env`:

```ini
# Attendance gate camera (0 for primary webcam, 1 for secondary USB, or path to video)
CAMERA_SOURCE=0

# Workstation monitoring camera (can be shared or separate)
WORKSTATION_CAMERA_SOURCE=0

# Workstation absence grace period in seconds (default: 60)
WORKSTATION_ABSENCE_GRACE_SECONDS=60
```

> **Testing without a physical camera:**
> You can set `CAMERA_SOURCE=data/video1.mp4` or `WORKSTATION_CAMERA_SOURCE=data/video1.mp4` to loop through the included sample video feed.

---

## Database Configuration

The application supports both **PostgreSQL** and local **SQLite**:

- **Local SQLite (Default Fallback):** If `DATABASE_URL` is empty, invalid, or the remote PostgreSQL host is unreachable (e.g. offline / network disconnect), the application automatically connects to local SQLite at `data/attendance.db`.
- **PostgreSQL:** Specify your connection string in `backend/.env`:
  ```ini
  DATABASE_URL=postgresql://user:password@host:port/dbname?sslmode=require
  ```
- **Tables Managed:**
  - `persons`: Employee master records
  - `employee_faces`: Enrolled image paths and validation statuses
  - `attendance_logs`: Daily attendance records with confirmation confidence
  - `workstations`: Configured workstations, camera sources, and ROI coordinates
  - `workstation_assignments`: Employee-workstation schedule links
  - `workstation_sessions`: Daily monitoring sessions and status
  - `presence_intervals`: Discrete non-overlapping presence intervals
  - `audit_events`: Supervisor corrections, overrides, and outage recovery logs

---

## Running Automated Tests

A comprehensive suite of 9 automated unit and integration tests verifies all acceptance criteria (face matching, duplicate prevention, monotonic timer, grace cancellation, session recovery, and interval aggregation):

```powershell
cd backend
..\venv\Scripts\python.exe -m unittest discover -s tests
```

Output:
```
Ran 9 tests in 3.921s
OK
```

---

## Model Licensing Notes

1. **YOLOv8 (Ultralytics):** Licensed under AGPL-3.0 for open-source use. Ultralytics offers commercial licenses if AGPL-3.0 copyleft terms cannot be met.
2. **FaceNet (facenet-pytorch):** Code is licensed under MIT. Pretrained weights (`vggface2`) are trained on the VGGFace2 dataset (academic non-commercial dataset). For unrestricted commercial distribution, fine-tuning on commercially licensed face datasets or switching to an open-weights model such as MobileFaceNet / ArcFace (Apache 2.0 / MIT) is recommended.
3. **DeepSORT (deep-sort-realtime):** Licensed under MIT. Uses lightweight MobileNetV2 embedder.

---

## License

This project is licensed under the MIT License — see the LICENSE file for details.
