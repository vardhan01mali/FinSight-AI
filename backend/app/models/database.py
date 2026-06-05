import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    chat_histories = relationship("ChatHistory", back_populates="user", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    processing_status = Column(String, default="Uploading")  # Uploading, Processing, Completed, Failed
    failure_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="documents")
    metrics = relationship("DocumentMetrics", back_populates="document", uselist=False, cascade="all, delete-orphan")
    chat_histories = relationship("ChatHistory", back_populates="document", cascade="all, delete-orphan")


class DocumentMetrics(Base):
    __tablename__ = "document_metrics"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, unique=True)
    revenue = Column(Float, nullable=True)
    expenses = Column(Float, nullable=True)
    profit = Column(Float, nullable=True)
    assets = Column(Float, nullable=True)
    liabilities = Column(Float, nullable=True)
    cash_flow = Column(Float, nullable=True)
    debt = Column(Float, nullable=True)

    document = relationship("Document", back_populates="metrics")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    sources = Column(Text, nullable=True)  # Stored as JSON string of source metadata/chunks
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="chat_histories")
    document = relationship("Document", back_populates="chat_histories")
