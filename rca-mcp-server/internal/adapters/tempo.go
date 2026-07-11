package adapters

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"rca-mcp-server/internal/config"
)

type TempoAdapter struct {
	baseURL string
	client  *http.Client
	cfg     config.Config
}

type TraceSummary struct {
	TraceID       string            `json:"traceId"`
	RootService   string            `json:"rootService,omitempty"`
	RootOperation string            `json:"rootOperation,omitempty"`
	DurationMs    float64           `json:"durationMs,omitempty"`
	Status        string            `json:"status,omitempty"`
	Attributes    map[string]string `json:"attributes,omitempty"`
}

func NewTempoAdapter(cfg config.Config) *TempoAdapter {
	return &TempoAdapter{
		baseURL: strings.TrimRight(cfg.TempoURL, "/"),
		client:  &http.Client{Timeout: cfg.HTTPTimeout},
		cfg:     cfg,
	}
}

func (a *TempoAdapter) QueryDeploymentTraces(ctx context.Context, serviceName string, start time.Time, end time.Time) ([]TraceSummary, error) {
	if a.baseURL == "" {
		return nil, fmt.Errorf("tempo url is not configured")
	}

	u, err := url.Parse(a.baseURL + "/api/search")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("tags", "service.name="+serviceName)
	q.Set("start", fmt.Sprintf("%d", start.Unix()))
	q.Set("end", fmt.Sprintf("%d", end.Unix()))
	q.Set("limit", fmt.Sprintf("%d", a.cfg.MaxSpans))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("tempo returned %d: %s", resp.StatusCode, string(data))
	}

	var body struct {
		Traces []struct {
			TraceID         string            `json:"traceID"`
			RootServiceName string            `json:"rootServiceName"`
			RootTraceName   string            `json:"rootTraceName"`
			DurationMs      float64           `json:"durationMs"`
			ServiceStats    map[string]any    `json:"serviceStats"`
			SpanSet         map[string]any    `json:"spanSet"`
			Attributes      map[string]string `json:"attributes"`
		} `json:"traces"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, err
	}

	traces := make([]TraceSummary, 0, len(body.Traces))
	for _, trace := range body.Traces {
		traces = append(traces, TraceSummary{
			TraceID:       trace.TraceID,
			RootService:   trace.RootServiceName,
			RootOperation: trace.RootTraceName,
			DurationMs:    trace.DurationMs,
			Attributes:    trace.Attributes,
		})
	}
	return traces, nil
}
