from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "retail_pricing_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,  # Task acknowledged only after processing
    worker_prefetch_multiplier=1,
)

celery_app.autodiscover_tasks(["app.workers.tasks"])
