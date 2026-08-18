from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class AgentRole(StrEnum):
    FRONTEND_DEV = "frontend_dev"
    BACKEND_DEV = "backend_dev"
    QA_TESTER = "qa_tester"
    DEVOPS_ADMIN = "devops_admin"


class TaskType(StrEnum):
    FIX_BUG = "fix_bug"
    IMPLEMENT_FEATURE = "implement_feature"
    REFACTOR = "refactor"
    WRITE_TEST = "write_test"
    RUN_TESTS = "run_tests"
    LINT_CHECK = "lint_check"
    TYPE_CHECK = "type_check"
    DEPLOY = "deploy"
    GIT_OPERATION = "git_operation"
    CODE_REVIEW = "code_review"


class AgentTaskStatus(StrEnum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"
    DEAD_LETTER = "dead_letter"


class AgentTask(BaseModel):
    id: UUID = Field(default_factory=lambda: __import__("uuid").uuid7())
    role: AgentRole
    type: TaskType
    title: str
    description: str
    payload: dict = Field(default_factory=dict)
    priority: int = 5
    max_retries: int = 3
    retry_count: int = 0
    status: AgentTaskStatus = AgentTaskStatus.PENDING
    assigned_to: str | None = None
    result: dict | None = None
    error: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
