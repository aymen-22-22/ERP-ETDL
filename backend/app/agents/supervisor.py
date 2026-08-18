import asyncio
import os
from datetime import UTC, datetime

from app.agents.celery_app import celery_app
from app.shared.core.logging import get_logger

logger = get_logger(__name__)


class AgentSupervisor:
    def __init__(self, poll_interval: float = 5.0) -> None:
        self.poll_interval = poll_interval
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("agent_supervisor_started", poll_interval=self.poll_interval)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("agent_supervisor_stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("agent_supervisor_tick_failed")
            await asyncio.sleep(self.poll_interval)

    async def _tick(self) -> None:
        inspector = celery_app.control.inspect()
        active = inspector.active() or {}
        scheduled = inspector.scheduled() or {}
        reserved = inspector.reserved() or {}

        total_active = sum(len(v) for v in active.values())
        total_scheduled = sum(len(v) for v in scheduled.values())
        total_reserved = sum(len(v) for v in reserved.values())

        logger.debug(
            "agent_supervisor_tick",
            active=total_active,
            scheduled=total_scheduled,
            reserved=total_reserved,
        )

        for queue_name, tasks in scheduled.items():
            for entry in tasks:
                request = entry.get("request", {})
                task_id = request.get("id")
                logger.debug("agent_supervisor_scheduled_task", queue=queue_name, task_id=task_id)

        now = datetime.now(UTC)
        logger.info(
            "agent_supervisor_heartbeat",
            time=now.isoformat(),
            active=total_active,
            scheduled=total_scheduled,
            reserved=total_reserved,
        )


_supervisor: AgentSupervisor | None = None


def get_supervisor() -> AgentSupervisor:
    global _supervisor
    if _supervisor is None:
        _supervisor = AgentSupervisor(poll_interval=float(os.environ.get("AGENT_POLL_INTERVAL", "5.0")))
    return _supervisor
