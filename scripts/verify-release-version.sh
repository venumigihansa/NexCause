#!/usr/bin/env bash

set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "error: expected a semantic version without a leading v, got '$VERSION'" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chart_version() {
  awk '$1 == "version:" { gsub(/"/, "", $2); print $2; exit }' "$1"
}

app_version() {
  awk '$1 == "appVersion:" { gsub(/"/, "", $2); print $2; exit }' "$1"
}

charts=(
  "$ROOT/deployments/Chart.yaml"
  "$ROOT/deployments/charts/deployment-manager/Chart.yaml"
  "$ROOT/deployments/charts/rca-agent/Chart.yaml"
  "$ROOT/deployments/charts/mcp-server/Chart.yaml"
  "$ROOT/deployments/charts/postgres/Chart.yaml"
  "$ROOT/deployments/charts/registry/Chart.yaml"
)

application_charts=(
  "$ROOT/deployments/Chart.yaml"
  "$ROOT/deployments/charts/deployment-manager/Chart.yaml"
  "$ROOT/deployments/charts/rca-agent/Chart.yaml"
  "$ROOT/deployments/charts/mcp-server/Chart.yaml"
)

for chart in "${charts[@]}"; do
  actual="$(chart_version "$chart")"
  [[ "$actual" == "$VERSION" ]] || {
    echo "error: $chart has chart version $actual, expected $VERSION" >&2
    exit 1
  }
done

for chart in "${application_charts[@]}"; do
  actual="$(app_version "$chart")"
  [[ "$actual" == "$VERSION" ]] || {
    echo "error: $chart has appVersion $actual, expected $VERSION" >&2
    exit 1
  }
done

actual_image_tags="$(grep -Ec 'tag: "?'"$VERSION"'"?$' "$ROOT/deployments/values.yaml")"
[[ "$actual_image_tags" -eq 3 ]] || {
  echo "error: expected three platform image tags for $VERSION, found $actual_image_tags" >&2
  exit 1
}

for values_file in "$ROOT/deployments/values.yaml" "$ROOT/deployments/values-kind.yaml"; do
  grep -Eq "BUILDPACK_RUNNER_IMAGE: ghcr.io/venumigihansa/nexcause-buildpack-runner:${VERSION}$" "$values_file" || {
    echo "error: $values_file does not pin the buildpack runner to $VERSION" >&2
    exit 1
  }
done

echo "Release metadata is consistently versioned at $VERSION."

