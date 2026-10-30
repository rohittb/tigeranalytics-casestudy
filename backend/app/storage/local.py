import os
import uuid
import shutil
from typing import BinaryIO
from app.core.config import settings
from app.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    def __init__(self, base_dir: str = settings.UPLOAD_DIR):
        self.base_dir = os.path.abspath(base_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def save(self, file_obj: BinaryIO, filename: str) -> str:
        # Generate safe unique storage key preserving extension
        ext = os.path.splitext(filename)[1].lower() or ".csv"
        storage_key = f"{uuid.uuid4().hex}{ext}"
        destination_path = self.get_path(storage_key)

        with open(destination_path, "wb") as dest:
            shutil.copyfileobj(file_obj, dest)

        return storage_key

    def get_path(self, storage_key: str) -> str:
        # Prevent directory traversal
        safe_key = os.path.basename(storage_key)
        return os.path.join(self.base_dir, safe_key)

    def open(self, storage_key: str) -> BinaryIO:
        path = self.get_path(storage_key)
        return open(path, "rb")

    def delete(self, storage_key: str) -> bool:
        path = self.get_path(storage_key)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


default_storage = LocalStorageBackend()
