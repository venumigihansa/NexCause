#!/usr/bin/env bash

set -euo pipefail

GATEWAY_API_VERSION="${GATEWAY_API_VERSION:-v1.6.1}"
KGATEWAY_VERSION="${KGATEWAY_VERSION:-v2.4.0}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.21.0}"

ENVIRONMENT=""
KUBE_CONTEXT=""

usage() {
  cat <<'EOF'
Usage:
  install-cluster-prerequisites.sh --environment kind|eks --context KUBE_CONTEXT

Environment variables:
  GATEWAY_API_VERSION  Gateway API release to install (default: v1.6.1)
  KGATEWAY_VERSION     kgateway chart version to install (default: v2.4.0)
  CERT_MANAGER_VERSION cert-manager chart version to install (default: v1.21.0)
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command '$1' was not found"
}

while (($# > 0)); do
  case "$1" in
    --environment)
      (($# >= 2)) || fail "--environment requires a value"
      ENVIRONMENT="$2"
      shift 2
      ;;
    --context)
      (($# >= 2)) || fail "--context requires a value"
      KUBE_CONTEXT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ "$ENVIRONMENT" == "kind" || "$ENVIRONMENT" == "eks" ]] ||
  fail "--environment must be either 'kind' or 'eks'"
[[ -n "$KUBE_CONTEXT" ]] || fail "--context is required"

require_command kubectl
require_command helm

kubectl config get-contexts "$KUBE_CONTEXT" --no-headers >/dev/null 2>&1 ||
  fail "Kubernetes context '$KUBE_CONTEXT' does not exist"
kubectl --context "$KUBE_CONTEXT" cluster-info >/dev/null 2>&1 ||
  fail "Kubernetes context '$KUBE_CONTEXT' exists, but its API server is not reachable"

if [[ "$ENVIRONMENT" == "eks" ]]; then
  kubectl --context "$KUBE_CONTEXT" \
    --namespace kube-system \
    get deployment aws-load-balancer-controller >/dev/null 2>&1 ||
    fail "AWS Load Balancer Controller is required in kube-system before EKS prerequisites are installed"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PREREQUISITES_DIR="$REPOSITORY_ROOT/deployments/prerequisites"

echo "Installing cluster prerequisites"
echo "  environment: $ENVIRONMENT"
echo "  context:     $KUBE_CONTEXT"
echo "  Gateway API: $GATEWAY_API_VERSION (standard channel)"
echo "  kgateway:    $KGATEWAY_VERSION"
echo "  cert-manager:$CERT_MANAGER_VERSION"

kubectl --context "$KUBE_CONTEXT" apply --server-side \
  -f "https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml"

for crd in \
  gatewayclasses.gateway.networking.k8s.io \
  gateways.gateway.networking.k8s.io \
  httproutes.gateway.networking.k8s.io; do
  kubectl --context "$KUBE_CONTEXT" wait \
    --for=condition=Established \
    "crd/$crd" \
    --timeout=2m
done

helm upgrade --install kgateway-crds \
  oci://cr.kgateway.dev/kgateway-dev/charts/kgateway-crds \
  --version "$KGATEWAY_VERSION" \
  --namespace kgateway-system \
  --create-namespace \
  --kube-context "$KUBE_CONTEXT" \
  --wait \
  --timeout 5m

helm upgrade --install kgateway \
  oci://cr.kgateway.dev/kgateway-dev/charts/kgateway \
  --version "$KGATEWAY_VERSION" \
  --namespace kgateway-system \
  --create-namespace \
  --kube-context "$KUBE_CONTEXT" \
  -f "$PREREQUISITES_DIR/kgateway-common.yaml" \
  -f "$PREREQUISITES_DIR/kgateway-${ENVIRONMENT}.yaml" \
  --wait \
  --timeout 5m

helm upgrade --install cert-manager \
  oci://quay.io/jetstack/charts/cert-manager \
  --version "$CERT_MANAGER_VERSION" \
  --namespace cert-manager \
  --create-namespace \
  --kube-context "$KUBE_CONTEXT" \
  -f "$PREREQUISITES_DIR/cert-manager.yaml" \
  --wait \
  --timeout 5m

kubectl --context "$KUBE_CONTEXT" wait \
  --for=condition=Available \
  deployment/kgateway \
  --namespace kgateway-system \
  --timeout=5m

for deployment in cert-manager cert-manager-cainjector cert-manager-webhook; do
  kubectl --context "$KUBE_CONTEXT" wait \
    --for=condition=Available \
    "deployment/$deployment" \
    --namespace cert-manager \
    --timeout=5m
done

kubectl --context "$KUBE_CONTEXT" wait \
  --for=condition=Accepted \
  gatewayclass/kgateway \
  --timeout=2m

for namespace in rca-platform apps; do
  kubectl --context "$KUBE_CONTEXT" create namespace "$namespace" \
    --dry-run=client \
    --output=yaml |
    kubectl --context "$KUBE_CONTEXT" apply -f -
  kubectl --context "$KUBE_CONTEXT" label namespace "$namespace" \
    rca-platform.io/gateway-access=true \
    --overwrite
done

echo
echo "Cluster prerequisites are ready."
kubectl --context "$KUBE_CONTEXT" get gatewayclass kgateway

if [[ "$ENVIRONMENT" == "kind" ]]; then
  cat <<EOF

Kind requires a LoadBalancer implementation. Install and run cloud-provider-kind:
  https://kubernetes-sigs.github.io/cloud-provider-kind/

After installing the RCA chart, a no-LoadBalancer fallback is:
  kubectl --context "$KUBE_CONTEXT" --namespace rca-platform \\
    port-forward service/rca-gateway 8080:80 8443:443
EOF
fi
