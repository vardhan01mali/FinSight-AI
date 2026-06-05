import logging
from PIL import Image

logger = logging.getLogger(__name__)

# Try to import pytesseract and check if it is available
try:
    import pytesseract
except ImportError:
    pytesseract = None
    logger.warning("pytesseract package not installed. OCR will be disabled.")

_ocr_available_cache = None

def is_ocr_available() -> bool:
    global _ocr_available_cache
    if _ocr_available_cache is not None:
        return _ocr_available_cache

    if pytesseract is None:
        _ocr_available_cache = False
        return False
    try:
        # Check if tesseract binary is available on the path
        pytesseract.get_tesseract_version()
        _ocr_available_cache = True
        return True
    except Exception as e:
        logger.warning(f"Tesseract OCR binary not found on system path: {e}")
        _ocr_available_cache = False
        return False

def extract_text_from_image(image_path: str) -> str:
    """Extracts text from an image using pytesseract OCR."""
    if not is_ocr_available():
        raise RuntimeError("Tesseract OCR is not available. Please install it on the host system.")
    
    try:
        image = Image.open(image_path)
        # Perform OCR text extraction
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        logger.error(f"Error during image OCR processing: {e}")
        raise RuntimeError(f"OCR extraction failed: {str(e)}")

def extract_text_from_pil_image(image: Image.Image) -> str:
    """Extracts text from a PIL Image object."""
    if not is_ocr_available():
        raise RuntimeError("Tesseract OCR is not available.")
    try:
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        logger.error(f"Error during PIL image OCR: {e}")
        return ""
