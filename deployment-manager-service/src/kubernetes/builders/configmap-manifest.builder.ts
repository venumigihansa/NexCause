import * as k8s from "@kubernetes/client-node";

interface BuildConfigMapManifestInput {
  name: string;
  labels: Record<string, string>;
  data: Record<string, string>;
}

export function buildConfigMapManifest({
  name,
  labels,
  data,
}: BuildConfigMapManifestInput): k8s.V1ConfigMap {
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      labels,
    },
    data,
  };
}
