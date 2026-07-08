package adapters

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"rca-mcp-server/internal/config"
)

type LogBackendAdapter struct {
	baseURL string
	client  *http.Client
}

func NewLogBackendAdapter(cfg config.Config) *LogBackendAdapter {
	return &LogBackendAdapter{
		baseURL: strings.TrimRight(cfg.LogBackendURL, "/"),
		client:  &http.Client{Timeout: cfg.HTTPTimeout},
	}
}

func (a *LogBackendAdapter) QueryLogs(ctx context.Context, namespace string, deploymentName string, start time.Time, end time.Time, limit int) ([]PodLog, error) {
	if a.baseURL == "" {
		return nil, fmt.Errorf("log backend url is not configured")
	}

	u, err := url.Parse(a.baseURL + "/loki/api/v1/query_range")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("query", lokiQuery(namespace, deploymentName))
	q.Set("start", strconv.FormatInt(start.UnixNano(), 10))
	q.Set("end", strconv.FormatInt(end.UnixNano(), 10))
	q.Set("limit", fmt.Sprintf("%d", limit))
	q.Set("direction", "forward")
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
		return nil, fmt.Errorf("log backend returned %d: %s", resp.StatusCode, string(data))
	}

	return parseLokiLogs(data, deploymentName)
}

func lokiQuery(namespace string, deploymentName string) string {
	// OTLP logs can arrive with different label mappings depending on collector/Loki versions.
	// Keep the query scoped by namespace and broad enough to survive label normalization.
	return fmt.Sprintf(`{service_namespace=%q} |~ %q`, namespace, deploymentName)
}

func parseLokiLogs(data []byte, fallbackName string) ([]PodLog, error) {
	var body struct {
		Status string `json:"status"`
		Data struct {
			Result []struct {
				Stream map[string]string `json:"stream"`
				Values [][]string         `json:"values"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, err
	}

	logsByPod := map[string][]string{}
	for _, result := range body.Data.Result {
		podName := result.Stream["k8s_pod_name"]
		if podName == "" {
			podName = result.Stream["pod"]
		}
		if podName == "" {
			podName = result.Stream["service_name"]
		}
		if podName == "" {
			podName = fallbackName
		}

		for _, value := range result.Values {
			if len(value) != 2 {
				continue
			}
			logsByPod[podName] = append(logsByPod[podName], value[1])
		}
	}

	logs := make([]PodLog, 0, len(logsByPod))
	for podName, lines := range logsByPod {
		logs = append(logs, PodLog{PodName: podName, Logs: strings.Join(lines, "\n")})
	}
	if len(logs) == 0 {
		return []PodLog{{PodName: fallbackName, Logs: ""}}, nil
	}
	return logs, nil
}
