import * as k8s from '@kubernetes/client-node';

export function buildSecretManifest(): k8s.V1Secret {
  throw new Error('Kubernetes Secret support is not implemented in Phase 1');
}
