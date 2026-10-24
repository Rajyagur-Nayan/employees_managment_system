from fastapi import APIRouter
from pydantic import BaseModel
import core.config as config

router = APIRouter(prefix="/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    yolo_conf: float
    face_sim_threshold: float
    dup_window: int

@router.get("")
def get_settings():
    return {
        "yolo_conf": config.YOLO_CONF_THRESHOLD,
        "face_sim_threshold": config.EMBEDDING_SIMILARITY_THRESHOLD,
        "dup_window": config.DUPLICATE_WINDOW_SECONDS
    }

@router.put("")
def update_settings(settings: SettingsUpdate):
    # In a real app we would write to .env or a config table
    config.YOLO_CONF_THRESHOLD = settings.yolo_conf
    config.YOLO_CONF = settings.yolo_conf
    config.EMBEDDING_SIMILARITY_THRESHOLD = settings.face_sim_threshold
    config.DUPLICATE_WINDOW_SECONDS = settings.dup_window
    return {"status": "success"}
