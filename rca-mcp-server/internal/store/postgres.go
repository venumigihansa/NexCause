package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

func (s *PostgresStore) GetRCAContextRecord(ctx context.Context, runID string, incidentID string) (RCAContextRecord, error) {
	const query = `
SELECT
  r."id", r."source", COALESCE(r."startedAt", r."createdAt"),
  i."id", i."severity", i."ruleKey", i."title", i."summary", i."openedAt", i."latestHealthSampleId",
  d."id", d."namespace", d."image", d."status", d."kubernetesDeployment", d."kubernetesService", d."buildId",
  a."id", a."name", a."displayName",
  hs."collectedAt"
FROM "RcaRun" r
JOIN "Incident" i ON i."id" = r."incidentId"
JOIN "Deployment" d ON d."id" = r."deploymentId"
JOIN "App" a ON a."id" = i."appId"
LEFT JOIN "DeploymentHealthSample" hs ON hs."id" = i."latestHealthSampleId"
WHERE r."id" = $1 AND i."id" = $2`

	var record RCAContextRecord
	var ruleKey, summary, latestHealthSampleID, buildID sql.NullString
	var latestCollectedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, runID, incidentID).Scan(
		&record.Run.ID,
		&record.Run.Source,
		&record.Run.StartedAt,
		&record.Incident.ID,
		&record.Incident.Severity,
		&ruleKey,
		&record.Incident.Title,
		&summary,
		&record.Incident.OpenedAt,
		&latestHealthSampleID,
		&record.Deployment.ID,
		&record.Deployment.Namespace,
		&record.Deployment.Image,
		&record.Deployment.Status,
		&record.Deployment.KubernetesDeployment,
		&record.Deployment.KubernetesService,
		&buildID,
		&record.App.ID,
		&record.App.Name,
		&record.App.DisplayName,
		&latestCollectedAt,
	)
	if err != nil {
		return RCAContextRecord{}, err
	}

	record.Incident.RuleKey = nullableString(ruleKey)
	record.Incident.Summary = nullableString(summary)
	record.Incident.LatestHealthSampleID = nullableString(latestHealthSampleID)
	record.Deployment.BuildID = nullableString(buildID)
	if latestCollectedAt.Valid {
		record.LatestHealthSampleCollectedAt = &latestCollectedAt.Time
	}

	return record, nil
}

func (s *PostgresStore) ListHealthSamples(ctx context.Context, deploymentID string, start time.Time, end time.Time, limit int) ([]HealthSample, error) {
	const query = `
SELECT "id", "status", "desiredReplicas", "readyReplicas", "availableReplicas", "podCount",
       "warningEventCount", "restartCount", "data", "collectedAt"
FROM "DeploymentHealthSample"
WHERE "deploymentId" = $1 AND "collectedAt" >= $2 AND "collectedAt" <= $3
ORDER BY "collectedAt" DESC
LIMIT $4`

	rows, err := s.db.QueryContext(ctx, query, deploymentID, start, end, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	samples := []HealthSample{}
	for rows.Next() {
		var sample HealthSample
		if err := rows.Scan(
			&sample.ID,
			&sample.Status,
			&sample.DesiredReplicas,
			&sample.ReadyReplicas,
			&sample.AvailableReplicas,
			&sample.PodCount,
			&sample.WarningEventCount,
			&sample.RestartCount,
			&sample.Data,
			&sample.CollectedAt,
		); err != nil {
			return nil, err
		}
		samples = append(samples, sample)
	}

	return samples, rows.Err()
}

func (s *PostgresStore) ListRuntimeConfigs(ctx context.Context, deploymentID string) ([]RuntimeConfig, error) {
	const query = `
SELECT "id", "type", "data", "createdAt", "updatedAt"
FROM "RuntimeConfig"
WHERE "deploymentId" = $1
ORDER BY "createdAt" ASC`

	rows, err := s.db.QueryContext(ctx, query, deploymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	configs := []RuntimeConfig{}
	for rows.Next() {
		var config RuntimeConfig
		if err := rows.Scan(&config.ID, &config.Type, &config.Data, &config.CreatedAt, &config.UpdatedAt); err != nil {
			return nil, err
		}
		configs = append(configs, config)
	}

	return configs, rows.Err()
}

func (s *PostgresStore) ListRecentChanges(ctx context.Context, deploymentID string, start time.Time, end time.Time, limit int) ([]RecentChange, error) {
	const query = `
SELECT kind, id, summary, changed_at
FROM (
  SELECT 'deployment' AS kind, "id" AS id, CONCAT('deployment status=', "status", ', image=', "image") AS summary, "updatedAt" AS changed_at
  FROM "Deployment"
  WHERE "id" = $1 AND "updatedAt" >= $2 AND "updatedAt" <= $3
  UNION ALL
  SELECT 'runtime_config' AS kind, "id" AS id, CONCAT('runtime config type=', "type") AS summary, "updatedAt" AS changed_at
  FROM "RuntimeConfig"
  WHERE "deploymentId" = $1 AND "updatedAt" >= $2 AND "updatedAt" <= $3
) changes
ORDER BY changed_at DESC
LIMIT $4`

	rows, err := s.db.QueryContext(ctx, query, deploymentID, start, end, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	changes := []RecentChange{}
	for rows.Next() {
		var change RecentChange
		if err := rows.Scan(&change.Kind, &change.ID, &change.Summary, &change.ChangedAt); err != nil {
			return nil, err
		}
		changes = append(changes, change)
	}
	return changes, rows.Err()
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func PrettyJSON(value any) json.RawMessage {
	data, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage(fmt.Sprintf(`{"error":%q}`, err.Error()))
	}
	return data
}
