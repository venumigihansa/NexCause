import * as k8s from "@kubernetes/client-node";

interface BuildDeploymentManifestInput {
  name: string;
  image: string;
  port: number;
  replicas: number;
  labels: Record<string, string>;
  configMapName?: string;
  secretName?: string;
  configFileConfigMapName?: string;
  secretFileSecretName?: string;
  configFileVolume?: FileVolumeInput;
  secretFileVolume?: FileVolumeInput;
}

interface FileVolumeInput {
  name: string;
  mountPath: string;
  items: Array<{
    key: string;
    path: string;
  }>;
}

export function buildDeploymentManifest({
  name,
  image,
  port,
  replicas,
  labels,
  configMapName,
  secretName,
  configFileConfigMapName,
  secretFileSecretName,
  configFileVolume,
  secretFileVolume,
}: BuildDeploymentManifestInput): k8s.V1Deployment {
  const envFrom: k8s.V1EnvFromSource[] = [];
  const volumes: k8s.V1Volume[] = [];
  const volumeMounts: k8s.V1VolumeMount[] = [];

  if (configMapName) {
    envFrom.push({ configMapRef: { name: configMapName } });
  }

  if (secretName) {
    envFrom.push({ secretRef: { name: secretName } });
  }

  if (configFileVolume && configFileConfigMapName) {
    volumes.push({
      name: configFileVolume.name,
      configMap: {
        name: configFileConfigMapName,
        items: configFileVolume.items,
      },
    });
    volumeMounts.push({
      name: configFileVolume.name,
      mountPath: configFileVolume.mountPath,
      readOnly: true,
    });
  }

  if (secretFileVolume && secretFileSecretName) {
    volumes.push({
      name: secretFileVolume.name,
      secret: {
        secretName: secretFileSecretName,
        items: secretFileVolume.items,
      },
    });
    volumeMounts.push({
      name: secretFileVolume.name,
      mountPath: secretFileVolume.mountPath,
      readOnly: true,
    });
  }

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
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
          volumes: volumes.length > 0 ? volumes : undefined,
          containers: [
            {
              name: "app",
              image,
              ports: [{ containerPort: port }],
              envFrom: envFrom.length > 0 ? envFrom : undefined,
              volumeMounts: volumeMounts.length > 0 ? volumeMounts : undefined,
            },
          ],
        },
      },
    },
  };
}
