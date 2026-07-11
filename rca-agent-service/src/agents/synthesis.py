from __future__ import annotations

from typing import Any

from src.llm import LLMClient
from src.models import AgentFinding, Hypothesis, RCAReport, RootCause, VerifierResult


class HypothesisBuilder:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def run(
        self,
        context: dict[str, Any],
        findings: list[AgentFinding],
    ) -> list[Hypothesis]:
        causes: list[str] = []
        evidence: list[str] = []
        for finding in findings:
            causes.extend(finding.suspectedCauses)
            evidence.extend(finding.findings)
        if not causes:
            return [
                Hypothesis(
                    title="No dominant root cause identified",
                    category="unknown",
                    supportingEvidence=evidence[:5],
                    confidence="low",
                )
            ]
        return [
            Hypothesis(
                title=f"Possible {causes[0].replace('_', ' ')}",
                category=causes[0],
                supportingEvidence=evidence[:5],
                confidence="medium",
            )
        ]


class Verifier:
    async def run(self, hypotheses: list[Hypothesis]) -> VerifierResult:
        strongest = hypotheses[0] if hypotheses else None
        if strongest is None or not strongest.supportingEvidence:
            return VerifierResult(
                verdict="inconclusive",
                notes=["No hypothesis had supporting evidence."],
            )
        if strongest.confidence == "low":
            return VerifierResult(
                verdict="needs_followup",
                requiredFollowUps=["Collect one more focused evidence source."],
            )
        return VerifierResult(verdict="approved")


class ReportWriter:
    async def run(
        self,
        run_id: str,
        incident_id: str,
        context: dict[str, Any],
        findings: list[AgentFinding],
        hypotheses: list[Hypothesis],
        verifier: VerifierResult,
    ) -> RCAReport:
        best = hypotheses[0] if hypotheses else None
        approved = verifier.verdict == "approved" and best is not None
        status = "root_cause_identified" if approved else "inconclusive"
        root_cause = RootCause()
        summary = "RCA was inconclusive."
        if approved and best is not None:
            root_cause = RootCause(
                title=best.title,
                category=best.category,
                confidence=best.confidence,
                explanation="; ".join(best.supportingEvidence[:3]),
            )
            summary = f"{best.title}: {root_cause.explanation}"

        evidence_used = [
            evidence
            for finding in findings
            for evidence in finding.evidence
        ]
        return RCAReport(
            runId=run_id,
            incidentId=incident_id,
            status=status,
            summary=summary,
            rootCause=root_cause,
            evidenceUsed=evidence_used,
            hypotheses=hypotheses,
            ruledOutCauses=[
                ruled_out
                for finding in findings
                for ruled_out in finding.ruledOut
            ],
            recommendations=build_recommendations(findings, status),
            limitations=verifier.notes + verifier.unsupportedClaims,
            agentContributions=findings,
            toolCallSummary=[
                {
                    "agent": finding.agent,
                    "evidenceSources": [evidence.source for evidence in finding.evidence],
                }
                for finding in findings
            ],
        )


def build_recommendations(findings: list[AgentFinding], status: str) -> list[str]:
    recommendations = [
        follow_up
        for finding in findings
        for follow_up in finding.recommendedFollowUps
    ]
    if recommendations:
        return recommendations
    if status == "inconclusive":
        return ["Review additional telemetry and rerun RCA with a wider evidence window."]
    return ["Validate the suspected root cause in staging before applying remediation."]
