import xml.etree.ElementTree as ET
import json
import logging

logger = logging.getLogger(__name__)

def parse_xml_to_text(file_path: str) -> list:
    """
    Parses an XML file and converts tags and values into readable key-value sentences.
    E.g. <profit>500000</profit> -> Profit: 500000
    """
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        lines = []
        
        def traverse(node, prefix=""):
            # Capitalize the tag for nicer presentation
            tag_name = node.tag.capitalize()
            current_prefix = f"{prefix} -> {tag_name}" if prefix else tag_name
            
            # Extract text if it exists and is not just spacing
            text = node.text.strip() if node.text else ""
            if text:
                lines.append(f"{current_prefix}: {text}")
                
            # Extract attributes
            for attr_name, attr_val in node.attrib.items():
                lines.append(f"{current_prefix} (Attribute {attr_name}): {attr_val}")
                
            for child in node:
                traverse(child, current_prefix)
                
        traverse(root)
        
        text_content = "\n".join(lines)
        if not text_content.strip():
            text_content = "Empty XML document."
            
        return [{
            "page": 1,
            "text": text_content
        }]
    except Exception as e:
        logger.error(f"Error parsing XML file {file_path}: {e}")
        raise RuntimeError(f"XML parsing failed: {str(e)}")


def parse_json_to_text(file_path: str) -> list:
    """
    Parses a JSON file and flattens nested key-value pairs into readable descriptions.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        lines = []
        
        def flatten(obj, prefix=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    current_prefix = f"{prefix}.{k}" if prefix else k
                    flatten(v, current_prefix)
            elif isinstance(obj, list):
                for idx, item in enumerate(obj):
                    current_prefix = f"{prefix}[{idx}]"
                    flatten(item, current_prefix)
            else:
                lines.append(f"{prefix}: {obj}")
                
        flatten(data)
        
        text_content = "\n".join(lines)
        if not text_content.strip():
            text_content = "Empty JSON document."
            
        return [{
            "page": 1,
            "text": text_content
        }]
    except Exception as e:
        logger.error(f"Error parsing JSON file {file_path}: {e}")
        raise RuntimeError(f"JSON parsing failed: {str(e)}")
