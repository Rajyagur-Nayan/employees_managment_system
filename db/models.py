from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from app.config import DATABASE_URL

Base = declarative_base()
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


class Person(Base):
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    employee_id = Column(String, unique=True, nullable=False)
    email = Column(String)
    phone = Column(String)
    registered_at = Column(DateTime, default=datetime.utcnow)


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, nullable=False)         # FK → persons.id
    employee_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    confidence = Column(Float)
    track_id = Column(Integer)                          # DeepSORT track ID
    is_duplicate = Column(Boolean, default=False)       # Flagged by dedup logic
    date = Column(String)                               # YYYY-MM-DD for quick queries


def init_db():
    Base.metadata.create_all(bind=engine)