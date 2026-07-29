export default () => ({
  incidentDetectionEnabled: process.env.INCIDENT_DETECTION_ENABLED !== "false",
  incidentDetectionIntervalSeconds: Number(
    process.env.INCIDENT_DETECTION_INTERVAL_SECONDS ?? 60,
  ),
  autoRcaEnabled: process.env.AUTO_RCA_ENABLED !== "false",
  rcaEvidenceLookbackMinutes: Number(
    process.env.RCA_EVIDENCE_LOOKBACK_MINUTES ?? 10,
  ),
  rcaEvidenceLookaheadMinutes: Number(
    process.env.RCA_EVIDENCE_LOOKAHEAD_MINUTES ?? 2,
  ),
  rcaMcpServerUrl:
    process.env.RCA_MCP_SERVER_URL ??
    "http://rca-mcp-server.deployment-manager.svc.cluster.local/mcp",
  rcaAgentServiceUrl:
    process.env.RCA_AGENT_SERVICE_URL ??
    "http://rca-agent-service.deployment-manager.svc.cluster.local",
  rcaAgentEnabled: process.env.RCA_AGENT_ENABLED !== "false",
  rcaAgentTriggerMode: process.env.RCA_AGENT_TRIGGER_MODE ?? "async",
  internalServiceJwtSecret: process.env.INTERNAL_SERVICE_JWT_SECRET ?? "",
});
