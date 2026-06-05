import os
import shutil
from abc import ABC, abstractmethod
from app.config import settings

class StorageProvider(ABC):
    @abstractmethod
    def save_file(self, user_id: int, filename: str, content: bytes) -> str:
        """Saves a file and returns its storage path or URL."""
        pass

    @abstractmethod
    def get_file(self, storage_path: str) -> bytes:
        """Retrieves file contents from the storage path."""
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """Deletes the file from storage."""
        pass


class LocalStorageProvider(StorageProvider):
    def __init__(self, base_dir: str = settings.UPLOAD_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_user_dir(self, user_id: int) -> str:
        user_dir = os.path.join(self.base_dir, str(user_id))
        os.makedirs(user_dir, exist_ok=True)
        return user_dir

    def save_file(self, user_id: int, filename: str, content: bytes) -> str:
        user_dir = self._get_user_dir(user_id)
        # To avoid collisions, we could prefix filename with timestamp or uuid, but standard is fine
        storage_path = os.path.join(user_dir, filename)
        with open(storage_path, "wb") as f:
            f.write(content)
        return os.path.abspath(storage_path)

    def get_file(self, storage_path: str) -> bytes:
        if not os.path.exists(storage_path):
            raise FileNotFoundError(f"File not found at: {storage_path}")
        with open(storage_path, "rb") as f:
            return f.read()

    def delete_file(self, storage_path: str) -> bool:
        try:
            if os.path.exists(storage_path):
                os.remove(storage_path)
                return True
        except Exception:
            pass
        return False


# Global storage instance
storage_provider = LocalStorageProvider()
