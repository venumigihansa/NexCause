from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from uuid import uuid4

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool


class RCARepository:
    def __init__(
        self,
        database_url: str,
        min_size: int = 1,
        max_size: int = 5,
        timeout: float = 5.0,
        query_timeout_ms: int = 10_000,
    ):
        self.query_timeout_ms = query_timeout_ms
        self.pool = AsyncConnectionPool(
            database_url,
            min_size=min_size,
            max_size=max_size,
            timeout=timeout,
            open=False,
            kwargs={"row_factory": dict_row},
        )

    async def open(self) -> None:
        await self.pool.open(wait=True)

    async def close(self) -> None:
        await self.pool.close()

    @asynccontextmanager
    async def tenant_connection(
        self, workspace_id: str
    ) -> AsyncIterator[AsyncConnection[dict[str, Any]]]:
        async with self.pool.connection() as conn:
            async with conn.transaction():
                await conn.execute(
                    "SELECT set_config('app.workspace_id', %s, true)",
                    (workspace_id,),
                )
                await conn.execute(
                    "SELECT set_config('statement_timeout', %s, true)",
                    (str(self.query_timeout_ms),),
                )
                yield conn

    async def active_workspace_ids(self) -> list[str]:
        async with self.pool.connection() as conn:
            rows = await conn.execute(
                """SELECT "id" FROM "Workspace" WHERE "status" = 'active'"""
            )
            return [row["id"] for row in await rows.fetchall()]

    async def get_run(
        self, workspace_id: str, run_id: str
    ) -> dict[str, Any] | None:
        async with self.tenant_connection(workspace_id) as conn:
            row = await conn.execute(
                """
                SELECT r.*, i."id" AS "incidentId"
                FROM "RcaRun" r
                JOIN "Incident" i ON i."id" = r."incidentId"
                WHERE r."id" = %s AND r."workspaceId" = %s
                """,
                (run_id, workspace_id),
            )
            return await row.fetchone()

    async def mark_running(self, workspace_id: str, run_id: str) -> bool:
        async with self.tenant_connection(workspace_id) as conn:
            row = await conn.execute(
                """
                UPDATE "RcaRun"
                SET "status" = 'running', "startedAt" = COALESCE("startedAt", NOW()),
                    "errorMessage" = NULL
                WHERE "id" = %s AND "workspaceId" = %s
                  AND "status" IN ('pending', 'failed')
                RETURNING "id"
                """,
                (run_id, workspace_id),
            )
            claimed = await row.fetchone() is not None
            if claimed:
                await self._add_run_event(
                    conn, workspace_id, run_id, "run.running", {}
                )
            return claimed

    async def complete_run(
        self, workspace_id: str, run_id: str, result: dict[str, Any]
    ) -> None:
        async with self.tenant_connection(workspace_id) as conn:
            await conn.execute(
                """
                UPDATE "RcaRun" SET "status" = 'completed', "result" = %s::jsonb,
                  "completedAt" = NOW(), "errorMessage" = NULL
                WHERE "id" = %s AND "workspaceId" = %s
                """,
                (Jsonb(result), run_id, workspace_id),
            )
            await self._add_run_event(
                conn, workspace_id, run_id, "run.completed", {}
            )

    async def fail_run(
        self, workspace_id: str, run_id: str, message: str
    ) -> None:
        async with self.tenant_connection(workspace_id) as conn:
            await conn.execute(
                """
                UPDATE "RcaRun" SET "status" = 'failed', "errorMessage" = %s,
                  "completedAt" = NOW()
                WHERE "id" = %s AND "workspaceId" = %s
                """,
                (message, run_id, workspace_id),
            )
            await self._add_run_event(
                conn,
                workspace_id,
                run_id,
                "run.failed",
                {"error": message[:500]},
            )

    async def get_or_create_thread(
        self, workspace_id: str, run_id: str
    ) -> dict[str, Any]:
        async with self.tenant_connection(workspace_id) as conn:
            row = await conn.execute(
                """SELECT * FROM "RcaAgentThread"
                   WHERE "rcaRunId" = %s AND "workspaceId" = %s""",
                (run_id, workspace_id),
            )
            existing = await row.fetchone()
            if existing:
                return existing
            created = await conn.execute(
                """
                INSERT INTO "RcaAgentThread"
                  ("id", "workspaceId", "rcaRunId", "checkpointThreadId", "status", "updatedAt")
                VALUES (%s, %s, %s, %s, 'open', NOW()) RETURNING *
                """,
                (new_id("rca_thread"), workspace_id, run_id, run_id),
            )
            return await created.fetchone()

    async def add_chat_message(
        self,
        workspace_id: str,
        thread_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        async with self.tenant_connection(workspace_id) as conn:
            await conn.execute(
                """
                INSERT INTO "RcaChatMessage"
                  ("id", "workspaceId", "threadId", "role", "content", "metadata")
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    new_id("rca_msg"),
                    workspace_id,
                    thread_id,
                    role,
                    content,
                    Jsonb(metadata or {}),
                ),
            )

    async def list_chat_messages(
        self, workspace_id: str, thread_id: str
    ) -> list[dict[str, Any]]:
        async with self.tenant_connection(workspace_id) as conn:
            rows = await conn.execute(
                """
                SELECT * FROM "RcaChatMessage"
                WHERE "threadId" = %s AND "workspaceId" = %s
                ORDER BY "createdAt" ASC
                """,
                (thread_id, workspace_id),
            )
            return list(await rows.fetchall())

    async def pending_runs(
        self, workspace_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        async with self.tenant_connection(workspace_id) as conn:
            rows = await conn.execute(
                """
                SELECT * FROM "RcaRun"
                WHERE "status" = 'pending' AND "workspaceId" = %s
                ORDER BY "createdAt" ASC LIMIT %s
                """,
                (workspace_id, limit),
            )
            return list(await rows.fetchall())

    async def _add_run_event(
        self,
        conn: AsyncConnection[dict[str, Any]],
        workspace_id: str,
        run_id: str,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        await conn.execute(
            """
            INSERT INTO "RcaRunEvent"
              ("id", "workspaceId", "rcaRunId", "type", "data")
            VALUES (%s, %s, %s, %s, %s::jsonb)
            """,
            (
                new_id("rca_event"),
                workspace_id,
                run_id,
                event_type,
                Jsonb(data),
            ),
        )


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"
