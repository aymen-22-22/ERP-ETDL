"""agents: multi-agent worker task logs

Revision ID: g1h2i3j4k5l6
Revises: f7d4ffb39f19
Create Date: 2026-08-17 13:00:00.000000

Creates the `agent_task_logs` table used by the multi-agent worker system
to persist task execution history for audit and debugging.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "g1h2i3j4k5l6"
down_revision: str | Sequence[str] | None = "f7d4ffb39f19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_task_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_id", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_agent_task_logs_task_id", "agent_task_logs", ["task_id"])
    op.create_index("ix_agent_task_logs_role", "agent_task_logs", ["role"])
    op.create_index("ix_agent_task_logs_status", "agent_task_logs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_agent_task_logs_status", table_name="agent_task_logs")
    op.drop_index("ix_agent_task_logs_role", table_name="agent_task_logs")
    op.drop_index("ix_agent_task_logs_task_id", table_name="agent_task_logs")
    op.drop_table("agent_task_logs")
