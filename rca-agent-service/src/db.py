from __future__ import annotations

from typing import Any
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class RCARepository:
    def __init__(self, database_url: str):
        self.database_url = database_url

    async def _connect(self):
        return await psycopg.AsyncConnection.connect(
            self.database_url,
            row_factory=dict_row,
        )

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        async with await self._connect() as conn:
            row = await conn.execute(
                """
                SELECT r.*, i."id" AS "incidentId"
                FROM "RcaRun" r
                JOIN "Incident" i ON i."id" = r."incidentId"
                WHERE r."id" = %s
                """,
                (run_id,),
            )
            return await row.fetchone()

    async def mark_running(self, run_id: str) -> bool:
        async with await self._connect() as conn:
            row = await conn.execute(
                """
                UPDATE "RcaRun"
                SET "status" = 'running', "startedAt" = COALESCE("startedAt", NOW()),
                    "errorMessage" = NULL
                WHERE "id" = %s AND "status" IN ('pending', 'failed')
                RETURNING "id"
                """,
                (run_id,),
            )
            return await row.fetchone() is not None

    async def complete_run(self, run_id: str, result: dict[str, Any]) -> None:
        async with await self._connect() as conn:
            await conn.execute(
                """
                UPDATE "RcaRun"
                SET "status" = 'completed', "result" = %s::jsonb,
                    "completedAt" = NOW(), "errorMessage" = NULL
                WHERE "id" = %s
                """,
                (Jsonb(result), run_id),
            )

    async def fail_run(self, run_id: str, message: str) -> None:
        async with await self._connect() as conn:
            await conn.execute(
                """
                UPDATE "RcaRun"
                SET "status" = 'failed', "errorMessage" = %s, "completedAt" = NOW()
                WHERE "id" = %s
                """,
                (message, run_id),
            )

    async def get_or_create_thread(self, run_id: str) -> dict[str, Any]:
        async with await self._connect() as conn:
            row = await conn.execute(
                'SELECT * FROM "RcaAgentThread" WHERE "rcaRunId" = %s',
                (run_id,),
            )
            existing = await row.fetchone()
            if existing:
                return existing
            created = await conn.execute(
                """
                INSERT INTO "RcaAgentThread" ("id", "rcaRunId", "checkpointThreadId", "status", "updatedAt")
                VALUES (%s, %s, %s, 'open', NOW())
                RETURNING *
                """,
                (new_id("rca_thread"), run_id, run_id),
            )
            return await created.fetchone()

    async def add_chat_message(
        self,
        thread_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        async with await self._connect() as conn:
            await conn.execute(
                """
                INSERT INTO "RcaChatMessage" ("id", "threadId", "role", "content", "metadata")
                VALUES (%s, %s, %s, %s, %s::jsonb)
                """,
                (
                    new_id("rca_msg"),
                    thread_id,
                    role,
                    content,
                    Jsonb(metadata or {}),
                ),
            )

    async def list_chat_messages(self, thread_id: str) -> list[dict[str, Any]]:
        async with await self._connect() as conn:
            rows = await conn.execute(
                """
                SELECT * FROM "RcaChatMessage"
                WHERE "threadId" = %s
                ORDER BY "createdAt" ASC
                """,
                (thread_id,),
            )
            return list(await rows.fetchall())

    async def pending_runs(self, limit: int = 5) -> list[dict[str, Any]]:
        async with await self._connect() as conn:
            rows = await conn.execute(
                """
                SELECT * FROM "RcaRun"
                WHERE "status" = 'pending'
                ORDER BY "createdAt" ASC
                LIMIT %s
                """,
                (limit,),
            )
            return list(await rows.fetchall())


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"
