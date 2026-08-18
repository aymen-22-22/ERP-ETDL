from celery import Celery

from app.shared.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "erp-agent-worker",
    broker=settings.redis_url or "redis://localhost:6379/1",
    backend=settings.redis_url or "redis://localhost:6379/2",
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_soft_time_limit=240,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
)

celery_app.conf.task_routes = {
    "app.agents.tasks.run_agent_task": {"queue": "agent:default"},
}

celery_app.conf.task_queues = {
    "agent:default": {"exchange": "agent", "routing_key": "agent.default"},
    "agent:frontend": {"exchange": "agent", "routing_key": "agent.frontend"},
    "agent:backend": {"exchange": "agent", "routing_key": "agent.backend"},
    "agent:qa": {"exchange": "agent", "routing_key": "agent.qa"},
    "agent:devops": {"exchange": "agent", "routing_key": "agent.devops"},
}

for role, queue_name in {
    "frontend_dev": "agent:frontend",
    "backend_dev": "agent:backend",
    "qa_tester": "agent:qa",
    "devops_admin": "agent:devops",
}.items():
    celery_app.conf.task_routes[f"app.agents.tasks.*_{role}"] = {"queue": queue_name}
