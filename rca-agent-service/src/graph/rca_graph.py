from __future__ import annotations

from typing import Any, TypedDict
from datetime import datetime, timedelta, timezone
import jwt

from langgraph.graph import END, StateGraph

from src.agents.base import AgentRuntime
from src.agents.investigators import (
    ChangesConfigInvestigator,
    KubernetesInvestigator,
    LogsInvestigator,
    MetricsTracesInvestigator,
)
from src.agents.synthesis import HypothesisBuilder, ReportWriter, Verifier
from src.agents.supervisor import RCASupervisor
from src.config import Settings
from src.llm import LLMClient
from src.mcp_client import MCPClient
from src.models import AgentFinding, Hypothesis, RCAReport, VerifierResult


REQUIRED_MCP_TOOLS = {
    "get_rca_context",
    "get_deployment_status",
    "get_pods",
    "get_kubernetes_events",
    "get_logs",
    "get_metrics",
    "get_traces",
    "get_health_samples",
    "get_runtime_configs",
    "get_recent_changes",
}


class RCAState(TypedDict, total=False):
    run_id: str
    incident_id: str
    context: dict[str, Any]
    selected_agents: list[str]
    findings: list[AgentFinding]
    hypotheses: list[Hypothesis]
    verifier_result: VerifierResult
    report: RCAReport


class RCAGraphRunner:
    def __init__(self, settings: Settings, events: Any | None = None):
        self.settings = settings
        self.events = events

    async def run(
        self, workspace_id: str, run_id: str, incident_id: str
    ) -> RCAReport:
        now = datetime.now(timezone.utc)
        token = jwt.encode(
            {
                "iss": "rca-agent",
                "aud": "rca-mcp",
                "iat": now,
                "exp": now + timedelta(minutes=2),
                "workspaceId": workspace_id,
                "runId": run_id,
                "incidentId": incident_id,
            },
            self.settings.internal_service_jwt_secret,
            algorithm="HS256",
        )
        mcp = MCPClient(self.settings.rca_mcp_server_url, token)
        llm = LLMClient(self.settings)
        runtime = AgentRuntime(mcp=mcp, llm=llm)
        try:
            await self._emit(run_id, "mcp.initialize", {})
            await mcp.initialize()
            await self._emit(run_id, "mcp.validate_tools", {})
            await mcp.validate_required_tools(REQUIRED_MCP_TOOLS)

            graph = self._build_graph(runtime, llm)
            final_state = await graph.ainvoke(
                {"run_id": run_id, "incident_id": incident_id}
            )
            report = final_state["report"]
            await self._emit(run_id, "report.completed", {"status": report.status})
            return report
        finally:
            await mcp.close()

    def _build_graph(self, runtime: AgentRuntime, llm: LLMClient):
        graph = StateGraph(RCAState)

        async def load_context(state: RCAState) -> RCAState:
            context = await runtime.mcp.call_tool(
                "get_rca_context",
                {"runId": state["run_id"], "incidentId": state["incident_id"]},
            )
            await self._emit(
                state["run_id"],
                "context.loaded",
                {"incidentId": state["incident_id"]},
            )
            return {"context": context}

        async def select_specialists(state: RCAState) -> RCAState:
            selected = await RCASupervisor(llm).select_specialists(state["context"])
            await self._emit(
                state["run_id"],
                "supervisor.selected",
                {"agents": selected},
            )
            return {"selected_agents": selected}

        async def run_specialists(state: RCAState) -> RCAState:
            context = state["context"]
            findings: list[AgentFinding] = []
            for investigator in build_investigators(runtime, state["selected_agents"]):
                await self._emit(
                    state["run_id"],
                    "agent.started",
                    {"agent": investigator.name},
                )
                finding = await investigator.run(
                    context,
                    task=task_for(investigator.name, context),
                )
                findings.append(finding)
                await self._emit(
                    state["run_id"],
                    "agent.completed",
                    {"agent": investigator.name, "confidence": finding.confidence},
                )
            return {"findings": findings}

        async def build_hypotheses(state: RCAState) -> RCAState:
            hypotheses = await HypothesisBuilder(llm).run(
                state["context"],
                state["findings"],
            )
            return {"hypotheses": hypotheses}

        async def verify(state: RCAState) -> RCAState:
            verifier_result = await Verifier().run(state["hypotheses"])
            await self._emit(
                state["run_id"],
                "verifier.completed",
                {"verdict": verifier_result.verdict},
            )
            return {"verifier_result": verifier_result}

        async def write_report(state: RCAState) -> RCAState:
            report = await ReportWriter().run(
                state["run_id"],
                state["incident_id"],
                state["context"],
                state["findings"],
                state["hypotheses"],
                state["verifier_result"],
            )
            return {"report": report}

        graph.add_node("load_context", load_context)
        graph.add_node("select_specialists", select_specialists)
        graph.add_node("run_specialists", run_specialists)
        graph.add_node("build_hypotheses", build_hypotheses)
        graph.add_node("verify", verify)
        graph.add_node("write_report", write_report)

        graph.set_entry_point("load_context")
        graph.add_edge("load_context", "select_specialists")
        graph.add_edge("select_specialists", "run_specialists")
        graph.add_edge("run_specialists", "build_hypotheses")
        graph.add_edge("build_hypotheses", "verify")
        graph.add_edge("verify", "write_report")
        graph.add_edge("write_report", END)
        return graph.compile()

    async def _emit(self, run_id: str, event: str, payload: dict[str, Any]) -> None:
        if self.events is not None:
            await self.events.publish(run_id, event, payload)


def build_investigators(runtime: AgentRuntime, names: list[str]):
    registry = {
        "kubernetes_investigator": KubernetesInvestigator,
        "logs_investigator": LogsInvestigator,
        "metrics_traces_investigator": MetricsTracesInvestigator,
        "changes_config_investigator": ChangesConfigInvestigator,
    }
    return [registry[name](runtime) for name in names if name in registry]


def task_for(agent_name: str, context: dict[str, Any]) -> str:
    incident = context.get("incident", {})
    return (
        f"Investigate incident {incident.get('id')} with ruleKey "
        f"{incident.get('ruleKey')} and summary {incident.get('summary')}."
    )
