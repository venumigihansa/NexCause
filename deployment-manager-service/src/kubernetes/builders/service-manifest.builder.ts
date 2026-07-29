import * as k8s from "@kubernetes/client-node";

interface BuildServiceManifestInput {
  name: string;
  port: number;
  labels: Record<string, string>;
}

export function buildServiceManifest({
  name,
  port,
  labels,
}: BuildServiceManifestInput): k8s.V1Service {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      labels,
    },
    spec: {
      type: "ClusterIP",
      selector: labels,
      ports: [
        {
          name: "http",
          port,
          targetPort: port,
        },
      ],
    },
  };
}
