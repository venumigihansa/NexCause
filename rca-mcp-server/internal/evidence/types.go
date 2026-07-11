package evidence

import "time"

type Source string

const (
	SourceKubernetes   Source = "kubernetes"
	SourceLogs         Source = "logs"
	SourceMetrics      Source = "metrics"
	SourceTraces       Source = "traces"
	SourceHealthSample Source = "health_samples"
	SourceRuntime      Source = "runtime"
	SourceChanges      Source = "changes"
	SourceOverview     Source = "overview"
)

type Scope struct {
	AppID          string `json:"appId"`
	AppName        string `json:"appName,omitempty"`
	DeploymentID   string `json:"deploymentId"`
	Namespace      string `json:"namespace"`
	ServiceName    string `json:"serviceName,omitempty"`
	DeploymentName string `json:"deploymentName,omitempty"`
}

type Window struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type Signal struct {
	Name       string         `json:"name"`
	Severity   string         `json:"severity"`
	Value      any            `json:"value,omitempty"`
	Reason     string         `json:"reason,omitempty"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

type CollectionError struct {
	Source  string `json:"source"`
	Message string `json:"message"`
}

type Correlation struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Reason string `json:"reason"`
}

type Bundle struct {
	Source       Source             `json:"source"`
	Scope        Scope              `json:"scope"`
	Window       Window             `json:"window"`
	Summary      string             `json:"summary"`
	Signals      []Signal           `json:"signals"`
	Samples      []any              `json:"samples"`
	Stats        map[string]float64 `json:"stats,omitempty"`
	Correlations []Correlation      `json:"correlations"`
	Errors       []CollectionError  `json:"errors"`
	Truncated    bool               `json:"truncated"`
	CollectedAt  string             `json:"collectedAt"`
}

func NewBundle(source Source, scope Scope, start time.Time, end time.Time) Bundle {
	return Bundle{
		Source:       source,
		Scope:        scope,
		Window:       Window{Start: start.UTC().Format(time.RFC3339), End: end.UTC().Format(time.RFC3339)},
		Signals:      []Signal{},
		Samples:      []any{},
		Correlations: []Correlation{},
		Errors:       []CollectionError{},
		CollectedAt:  time.Now().UTC().Format(time.RFC3339),
	}
}
