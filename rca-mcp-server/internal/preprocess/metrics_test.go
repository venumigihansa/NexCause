package preprocess

import (
	"testing"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

func TestMetricsCalculatesStats(t *testing.T) {
	scope := evidence.Scope{AppID: "app", DeploymentID: "dep", Namespace: "apps"}
	bundle := Metrics(scope, time.Now().Add(-time.Minute), time.Now(), []adapters.MetricSeries{
		{
			Name: "cpu",
			Values: []adapters.MetricPoint{
				{Value: 1},
				{Value: 2},
				{Value: 10},
			},
		},
	}, 10)

	if bundle.Stats["cpu.max"] != 10 {
		t.Fatalf("expected max 10, got %v", bundle.Stats["cpu.max"])
	}
	if len(bundle.Signals) == 0 {
		t.Fatalf("expected spike signal")
	}
}
