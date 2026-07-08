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
	"rca-mcp-server/internal/store"
	"rca-mcp-server/internal/tools"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}

	metadataStore := store.NewPostgresStore(db)
	kubeAdapter, err := adapters.NewKubernetesAdapter(cfg)
	if err != nil {
		logger.Warn("kubernetes adapter disabled", "error", err)
	}

	registry := tools.NewRegistry(tools.Dependencies{
		Config:         cfg,
		ContextBuilder: rcacontext.NewBuilder(metadataStore, cfg),
		Store:          metadataStore,
		Kubernetes:     kubeAdapter,
		Metrics:        adapters.NewPrometheusAdapter(cfg),
		Traces:         adapters.NewTempoAdapter(cfg),
		Logs:           adapters.NewLogBackendAdapter(cfg),
		Logger:         logger,
	})

	mux := http.NewServeMux()
	mux.Handle("/mcp", tools.NewMCPHandler(registry, logger))
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
