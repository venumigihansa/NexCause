package context

import (
	stdctx "context"
	"fmt"
	"time"

	"rca-mcp-server/internal/config"
	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/store"
)

type Run struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	StartedAt string `json:"startedAt"`
}

type Incident struct {
	ID                   string  `json:"id"`
	Severity             string  `json:"severity"`
	RuleKey              *string `json:"ruleKey,omitempty"`
	Title                string  `json:"title"`
	Summary              *string `json:"summary,omitempty"`
	OpenedAt             string  `json:"openedAt"`
	LatestHealthSampleID *string `json:"latestHealthSampleId,omitempty"`
}

type Window struct {
	TriggeredAt      string `json:"triggeredAt"`
	WindowStart      string `json:"windowStart"`
	WindowEnd        string `json:"windowEnd"`
	LookbackMinutes  int    `json:"lookbackMinutes"`
	LookaheadMinutes int    `json:"lookaheadMinutes"`
	Reason           string `json:"reason"`
}

type Constraints struct {
	ReadOnly            bool   `json:"readOnly"`
	Persistence         string `json:"persistence"`
	MaxRecursionDepth   int    `json:"maxRecursionDepth"`
	MaxLogLines         int    `json:"maxLogLines"`
	MaxSamples          int    `json:"maxSamples"`
	MaxSpans            int    `json:"maxSpans"`
	RedactSecrets       bool   `json:"redactSecrets"`
}

type RCAContext struct {
	Run         Run            `json:"run"`
	Incident    Incident       `json:"incident"`
	Scope       evidence.Scope `json:"scope"`
	Window      Window         `json:"window"`
	Constraints Constraints    `json:"constraints"`
}

type Builder struct {
	store store.MetadataStore
	cfg   config.Config
}

func NewBuilder(store store.MetadataStore, cfg config.Config) *Builder {
	return &Builder{store: store, cfg: cfg}
}

func (b *Builder) Build(ctx stdctx.Context, runID string, incidentID string) (RCAContext, error) {
	record, err := b.store.GetRCAContextRecord(ctx, runID, incidentID)
	if err != nil {
		return RCAContext{}, err
	}
	if record.Run.ID == "" {
		return RCAContext{}, fmt.Errorf("rca run %s for incident %s was not found", runID, incidentID)
	}

	triggeredAt := record.Incident.OpenedAt
	reason := "incident-opened-at"
	if record.LatestHealthSampleCollectedAt != nil {
		triggeredAt = *record.LatestHealthSampleCollectedAt
		reason = "incident-health-sample"
	}

	windowStart := triggeredAt.Add(-b.cfg.DefaultLookback)
	requestedEnd := triggeredAt.Add(b.cfg.DefaultLookahead)
	now := time.Now().UTC()
	windowEnd := requestedEnd
	if requestedEnd.After(now) {
		windowEnd = now
	}

	return RCAContext{
		Run: Run{
			ID:        record.Run.ID,
			Source:    record.Run.Source,
			StartedAt: record.Run.StartedAt.UTC().Format(time.RFC3339),
		},
		Incident: Incident{
			ID:                   record.Incident.ID,
			Severity:             record.Incident.Severity,
			RuleKey:              record.Incident.RuleKey,
			Title:                record.Incident.Title,
			Summary:              record.Incident.Summary,
			OpenedAt:             record.Incident.OpenedAt.UTC().Format(time.RFC3339),
			LatestHealthSampleID: record.Incident.LatestHealthSampleID,
		},
		Scope: evidence.Scope{
			AppID:          record.App.ID,
			AppName:        record.App.Name,
			DeploymentID:   record.Deployment.ID,
			Namespace:      record.Deployment.Namespace,
			ServiceName:    record.Deployment.KubernetesService,
			DeploymentName: record.Deployment.KubernetesDeployment,
		},
		Window: Window{
			TriggeredAt:      triggeredAt.UTC().Format(time.RFC3339),
			WindowStart:      windowStart.UTC().Format(time.RFC3339),
			WindowEnd:        windowEnd.UTC().Format(time.RFC3339),
			LookbackMinutes:  int(b.cfg.DefaultLookback.Minutes()),
			LookaheadMinutes: int(b.cfg.DefaultLookahead.Minutes()),
			Reason:           reason,
		},
		Constraints: Constraints{
			ReadOnly:          true,
			Persistence:       "none",
			MaxRecursionDepth: b.cfg.MaxRecursionDepth,
			MaxLogLines:       b.cfg.MaxLogLines,
			MaxSamples:        b.cfg.MaxSamples,
			MaxSpans:          b.cfg.MaxSpans,
			RedactSecrets:     true,
		},
	}, nil
}

func (c RCAContext) WindowTimes() (time.Time, time.Time, error) {
	start, err := time.Parse(time.RFC3339, c.Window.WindowStart)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := time.Parse(time.RFC3339, c.Window.WindowEnd)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return start, end, nil
}
