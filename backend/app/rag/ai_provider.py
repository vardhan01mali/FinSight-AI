import os
from abc import ABC, abstractmethod
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class AIProvider(ABC):
    @abstractmethod
    def generate_text(self, prompt: str, system_prompt: str = None, json_mode: bool = False, model: str = None) -> str:
        """Generates text from the AI model."""
        pass


class GroqProvider(AIProvider):
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        if not self.api_key:
            error_msg = "Groq API key missing. Add GROQ_API_KEY in .env file."
            logger.critical(error_msg)
            raise ValueError(error_msg)
            
        try:
            from langchain_groq import ChatGroq
            self.ChatGroqClass = ChatGroq
        except ImportError:
            logger.error("langchain-groq package not installed. Cannot use GroqProvider.")
            raise

    def generate_text(self, prompt: str, system_prompt: str = None, json_mode: bool = False, model: str = None) -> str:
        # Resolve model to use
        selected_model = model or settings.DEFAULT_LLM_MODEL
        
        # Configure JSON mode if requested
        kwargs = {}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        chat = self.ChatGroqClass(
            groq_api_key=self.api_key,
            model_name=selected_model,
            temperature=0.0, # Zero temperature is best for financial document correctness
            **kwargs
        )

        messages = []
        if system_prompt:
            messages.append(("system", system_prompt))
        messages.append(("user", prompt))

        try:
            response = chat.invoke(messages)
            return response.content
        except Exception as e:
            logger.error(f"Error calling Groq API: {e}")
            raise RuntimeError(f"Groq API call failed: {str(e)}")


class OllamaProvider(AIProvider):
    """Placeholder for future Ollama integration support."""
    def __init__(self):
        logger.info("OllamaProvider initialized (Stub/Optional future support).")

    def generate_text(self, prompt: str, system_prompt: str = None, json_mode: bool = False, model: str = None) -> str:
        raise NotImplementedError("OllamaProvider is not yet implemented.")


def get_ai_provider() -> AIProvider:
    provider_type = settings.AI_PROVIDER.lower()
    if provider_type == "groq":
        return GroqProvider()
    elif provider_type == "ollama":
        return OllamaProvider()
    else:
        # Fallback to groq if unknown
        return GroqProvider()
