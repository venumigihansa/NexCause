package adapters

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"rca-mcp-server/internal/config"
)

type KubernetesAdapter struct {
	baseURL string
	token   string
	client  *http.Client
	cfg     config.Config
}

type K8sDeploymentStatus struct {
	DesiredReplicas     int              `json:"desiredReplicas"`
	ReadyReplicas       int              `json:"readyReplicas"`
	AvailableReplicas   int              `json:"availableReplicas"`
	UpdatedReplicas     int              `json:"updatedReplicas"`
	UnavailableReplicas int              `json:"unavailableReplicas"`
	Conditions          []map[string]any `json:"conditions"`
}

type K8sPod struct {
	Name       string           `json:"name"`
	Phase      string           `json:"phase"`
	NodeName   string           `json:"nodeName,omitempty"`
	StartedAt  *time.Time       `json:"startedAt,omitempty"`
	Containers []K8sContainer   `json:"containers"`
	Conditions []map[string]any `json:"conditions"`
}

type K8sContainer struct {
	Name         string         `json:"name"`
	Ready        bool           `json:"ready"`
	RestartCount int            `json:"restartCount"`
	State        map[string]any `json:"state,omitempty"`
	LastState    map[string]any `json:"lastState,omitempty"`
}

type K8sEvent struct {
	Name           string     `json:"name"`
	Type           string     `json:"type"`
	Reason         string     `json:"reason"`
	Message        string     `json:"message"`
	InvolvedKind   string     `json:"involvedKind"`
	InvolvedName   string     `json:"involvedName"`
	FirstTimestamp *time.Time `json:"firstTimestamp,omitempty"`
	LastTimestamp  *time.Time `json:"lastTimestamp,omitempty"`
	EventTime      *time.Time `json:"eventTime,omitempty"`
	Count          int        `json:"count"`
}

type PodLog struct {
	PodName string `json:"podName"`
	Logs    string `json:"logs"`
}

func NewKubernetesAdapter(cfg config.Config) (*KubernetesAdapter, error) {
	token := cfg.KubernetesBearerToken
	if token == "" && cfg.KubernetesInCluster {
		data, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
		if err != nil {
			return nil, err
		}
		token = strings.TrimSpace(string(data))
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	if cfg.KubernetesInCluster {
		ca, err := os.ReadFile(cfg.KubernetesCAFile)
		if err == nil {
			pool := x509.NewCertPool()
			if pool.AppendCertsFromPEM(ca) {
				transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
			}
		}
	}

	return &KubernetesAdapter{
		baseURL: strings.TrimRight(cfg.KubernetesAPIURL, "/"),
		token:   token,
		client:  &http.Client{Timeout: cfg.HTTPTimeout, Transport: transport},
		cfg:     cfg,
	}, nil
}

func (a *KubernetesAdapter) DeploymentStatus(ctx context.Context, namespace string, deploymentName string) (K8sDeploymentStatus, error) {
	var body struct {
		Spec struct {
			Replicas *int `json:"replicas"`
		} `json:"spec"`
		Status struct {
			ReadyReplicas       int              `json:"readyReplicas"`
			AvailableReplicas   int              `json:"availableReplicas"`
			UpdatedReplicas     int              `json:"updatedReplicas"`
			UnavailableReplicas int              `json:"unavailableReplicas"`
			Conditions          []map[string]any `json:"conditions"`
		} `json:"status"`
	}
	if err := a.get(ctx, fmt.Sprintf("/apis/apps/v1/namespaces/%s/deployments/%s", pathEscape(namespace), pathEscape(deploymentName)), &body); err != nil {
		return K8sDeploymentStatus{}, err
	}

	desired := 0
	if body.Spec.Replicas != nil {
		desired = *body.Spec.Replicas
	}
	return K8sDeploymentStatus{
		DesiredReplicas:     desired,
		ReadyReplicas:       body.Status.ReadyReplicas,
		AvailableReplicas:   body.Status.AvailableReplicas,
		UpdatedReplicas:     body.Status.UpdatedReplicas,
		UnavailableReplicas: body.Status.UnavailableReplicas,
		Conditions:          body.Status.Conditions,
	}, nil
}

func (a *KubernetesAdapter) Pods(ctx context.Context, namespace string, appID string, deploymentID string) ([]K8sPod, error) {
	selector := url.QueryEscape(fmt.Sprintf("%s=%s,%s=%s,%s=%s", a.cfg.ManagedByLabel, a.cfg.ManagedByValue, a.cfg.RcaAppIDLabel, appID, a.cfg.RcaDeploymentIDLabel, deploymentID))
	var body struct {
		Items []struct {
			Metadata struct {
				Name string `json:"name"`
			} `json:"metadata"`
			Status struct {
				Phase             string           `json:"phase"`
				NodeName          string           `json:"nodeName"`
				StartTime         *time.Time       `json:"startTime"`
				Conditions        []map[string]any `json:"conditions"`
				ContainerStatuses []struct {
					Name         string         `json:"name"`
					Ready        bool           `json:"ready"`
					RestartCount int            `json:"restartCount"`
					State        map[string]any `json:"state"`
					LastState    map[string]any `json:"lastState"`
				} `json:"containerStatuses"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := a.get(ctx, fmt.Sprintf("/api/v1/namespaces/%s/pods?labelSelector=%s", pathEscape(namespace), selector), &body); err != nil {
		return nil, err
	}

	pods := make([]K8sPod, 0, len(body.Items))
	for _, item := range body.Items {
		pod := K8sPod{
			Name:       item.Metadata.Name,
			Phase:      item.Status.Phase,
			NodeName:   item.Status.NodeName,
			StartedAt:  item.Status.StartTime,
			Conditions: item.Status.Conditions,
			Containers: []K8sContainer{},
		}
		for _, status := range item.Status.ContainerStatuses {
			pod.Containers = append(pod.Containers, K8sContainer{
				Name:         status.Name,
				Ready:        status.Ready,
				RestartCount: status.RestartCount,
				State:        status.State,
				LastState:    status.LastState,
			})
		}
		pods = append(pods, pod)
	}
	return pods, nil
}

func (a *KubernetesAdapter) Events(ctx context.Context, namespace string, deploymentName string, appID string, deploymentID string) ([]K8sEvent, error) {
	pods, _ := a.Pods(ctx, namespace, appID, deploymentID)
	podNames := map[string]bool{}
	for _, pod := range pods {
		podNames[pod.Name] = true
	}

	var body struct {
		Items []struct {
			Metadata struct {
				Name string `json:"name"`
			} `json:"metadata"`
			Type           string     `json:"type"`
			Reason         string     `json:"reason"`
			Message        string     `json:"message"`
			Count          int        `json:"count"`
			FirstTimestamp *time.Time `json:"firstTimestamp"`
			LastTimestamp  *time.Time `json:"lastTimestamp"`
			EventTime      *time.Time `json:"eventTime"`
			InvolvedObject struct {
				Kind string `json:"kind"`
				Name string `json:"name"`
			} `json:"involvedObject"`
		} `json:"items"`
	}
	if err := a.get(ctx, fmt.Sprintf("/api/v1/namespaces/%s/events", pathEscape(namespace)), &body); err != nil {
		return nil, err
	}

	events := []K8sEvent{}
	for _, item := range body.Items {
		involved := item.InvolvedObject.Name
		if involved != deploymentName && !podNames[involved] && !strings.HasPrefix(involved, deploymentName+"-") {
			continue
		}
		events = append(events, K8sEvent{
			Name:           item.Metadata.Name,
			Type:           item.Type,
			Reason:         item.Reason,
			Message:        item.Message,
			InvolvedKind:   item.InvolvedObject.Kind,
			InvolvedName:   involved,
			FirstTimestamp: item.FirstTimestamp,
			LastTimestamp:  item.LastTimestamp,
			EventTime:      item.EventTime,
			Count:          item.Count,
		})
	}
	return events, nil
}

func (a *KubernetesAdapter) Logs(ctx context.Context, namespace string, appID string, deploymentID string, since time.Duration, tailLines int) ([]PodLog, error) {
	pods, err := a.Pods(ctx, namespace, appID, deploymentID)
	if err != nil {
		return nil, err
	}

	logs := []PodLog{}
	sinceSeconds := int(since.Seconds())
	if sinceSeconds < 1 {
		sinceSeconds = 1
	}
	for _, pod := range pods {
		path := fmt.Sprintf("/api/v1/namespaces/%s/pods/%s/log?timestamps=true&tailLines=%d&sinceSeconds=%d", pathEscape(namespace), pathEscape(pod.Name), tailLines, sinceSeconds)
		data, err := a.getBytes(ctx, path)
		if err != nil {
			logs = append(logs, PodLog{PodName: pod.Name, Logs: "error: " + err.Error()})
			continue
		}
		logs = append(logs, PodLog{PodName: pod.Name, Logs: string(data)})
	}
	return logs, nil
}

func (a *KubernetesAdapter) get(ctx context.Context, path string, out any) error {
	data, err := a.getBytes(ctx, path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}

func (a *KubernetesAdapter) getBytes(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	if a.token != "" {
		req.Header.Set("Authorization", "Bearer "+a.token)
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
		return nil, fmt.Errorf("kubernetes api returned %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}

func pathEscape(value string) string {
	return url.PathEscape(value)
}
