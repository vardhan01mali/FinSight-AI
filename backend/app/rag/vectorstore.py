import chromadb
import logging
import uuid
from app.config import settings
from app.rag.embeddings import embeddings_manager

logger = logging.getLogger(__name__)

class ChromaVectorStore:
    def __init__(self):
        self.chroma_path = settings.CHROMA_PATH
        logger.info(f"Initializing persistent ChromaDB client at {self.chroma_path}...")
        self.client = chromadb.PersistentClient(path=self.chroma_path)
        self.collection = self.client.get_or_create_collection(
            name="finsight_documents",
            metadata={"hnsw:space": "cosine"} # cosine distance is ideal for text matching
        )
        logger.info("ChromaDB collection loaded successfully.")

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> list:
        """Splits text into overlapping segments."""
        chunks = []
        if not text:
            return chunks
        
        # Simple character-based splitting
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start += chunk_size - overlap
            
        # Ensure we have at least one chunk even if short
        if not chunks and text:
            chunks.append(text)
            
        return chunks

    def add_document_chunks(self, user_id: int, document_id: int, filename: str, pages_data: list) -> bool:
        """
        Chunks pages and adds them to ChromaDB.
        Each page contains {"page": int, "text": str}.
        """
        documents_list = []
        metadatas_list = []
        ids_list = []
        
        for page_data in pages_data:
            page_num = page_data["page"]
            text_content = page_data["text"]
            
            if not text_content.strip():
                continue
                
            chunks = self.chunk_text(text_content)
            for idx, chunk in enumerate(chunks):
                chunk_id = f"doc_{document_id}_p{page_num}_c{idx}_{uuid.uuid4().hex[:6]}"
                
                # metadata mapping required for search & isolation
                metadata = {
                    "user_id": user_id,
                    "document_id": document_id,
                    "filename": filename,
                    "page_number": page_num,
                    "chunk_id": chunk_id
                }
                
                documents_list.append(chunk)
                metadatas_list.append(metadata)
                ids_list.append(chunk_id)
                
        if not documents_list:
            logger.info("No content to index in vector store.")
            return False

        # Generate embeddings
        logger.info(f"Generating embeddings for {len(documents_list)} chunks...")
        embeddings = embeddings_manager.embed_documents(documents_list)
        
        # Insert in batches to prevent hitting ChromaDB single-request limits
        batch_size = 200
        for i in range(0, len(documents_list), batch_size):
            end_idx = i + batch_size
            self.collection.add(
                ids=ids_list[i:end_idx],
                embeddings=embeddings[i:end_idx],
                metadatas=metadatas_list[i:end_idx],
                documents=documents_list[i:end_idx]
            )
            
        logger.info(f"Indexed {len(documents_list)} chunks for doc {document_id}")
        return True

    def search_similar_chunks(self, user_id: int, query_text: str, limit: int = 5, document_id: int = None) -> list:
        """
        Queries ChromaDB for segments similar to query_text.
        Enforces strict user isolation via user_id metadata filters.
        """
        try:
            # Build filter query
            where_filter = {"user_id": user_id}
            if document_id is not None:
                where_filter = {
                    "$and": [
                        {"user_id": user_id},
                        {"document_id": document_id}
                    ]
                }
                
            query_embedding = embeddings_manager.embed_query(query_text)
            
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=limit,
                where=where_filter
            )
            
            # Reformat results
            hits = []
            if results and results["documents"] and len(results["documents"][0]) > 0:
                docs = results["documents"][0]
                metas = results["metadatas"][0]
                distances = results["distances"][0] if "distances" in results else [0.0] * len(docs)
                
                for i in range(len(docs)):
                    hits.append({
                        "text": docs[i],
                        "metadata": metas[i],
                        "score": 1.0 - distances[i]  # Convert distance to a similarity score
                    })
            return hits
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []

    def delete_document_chunks(self, user_id: int, document_id: int) -> bool:
        """Deletes all chunks belonging to a document under user isolation scope."""
        try:
            where_filter = {
                "$and": [
                    {"user_id": user_id},
                    {"document_id": document_id}
                ]
            }
            self.collection.delete(where=where_filter)
            logger.info(f"Deleted vector chunks for document {document_id} of user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete document vector chunks: {e}")
            return False


# Global vector store instance
vector_store = ChromaVectorStore()
