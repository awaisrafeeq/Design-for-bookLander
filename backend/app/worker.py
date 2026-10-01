from celery import Celery

from app.config import settings

celery_app = Celery("booklender", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.booklender_timezone,
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    beat_schedule={},
)


@celery_app.task(name="booklender.healthcheck")
def healthcheck() -> str:
    return "ok"
