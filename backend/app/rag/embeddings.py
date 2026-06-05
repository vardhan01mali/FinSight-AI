import logging

logger = logging.getLogger(__name__)

class LazyEmbeddings:
    def __init__(self):
        self._model = None

    @property
    def model(self):
        if self._model is None:
            logger.info("Initializing SentenceTransformer model 'all-MiniLM-L6-v2'...")
            try:
                from sentence_transformers import SentenceTransformer
                # Load the model on local CPU (small 90MB model)
                self._model = SentenceTransformer("all-MiniLM-L6-v2")
                logger.info("SentenceTransformer model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load sentence-transformers: {e}")
                raise
        return self._model

    def initialize(self):
        """Eagerly load the model to cache/warm it up."""
        _ = self.model

    def embed_documents(self, texts: list) -> list:
        if not texts:
            return []
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()

    def embed_query(self, text: str) -> list:
        embedding = self.model.encode([text], convert_to_numpy=True)[0]
        return embedding.tolist()


# Global instance of LazyEmbeddings
embeddings_manager = LazyEmbeddings()
