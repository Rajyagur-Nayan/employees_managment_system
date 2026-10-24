from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil

from api.dependencies import get_db
from api.schemas import Person, PersonCreate
from db.models import Person as PersonModel
from core.config import KNOWN_FACES_DIR
from api.camera_manager import attendance_manager

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=List[Person])
def get_employees(db: Session = Depends(get_db)):
    return db.query(PersonModel).filter(PersonModel.is_active == True).order_by(PersonModel.name).all()


@router.get("/enrollment-report")
def get_enrollment_report():
    """Returns detailed enrollment report including valid images and unreadable files."""
    return attendance_manager.enrollment.enrollment_report


@router.post("/sync")
def sync_employees(db: Session = Depends(get_db)):
    """Triggers re-scan of employee face directories and syncs with the database."""
    attendance_manager.enrollment.load_or_refresh(force_rebuild=True)
    return {
        "status": "success",
        "total_enrolled": attendance_manager.enrollment.enrollment_report.get("total_enrolled", 0),
        "total_failed": attendance_manager.enrollment.enrollment_report.get("total_failed", 0),
        "report": attendance_manager.enrollment.enrollment_report,
    }


@router.get("/{id}", response_model=Person)
def get_employee(id: int, db: Session = Depends(get_db)):
    person = db.query(PersonModel).filter(PersonModel.id == id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Employee not found")
    return person


@router.post("", response_model=Person)
def create_employee(
    name: str = Form(...),
    employee_id: str = Form(...),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    department: Optional[str] = Form("General"),
    images: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    # Check if exists
    existing = db.query(PersonModel).filter(PersonModel.employee_id == employee_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee ID already registered")

    person = PersonModel(
        name=name,
        employee_id=employee_id,
        email=email,
        phone=phone,
        department=department or "General",
        is_active=True,
    )
    db.add(person)
    db.commit()
    db.refresh(person)

    # Save face images in data/known_faces/EMPxxx_Name
    person_dir_name = f"{employee_id}_{name.replace(' ', '_')}"
    person_path = os.path.join(KNOWN_FACES_DIR, person_dir_name)
    os.makedirs(person_path, exist_ok=True)

    for img in images:
        file_path = os.path.join(person_path, img.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(img.file, buffer)

    # Rebuild embeddings
    attendance_manager.enrollment.load_or_refresh(force_rebuild=True)
    return person


@router.delete("/{id}")
def delete_employee(id: int, db: Session = Depends(get_db)):
    person = db.query(PersonModel).filter(PersonModel.id == id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Employee not found")

    person_dir_name = f"{person.employee_id}_{person.name.replace(' ', '_')}"
    person_path = os.path.join(KNOWN_FACES_DIR, person_dir_name)
    if os.path.exists(person_path):
        shutil.rmtree(person_path)

    # Soft delete / de-activate
    person.is_active = False
    db.commit()

    attendance_manager.enrollment.load_or_refresh(force_rebuild=True)
    return {"status": "deleted"}
