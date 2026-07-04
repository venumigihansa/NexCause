export default () => ({
  incidentDetectionEnabled: process.env.INCIDENT_DETECTION_ENABLED !== 'false',
  incidentDetectionIntervalSeconds: Number(
    process.env.INCIDENT_DETECTION_INTERVAL_SECONDS ?? 60,
  ),
  autoRcaEnabled: process.env.AUTO_RCA_ENABLED !== 'false',
});
