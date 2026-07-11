package config

import (
	"net/url"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port                  string
	DatabaseURL           string
	DefaultLookback       time.Duration
	DefaultLookahead      time.Duration
	MaxRecursionDepth     int
	MaxLogLines           int
	MaxSamples            int
	MaxSpans              int
	PrometheusURL         string
	TempoURL              string
	LogBackendURL         string
	KubernetesInCluster   bool
	KubernetesAPIURL      string
	KubernetesBearerToken string
	KubernetesCAFile      string
	KubernetesNamespace   string
	HTTPTimeout           time.Duration
	ManagedByLabel        string
	ManagedByValue        string
	RcaAppIDLabel         string
	RcaDeploymentIDLabel  string
}

func Load() Config {
	return Config{
		Port:                  env("PORT", "8080"),
		DatabaseURL:           postgresURL(env("DATABASE_URL", "")),
		DefaultLookback:       minutesEnv("DEFAULT_LOOKBACK_MINUTES", 10),
		DefaultLookahead:      minutesEnv("DEFAULT_LOOKAHEAD_MINUTES", 2),
		MaxRecursionDepth:     intEnv("MAX_RECURSION_DEPTH", 3),
		MaxLogLines:           intEnv("MAX_LOG_LINES", 500),
		MaxSamples:            intEnv("MAX_SAMPLES", 120),
		MaxSpans:              intEnv("MAX_SPANS", 100),
		PrometheusURL:         env("PROMETHEUS_URL", ""),
		TempoURL:              env("TEMPO_URL", ""),
		LogBackendURL:         env("LOG_BACKEND_URL", ""),
		KubernetesInCluster:   boolEnv("KUBERNETES_IN_CLUSTER", true),
		KubernetesAPIURL:      env("KUBERNETES_API_URL", "https://kubernetes.default.svc"),
		KubernetesBearerToken: env("KUBERNETES_BEARER_TOKEN", ""),
		KubernetesCAFile:      env("KUBERNETES_CA_FILE", "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"),
		KubernetesNamespace:   env("POD_NAMESPACE", ""),
		HTTPTimeout:           time.Duration(intEnv("HTTP_TIMEOUT_SECONDS", 15)) * time.Second,
		ManagedByLabel:        "app.kubernetes.io/managed-by",
		ManagedByValue:        "deployment-manager-service",
		RcaAppIDLabel:         "rca-platform/app-id",
		RcaDeploymentIDLabel:  "rca-platform/deployment-id",
	}
}

func postgresURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	query := parsed.Query()
	schema := query.Get("schema")
	if schema == "" {
		return raw
	}
	query.Del("schema")
	if query.Get("search_path") == "" {
		query.Set("search_path", schema)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func env(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return value
}

func boolEnv(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func minutesEnv(key string, fallback int) time.Duration {
	return time.Duration(intEnv(key, fallback)) * time.Minute
}
