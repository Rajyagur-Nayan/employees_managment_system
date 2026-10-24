import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.routes import health, attendance, workstations, employees, analytics, recognition, camera, settings
from api.camera_manager import attendance_manager, workstation_manager
from db.models import init_db, SessionLocal
from db.crud import recover_unclosed_sessions

app = FastAPI(title="Employee Attendance & Workstation Presence System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(workstations.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(recognition.router, prefix="/api")
app.include_router(camera.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    # 1. Initialize schema & apply auto-migrations
    init_db()

    # 2. Recover any sessions/intervals left unclosed from a previous shutdown
    db = SessionLocal()
    try:
        recover_unclosed_sessions(db, operator="startup_recovery")
    finally:
        db.close()

    # 3. Synchronize employee face roster with database
    attendance_manager.enrollment.sync_to_db()

    # 4. Launch camera processing loops
    asyncio.create_task(attendance_manager.process_loop())
    asyncio.create_task(workstation_manager.process_loop())


@app.on_event("shutdown")
def shutdown_event():
    attendance_manager.stop()
    workstation_manager.stop_camera()


@app.websocket("/ws/attendance")
async def websocket_attendance_endpoint(websocket: WebSocket):
    await attendance_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        attendance_manager.disconnect(websocket)


@app.websocket("/ws/workstation")
async def websocket_workstation_endpoint(websocket: WebSocket):
    await workstation_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        workstation_manager.disconnect(websocket)
