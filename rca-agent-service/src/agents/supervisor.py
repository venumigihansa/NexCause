from __future__ import annotations

from typing import Any

from src.llm import LLMClient


class RCASupervisor:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def select_specialists(self, context: dict[str, Any]) -> list[str]:
        rule_key = (context.get("incident", {}).get("ruleKey") or "").lower()
        summary = (context.get("incident", {}).get("summary") or "").lower()
        signal = f"{rule_key} {summary}"

        selected = ["kubernetes_investigator", "changes_config_investigator"]
        if any(term in signal for term in ("restart", "crash", "warning", "health")):
            selected.append("logs_investigator")
        if any(term in signal for term in ("ready", "latency", "error", "traffic", "slow")):
            selected.append("metrics_traces_investigator")
        if "logs_investigator" not in selected:
            selected.append("logs_investigator")
        if "metrics_traces_investigator" not in selected:
            selected.append("metrics_traces_investigator")
        return selected
