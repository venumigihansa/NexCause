# Phase 1 container runbook

Run the integration environment from `deployment-manager-service`:

```bash
docker compose build
docker compose up --wait
docker compose ps
```

The default credentials are for local development only. Override them without editing the Compose file:

```bash
POSTGRES_PASSWORD='<local-password>' RCA_LLM_API_KEY='<local-key>' docker compose up --wait
```

The Compose release builds these images:

```text
rca-platform/deployment-manager:dev
rca-platform/rca-agent:dev
rca-platform/mcp-server:dev
```

CI and release builds should pass immutable metadata:

```bash
IMAGE_TAG=git-$(git rev-parse --short HEAD) \
IMAGE_VERSION=0.1.2 \
VCS_REF=$(git rev-parse --short HEAD) \
docker compose build
```

Verify the public operational endpoints:

```bash
curl --fail http://localhost:3000/healthz
curl --fail http://localhost:3000/readyz
curl --fail http://localhost:8080/healthz
curl --fail http://localhost:8081/healthz
```

Re-run migrations to confirm they are current and non-interactive:

```bash
docker compose run --rm database-migration
```

Stop containers while preserving Postgres data with `docker compose down`. Use `docker compose down --volumes` only when intentionally resetting the local database.
