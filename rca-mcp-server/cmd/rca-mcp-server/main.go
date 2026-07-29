package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/config"
	rcacontext "rca-mcp-server/internal/context"
	"rca-mcp-server/internal/serviceauth"
	"rca-mcp-server/internal/services"
	"rca-mcp-server/internal/store"
	"rca-mcp-server/internal/tools"
)

var (
	version  = "dev"
	revision = "unknown"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "healthcheck" {
		runHealthcheck()
		return
	}

	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	logger.Info("starting RCA MCP server", "version", version, "revision", revision)

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	db.SetMaxOpenConns(cfg.DatabaseMaxOpenConnections)
	db.SetMaxIdleConns(cfg.DatabaseMaxIdleConnections)
	db.SetConnMaxIdleTime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}

	metadataStore := store.NewPostgresStore(db)
	kubeAdapter, err := adapters.NewKubernetesAdapter(cfg)
	if err != nil {
		logger.Warn("kubernetes adapter disabled", "error", err)
	}

	serviceLayer := services.NewServices(services.Dependencies{
		Config:         cfg,
		ContextBuilder: rcacontext.NewBuilder(metadataStore, cfg),
		Store:          metadataStore,
		Kubernetes:     kubeAdapter,
		Metrics:        adapters.NewPrometheusAdapter(cfg),
		Traces:         adapters.NewTempoAdapter(cfg),
		Logs:           adapters.NewLogBackendAdapter(cfg),
		Logger:         logger,
	})

	registry := tools.NewRegistry(tools.Dependencies{
		Services: serviceLayer,
		Logger:   logger,
	})

	mux := http.NewServeMux()
	mux.Handle("/mcp", http.TimeoutHandler(
		serviceauth.Middleware(
			cfg.InternalServiceJWTSecret,
			tools.NewMCPHandler(registry, logger),
		),
		35*time.Second,
		`{"error":"request timed out"}`,
	))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("starting rca mcp server", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server shutdown failed", "error", err)
		os.Exit(1)
	}
}

func runHealthcheck() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		os.Exit(1)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}
