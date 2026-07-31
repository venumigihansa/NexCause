# RCA Platform Helm chart

This umbrella chart installs the deployment manager, RCA agent, and MCP server. The Kind profile also installs persistent PostgreSQL and an OCI registry. The application charts use ConfigMaps for non-sensitive settings and reference Kubernetes Secrets for database and LLM credentials.

## Cluster prerequisites

The platform uses one Kubernetes Gateway implemented by kgateway. Gateway API CRDs, kgateway, and cert-manager are cluster-scoped prerequisites and are intentionally not dependencies of this application chart.

Install them with an explicit Kubernetes context:

```bash
./scripts/install-cluster-prerequisites.sh \
  --environment kind \
  --context kind-rca-lab
```

The script installs pinned standard-channel Gateway API CRDs, kgateway and cert-manager, waits for their controllers, verifies the `kgateway` GatewayClass, and labels the `rca-platform` and `apps` namespaces so only those namespaces can attach routes to the shared Gateway. It is safe to run repeatedly.

Kind does not implement `LoadBalancer` Services by itself. Install and run [cloud-provider-kind](https://kubernetes-sigs.github.io/cloud-provider-kind/) before testing the external Gateway address. A port-forward fallback is documented below.

## Published artifacts

Stable releases publish multi-platform images and the umbrella chart to the
public GitHub Container Registry namespace:

```text
ghcr.io/venumigihansa/nexcause-deployment-manager
ghcr.io/venumigihansa/nexcause-rca-agent
ghcr.io/venumigihansa/nexcause-mcp-server
ghcr.io/venumigihansa/nexcause-buildpack-runner
oci://ghcr.io/venumigihansa/charts/rca-platform
```

Releases are created from semantic-version tags such as `v0.1.1`. CI also
publishes an immutable `sha-<short-sha>` image tag. `latest` is updated only for
stable versions, and deployment values should use a semantic version or digest.

Verify a public release without registry credentials:

```bash
docker pull ghcr.io/venumigihansa/nexcause-deployment-manager:0.1.1
helm pull oci://ghcr.io/venumigihansa/charts/rca-platform --version 0.1.1
```

## Local Kind installation

After the release is public, install the published chart with the Kind profile
from this repository:

```bash
helm upgrade --install rca-platform \
  oci://ghcr.io/venumigihansa/charts/rca-platform \
  --version 0.1.1 \
  --namespace rca-platform \
  --create-namespace \
  -f ./deployments/values-kind.yaml \
  --wait --timeout 5m
```

A later installer will supply the same local profile automatically.

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
kubectl port-forward -n rca-platform svc/rca-gateway 8080:80 8443:443
curl --resolve manager.rca.local:8443:127.0.0.1 \
  --insecure https://manager.rca.local:8443/healthz
```

With cloud-provider-kind running, get the Gateway address and test the production-shaped ports:

```bash
kubectl get gateway rca-gateway -n rca-platform
kubectl get svc rca-gateway -n rca-platform

curl --resolve manager.rca.local:443:<GATEWAY-IP> \
  --insecure https://manager.rca.local/healthz
```

The Kind profile uses a self-signed certificate for `manager.rca.local` and `*.apps.rca.local`. Browsers will warn until the local certificate is trusted. `/etc/hosts` does not support wildcard entries; add `manager.rca.local` explicitly or use `curl --resolve`.

### Reset the development database

This permanently deletes local RCA database data and must never be used for a
production namespace:

```bash
helm uninstall rca-platform --namespace rca-platform
kubectl delete pvc --namespace rca-platform \
  -l app.kubernetes.io/name=postgres
```

Reinstalling the chart initializes the fixed PostgreSQL version and creates the
dedicated development-only database roles.

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

Bundled Postgres and the local registry are disabled in `values-prod.yaml`. Before a production install:

1. Provision the AWS Load Balancer Controller and its IAM permissions through EKS infrastructure.
2. Install the shared controllers:

   ```bash
   ./scripts/install-cluster-prerequisites.sh \
     --environment eks \
     --context '<EKS-KUBE-CONTEXT>'
   ```

3. Provision a `letsencrypt-production` ClusterIssuer using Route 53 DNS-01 and IAM scoped to the hosted zone.
4. Create Route 53 records for the manager hostname and application wildcard that point to the generated NLB.
5. Install External Secrets Operator and create the
   `aws-secrets-manager` `ClusterSecretStore` using EKS Pod Identity or IRSA.
6. Populate the AWS secret paths and JSON properties documented in
   `docs/authentication-and-tenancy.md`; the chart synchronizes the Asgardeo,
   internal JWT, and four restricted database Secrets.
7. Configure immutable ECR image references and provide the agent LLM Secret.

The production values intentionally contain invalid hostname placeholders. Helm schema validation prevents installation until both are replaced:

```bash
helm upgrade --install rca-platform ./deployments \
  --namespace rca-platform \
  -f ./deployments/values-prod.yaml \
  --set-string gateway.deploymentManagerHostname=manager.rca.example.com \
  --set-string 'gateway.applicationWildcardHostname=*.apps.rca.example.com' \
  --wait --timeout 10m
```

The EKS-only `GatewayParameters` configures kgateway's generated `LoadBalancer` Service for an internet-facing AWS NLB. TLS is passed through the NLB and terminated by Envoy with the Secret maintained by cert-manager.

See [Gateway operations](../docs/gateway.md) for ownership, troubleshooting, and readiness checks.
See [Authentication and tenancy operations](../docs/authentication-and-tenancy.md)
before enabling the public Gateway.

## Validation

```bash
helm lint ./deployments -f ./deployments/values-kind.yaml
helm template rca-platform ./deployments \
  --namespace rca-platform \
  -f ./deployments/values-kind.yaml
```
