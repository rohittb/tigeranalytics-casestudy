from abc import ABC, abstractmethod
from typing import BinaryIO


class StorageBackend(ABC):
    @abstractmethod
    def save(self, file_obj: BinaryIO, filename: str) -> str:
        """Save file and return a unique storage_key"""
        pass

    @abstractmethod
    def get_path(self, storage_key: str) -> str:
        """Return the local file path or identifier for reading"""
        pass

    @abstractmethod
    def open(self, storage_key: str) -> BinaryIO:
        """Open the file stream for reading"""
        pass

    @abstractmethod
    def delete(self, storage_key: str) -> bool:
        """Delete file by storage_key"""
        pass
