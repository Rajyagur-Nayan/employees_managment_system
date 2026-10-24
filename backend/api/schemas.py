from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime


class PersonBase(BaseModel):
    name: str
    employee_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = "General"


class PersonCreate(PersonBase):
    pass


class Person(PersonBase):
    id: int
    registered_at: datetime
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class AttendanceLog(BaseModel):
    id: int
    person_id: Optional[int] = None
    employee_id: str
    name: str
    timestamp: datetime
    confidence: Optional[float] = None
    track_id: Optional[int] = None
    status: Optional[str] = "VERIFIED"
    is_duplicate: bool
    date: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
