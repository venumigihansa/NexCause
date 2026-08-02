export interface KubernetesResourceNames {
  deploymentName: string;
  serviceName: string;
  configMapName: string;
  fileConfigMapName?: string;
  secretName?: string;
  secretFileSecretName?: string;
  httpRouteName: string;
  httpRedirectRouteName: string;
}
