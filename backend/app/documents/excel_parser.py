import pandas as pd
import logging
import os

logger = logging.getLogger(__name__)

def df_to_markdown(df: pd.DataFrame) -> str:
    """Converts a pandas DataFrame to a simple markdown table string without external dependencies."""
    headers = [str(col) for col in df.columns]
    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for _, row in df.iterrows():
        row_str = [str(val).replace("\n", " ").strip() for val in row.values]
        lines.append("| " + " | ".join(row_str) + " |")
    return "\n".join(lines)

def parse_excel(file_path: str) -> list:
    """
    Parses a .xlsx or .xls file.
    Reads each worksheet, converts it into a markdown table representation, and returns pages.
    """
    pages_data = []
    try:
        xls = pd.ExcelFile(file_path, engine="openpyxl")
        for idx, sheet_name in enumerate(xls.sheet_names):
            df = pd.read_excel(xls, sheet_name=sheet_name)
            # Drop completely empty rows and columns
            df = df.dropna(how="all").dropna(axis=1, how="all")
            
            if df.empty:
                continue
                
            md_table = df_to_markdown(df)
            text_content = f"Sheet Name: {sheet_name}\n\n{md_table}"
            pages_data.append({
                "page": idx + 1,
                "text": text_content.strip()
            })
        return pages_data
    except Exception as e:
        logger.error(f"Error parsing Excel file {file_path}: {e}")
        raise RuntimeError(f"Excel parsing failed: {str(e)}")

def parse_csv(file_path: str) -> list:
    """
    Parses a .csv file.
    Converts the csv table into a markdown table.
    """
    try:
        df = pd.read_csv(file_path)
        df = df.dropna(how="all").dropna(axis=1, how="all")
        
        if df.empty:
            return [{"page": 1, "text": "Empty CSV document."}]
            
        md_table = df_to_markdown(df)
        text_content = f"CSV Document Content:\n\n{md_table}"
        return [{
            "page": 1,
            "text": text_content.strip()
        }]
    except Exception as e:
        logger.error(f"Error parsing CSV file {file_path}: {e}")
        raise RuntimeError(f"CSV parsing failed: {str(e)}")
