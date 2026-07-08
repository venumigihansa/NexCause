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

type PrometheusAdapter struct {
	baseURL string
	client  *http.Client
}

type MetricSeries struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels"`
	Values []MetricPoint     `json:"values"`
}

type MetricPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

func NewPrometheusAdapter(cfg config.Config) *PrometheusAdapter {
	return &PrometheusAdapter{
		baseURL: strings.TrimRight(cfg.PrometheusURL, "/"),
		client:  &http.Client{Timeout: cfg.HTTPTimeout},
	}
}

func (a *PrometheusAdapter) QueryDeploymentMetrics(ctx context.Context, namespace string, deploymentName string, start time.Time, end time.Time) ([]MetricSeries, error) {
	if a.baseURL == "" {
		return nil, fmt.Errorf("prometheus url is not configured")
	}

	queries := map[string]string{
		"container_cpu_usage_seconds_total": fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace=%q,pod=~%q}[5m]))`, namespace, deploymentName+"-.*"),
		"container_memory_working_set_bytes": fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace=%q,pod=~%q})`, namespace, deploymentName+"-.*"),
		"kube_pod_container_status_restarts_total": fmt.Sprintf(`sum(kube_pod_container_status_restarts_total{namespace=%q,pod=~%q})`, namespace, deploymentName+"-.*"),
		"http_requests_error_rate": fmt.Sprintf(`sum(rate(http_server_requests_total{namespace=%q,status=~"5.."}[5m]))`, namespace),
		"http_request_duration_p95": fmt.Sprintf(`histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket{namespace=%q}[5m])) by (le))`, namespace),
	}

	series := []MetricSeries{}
	for name, query := range queries {
		values, labels, err := a.queryRange(ctx, query, start, end)
		if err != nil {
			series = append(series, MetricSeries{Name: name, Labels: map[string]string{"error": err.Error()}, Values: []MetricPoint{}})
			continue
		}
		series = append(series, MetricSeries{Name: name, Labels: labels, Values: values})
	}
	return series, nil
}

func (a *PrometheusAdapter) queryRange(ctx context.Context, query string, start time.Time, end time.Time) ([]MetricPoint, map[string]string, error) {
	u, err := url.Parse(a.baseURL + "/api/v1/query_range")
	if err != nil {
		return nil, nil, err
	}
	q := u.Query()
	q.Set("query", query)
	q.Set("start", strconv.FormatInt(start.Unix(), 10))
	q.Set("end", strconv.FormatInt(end.Unix(), 10))
	q.Set("step", "30")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, nil, err
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, nil, fmt.Errorf("prometheus returned %d: %s", resp.StatusCode, string(data))
	}

	var body struct {
		Status string `json:"status"`
		Data struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
				Values [][]any           `json:"values"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, nil, err
	}
	if len(body.Data.Result) == 0 {
		return []MetricPoint{}, map[string]string{}, nil
	}

	points := []MetricPoint{}
	for _, raw := range body.Data.Result[0].Values {
		if len(raw) != 2 {
			continue
		}
		ts, ok := raw[0].(float64)
		if !ok {
			continue
		}
		valueString, ok := raw[1].(string)
		if !ok {
			continue
		}
		value, err := strconv.ParseFloat(valueString, 64)
		if err != nil {
			continue
		}
		points = append(points, MetricPoint{Timestamp: time.Unix(int64(ts), 0).UTC(), Value: value})
	}
	return points, body.Data.Result[0].Metric, nil
}
