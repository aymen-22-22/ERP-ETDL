from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.celery_app import celery_app
from app.agents.models import AgentRole, AgentTaskStatus, TaskType
from app.agents.repository import AgentRepository
from app.agents.schemas import AgentTaskCreate, AgentTaskRead
from app.shared.database.session import get_session

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/roles")
async def list_roles() -> dict[str, list[dict[str, object]]]:
    return {
        "roles": [
            {"id": r.value, "name": r.name, "label": r.value.replace("_", " ").title()}
            for r in AgentRole
        ]
    }


@router.get("/task-types")
async def list_task_types() -> dict[str, list[dict[str, object]]]:
    return {
        "task_types": [
            {"id": t.value, "name": t.name, "label": t.value.replace("_", " ").title()}
            for t in TaskType
        ]
    }


@router.post("/tasks", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def create_task(
    data: AgentTaskCreate,
    session: AsyncSession = Depends(get_session),
) -> dict:
    task_payload = {
        "role": data.role.value,
        "type": data.type.value,
        "title": data.title,
        "description": data.description,
        "payload": data.payload,
        "priority": data.priority,
        "max_retries": data.max_retries,
    }
    result = celery_app.send_task(
        "app.agents.tasks.run_agent_task",
        args=[task_payload],
        queue=f"agent:{data.role.value}",
        priority=data.priority,
    )
    repo = AgentRepository(session)
    await repo.log_task(
        task_id=__import__("uuid").UUID(result.id),
        worker_id=result.id,
        role=data.role.value,
        status=AgentTaskStatus.PENDING.value,
        message=f"Task queued: {data.title}",
    )
    return {"task_id": result.id, "status": "queued", "queue": f"agent:{data.role.value}"}


@router.get("/tasks/{task_id}", response_model=AgentTaskRead)
async def get_task(task_id: str) -> AgentTaskRead:
    result = celery_app.AsyncResult(task_id)
    if result.state == "PENDING":
        status = AgentTaskStatus.PENDING
    elif result.state == "STARTED":
        status = AgentTaskStatus.RUNNING
    elif result.state == "SUCCESS":
        status = AgentTaskStatus.SUCCESS
    elif result.state == "RETRY":
        status = AgentTaskStatus.RETRYING
    elif result.state == "FAILURE":
        status = AgentTaskStatus.FAILED
    elif result.state == "REVOKED":
        status = AgentTaskStatus.CANCELLED
    else:
        status = AgentTaskStatus.PENDING

    return AgentTaskRead(
        id=UUID(task_id),
        role=AgentRole.FRONTEND_DEV,
        type=TaskType.FIX_BUG,
        title="",
        description="",
        payload={},
        priority=5,
        max_retries=3,
        retry_count=0,
        status=status,
        assigned_to=None,
        result=result.result if result.state == "SUCCESS" else None,
        error=str(result.result) if result.state == "FAILURE" else None,
        created_at=None,
        updated_at=datetime.now(UTC),
    )


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str) -> dict:
    celery_app.control.revoke(task_id, terminate=True)
    return {"task_id": task_id, "status": "cancelled"}


@router.get("/workers")
async def list_workers() -> dict[str, object]:
    inspector = celery_app.control.inspect()
    active = inspector.active() or {}
    scheduled = inspector.scheduled() or {}
    reserved = inspector.reserved() or {}
    workers = set(list(active.keys()) + list(scheduled.keys()) + list(reserved.keys()))
    return {
        "workers": sorted(workers),
        "active_count": sum(len(v) for v in active.values()),
        "scheduled_count": sum(len(v) for v in scheduled.values()),
        "reserved_count": sum(len(v) for v in reserved.values()),
    }
