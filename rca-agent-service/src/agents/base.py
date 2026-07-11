from __future__ import annotations

from typing import Any

from src.llm import LLMClient
from src.mcp_client import MCPClient
from src.models import AgentFinding, EvidenceReference


class AgentRuntime:
    def __init__(self, mcp: MCPClient, llm: LLMClient):
        self.mcp = mcp
        self.llm = llm


class BaseInvestigator:
    name: str
    allowed_tools: tuple[str, ...]
    prompt: str

    def __init__(self, runtime: AgentRuntime):
        self.runtime = runtime

    async def run(self, context: dict[str, Any], task: str) -> AgentFinding:
        evidence: list[dict[str, Any]] = []
        for tool in self.allowed_tools:
            evidence.append(
                await self.runtime.mcp.call_tool(
                    tool,
                    {
                        "runId": context["run"]["id"],
                        "incidentId": context["incident"]["id"],
                    },
                )
            )
        summary = await self.runtime.llm.summarize_json(
            f"{self.prompt}\nTask: {task}",
            {"context": context, "evidence": evidence},
        )
        return self.finding_from_evidence(summary, evidence)

    def finding_from_evidence(
        self,
        summary: str,
        evidence: list[dict[str, Any]],
    ) -> AgentFinding:
        references = [evidence_reference(item) for item in evidence]
        signals = [
            signal
            for item in evidence
            for signal in item.get("signals", [])
            if isinstance(item, dict)
        ]
        confidence = "medium" if signals else "low"
        return AgentFinding(
            agent=self.name,
            findings=[summary],
            suspectedCauses=[signal.get("name", "unknown") for signal in signals[:5]],
            ruledOut=[],
            recommendedFollowUps=[],
            confidence=confidence,
            evidence=references,
        )


def evidence_reference(item: dict[str, Any]) -> EvidenceReference:
    return EvidenceReference(
        source=str(item.get("source", "unknown")),
        summary=str(item.get("summary", "")),
        signals=list(item.get("signals", [])),
        stats=dict(item.get("stats", {}) or {}),
        truncated=bool(item.get("truncated", False)),
    )
