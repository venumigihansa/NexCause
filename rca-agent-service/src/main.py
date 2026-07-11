from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from src.config import settings
from src.db import RCARepository
from src.events import EventBus
from src.graph.rca_graph import RCAGraphRunner
from src.llm import LLMClient
from src.models import ChatRequest, RunRequest

repo = RCARepository(settings.database_url)
events = EventBus()
poll_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global poll_task
    if settings.rca_agent_poll_enabled:
        poll_task = asyncio.create_task(poll_pending_runs())
    yield
    if poll_task is not None:
        poll_task.cancel()


app = FastAPI(title="RCA Agent Service", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/rca-agent/runs")
async def start_run(request: RunRequest, background_tasks: BackgroundTasks):
    run = await repo.get_run(request.runId)
    if run is None or run["incidentId"] != request.incidentId:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    background_tasks.add_task(run_rca, request.runId, request.incidentId)
    return {"runId": request.runId, "incidentId": request.incidentId, "status": "accepted"}


@app.get("/rca-agent/runs/{run_id}")
async def get_run(run_id: str):
    run = await repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    return normalize_record(run)


@app.get("/rca-agent/runs/{run_id}/events")
async def stream_events(run_id: str):
    run = await repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    return StreamingResponse(events.subscribe(run_id), media_type="text/event-stream")


@app.post("/rca-agent/runs/{run_id}/chat")
async def chat(run_id: str, request: ChatRequest):
    run = await repo.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="RCA run was not found")
    thread = await repo.get_or_create_thread(run_id)
    await repo.add_chat_message(thread["id"], "user", request.message)
    answer = await answer_chat(run, request.message)
    await repo.add_chat_message(thread["id"], "assistant", answer)
    return {"runId": run_id, "message": answer}


async def run_rca(run_id: str, incident_id: str) -> None:
    try:
        claimed = await repo.mark_running(run_id)
        if not claimed:
            await events.publish(run_id, "run.skipped", {"runId": run_id})
            return
        await events.publish(run_id, "run.running", {"runId": run_id})
        await repo.get_or_create_thread(run_id)
        report = await RCAGraphRunner(settings, events).run(run_id, incident_id)
        await repo.complete_run(run_id, report.model_dump(mode="json"))
        await events.publish(run_id, "run.completed", {"runId": run_id})
    except Exception as error:
        await repo.fail_run(run_id, str(error))
        await events.publish(run_id, "run.failed", {"runId": run_id, "error": str(error)})


async def poll_pending_runs() -> None:
    while True:
        try:
            for run in await repo.pending_runs(limit=3):
                asyncio.create_task(run_rca(run["id"], run["incidentId"]))
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
