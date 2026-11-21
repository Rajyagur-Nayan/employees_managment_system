# Employee Facial Attendance, Workstation Presence & Position Monitoring System

A production-grade computer vision application implementing four core operational features:
1. **Facial Recognition Employee Attendance** with multi-frame confirmation, anti-spoofing liveness verification, strict 1-check-in-per-day duplicate prevention with database uniqueness constraints, and explicit feedback warnings.
2. **Workstation Presence Monitoring & Precision Timer** with Region of Interest (ROI) filtering, monotonic time tracking, absence grace periods, and non-overlapping interval persistence. Timers strictly require confirmed attendance (PRESENT) before initiating.
3. **Employee Position Monitoring & Automatic Manager Alerts** with continuous absence tracking (> 15 minutes), single-incident protection, auto-resolution on return, approved break management, and strict attendance validation.
4. **Multi-Employee Live Tracking Dashboard** with independent ticking timers, clean light-only pure white styling (`#ffffff`), multi-filter controls (date, shift, workstation, status), and comprehensive summary telemetry.

Built with **FastAPI** backend, **Next.js** modern dashboard frontend, **YOLOv8** / **DeepSORT** / **FaceNet**, and **PostgreSQL** database.

---

## Architecture Overview

```
Smart-Attendance-System/
├── backend/
│   ├── api/
│   │   ├── main.py                     # FastAPI app, WebSockets & startup lifecycle
│   │   ├── camera_manager.py           # Thread-safe CameraHub & dual camera managers
│   │   ├── dependencies.py             # DB dependency injection
│   │   ├── schemas.py                  # Pydantic request/response schemas
│   │   └── routes/
│   │       ├── attendance.py           # Attendance check-in & manual correction
│   │       ├── workstations.py         # Workstation sessions, ROI, timer, break & interval adjustments
│   │       ├── alerts.py               # Position absence alerts, acknowledgment & resolution
│   │       ├── camera.py               # Video streaming for attendance & workstation feeds
│   │       ├── employees.py            # Roster management & enrollment reporting
│   │       ├── analytics.py            # Daily trends and stats
│   │       ├── recognition.py          # Embedding cache management
│   │       └── settings.py             # Thresholds & configuration
│   ├── core/
│   │   ├── config.py                   # Paths, thresholds, CPU thread allocation & fallback DB URL
│   │   ├── detector.py                 # YOLOv8n face detection (320x320 imgsz, OpenVINO & HOG fallbacks)
│   │   ├── tracker.py                  # DeepSORT tracking with Kalman prediction on intermediate frames
│   │   ├── recognizer.py               # Fast-path FaceNet embeddings extractor
│   │   ├── enrollment.py               # Face scanner, validation & direct tensor normalization
│   │   ├── identity_cache.py           # Track-level identity cache with sliding TTL
│   │   ├── attendance_queue.py         # Thread-safe non-blocking asynchronous DB attendance worker
│   │   ├── performance_monitor.py      # Real-time FPS, CPU, RAM & component latency profiler
│   │   ├── attendance_engine.py        # Frame-skipping multi-frame verification & anti-spoofing engine
│   │   └── presence_engine.py          # Workstation ROI, precision monotonic timer, breaks & alerts engine
│   ├── db/
│   │   ├── models.py                   # SQLAlchemy ORM (PostgreSQL & local SQLite support)
│   │   └── crud.py                     # Transactions, intervals, sessions, alerts & audit trail
│   ├── tests/
│   │   ├── test_attendance_and_presence.py  # Attendance & workstation presence test suite (9 tests)
│   │   ├── test_position_alerts.py          # 15 scenario tests for 15-min alerts, breaks & recovery
│   │   └── benchmark_optimized.py      # Pipeline throughput, FPS, CPU & latency benchmark
│   ├── backups/                        # Complete original module backups before optimization
│   ├── requirements.txt                # Python backend dependencies
│   └── .env                            # Backend configuration (DB URL, camera sources, thresholds)
├── frontend/
│   ├── src/app/dashboard/
│   │   ├── live/page.tsx               # Live Facial Attendance Screen (camera, liveness, manual entry)
│   │   ├── workstations/page.tsx       # Workstation Presence Screen (shift, breaks & live timer)
│   │   ├── alerts/page.tsx             # Manager Absence Alerts Dashboard (real-time incidents & resolve)
│   │   ├── attendance/page.tsx         # Attendance History & Log
│   │   ├── employees/page.tsx          # Employee Roster & Enrollment (auto-fill sequential IDs)
│   │   └── settings/page.tsx           # Sensitivity & Threshold Settings
│   ├── package.json
│   └── .env                            # API & WebSocket URLs
├── data/
│   ├── known_faces/                    # Enrolled employee face folders (e.g., EMP001_mira/)
│   ├── embeddings/                     # Precomputed embeddings cache (embeddings.npy)
│   └── video1.mp4                      # Sample test video for camera simulation
├── models/
│   └── yolov8n-face.pt                 # YOLOv8 face detector weights
└── backend/.venv/                      # Python 3.10 virtual environment
```

---

## System Requirements & Hardware Performance

- **Operating System:** Windows 10/11, Linux, or macOS
- **Processor:** Standard Intel/AMD CPU (Tested and optimized for Intel Core i5 12th Gen)
- **RAM:** 8 GB RAM (Memory footprint optimized to ~576 MB)
- **GPU:** No dedicated GPU required — fully optimized for smooth CPU execution
- **Python:** 3.10 (tested on Python 3.10.11)
- **Node.js:** v18+ or v20+ (tested on Node v22)
- **Camera:** 1 standard USB webcam, laptop camera, RTSP IP stream, or local video file

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

> **Database Connection:** The system connects directly via `DATABASE_URL` configured in `backend/.env`. All tables and migrations are initialized automatically on startup.

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
  .\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
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
- **Direct Camera Automatic Face Check:** Eliminates manual check-ins and dropdown employee selection. The camera directly scans the workstation area, matching detected faces strictly against stored worker faces in the database (`self.enrollment.match`).
- **Present-Employees-Only Working Time:** The engine verifies each detected worker's attendance status for today (`is_employee_present_for_date`).
  - **Present Workers (`PRESENT`):** Bounding box is highlighted in Green (`[PRESENT]`), the worker is automatically associated with the workstation session, and their active working timer starts / accumulates in discrete intervals.
  - **Unmarked Workers (`NOT MARKED` / `ABSENT`):** Bounding box is highlighted in Amber (`[ATTENDANCE NOT MARKED]`). Working time does **NOT** start for them.
  - **Unknown Faces:** Highlighted in Gray (`Unknown Face`), timer does not run.
- **State Machine:**
  - `ACTIVE`: Confirmed present worker in workstation area. Active timer increments.
  - `PENDING_ABSENCE`: Worker steps away or is briefly occluded. A configurable grace countdown (default 60s) begins.
  - `PAUSED`: Absence continues beyond grace period. The active interval is cleanly closed at the *last confirmed presence timestamp* (never fabricating presence during absence).
  - `WAITING`: Idle scanning state when no worker is at the workstation.
- **Grace Cancellation:** If the employee returns before the grace countdown expires, pending absence is cancelled and active accumulation continues unbroken.
- **15-Minute Absence Alerts:** Continuous absence exceeding the configured threshold (default: 15 minutes) automatically triggers manager alerts.
- **Precision Monotonic Timing:** All duration measurements use `time.monotonic()` to ensure immunity against system clock jumps, NTP updates, and daylight saving time changes.
- **Crash & Outage Recovery:** If the computer reboots or crashes, unclosed intervals are automatically detected on startup and cleanly closed at `last_presence_time` with `is_uncertain=True` in the database.

---

## CPU Performance Optimization & Benchmarking

The entire computer vision and database pipeline is heavily optimized for smooth, low-latency execution on standard consumer laptop CPUs (e.g., **Intel Core i5 12th Gen**, 8 GB RAM, no dedicated GPU) without sacrificing face recognition accuracy or attendance integrity.

### 1. Key Optimization Enhancements

- **YOLOv8 Detection at 320x320 (`INFERENCE_SIZE=320`):** Reduces tensor resolution to 320x320 for CPU inference without compromising face localization. Uses workspace-isolated configuration (`YOLO_CONFIG_DIR=backend/.ultralytics`) to eliminate Windows `WinError 5` AppData access denials.
- **Intermittent Detection & DeepSORT Kalman Tracking:** YOLO detection runs once every 3 frames (`DETECTION_INTERVAL=3`). On intermediate frames, DeepSORT maintains bounding boxes via its internal Kalman filter without extracting appearance embeddings (<1 ms tracking latency).
- **FaceNet Fast-Path Embedding (`cv2_crop_to_tensor`):** Pre-cropped face crops bypass the redundant MTCNN cascade detector, performing direct bilinear interpolation to 160x160 and tensor normalization under `torch.inference_mode()`, halving embedding generation time.
- **Track Identity Caching (`TrackIdentityCache`):** Caches matched employee identity, name, and similarity scores per track ID for up to 45 frames (~3 seconds), eliminating redundant neural network evaluations on confirmed tracks.
- **Camera Device Sharing (`CameraHub`):** Manages camera capture reference counting so multiple consumers (Attendance and Workstation) share one physical camera thread without Windows DirectShow locks or duplicate frame reads.
- **Asynchronous Attendance Queue (`AttendanceQueueWorker`):** Shifts SQLite/PostgreSQL attendance writes, duplicate checks, and transaction commits to a background worker thread. Main video inference loops never block on database I/O.
- **Workstation Telemetry Caching:** Active duration aggregate queries in `WorkstationPresenceEngine` are cached for 3 seconds, eliminating 12 redundant SQL queries per second.
- **Frontend Re-Render Throttling:** WebSocket telemetry updates in `frontend/src/app/dashboard/workstations/page.tsx` are throttled to 4 Hz (250 ms) to avoid excessive React component tree re-renders.

### 2. Benchmark Results (Intel Core i5 12th Gen, CPU Only)

Tested against registered employee face datasets at standard 640x480 resolution:

| Metric | Before Optimization | After Optimization | Gain |
| :--- | :--- | :--- | :--- |
| **Pipeline Throughput** | < 5 FPS | **32.33 FPS** | **> 6.4x faster** |
| **Average Latency** | ~600–800 ms / frame | **30.93 ms / frame** | **~95% reduction** |
| **CPU Utilization** | 90% – 100% | **~20.0%** | **~75% cooler** |
| **RAM Footprint** | ~1.5 GB | **~576.8 MB** | **~60% lighter** |
| **Recognition Accuracy** | 0.98 similarity | **0.98 similarity (100% preserved)** | **Zero accuracy loss** |

### 3. Running the Benchmark Script

Run the automated benchmark suite to measure real-time FPS, CPU %, RAM, and latency:

```powershell
cd backend
.\.venv\Scripts\python.exe tests\benchmark_optimized.py
```

### 4. Optional: Exporting YOLO to Intel OpenVINO

The detector natively supports Intel OpenVINO IR models with automatic fallback to PyTorch `.pt`. To export for maximum Intel CPU acceleration:

```powershell
cd backend
.\.venv\Scripts\pip.exe install openvino
.\.venv\Scripts\yolo.exe export model=..\models\yolov8n-face.pt format=openvino imgsz=320
```
Upon restart, `backend/core/detector.py` automatically detects and loads the OpenVINO model.

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

The application is configured to connect directly to the database via `DATABASE_URL` in `backend/.env`:

```ini
DATABASE_URL=postgresql://user:password@host:port/dbname?sslmode=require
```

All tables and column auto-migrations (including shift timing and workstation presence tracking) are initialized automatically upon startup.
- **Tables Managed:**
  - `persons`: Employee master records
  - `employee_faces`: Enrolled image paths and validation statuses
  - `attendance_logs`: Daily attendance records with confirmation confidence
  - `workstations`: Configured workstations, camera sources, ROI coordinates, and `alert_threshold_seconds` (default: 900s)
  - `workstation_assignments`: Employee-workstation schedule links and `shift_name`
  - `workstation_sessions`: Daily monitoring sessions, active shift, and `is_on_break` status
  - `presence_intervals`: Discrete non-overlapping presence intervals
  - `employee_position_alerts`: Automatic manager absence alert incidents (ACTIVE, ACKNOWLEDGED, RESOLVED)
  - `employee_breaks`: Approved employee breaks and temporary authorized leaves
  - `audit_events`: Supervisor corrections, overrides, and outage recovery logs

---

## Employee Position Monitoring & Manager Alerts (15-Minute Absence System)

The system automatically monitors employees at their designated workstation positions and generates real-time alerts if an employee is continuously absent for more than 15 minutes (`alert_threshold_seconds = 900`, configurable per workstation).

### Key Rules & Behavior:
- **Attendance Validation**: Position monitoring requires verified `PRESENT` attendance today. Unmarked or absent employees cannot be monitored.
- **Continuous Absence Tracking**: Absence starts after a configurable camera detection grace period (default 60s). If continuous absence reaches 15 minutes, an `ACTIVE` incident alert is automatically created.
- **Duplicate Prevention**: Only **one** alert incident is created per continuous absence event.
- **Automatic Return Resolution**: When the employee returns to the workstation ROI, facial identity is confirmed, active intervals resume, and any active absence alerts are automatically resolved (`RESOLVED`, `resolved_by="auto_return"`).
- **Approved Break Management**: Supervisors can record authorized breaks (Lunch, Tea, Leave) via `/api/workstations/{id}/break/start`. Absence alerts and timers are suspended during approved breaks and resume on break end.
- **Manager Dashboard**: `/dashboard/alerts` provides filtering (by status, employee, shift, date), KPI summary cards, and manual Acknowledge / Resolve modal workflows with audit logging.

### New REST & WebSocket Endpoints:
- `GET /api/alerts`: List position absence alerts with filtering (`employee_id`, `workstation_id`, `status`, `date`, `shift`, `limit`, `offset`)
- `GET /api/alerts/active`: Retrieve count of unresolved active alerts
- `POST /api/alerts/{id}/acknowledge`: Acknowledge an alert with manager notes
- `POST /api/alerts/{id}/resolve`: Manually resolve an alert with audit notes
- `GET /api/alerts/settings`: View alert threshold settings
- `POST /api/workstations/{id}/break/start`: Authorize an employee break (suspends alerts)
- `POST /api/workstations/{id}/break/stop`: End an authorized break (resumes monitoring)
- `WS /ws/workstation`: Broadcasts `telemetry`, `position_alert`, and `position_alert_resolved` events in real-time

---

## Running Automated Tests

A comprehensive suite of **24 automated unit and integration tests** verifies all functional criteria across attendance, presence tracking, and the 15-minute position monitoring alert scenarios:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover tests
```

Output:
```
Ran 24 tests in 5.131s
OK
```

All 15 position alert scenarios are verified:
1. Present at assigned position (session active, 0 alerts).
2. Absent for 5 minutes (timer pauses after grace, no alert generated).
3. Absent for 14 minutes (timer paused, no alert generated).
4. Absent for > 15 minutes (automatic ACTIVE alert generated, callback fired).
5. Return before 15 minutes (absence cancelled, interval resumes, no alert).
6. Return after alert generated (alert auto-resolved with status RESOLVED).
7. Duplicate alert prevention (single continuous incident recorded).
8. Temporary detection failure / grace period (transient drop handled smoothly).
9. Employee on approved break (absence alerts suspended).
10. Employee without attendance rejected (cannot start position monitoring).
11. Employee marked absent rejected (cannot start position monitoring).
12. Employee changes assigned position / shift (reassignment tracked cleanly).
13. Night shift crossing midnight (preserves timestamps across midnight boundary).
14. Application restart during active absence (recovers existing alert without duplicate).
15. Manager acknowledges and manually resolves alert (audit notes recorded).

---

## Model Licensing Notes

1. **YOLOv8 (Ultralytics):** Licensed under AGPL-3.0 for open-source use. Ultralytics offers commercial licenses if AGPL-3.0 copyleft terms cannot be met.
2. **FaceNet (facenet-pytorch):** Code is licensed under MIT. Pretrained weights (`vggface2`) are trained on the VGGFace2 dataset (academic non-commercial dataset). For unrestricted commercial distribution, fine-tuning on commercially licensed face datasets or switching to an open-weights model such as MobileFaceNet / ArcFace (Apache 2.0 / MIT) is recommended.
3. **DeepSORT (deep-sort-realtime):** Licensed under MIT. Uses lightweight MobileNetV2 embedder.

---

## License

This project is licensed under the MIT License — see the LICENSE file for details.
