from typing import Any, Optional, Dict
from fastapi import Request, status
from fastapi.responses import JSONResponse


class AppException(Exception):
    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class ConcurrencyConflictError(AppException):
    def __init__(
        self,
        message: str = "Pricing record has been modified by another process. Please reload and review the latest data.",
        current_data: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            message=message,
            code="CONCURRENCY_CONFLICT",
            status_code=status.HTTP_409_CONFLICT,
            details=current_data or {},
        )


class FileLimitExceededError(AppException):
    def __init__(self, message: str = "File limit exceeded", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="FILE_LIMIT_EXCEEDED",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            details=details,
        )


class InvalidStateTransitionError(AppException):
    def __init__(self, message: str = "Invalid job state transition", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="INVALID_STATE_TRANSITION",
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )


class AppValidationError(AppException):
    def __init__(self, message: str = "Validation failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )
