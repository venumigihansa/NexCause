import * as k8s from '@kubernetes/client-node';

export function buildNamespaceManifest(name: string): k8s.V1Namespace {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name,
    },
  };
}
