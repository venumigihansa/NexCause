package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"rca-mcp-server/internal/serviceauth"
	"time"
)

type MetadataStore interface {
	GetRCAContextRecord(ctx context.Context, runID string, incidentID string) (RCAContextRecord, error)
	ListHealthSamples(ctx context.Context, deploymentID string, start time.Time, end time.Time, limit int) ([]HealthSample, error)
	ListRuntimeConfigs(ctx context.Context, deploymentID string) ([]RuntimeConfig, error)
	ListRecentChanges(ctx context.Context, deploymentID string, start time.Time, end time.Time, limit int) ([]RecentChange, error)
}

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) tenantTx(ctx context.Context) (*sql.Tx, error) {
	workspaceID, ok := serviceauth.WorkspaceID(ctx)
	if !ok {
		return nil, fmt.Errorf("workspace context is required")
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(
		ctx,
		`SELECT set_config('app.workspace_id', $1, true),
		        set_config('statement_timeout', '10000', true)`,
		workspaceID,
	); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	return tx, nil
}

type RCAContextRecord struct {
	Run                           RunRecord
	Incident                      IncidentRecord
	Deployment                    DeploymentRecord
	App                           AppRecord
	LatestHealthSampleCollectedAt *time.Time
}

type RunRecord struct {
	ID        string
	Source    string
	StartedAt time.Time
}

type IncidentRecord struct {
	ID                   string
	Severity             string
	RuleKey              *string
	Title                string
	Summary              *string
	OpenedAt             time.Time
	LatestHealthSampleID *string
}

type DeploymentRecord struct {
	ID                   string
	Namespace            string
	Image                string
	Status               string
	KubernetesDeployment string
	KubernetesService    string
	BuildID              *string
}

type AppRecord struct {
	ID          string
	Name        string
	DisplayName string
}

type HealthSample struct {
	ID                string          `json:"id"`
	Status            string          `json:"status"`
	DesiredReplicas   int             `json:"desiredReplicas"`
	ReadyReplicas     int             `json:"readyReplicas"`
	AvailableReplicas int             `json:"availableReplicas"`
	PodCount          int             `json:"podCount"`
	WarningEventCount int             `json:"warningEventCount"`
	RestartCount      int             `json:"restartCount"`
	Data              json.RawMessage `json:"data,omitempty"`
	CollectedAt       time.Time       `json:"collectedAt"`
}

type RuntimeConfig struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type RecentChange struct {
	Kind      string    `json:"kind"`
	ID        string    `json:"id"`
	Summary   string    `json:"summary"`
	ChangedAt time.Time `json:"changedAt"`
}
