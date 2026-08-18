import subprocess
import time
from pathlib import Path
from typing import Any

from app.agents.celery_app import celery_app
from app.agents.models import AgentRole, TaskType
from app.shared.core.logging import get_logger

logger = get_logger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_ROOT = BACKEND_ROOT / "frontend"

PROJECT_CONTEXT = {
    AgentRole.FRONTEND_DEV: {
        "root": str(FRONTEND_ROOT),
        "commands": {
            "lint": "npm run lint",
            "typecheck": "npm run typecheck",
            "build": "npm run build",
            "test": "npm run test -- --run",
        },
        "languages": ["tsx", "ts", "css"],
        "frameworks": ["React 19", "Vite", "TypeScript"],
    },
    AgentRole.BACKEND_DEV: {
        "root": str(BACKEND_ROOT / "backend"),
        "commands": {
            "lint": "ruff check .",
            "format_check": "black --check .",
            "typecheck": "mypy app",
            "test": "pytest -q",
        },
        "languages": ["py"],
        "frameworks": ["FastAPI", "SQLAlchemy", "Alembic"],
    },
    AgentRole.QA_TESTER: {
        "root": str(BACKEND_ROOT / "backend"),
        "commands": {
            "backend_tests": "pytest -q",
            "frontend_tests": "npm run test -- --run",
        },
    },
    AgentRole.DEVOPS_ADMIN: {
        "root": str(BACKEND_ROOT),
        "commands": {
            "git_status": "git status",
            "git_log": "git log --oneline -10",
        },
    },
}


def _execute_shell(command: str, cwd: str, timeout: int = 120) -> dict[str, Any]:
    start = time.monotonic()
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed = time.monotonic() - start
        return {
            "command": command,
            "cwd": cwd,
            "returncode": proc.returncode,
            "stdout": proc.stdout[:4000],
            "stderr": proc.stderr[:4000],
            "elapsed_seconds": round(elapsed, 2),
            "success": proc.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        elapsed = time.monotonic() - start
        return {
            "command": command,
            "cwd": cwd,
            "returncode": -1,
            "stdout": "",
            "stderr": f"Timed out after {timeout}s",
            "elapsed_seconds": round(elapsed, 2),
            "success": False,
        }
    except Exception as exc:
        elapsed = time.monotonic() - start
        return {
            "command": command,
            "cwd": cwd,
            "returncode": -1,
            "stdout": "",
            "stderr": str(exc),
            "elapsed_seconds": round(elapsed, 2),
            "success": False,
        }


def _dispatch_by_role(role: AgentRole, task_type: TaskType, payload: dict) -> dict[str, Any]:
    ctx = PROJECT_CONTEXT.get(role, {})
    cwd = ctx.get("root", str(BACKEND_ROOT))
    commands = ctx.get("commands", {})

    if task_type == TaskType.LINT_CHECK:
        cmd = commands.get("lint") or commands.get("backend_tests") or "echo 'no lint command'"
        return _execute_shell(cmd, cwd)

    if task_type == TaskType.TYPE_CHECK:
        cmd = commands.get("typecheck") or "echo 'no typecheck command'"
        return _execute_shell(cmd, cwd)

    if task_type == TaskType.RUN_TESTS:
        if role == AgentRole.QA_TESTER:
            results = {}
            for key in ("backend_tests", "frontend_tests"):
                if key in commands:
                    results[key] = _execute_shell(commands[key], cwd if "backend" in key else str(FRONTEND_ROOT))
            return {"type": "test_suite", "results": results}
        cmd = commands.get("test") or commands.get("backend_tests") or "echo 'no test command'"
        return _execute_shell(cmd, cwd)

    if task_type == TaskType.GIT_OPERATION:
        git_cmd = payload.get("command", "git status")
        return _execute_shell(f"git {git_cmd}", cwd)

    if task_type == TaskType.DEPLOY:
        target = payload.get("target", "backend")
        if target == "backend":
            return _execute_shell("pytest -q && ruff check .", cwd)
        return _execute_shell("npm run build", str(FRONTEND_ROOT))

    if task_type == TaskType.CODE_REVIEW:
        changed = _execute_shell("git diff --name-only HEAD~1", cwd)
        return {"type": "code_review", "changed_files": changed.get("stdout", "").splitlines()}

    return {
        "type": "generic",
        "message": f"Agent {role} received task {task_type}",
        "payload": payload,
    }


def _run_frontend_dev(role: AgentRole, task_type: TaskType, payload: dict) -> dict[str, Any]:
    if task_type == TaskType.IMPLEMENT_FEATURE:
        return {
            "type": "frontend_feature",
            "message": "Frontend agent: feature scaffolded (placeholder — attach UI spec)",
            "target_path": str(FRONTEND_ROOT / "src"),
        }
    return _dispatch_by_role(role, task_type, payload)


def _run_backend_dev(role: AgentRole, task_type: TaskType, payload: dict) -> dict[str, Any]:
    if task_type == TaskType.IMPLEMENT_FEATURE:
        return {
            "type": "backend_feature",
            "message": "Backend agent: endpoint scaffolded (placeholder — attach spec)",
            "target_path": str(BACKEND_ROOT / "backend" / "app"),
        }
    return _dispatch_by_role(role, task_type, payload)


def _run_qa_tester(role: AgentRole, task_type: TaskType, payload: dict) -> dict[str, Any]:
    if task_type == TaskType.LINT_CHECK:
        backend_lint = _execute_shell("ruff check .", str(BACKEND_ROOT / "backend"))
        frontend_lint = _execute_shell("npm run lint", str(FRONTEND_ROOT))
        return {
            "type": "lint_suite",
            "backend": backend_lint,
            "frontend": frontend_lint,
            "all_passed": backend_lint.get("success") and frontend_lint.get("success"),
        }
    return _dispatch_by_role(role, task_type, payload)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_agent_task(self, task_payload: dict) -> dict:
    role = AgentRole(task_payload["role"])
    task_type = TaskType(task_payload["type"])
    payload = task_payload.get("payload", {})
    worker_id = self.request.id

    logger.info("agent_task_started", role=role.value, task_type=task_type.value, worker=worker_id)

    runners = {
        AgentRole.FRONTEND_DEV: _run_frontend_dev,
        AgentRole.BACKEND_DEV: _run_backend_dev,
        AgentRole.QA_TESTER: _run_qa_tester,
        AgentRole.DEVOPS_ADMIN: _dispatch_by_role,
    }
    runner = runners.get(role, _dispatch_by_role)
    result = runner(role, task_type, payload)

    if not result.get("success", True):
        logger.warning("agent_task_failed", role=role.value, task_type=task_type.value, worker=worker_id)
        raise self.retry(exc=Exception(result.get("stderr", "agent task failed")))

    logger.info("agent_task_succeeded", role=role.value, task_type=task_type.value, worker=worker_id)
    result["status"] = "success"
    result["worker_id"] = worker_id
    return result
