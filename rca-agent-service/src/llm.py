from __future__ import annotations

from typing import Any

from .config import Settings


class LLMClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._llm = None
        if settings.rca_llm_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI

                self._llm = ChatGoogleGenerativeAI(
                    model=settings.rca_llm_model,
                    google_api_key=settings.rca_llm_api_key,
                    temperature=0.2,
                )
            except Exception:
                self._llm = None

    async def summarize_json(self, prompt: str, payload: dict[str, Any]) -> str:
        if self._llm is None:
            return fallback_summary(payload)
        message = (
            f"{prompt}\n\nReturn concise RCA findings grounded only in this JSON:\n"
            f"{payload}"
        )
        result = await self._llm.ainvoke(message)
        return str(result.content)


def fallback_summary(payload: dict[str, Any]) -> str:
    summaries: list[str] = []
    for evidence in payload.get("evidence", []):
        if isinstance(evidence, dict) and evidence.get("summary"):
            summaries.append(str(evidence["summary"]))
    return " ".join(summaries[:4]) or "No strong evidence summary was available."
