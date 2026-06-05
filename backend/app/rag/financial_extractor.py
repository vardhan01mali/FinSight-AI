import json
import logging
from app.rag.ai_provider import get_ai_provider

logger = logging.getLogger(__name__)

def extract_financial_metrics(document_text: str) -> dict:
    """
    Takes document text and uses the Groq LLM in JSON mode to extract:
    revenue, expenses, profit, assets, liabilities, cash_flow, debt.
    Returns: Dict containing the float values or None if not found.
    """
    # Sample up to 30,000 characters of text to prevent token exhaustion while capturing summaries
    text_sample = document_text[:30000]

    system_prompt = (
        "You are a financial parsing agent that outputs strict JSON. "
        "Analyze the provided text from a financial document and extract the primary financial metrics. "
        "Return a JSON object with the following keys:\n"
        "{\n"
        '  "revenue": float or null,\n'
        '  "expenses": float or null,\n'
        '  "profit": float or null,\n'
        '  "assets": float or null,\n'
        '  "liabilities": float or null,\n'
        '  "cash_flow": float or null,\n'
        '  "debt": float or null\n'
        "}\n"
        "Rules:\n"
        "1. Extract the most recent annual or quarterly values if multiple are present.\n"
        "2. Parse the numbers as floating point numbers (e.g. 500000.00). Do not include commas or currency symbols.\n"
        "3. If a metric is not mentioned or cannot be calculated from the text, set its value to null.\n"
        "4. Output ONLY valid JSON. No other text."
    )

    prompt = (
        f"Financial Document Text:\n"
        f"=======================\n"
        f"{text_sample}\n"
        f"=======================\n\n"
        f"Extract the requested JSON metrics:"
    )

    default_metrics = {
        "revenue": None,
        "expenses": None,
        "profit": None,
        "assets": None,
        "liabilities": None,
        "cash_flow": None,
        "debt": None
    }

    try:
        provider = get_ai_provider()
        response_text = provider.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            json_mode=True
        )
        
        # Parse output JSON
        extracted = json.loads(response_text)
        
        # Ensure all keys exist and convert values to float/None
        final_metrics = {}
        for key in default_metrics.keys():
            val = extracted.get(key)
            if val is not None:
                try:
                    # Strip any string formatting if LLM returned a string
                    if isinstance(val, str):
                        # Clean up formatting like '$', ',', ' '
                        for char in ["$", ",", " "]:
                            val = val.replace(char, "")
                    final_metrics[key] = float(val)
                except (ValueError, TypeError):
                    final_metrics[key] = None
            else:
                final_metrics[key] = None
                
        logger.info(f"Extracted metrics: {final_metrics}")
        return final_metrics
    except Exception as e:
        logger.error(f"Failed to extract financial metrics: {e}")
        return default_metrics
