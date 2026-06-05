import json
import logging
from app.rag.vectorstore import vector_store
from app.rag.ai_provider import get_ai_provider

logger = logging.getLogger(__name__)

def query_document_rag(user_id: int, question: str, document_id: int = None) -> tuple:
    """
    Retrieves contexts from the vector store under user isolation scope,
    sends them to the Groq LLM, and formats the response.
    Returns: (answer_string, sources_list)
    """
    # 1. Search for matching text chunks
    hits = vector_store.search_similar_chunks(user_id=user_id, query_text=question, limit=6, document_id=document_id)
    
    if not hits:
        return ("Information not found in uploaded documents.", [])

    # 2. Extract and format contexts for the LLM
    context_str_list = []
    sources = []
    
    for idx, hit in enumerate(hits):
        meta = hit["metadata"]
        text = hit["text"]
        filename = meta.get("filename", "Unknown")
        page_num = meta.get("page_number", "N/A")
        
        context_str_list.append(
            f"Context {idx + 1} (Source: {filename}, Page: {page_num}):\n{text}\n"
        )
        
        sources.append({
            "filename": filename,
            "page_number": page_num,
            "text": text[:300] + "..." if len(text) > 300 else text
        })

    context_block = "\n".join(context_str_list)

    # 3. Formulate the prompt
    system_prompt = (
        "You are an expert financial analysis assistant. "
        "Your task is to answer the user's question using ONLY the provided document contexts. "
        "Strictly adhere to the following rules:\n"
        "1. Your answer must be entirely based on the provided document contexts.\n"
        "2. If the context does not contain the information needed to answer the question, "
        "respond with EXACTLY: 'Information not found in uploaded documents.' Do not make up facts or use external knowledge.\n"
        "3. Keep your answers clear, professional, and detailed when explaining financial numbers.\n"
        "4. Include calculations or intermediate breakdowns if requested and available."
    )

    prompt = (
        f"Document Contexts:\n"
        f"=======================\n"
        f"{context_block}\n"
        f"=======================\n\n"
        f"User Question: {question}\n\n"
        f"Answer:"
    )

    # 4. Generate answer via AI Provider
    try:
        provider = get_ai_provider()
        answer = provider.generate_text(prompt=prompt, system_prompt=system_prompt)
        
        # Double check if the LLM returned a soft "I don't know" or couldn't find the info
        answer_clean = answer.strip().lower()
        if any(phrase in answer_clean for phrase in ["information not found", "i cannot find", "does not contain", "not mentioned in the context"]):
            # Normalize to the required phrase
            return ("Information not found in uploaded documents.", [])
            
        return (answer.strip(), sources)
    except Exception as e:
        logger.error(f"Failed to query LLM: {e}")
        return (f"Error generating answer: {str(e)}", [])
