import logging
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

logger = logging.getLogger(__name__)

engine = create_engine("sqlite:///transcriptions.db", connect_args={"check_same_thread": False})
Base = declarative_base()
Session = sessionmaker(bind=engine)

class Transcription(Base):
    __tablename__ = "transcriptions"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), default="untitled")
    text = Column(Text, nullable=False)
    language = Column(String(50), default="unknown")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

def init_db():
    Base.metadata.create_all(engine)
    logger.info("database initialized.")
