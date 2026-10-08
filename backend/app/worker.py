import logging

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
    beat_schedule={
        "studio-outbox": {"task": "booklender.process_jobs", "schedule": 15.0},
        "zernio-accounts": {"task": "booklender.sync_zernio_accounts", "schedule": 300.0},
    },
)


@celery_app.task(name="booklender.healthcheck")
def healthcheck() -> str:
    return "ok"


@celery_app.task(name="booklender.process_jobs", soft_time_limit=900, time_limit=930)
def process_jobs():
    from app.jobs import run_pending
    run_pending()


@celery_app.task(name="booklender.sync_zernio_accounts")
def sync_zernio_accounts():
    if not settings.zernio_api_key:
        return
    from app.db import SessionLocal
    from app.workflow import sync_accounts

    try:
        with SessionLocal() as db:
            sync_accounts(db)
    except Exception:
        logging.getLogger(__name__).exception("Zernio account sync failed; existing connections retained")
