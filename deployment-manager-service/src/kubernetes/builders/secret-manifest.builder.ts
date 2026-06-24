import * as k8s from '@kubernetes/client-node';

interface BuildSecretManifestInput {
  name: string;
  labels: Record<string, string>;
  stringData: Record<string, string>;
}

export function buildSecretManifest({
  name,
  labels,
  stringData,
}: BuildSecretManifestInput): k8s.V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name,
      labels,
    },
    stringData,
  };
}
