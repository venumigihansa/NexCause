from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


Confidence = Literal["low", "medium", "high"]
ReportStatus = Literal[
    "root_cause_identified", "no_root_cause_identified", "inconclusive"
]


class RunRequest(BaseModel):
    workspaceId: str
    runId: str
    incidentId: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class RootCause(BaseModel):
    title: str | None = None
    category: str | None = None
    confidence: Confidence = "low"
    explanation: str = ""


class EvidenceReference(BaseModel):
    source: str
    summary: str
    signals: list[dict[str, Any]] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    truncated: bool = False


class AgentFinding(BaseModel):
    agent: str
    findings: list[str] = Field(default_factory=list)
    suspectedCauses: list[str] = Field(default_factory=list)
    ruledOut: list[str] = Field(default_factory=list)
    recommendedFollowUps: list[str] = Field(default_factory=list)
    confidence: Confidence = "low"
    evidence: list[EvidenceReference] = Field(default_factory=list)


class Hypothesis(BaseModel):
    title: str
    category: str
    supportingEvidence: list[str] = Field(default_factory=list)
    contradictingEvidence: list[str] = Field(default_factory=list)
    confidence: Confidence = "low"


class VerifierResult(BaseModel):
    verdict: Literal["approved", "needs_followup", "inconclusive"]
    unsupportedClaims: list[str] = Field(default_factory=list)
    requiredFollowUps: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class RCAReport(BaseModel):
    schemaVersion: str = "1.0"
    runId: str
    incidentId: str
    generatedAt: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    status: ReportStatus
    summary: str
    rootCause: RootCause = Field(default_factory=RootCause)
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    evidenceUsed: list[EvidenceReference] = Field(default_factory=list)
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    ruledOutCauses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    agentContributions: list[AgentFinding] = Field(default_factory=list)
    toolCallSummary: list[dict[str, Any]] = Field(default_factory=list)
