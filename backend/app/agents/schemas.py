from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.agents.models import AgentRole, AgentTaskStatus, TaskType


class AgentTaskCreate(BaseModel):
    role: AgentRole
    type: TaskType
    title: str
    description: str
    payload: dict = Field(default_factory=dict)
    priority: int = 5
    max_retries: int = 3


class AgentTaskRead(BaseModel):
    id: UUID
    role: AgentRole
    type: TaskType
    title: str
    description: str
    payload: dict
    priority: int
    max_retries: int
    retry_count: int
    status: AgentTaskStatus
    assigned_to: str | None
    result: dict | None
    error: str | None
    created_at: datetime | None
    updated_at: datetime | None


class AgentTaskLog(BaseModel):
    task_id: UUID
    worker_id: str
    status: AgentTaskStatus
    message: str
    timestamp: datetime


class AgentHeartbeat(BaseModel):
    role: AgentRole
    worker_id: str
    status: str
    timestamp: datetime
