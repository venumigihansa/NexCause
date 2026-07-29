from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any
import jwt

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse

from src.config import settings
from src.db import RCARepository
from src.events import EventBus
from src.graph.rca_graph import RCAGraphRunner
from src.llm import LLMClient
from src.models import ChatRequest, RunRequest

repo = RCARepository(
    settings.database_url,
    min_size=settings.database_pool_min_size,
    max_size=settings.database_pool_max_size,
    timeout=settings.database_pool_timeout_seconds,
    query_timeout_ms=settings.database_query_timeout_ms,
)
events = EventBus()
poll_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global poll_task
    if len(settings.internal_service_jwt_secret.encode()) < 32:
        raise RuntimeError(
            "INTERNAL_SERVICE_JWT_SECRET must contain at least 32 bytes"
        )
    await repo.open()
    if settings.rca_agent_poll_enabled:
        poll_task = asyncio.create_task(poll_pending_runs())
    yield
    if poll_task is not None:
        poll_task.cancel()
    await repo.close()


app = FastAPI(title="RCA Agent Service", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/rca-agent/runs")
async def start_run(
    request: RunRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    claims = verify_internal_token(authorization, "rca-agent")
    require_scope(claims, request.workspaceId, request.runId, request.incidentId)
    run = await repo.get_run(request.workspaceId, request.runId)
    if run is None or run["incidentId"] != request.incidentId:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    background_tasks.add_task(
        run_rca, request.workspaceId, request.runId, request.incidentId
    )
    return {"runId": request.runId, "incidentId": request.incidentId, "status": "accepted"}


@app.get("/rca-agent/runs/{run_id}")
async def get_run(run_id: str, authorization: str | None = Header(default=None)):
    claims = verify_internal_token(authorization, "rca-agent")
    workspace_id = require_scope(claims, run_id=run_id)
    run = await repo.get_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    return normalize_record(run)


@app.get("/rca-agent/runs/{run_id}/events")
async def stream_events(
    run_id: str, authorization: str | None = Header(default=None)
):
    claims = verify_internal_token(authorization, "rca-agent")
    workspace_id = require_scope(claims, run_id=run_id)
    run = await repo.get_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    return StreamingResponse(events.subscribe(run_id), media_type="text/event-stream")


@app.post("/rca-agent/runs/{run_id}/chat")
async def chat(
    run_id: str,
    request: ChatRequest,
    authorization: str | None = Header(default=None),
):
    claims = verify_internal_token(authorization, "rca-agent")
    workspace_id = require_scope(claims, run_id=run_id)
    run = await repo.get_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    thread = await repo.get_or_create_thread(workspace_id, run_id)
    await repo.add_chat_message(
        workspace_id, thread["id"], "user", request.message
    )
    answer = await answer_chat(run, request.message)
    await repo.add_chat_message(workspace_id, thread["id"], "assistant", answer)
    return {"runId": run_id, "message": answer}


@app.get("/rca-agent/runs/{run_id}/chat")
async def list_chat(
    run_id: str, authorization: str | None = Header(default=None)
):
    claims = verify_internal_token(authorization, "rca-agent")
    workspace_id = require_scope(claims, run_id=run_id)
    run = await repo.get_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    thread = await repo.get_or_create_thread(workspace_id, run_id)
    messages = await repo.list_chat_messages(workspace_id, thread["id"])
    return [normalize_record(message) for message in messages]


async def run_rca(workspace_id: str, run_id: str, incident_id: str) -> None:
    try:
        claimed = await repo.mark_running(workspace_id, run_id)
        if not claimed:
            await events.publish(run_id, "run.skipped", {"runId": run_id})
            return
        await events.publish(run_id, "run.running", {"runId": run_id})
        await repo.get_or_create_thread(workspace_id, run_id)
        report = await RCAGraphRunner(settings, events).run(
            workspace_id, run_id, incident_id
        )
        await repo.complete_run(workspace_id, run_id, report.model_dump(mode="json"))
        await events.publish(run_id, "run.completed", {"runId": run_id})
    except Exception as error:
        await repo.fail_run(workspace_id, run_id, str(error))
        await events.publish(run_id, "run.failed", {"runId": run_id, "error": str(error)})


async def poll_pending_runs() -> None:
    while True:
        try:
            for workspace_id in await repo.active_workspace_ids():
                for run in await repo.pending_runs(workspace_id, limit=3):
                    asyncio.create_task(
                        run_rca(workspace_id, run["id"], run["incidentId"])
                    )
        except Exception:
            pass
        await asyncio.sleep(settings.rca_agent_poll_interval_seconds)


async def answer_chat(run: dict[str, Any], message: str) -> str:
    result = run.get("result") or {}
    llm = LLMClient(settings)
    return await llm.summarize_json(
        "Answer the user's follow-up question using only this RCA report. "
        "If the report does not contain enough information, say so.",
        {
            "question": message,
            "report": result,
        },
    )


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value.isoformat() if hasattr(value, "isoformat") else value
        for key, value in record.items()
    }


def verify_internal_token(
    authorization: str | None, audience: str
) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Service authentication required")
    try:
        return jwt.decode(
            authorization[7:],
            settings.internal_service_jwt_secret,
            algorithms=["HS256"],
            audience=audience,
            issuer="deployment-manager",
            options={"require": ["exp", "iat", "iss", "aud", "workspaceId"]},
        )
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Invalid service token") from error


def require_scope(
    claims: dict[str, Any],
    workspace_id: str | None = None,
    run_id: str | None = None,
    incident_id: str | None = None,
) -> str:
    claimed_workspace = str(claims.get("workspaceId") or "")
    if not claimed_workspace or (workspace_id and claimed_workspace != workspace_id):
        raise HTTPException(status_code=403, detail="Workspace scope mismatch")
    if run_id and claims.get("runId") != run_id:
        raise HTTPException(status_code=403, detail="Run scope mismatch")
    if incident_id and claims.get("incidentId") != incident_id:
        raise HTTPException(status_code=403, detail="Incident scope mismatch")
    return claimed_workspace
