package preprocess

import (
	"strings"
	"testing"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

func TestLogsRedactsAndDetectsErrors(t *testing.T) {
	scope := evidence.Scope{AppID: "app", DeploymentID: "dep", Namespace: "apps"}
	bundle := Logs(scope, time.Now().Add(-time.Minute), time.Now(), []adapters.PodLog{
		{
			PodName: "api-123",
			Logs: strings.Join([]string{
				"2026-07-08T00:00:00Z error failed to connect password=swordfish",
				"2026-07-08T00:00:01Z info recovered",
			}, "\n"),
		},
	}, 10)

	if len(bundle.Signals) == 0 {
		t.Fatalf("expected error signal")
	}
	if bundle.Stats["errorLineCount"] != 1 {
		t.Fatalf("expected one error line, got %v", bundle.Stats["errorLineCount"])
	}
	sample := bundle.Samples[0].(map[string]string)
	if strings.Contains(sample["line"], "swordfish") {
		t.Fatalf("expected secret value to be redacted")
	}
}

func TestLogsTruncates(t *testing.T) {
	scope := evidence.Scope{AppID: "app", DeploymentID: "dep", Namespace: "apps"}
	bundle := Logs(scope, time.Now().Add(-time.Minute), time.Now(), []adapters.PodLog{
		{PodName: "api-123", Logs: "line one\nline two\nline three"},
	}, 2)

	if !bundle.Truncated {
		t.Fatalf("expected bundle to be truncated")
	}
	if len(bundle.Samples) != 2 {
		t.Fatalf("expected two samples, got %d", len(bundle.Samples))
	}
}
