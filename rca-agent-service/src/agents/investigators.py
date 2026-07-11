from src.agents.base import BaseInvestigator


class KubernetesInvestigator(BaseInvestigator):
    name = "kubernetes_investigator"
    allowed_tools = (
        "get_deployment_status",
        "get_pods",
        "get_kubernetes_events",
        "get_health_samples",
    )
    prompt = (
        "You are the Kubernetes RCA investigator. Inspect readiness, restarts, "
        "warning events, probes, image pulls, scheduling, and rollout health. "
        "Use only Kubernetes and health-sample evidence."
    )


class LogsInvestigator(BaseInvestigator):
    name = "logs_investigator"
    allowed_tools = ("get_logs",)
    prompt = (
        "You are the logs RCA investigator. Inspect log patterns for crashes, "
        "exceptions, dependency errors, startup failures, and repeated timeouts."
    )


class MetricsTracesInvestigator(BaseInvestigator):
    name = "metrics_traces_investigator"
    allowed_tools = ("get_metrics", "get_traces")
    prompt = (
        "You are the metrics and traces RCA investigator. Inspect latency, error "
        "rates, resource saturation, failed spans, and slow dependencies."
    )


class ChangesConfigInvestigator(BaseInvestigator):
    name = "changes_config_investigator"
    allowed_tools = ("get_runtime_configs", "get_recent_changes")
    prompt = (
        "You are the changes and configuration RCA investigator. Inspect runtime "
        "config metadata, deployment changes, image/build changes, and config drift."
    )
