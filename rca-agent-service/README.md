# RCA Agent Service

Phase 11 multi-agent RCA reasoning service.

The service runs a LangGraph/LangChain-style supervisor with specialist subagents. It does not collect telemetry directly. It calls `rca-mcp-server` over MCP and stores only final RCA reports and chat messages in Postgres.

## Endpoints

- `GET /healthz`
- `POST /rca-agent/runs`
- `GET /rca-agent/runs/:runId`
- `GET /rca-agent/runs/:runId/events`
- `POST /rca-agent/runs/:runId/chat`

## Required Environment

- `DATABASE_URL`
- `RCA_MCP_SERVER_URL`
- `RCA_LLM_PROVIDER=gemini`
- `RCA_LLM_MODEL`
- `RCA_LLM_API_KEY`
- `RCA_MAX_FOLLOWUP_ROUNDS`
- `RCA_MAX_VERIFIER_RETRIES`

## Important Rule

The first MCP evidence call is `get_rca_context`. `extract_evidence` is intentionally not used or exposed; specialist agents call source-specific tools themselves.
