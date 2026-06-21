import * as k8s from '@kubernetes/client-node';

interface BuildDeploymentManifestInput {
  name: string;
  image: string;
  port: number;
  replicas: number;
  labels: Record<string, string>;
  configMapName?: string;
}

export function buildDeploymentManifest({
  name,
  image,
  port,
  replicas,
  labels,
  configMapName,
}: BuildDeploymentManifestInput): k8s.V1Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      labels,
    },
    spec: {
      replicas,
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          containers: [
            {
              name: 'app',
              image,
              ports: [{ containerPort: port }],
              envFrom: configMapName
                ? [{ configMapRef: { name: configMapName } }]
                : undefined,
            },
          ],
        },
      },
    },
  };
}
