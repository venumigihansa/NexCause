package preprocess

import (
	"testing"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

func TestDeploymentStatusDetectsReplicaMismatch(t *testing.T) {
	scope := evidence.Scope{AppID: "app", DeploymentID: "dep", Namespace: "apps"}
	bundle := DeploymentStatus(scope, time.Now().Add(-time.Minute), time.Now(), adapters.K8sDeploymentStatus{
		DesiredReplicas:     3,
		ReadyReplicas:       1,
		UnavailableReplicas: 2,
	})

	if len(bundle.Signals) == 0 {
		t.Fatalf("expected readiness signal")
	}
	if bundle.Signals[0].Name != "ready_replicas_below_desired" {
		t.Fatalf("unexpected signal %q", bundle.Signals[0].Name)
	}
}

func TestPodsDetectsRestarts(t *testing.T) {
	scope := evidence.Scope{AppID: "app", DeploymentID: "dep", Namespace: "apps"}
	bundle := Pods(scope, time.Now().Add(-time.Minute), time.Now(), []adapters.K8sPod{
		{
			Name: "api-123",
			Containers: []adapters.K8sContainer{
				{Name: "api", Ready: true, RestartCount: 2},
			},
		},
	}, 10)

	if bundle.Stats["totalRestartCount"] != 2 {
		t.Fatalf("expected restart count 2, got %v", bundle.Stats["totalRestartCount"])
	}
	if !hasSignalForTest(bundle, "container_restarts_present") {
		t.Fatalf("expected restart signal")
	}
}

func hasSignalForTest(bundle evidence.Bundle, name string) bool {
	for _, signal := range bundle.Signals {
		if signal.Name == name {
			return true
		}
	}
	return false
}
