# RCA Platform Helm chart

This umbrella chart installs the deployment manager, RCA agent, and MCP server. The Kind profile also installs persistent PostgreSQL and an OCI registry. The application charts use ConfigMaps for non-sensitive settings and reference Kubernetes Secrets for database and LLM credentials.

## Local Kind installation

Build the application images from the repository root:

```bash
docker build -t rca-platform/deployment-manager:dev deployment-manager-service
docker build -t rca-platform/rca-agent:dev rca-agent-service
docker build -t rca-platform/mcp-server:dev rca-mcp-server
```

Load them into the Kind cluster and install the release:

```bash
kind load docker-image --name rca-lab \
  rca-platform/deployment-manager:dev \
  rca-platform/rca-agent:dev \
  rca-platform/mcp-server:dev

helm upgrade --install rca-platform ./deployments \
  --namespace rca-platform \
  --create-namespace \
  -f ./deployments/values-kind.yaml \
  --wait --timeout 5m
```

`values-kind.yaml` uses development-only Postgres credentials. Do not reuse them outside a local cluster. Supply an LLM key without committing it by creating a Secret and setting the agent Secret reference:

```bash
kubectl create secret generic rca-platform-agent \
  --namespace rca-platform \
  --from-literal=RCA_LLM_API_KEY='<key>'

helm upgrade rca-platform ./deployments \
  --namespace rca-platform \
  -f ./deployments/values-kind.yaml \
  --set rca-agent.existingSecret.name=rca-platform-agent \
  --wait
```

Access the API with port forwarding, which works regardless of Kind port mappings:

```bash
kubectl port-forward -n rca-platform svc/rca-platform-deployment-manager 3000:80
```

The Kind profile also installs the shared OpenTelemetry Collector, Prometheus, Loki, Tempo, and Grafana. Access Grafana with:

```bash
kubectl port-forward -n rca-platform svc/rca-observability-grafana 3001:80
kubectl get secret -n rca-platform rca-observability-grafana \
  -o jsonpath='{.data.admin-password}' | base64 --decode
```

Sign in as `admin`. Prometheus, Loki, and Tempo are provisioned as data sources and the `RCA Platform Overview` dashboard is installed automatically.

## Database migrations

The deployment-manager image contains the Prisma CLI and checked-in migrations. Helm runs it as a Kubernetes Job using `post-install` for a fresh install, because bundled Postgres must exist first, and `pre-upgrade` for later releases. A failed migration fails the Helm operation. Successful hook Jobs are deleted automatically.

## Production prerequisites

Bundled Postgres and the local registry are disabled by default and in `values-prod.yaml`. Before a production install, create a Secret with a `DATABASE_URL` key; it defaults to `<release-name>-database` or can be set through `global.database.secretName`. Configure immutable ECR image references and provide the agent LLM Secret. EKS ingress, AWS Secrets Manager integration, and production observability are intentionally handled in later phases.

## Validation

```bash
helm lint ./deployments -f ./deployments/values-kind.yaml
helm template rca-platform ./deployments \
  --namespace rca-platform \
  -f ./deployments/values-kind.yaml
```
