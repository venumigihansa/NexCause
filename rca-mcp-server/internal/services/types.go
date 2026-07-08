package services

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/authz"
	"rca-mcp-server/internal/config"
	rcacontext "rca-mcp-server/internal/context"
	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/store"
)

type EvidenceRequest struct {
	RunID      string
	IncidentID string
}

type ExtractRequest struct {
	EvidenceRequest
	Focus string
	Depth int
}

type Dependencies struct {
	Config         config.Config
	ContextBuilder *rcacontext.Builder
	Store          store.MetadataStore
	Kubernetes     *adapters.KubernetesAdapter
	Metrics        *adapters.PrometheusAdapter
	Traces         *adapters.TempoAdapter
	Logs           *adapters.LogBackendAdapter
	Authorizer     authz.Authorizer
	Logger         *slog.Logger
}

type Services struct {
	Context    *ContextService
	Kubernetes *KubernetesService
	Logs       *LogService
	Metrics    *MetricService
	Traces     *TraceService
	Store      *StoreService
	Evidence   *EvidenceService
}

type serviceBase struct {
	deps Dependencies
}

func NewServices(deps Dependencies) *Services {
	if deps.Authorizer == nil {
		deps.Authorizer = authz.AllowAllAuthorizer{}
	}
	base := serviceBase{deps: deps}
	services := &Services{
		Context:    &ContextService{base: base},
		Kubernetes: &KubernetesService{base: base},
		Logs:       &LogService{base: base},
		Metrics:    &MetricService{base: base},
		Traces:     &TraceService{base: base},
		Store:      &StoreService{base: base},
	}
	services.Evidence = &EvidenceService{services: services}
	return services
}

func (b serviceBase) scopedContext(ctx context.Context, req EvidenceRequest) (rcacontext.RCAContext, time.Time, time.Time, error) {
	req.RunID = strings.TrimSpace(req.RunID)
	req.IncidentID = strings.TrimSpace(req.IncidentID)
	if req.RunID == "" || req.IncidentID == "" {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, fmt.Errorf("runId and incidentId are required")
	}
	c, err := b.deps.ContextBuilder.Build(ctx, req.RunID, req.IncidentID)
	if err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	start, end, err := c.WindowTimes()
	if err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	if err := b.authorizeRead(ctx, c.Scope); err != nil {
		return rcacontext.RCAContext{}, time.Time{}, time.Time{}, err
	}
	return c, start, end, nil
}

func (b serviceBase) authorizeRead(ctx context.Context, scope evidence.Scope) error {
	return b.deps.Authorizer.CanReadDeploymentTelemetry(ctx, authz.SubjectFromContext(ctx), scope)
}

func withError(source evidence.Source, scope evidence.Scope, start time.Time, end time.Time, err error) evidence.Bundle {
	bundle := evidence.NewBundle(source, scope, start, end)
	bundle.Summary = "Evidence collection failed."
	bundle.Errors = append(bundle.Errors, evidence.CollectionError{Source: string(source), Message: err.Error()})
	return bundle
}

func unavailable(source evidence.Source, scope evidence.Scope, start time.Time, end time.Time, message string) evidence.Bundle {
	bundle := evidence.NewBundle(source, scope, start, end)
	bundle.Summary = message
	bundle.Errors = append(bundle.Errors, evidence.CollectionError{Source: string(source), Message: message})
	return bundle
}
