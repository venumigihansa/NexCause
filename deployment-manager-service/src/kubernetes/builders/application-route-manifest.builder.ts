interface BuildApplicationRouteManifestInput {
  name: string;
  namespace: string;
  hostname: string;
  gatewayName: string;
  gatewayNamespace: string;
  serviceName: string;
  servicePort: number;
  labels: Record<string, string>;
}

interface BuildApplicationRedirectRouteManifestInput {
  name: string;
  namespace: string;
  hostname: string;
  gatewayName: string;
  gatewayNamespace: string;
  labels: Record<string, string>;
}

export function buildApplicationRouteManifest({
  name,
  namespace,
  hostname,
  gatewayName,
  gatewayNamespace,
  serviceName,
  servicePort,
  labels,
}: BuildApplicationRouteManifestInput): Record<string, unknown> {
  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "HTTPRoute",
    metadata: { name, namespace, labels },
    spec: {
      parentRefs: [
        {
          name: gatewayName,
          namespace: gatewayNamespace,
          sectionName: "https",
        },
      ],
      hostnames: [hostname],
      rules: [
        {
          matches: [{ path: { type: "PathPrefix", value: "/" } }],
          backendRefs: [
            {
              group: "",
              kind: "Service",
              name: serviceName,
              port: servicePort,
            },
          ],
        },
      ],
    },
  };
}

export function buildApplicationRedirectRouteManifest({
  name,
  namespace,
  hostname,
  gatewayName,
  gatewayNamespace,
  labels,
}: BuildApplicationRedirectRouteManifestInput): Record<string, unknown> {
  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "HTTPRoute",
    metadata: { name, namespace, labels },
    spec: {
      parentRefs: [
        {
          name: gatewayName,
          namespace: gatewayNamespace,
          sectionName: "http",
        },
      ],
      hostnames: [hostname],
      rules: [
        {
          filters: [
            {
              type: "RequestRedirect",
              requestRedirect: { scheme: "https", statusCode: 308 },
            },
          ],
        },
      ],
    },
  };
}
