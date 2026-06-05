import fitz  # PyMuPDF
import pdfplumber
import logging
import io
from PIL import Image
from app.documents.ocr import is_ocr_available, extract_text_from_pil_image

logger = logging.getLogger(__name__)

def parse_pdf(pdf_path: str) -> list:
    """
    Parses a PDF file.
    First tries to extract text directly using pdfplumber.
    If direct extraction yields very little text (< 50 chars), it falls back
    to rendering pages as images and running OCR using PyMuPDF and Tesseract.
    Returns: List of dicts, e.g., [{"page": 1, "text": "..."}]
    """
    pages_data = []
    
    # Try direct PyMuPDF text extraction first (much faster than pdfplumber)
    try:
        doc = fitz.open(pdf_path)
        for idx, page in enumerate(doc):
            text = page.get_text()
            page_num = idx + 1
            if text:
                pages_data.append({
                    "page": page_num,
                    "text": text.strip()
                })
        doc.close()
    except Exception as e:
        logger.error(f"Direct PyMuPDF PDF text extraction failed for {pdf_path}: {e}")
    
    # Check if we got substantive text from PyMuPDF
    total_text_len = sum(len(p["text"]) for p in pages_data)
    
    if total_text_len <= 50:
        logger.info(f"PyMuPDF direct extraction yielded scant text ({total_text_len} chars). Trying pdfplumber fallback...")
        pages_data = []
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for idx, page in enumerate(pdf.pages):
                    text = page.extract_text()
                    page_num = idx + 1
                    if text:
                        pages_data.append({
                            "page": page_num,
                            "text": text.strip()
                        })
        except Exception as e:
            logger.error(f"Direct pdfplumber PDF text extraction failed for {pdf_path}: {e}")

    # Final check of direct extraction methods
    total_text_len = sum(len(p["text"]) for p in pages_data)
    if total_text_len > 50:
        logger.info(f"Successfully extracted text directly from {pdf_path}")
        return pages_data

    # If direct text extraction yielded nothing, try OCR fallback
    logger.info(f"Scant text found ({total_text_len} chars). Falling back to OCR for {pdf_path}")
    
    if not is_ocr_available():
        raise RuntimeError("Direct text extraction yielded no content, and OCR is not available.")
        
    pages_data = [] # Reset and do OCR
    try:
        doc = fitz.open(pdf_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Render page to a high-resolution pixmap (300 DPI is standard for OCR)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            image_data = pix.tobytes("png")
            image = Image.open(io.BytesIO(image_data))
            
            ocr_text = extract_text_from_pil_image(image)
            pages_data.append({
                "page": page_num + 1,
                "text": ocr_text.strip()
            })
        
        doc.close()
        logger.info(f"Successfully extracted text via OCR from {pdf_path}")
        return pages_data
    except Exception as e:
        logger.error(f"OCR PDF extraction failed for {pdf_path}: {e}")
        raise RuntimeError(f"OCR PDF parsing failed: {str(e)}")
