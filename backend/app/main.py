import logging
import os
import time
from collections import defaultdict
from typing import List, Optional
import io
import json

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

# Import config, DB session and models
from app.config import settings
from app.database.session import get_db, engine, Base, SessionLocal
from app.models.database import User, Document, DocumentMetrics, ChatHistory
from app.auth.routes import router as auth_router, get_current_user

# Import parsers and RAG utilities
from app.documents.storage import storage_provider
from app.documents.pdf_parser import parse_pdf
from app.documents.excel_parser import parse_excel, parse_csv
from app.documents.doc_parser import parse_docx, parse_txt
from app.documents.xml_parser import parse_xml_to_text, parse_json_to_text
from app.documents.ocr import extract_text_from_image, is_ocr_available
from app.rag.vectorstore import vector_store
from app.rag.retriever import query_document_rag
from app.rag.financial_extractor import extract_financial_metrics
from app.rag.ai_provider import get_ai_provider

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("finsight_backend")

# Initialize FastAPI App
app = FastAPI(
    title="FinSight AI",
    description="AI-powered Financial Document Intelligence Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS using environment variables
origins = settings.parsed_origins
allow_credentials = True
if "*" in origins:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router, prefix="/api")

@app.on_event("startup")
def startup_event():
    logger.info(f"Loaded ALLOWED_ORIGINS: {settings.ALLOWED_ORIGINS}")
    logger.info(f"Parsed Origins: {settings.parsed_origins}")
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    
    # Configure SQLite connection properties to enable WAL mode
    if settings.DATABASE_URL.startswith("sqlite"):
        try:
            with engine.connect() as connection:
                connection.execute(text("PRAGMA journal_mode=WAL;"))
                connection.execute(text("PRAGMA synchronous=NORMAL;"))
                logger.info("SQLite database configured in WAL mode.")
        except Exception as e:
            logger.warning(f"Could not configure SQLite WAL mode: {e}")
            
    logger.info("Database tables verified.")
    
    if not os.environ.get("RENDER"):
        logger.info("Pre-loading SentenceTransformer model...")
        try:
            from app.rag.embeddings import embeddings_manager
            embeddings_manager.initialize()
            logger.info("SentenceTransformer model pre-loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to pre-load SentenceTransformer model: {e}")
    else:
        logger.info("Render environment detected. Skipping eager SentenceTransformer loading to conserve memory.")
        # Configure CPU threading limits for PyTorch to reduce memory overhead
        os.environ["OMP_NUM_THREADS"] = "1"
        os.environ["MKL_NUM_THREADS"] = "1"
        os.environ["OPENBLAS_NUM_THREADS"] = "1"

# Simple custom rate limiter for chat: 15 queries per minute per user
CHAT_LIMIT_QUERIES = 15
CHAT_LIMIT_WINDOW = 60
user_chat_timestamps = defaultdict(list)

def rate_limit_chat(current_user: User = Depends(get_current_user)):
    now = time.time()
    user_id = current_user.id
    # Keep timestamps within the window
    user_chat_timestamps[user_id] = [t for t in user_chat_timestamps[user_id] if now - t < CHAT_LIMIT_WINDOW]
    if len(user_chat_timestamps[user_id]) >= CHAT_LIMIT_QUERIES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 15 questions per minute."
        )
    user_chat_timestamps[user_id].append(now)

# Background Task for document parsing and indexing
def process_document_task(db_session_factory, doc_id: int, file_path: str):
    # Retrieve clean session for background task thread to initialize status
    db = db_session_factory()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            logger.error(f"Document ID {doc_id} not found in database for background processing.")
            return

        doc.processing_status = "Processing"
        db.commit()

        # Read needed fields before closing the session
        user_id = doc.user_id
        filename = doc.filename
        file_type = doc.file_type
    except Exception as e:
        logger.error(f"Failed to initialize processing status for document {doc_id}: {e}")
        return
    finally:
        db.close()

    logger.info(f"Start processing document {filename} (Type: {file_type})")
    pages_data = []

    # Run heavy operations outside active DB transactions to prevent SQLite locking
    try:
        # Route to correct parser
        ext = file_type.lower()
        if ext == "pdf":
            pages_data = parse_pdf(file_path)
        elif ext in ["xlsx", "xls"]:
            pages_data = parse_excel(file_path)
        elif ext == "csv":
            pages_data = parse_csv(file_path)
        elif ext == "docx":
            pages_data = parse_docx(file_path)
        elif ext == "txt":
            pages_data = parse_txt(file_path)
        elif ext == "xml":
            pages_data = parse_xml_to_text(file_path)
        elif ext == "json":
            pages_data = parse_json_to_text(file_path)
        elif ext in ["jpg", "jpeg", "png"]:
            text_extracted = extract_text_from_image(file_path)
            pages_data = [{"page": 1, "text": text_extracted}]
        else:
            raise ValueError(f"Unsupported file extension: {ext}")

        # Vectorize chunks
        vector_store.add_document_chunks(
            user_id=user_id,
            document_id=doc_id,
            filename=filename,
            pages_data=pages_data
        )

        # Concatenate text and run metrics extraction
        full_text = "\n\n".join([page["text"] for page in pages_data])
        metrics_dict = extract_financial_metrics(full_text)
        
        # Save metrics and update status to completed using a new clean session
        db = db_session_factory()
        try:
            metrics_model = DocumentMetrics(
                document_id=doc_id,
                revenue=metrics_dict.get("revenue"),
                expenses=metrics_dict.get("expenses"),
                profit=metrics_dict.get("profit"),
                assets=metrics_dict.get("assets"),
                liabilities=metrics_dict.get("liabilities"),
                cash_flow=metrics_dict.get("cash_flow"),
                debt=metrics_dict.get("debt")
            )
            db.add(metrics_model)
            
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.processing_status = "Completed"
                db.commit()
                logger.info(f"Document {filename} processed successfully.")
            else:
                logger.error(f"Document ID {doc_id} not found when trying to set status to Completed.")
                db.rollback()
        except Exception as save_err:
            logger.error(f"Error saving results for document {doc_id}: {save_err}")
            db.rollback()
            raise
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}", exc_info=True)
        # Set status to failed using a new clean session
        db = db_session_factory()
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.processing_status = "Failed"
                doc.failure_reason = str(e)
                db.commit()
        except Exception as rollback_err:
            logger.error(f"Failed to update document status to Failed: {rollback_err}")
            db.rollback()
        finally:
            db.close()

# ==================== Health Check ====================
@app.get("/health", tags=["health"])
def health_check(db: Session = Depends(get_db)):
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "disconnected"

    groq_status = "available"
    if settings.AI_PROVIDER.lower() == "groq":
        if not settings.GROQ_API_KEY:
            groq_status = "missing_api_key"
        else:
            try:
                # Basic check - initialize Groq provider
                get_ai_provider()
            except Exception as e:
                logger.error(f"Groq initialization check failed: {e}")
                groq_status = "unavailable"
    else:
        groq_status = f"provider_{settings.AI_PROVIDER}_configured"

    return {
        "status": "ok" if db_status == "connected" and groq_status in ["available", "provider_ollama_configured"] else "degraded",
        "database": db_status,
        "groq": groq_status,
        "version": "1.0.0"
    }

# ==================== Document Upload & Management ====================
@app.post("/api/documents/upload", tags=["documents"])
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    filename = file.filename
    # Extract extension
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    supported_exts = ["pdf", "docx", "xlsx", "xls", "csv", "txt", "json", "xml", "jpg", "jpeg", "png"]
    
    if file_ext not in supported_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format: .{file_ext}"
        )

    # Read content to check file size limits
    content = file.file.read()
    file_size = len(content)
    
    # 20MB limit for documents, 10MB limit for images
    if file_ext in ["jpg", "jpeg", "png"]:
        limit = settings.MAX_IMAGE_SIZE or 10485760
        if file_size > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image size exceeds limit of {limit / (1024*1024):.1f} MB."
            )
    else:
        limit = settings.MAX_FILE_SIZE or 20971520
        if file_size > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Document size exceeds limit of {limit / (1024*1024):.1f} MB."
            )

    try:
        # Save file using local filesystem storage abstraction
        storage_path = storage_provider.save_file(
            user_id=current_user.id,
            filename=filename,
            content=content
        )

        # Create Database Record
        doc = Document(
            user_id=current_user.id,
            filename=filename,
            file_type=file_ext,
            storage_path=storage_path,
            processing_status="Uploading"
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        # Trigger background execution using a fresh session factory
        background_tasks.add_task(
            process_document_task,
            SessionLocal,
            doc.id,
            storage_path
        )

        return {
            "message": "File uploaded and queued for processing.",
            "document_id": doc.id,
            "filename": doc.filename,
            "status": "Uploading"
        }
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )

@app.get("/api/documents", tags=["documents"])
def list_documents(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Document).filter(Document.user_id == current_user.id)
    total = query.count()
    documents = query.order_by(Document.created_at.desc()).offset(offset).limit(limit).all()
    
    res = []
    for doc in documents:
        metrics = db.query(DocumentMetrics).filter(DocumentMetrics.document_id == doc.id).first()
        res.append({
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "processing_status": doc.processing_status,
            "failure_reason": doc.failure_reason,
            "created_at": doc.created_at,
            "metrics": {
                "revenue": metrics.revenue if metrics else None,
                "expenses": metrics.expenses if metrics else None,
                "profit": metrics.profit if metrics else None,
                "assets": metrics.assets if metrics else None,
                "liabilities": metrics.liabilities if metrics else None,
                "cash_flow": metrics.cash_flow if metrics else None,
                "debt": metrics.debt if metrics else None
            } if doc.processing_status == "Completed" else None
        })
        
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": res
    }

@app.get("/api/documents/{document_id}", tags=["documents"])
def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
    metrics = db.query(DocumentMetrics).filter(DocumentMetrics.document_id == doc.id).first()
    return {
        "id": doc.id,
        "filename": doc.filename,
        "file_type": doc.file_type,
        "processing_status": doc.processing_status,
        "failure_reason": doc.failure_reason,
        "created_at": doc.created_at,
        "metrics": {
            "revenue": metrics.revenue if metrics else None,
            "expenses": metrics.expenses if metrics else None,
            "profit": metrics.profit if metrics else None,
            "assets": metrics.assets if metrics else None,
            "liabilities": metrics.liabilities if metrics else None,
            "cash_flow": metrics.cash_flow if metrics else None,
            "debt": metrics.debt if metrics else None
        } if doc.processing_status == "Completed" else None
    }

@app.delete("/api/documents/{document_id}", tags=["documents"])
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
    # Delete from filesystem
    storage_provider.delete_file(doc.storage_path)
    
    # Delete vector chunks (isolated to user)
    vector_store.delete_document_chunks(user_id=current_user.id, document_id=doc.id)
    
    # Cascade deletes metrics and history via SQLite/ORM
    db.delete(doc)
    db.commit()
    
    return {"message": f"Document '{doc.filename}' deleted successfully."}

# ==================== RAG Chat & Search ====================
@app.post("/api/chat", tags=["chat"])
def chat_document(
    question: str = Query(...),
    document_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _rate_limit = Depends(rate_limit_chat)
):
    # If a specific document is specified, verify ownership
    if document_id:
        doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found or access denied")
            
    # Trigger RAG query
    answer, sources = query_document_rag(
        user_id=current_user.id,
        question=question,
        document_id=document_id
    )

    # Store in ChatHistory database table
    history_entry = ChatHistory(
        user_id=current_user.id,
        document_id=document_id,
        question=question,
        answer=answer,
        sources=json.dumps(sources)
    )
    db.add(history_entry)
    db.commit()

    return {
        "id": history_entry.id,
        "question": question,
        "answer": answer,
        "sources": sources,
        "created_at": history_entry.created_at
    }

@app.get("/api/chat/history", tags=["chat"])
def get_chat_history(
    document_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ChatHistory).filter(ChatHistory.user_id == current_user.id)
    if document_id:
        query = query.filter(ChatHistory.document_id == document_id)
        
    total = query.count()
    records = query.order_by(ChatHistory.created_at.desc()).offset(offset).limit(limit).all()
    
    items = []
    for r in records:
        try:
            parsed_sources = json.loads(r.sources) if r.sources else []
        except Exception:
            parsed_sources = []
            
        items.append({
            "id": r.id,
            "document_id": r.document_id,
            "question": r.question,
            "answer": r.answer,
            "sources": parsed_sources,
            "created_at": r.created_at
        })
        
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items
    }

@app.get("/api/documents/search", tags=["search"])
def semantic_search(
    query: str = Query(...),
    document_id: Optional[int] = Query(None),
    limit: int = Query(5, ge=1, le=50),
    current_user: User = Depends(get_current_user)
):
    hits = vector_store.search_similar_chunks(
        user_id=current_user.id,
        query_text=query,
        limit=limit,
        document_id=document_id
    )
    results = []
    for hit in hits:
        meta = hit["metadata"]
        results.append({
            "filename": meta.get("filename"),
            "document_id": meta.get("document_id"),
            "page_number": meta.get("page_number"),
            "text": hit["text"],
            "score": hit["score"]
        })
    return {
        "query": query,
        "results": results
    }

# ==================== Dashboard / Metrics Aggregator ====================
@app.get("/api/dashboard/metrics", tags=["dashboard"])
def get_dashboard_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Retrieve all completed documents for this user
    docs = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == "Completed"
    ).all()
    
    doc_ids = [d.id for d in docs]
    if not doc_ids:
        return {
            "summary": {
                "total_documents": 0,
                "total_revenue": 0.0,
                "total_expenses": 0.0,
                "total_profit": 0.0,
                "total_assets": 0.0,
                "total_liabilities": 0.0
            },
            "documents": []
        }
        
    metrics_list = db.query(DocumentMetrics).filter(DocumentMetrics.document_id.in_(doc_ids)).all()
    
    # Aggregate values (averaging or taking sums)
    total_rev = sum(m.revenue for m in metrics_list if m.revenue is not None)
    total_exp = sum(m.expenses for m in metrics_list if m.expenses is not None)
    total_prof = sum(m.profit for m in metrics_list if m.profit is not None)
    total_assets = sum(m.assets for m in metrics_list if m.assets is not None)
    total_liab = sum(m.liabilities for m in metrics_list if m.liabilities is not None)
    
    doc_metrics_map = []
    for doc in docs:
        m = next((x for x in metrics_list if x.document_id == doc.id), None)
        doc_metrics_map.append({
            "document_id": doc.id,
            "filename": doc.filename,
            "upload_date": doc.created_at,
            "metrics": {
                "revenue": m.revenue if m else None,
                "expenses": m.expenses if m else None,
                "profit": m.profit if m else None,
                "assets": m.assets if m else None,
                "liabilities": m.liabilities if m else None,
                "cash_flow": m.cash_flow if m else None,
                "debt": m.debt if m else None
            }
        })
        
    return {
        "summary": {
            "total_documents": len(docs),
            "total_revenue": total_rev,
            "total_expenses": total_exp,
            "total_profit": total_prof,
            "total_assets": total_assets,
            "total_liabilities": total_liab
        },
        "documents": doc_metrics_map
    }

# ==================== Document Comparison ====================
@app.get("/api/analysis/compare", tags=["analysis"])
def compare_documents(
    doc_id_1: int = Query(...),
    doc_id_2: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify both belong to the user
    d1 = db.query(Document).filter(Document.id == doc_id_1, Document.user_id == current_user.id).first()
    d2 = db.query(Document).filter(Document.id == doc_id_2, Document.user_id == current_user.id).first()
    
    if not d1 or not d2:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both documents not found")
        
    m1 = db.query(DocumentMetrics).filter(DocumentMetrics.document_id == doc_id_1).first()
    m2 = db.query(DocumentMetrics).filter(DocumentMetrics.document_id == doc_id_2).first()
    
    metrics1 = {
        "revenue": m1.revenue if m1 else None,
        "expenses": m1.expenses if m1 else None,
        "profit": m1.profit if m1 else None,
        "assets": m1.assets if m1 else None,
        "liabilities": m1.liabilities if m1 else None,
        "cash_flow": m1.cash_flow if m1 else None,
        "debt": m1.debt if m1 else None
    }
    
    metrics2 = {
        "revenue": m2.revenue if m2 else None,
        "expenses": m2.expenses if m2 else None,
        "profit": m2.profit if m2 else None,
        "assets": m2.assets if m2 else None,
        "liabilities": m2.liabilities if m2 else None,
        "cash_flow": m2.cash_flow if m2 else None,
        "debt": m2.debt if m2 else None
    }
    
    # Calculate absolute differences
    differences = {}
    for key in metrics1.keys():
        v1 = metrics1[key]
        v2 = metrics2[key]
        if v1 is not None and v2 is not None:
            differences[key] = {
                "doc1_val": v1,
                "doc2_val": v2,
                "diff": v2 - v1,
                "pct_change": ((v2 - v1) / v1 * 100.0) if v1 != 0 else 0.0
            }
        else:
            differences[key] = {
                "doc1_val": v1,
                "doc2_val": v2,
                "diff": None,
                "pct_change": None
            }
            
    # LLM-based narrative comparison
    narrative_prompt = (
        f"Compare the financial profile of {d1.filename} against {d2.filename}.\n\n"
        f"Profile 1 ({d1.filename}):\n"
        f"- Revenue: {metrics1['revenue']}\n"
        f"- Expenses: {metrics1['expenses']}\n"
        f"- Profit: {metrics1['profit']}\n"
        f"- Assets: {metrics1['assets']}\n"
        f"- Liabilities: {metrics1['liabilities']}\n"
        f"- Cash Flow: {metrics1['cash_flow']}\n"
        f"- Debt: {metrics1['debt']}\n\n"
        f"Profile 2 ({d2.filename}):\n"
        f"- Revenue: {metrics2['revenue']}\n"
        f"- Expenses: {metrics2['expenses']}\n"
        f"- Profit: {metrics2['profit']}\n"
        f"- Assets: {metrics2['assets']}\n"
        f"- Liabilities: {metrics2['liabilities']}\n"
        f"- Cash Flow: {metrics2['cash_flow']}\n"
        f"- Debt: {metrics2['debt']}\n\n"
        f"Provide a brief summary detailing:\n"
        f"1. Revenue and Profit differences\n"
        f"2. Asset and liability shifts\n"
        f"3. Key financial observations/concerns.\n"
        f"Keep the summary structured, professional, and under 250 words."
    )
    
    narrative = "Narrative comparison not available (missing Groq API key)."
    if settings.GROQ_API_KEY:
        try:
            provider = get_ai_provider()
            narrative = provider.generate_text(
                prompt=narrative_prompt,
                system_prompt="You are an expert financial consultant."
            )
        except Exception as e:
            logger.error(f"Comparison narrative generation failed: {e}")
            narrative = f"Failed to generate summary: {str(e)}"
            
    return {
        "document1": {"id": d1.id, "filename": d1.filename},
        "document2": {"id": d2.id, "filename": d2.filename},
        "metrics1": metrics1,
        "metrics2": metrics2,
        "differences": differences,
        "narrative": narrative
    }

# ==================== Export Services (PDF / CSV) ====================
@app.get("/api/documents/{document_id}/export/summary", tags=["exports"])
def export_summary_pdf(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    m = db.query(DocumentMetrics).filter(DocumentMetrics.document_id == doc.id).first()
    
    summary_text = "Executive summary not available."
    if settings.GROQ_API_KEY:
        try:
            # RAG summary request
            summary_text, _ = query_document_rag(
                user_id=current_user.id,
                question="Provide a structured executive summary of this financial document. Highlight key financial metrics, liabilities, cash flow health, and primary risks.",
                document_id=doc.id
            )
        except Exception as e:
            summary_text = f"Failed to generate summary: {str(e)}"

    # Generate PDF using ReportLab
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    buffer = io.BytesIO()
    doc_pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=15
    )
    h2_style = ParagraphStyle(
        'H2Style',
        parent=styles['Heading2'],
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=12,
        spaceAfter=8
    )
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['BodyText'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155")
    )
    
    story.append(Paragraph(f"FinSight AI - Financial Document Summary", title_style))
    story.append(Paragraph(f"<b>Document:</b> {doc.filename}", body_style))
    story.append(Paragraph(f"<b>Type:</b> {doc.file_type.upper()}", body_style))
    story.append(Paragraph(f"<b>Processed:</b> {doc.created_at.strftime('%Y-%m-%d %H:%M')}", body_style))
    story.append(Spacer(1, 15))
    
    # Add Metrics Table
    if m:
        story.append(Paragraph("Extracted Financial Metrics", h2_style))
        data = [
            ["Metric", "Value"],
            ["Revenue", f"${m.revenue:,.2f}" if m.revenue is not None else "N/A"],
            ["Expenses", f"${m.expenses:,.2f}" if m.expenses is not None else "N/A"],
            ["Profit", f"${m.profit:,.2f}" if m.profit is not None else "N/A"],
            ["Assets", f"${m.assets:,.2f}" if m.assets is not None else "N/A"],
            ["Liabilities", f"${m.liabilities:,.2f}" if m.liabilities is not None else "N/A"],
            ["Cash Flow", f"${m.cash_flow:,.2f}" if m.cash_flow is not None else "N/A"],
            ["Debt", f"${m.debt:,.2f}" if m.debt is not None else "N/A"]
        ]
        
        t = Table(data, colWidths=[200, 200])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (1,0), colors.HexColor("#f1f5f9")),
            ('TEXTCOLOR', (0,0), (1,0), colors.HexColor("#0f172a")),
            ('FONTNAME', (0,0), (1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('ALIGN', (1,1), (1,-1), 'RIGHT')
        ]))
        story.append(t)
        story.append(Spacer(1, 15))
        
    story.append(Paragraph("AI-Generated Executive Summary", h2_style))
    story.append(Paragraph(summary_text.replace("\n", "<br/>"), body_style))
    
    doc_pdf.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=summary_{doc.id}.pdf"}
    )

@app.get("/api/documents/{document_id}/export/metrics", tags=["exports"])
def export_metrics_csv(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    m = db.query(DocumentMetrics).filter(DocumentMetrics.document_id == doc.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Metrics not extracted for this document")

    csv_data = [
        "Metric,Value",
        f"Revenue,{m.revenue if m.revenue is not None else ''}",
        f"Expenses,{m.expenses if m.expenses is not None else ''}",
        f"Profit,{m.profit if m.profit is not None else ''}",
        f"Assets,{m.assets if m.assets is not None else ''}",
        f"Liabilities,{m.liabilities if m.liabilities is not None else ''}",
        f"Cash Flow,{m.cash_flow if m.cash_flow is not None else ''}",
        f"Debt,{m.debt if m.debt is not None else ''}"
    ]
    csv_str = "\n".join(csv_data)
    
    buffer = io.BytesIO(csv_str.encode("utf-8"))
    
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=metrics_{doc.id}.csv"}
    )

@app.get("/api/analysis/compare/export", tags=["exports"])
def export_comparison_pdf(
    doc_id_1: int = Query(...),
    doc_id_2: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comparison = compare_documents(
        doc_id_1=doc_id_1,
        doc_id_2=doc_id_2,
        current_user=current_user,
        db=db
    )
    
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    buffer = io.BytesIO()
    doc_pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=15
    )
    h2_style = ParagraphStyle(
        'H2Style',
        parent=styles['Heading2'],
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=12,
        spaceAfter=8
    )
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['BodyText'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155")
    )
    
    story.append(Paragraph(f"FinSight AI - Financial Document Comparison Report", title_style))
    story.append(Paragraph(f"<b>Document 1:</b> {comparison['document1']['filename']}", body_style))
    story.append(Paragraph(f"<b>Document 2:</b> {comparison['document2']['filename']}", body_style))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Metric Comparison Table", h2_style))
    
    table_data = [
        ["Metric", comparison['document1']['filename'], comparison['document2']['filename'], "Difference", "% Change"]
    ]
    
    for key, diff in comparison['differences'].items():
        v1 = diff['doc1_val']
        v2 = diff['doc2_val']
        val1_str = f"${v1:,.2f}" if v1 is not None else "N/A"
        val2_str = f"${v2:,.2f}" if v2 is not None else "N/A"
        
        diff_val = diff['diff']
        pct_val = diff['pct_change']
        
        diff_str = f"${diff_val:,.2f}" if diff_val is not None else "N/A"
        if diff_val is not None and diff_val > 0:
            diff_str = "+" + diff_str
            
        pct_str = f"{pct_val:,.1f}%" if pct_val is not None else "N/A"
        if pct_val is not None and pct_val > 0:
            pct_str = "+" + pct_str
            
        table_data.append([key.capitalize(), val1_str, val2_str, diff_str, pct_str])
        
    t = Table(table_data, colWidths=[110, 110, 110, 100, 70])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor("#0f172a")),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('ALIGN', (1,1), (-1,-1), 'RIGHT')
    ]))
    story.append(t)
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Comparative Financial Narrative", h2_style))
    story.append(Paragraph(comparison['narrative'].replace("\n", "<br/>"), body_style))
    
    doc_pdf.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=comparison_report.pdf"}
    )
