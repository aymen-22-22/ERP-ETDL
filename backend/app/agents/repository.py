from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.models_db import AgentTaskLogModel


class AgentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def log_task(self, task_id: UUID, worker_id: str, role: str, status: str, message: str) -> None:
        stmt = insert(AgentTaskLogModel).values(
            id=__import__("uuid").uuid7(),
            task_id=task_id,
            worker_id=worker_id,
            role=role,
            status=status,
            message=message,
            completed_at=datetime.now(UTC),
        )
        await self.session.execute(stmt)
        await self.session.commit()
