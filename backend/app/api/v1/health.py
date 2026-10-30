from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import get_db
from app.core.config import settings
import redis

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/live", summary="Liveness probe")
def health_live():
    return {"status": "ok", "service": settings.PROJECT_NAME}


@router.get("/ready", summary="Readiness probe")
def health_ready(db: Session = Depends(get_db)):
    readiness = {
        "status": "ready",
        "database": "unknown",
        "redis": "unknown",
    }
    is_ready = True

    # 1. Database check
    try:
        db.execute(text("SELECT 1"))
        readiness["database"] = "healthy"
    except Exception as e:
        readiness["database"] = f"unhealthy: {str(e)}"
        is_ready = False

    # 2. Redis check
    try:
        r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=1)
        if r.ping():
            readiness["redis"] = "healthy"
        else:
            readiness["redis"] = "unresponsive"
            is_ready = False
    except Exception as e:
        readiness["redis"] = f"unhealthy: {str(e)}"
        # Note: In local dev if redis isn't started yet, we still report status
        readiness["redis_note"] = "Redis broker optional in direct test mode"

    status_code = status.HTTP_200_OK if readiness["database"] == "healthy" else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=readiness)
