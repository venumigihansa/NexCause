import * as k8s from "@kubernetes/client-node";

export const TENANT_NETWORK_POLICY_NAMES = {
  defaultDenyIngress: "default-deny-ingress",
  allowSameNamespace: "allow-same-namespace",
  allowSharedGateway: "allow-shared-gateway",
} as const;

export const PUBLIC_APPLICATION_LABEL = "rca-platform.io/public";

export function buildApplicationPodLabels(
  labels: Record<string, string>,
  publiclyExposed: boolean,
): Record<string, string> {
  return publiclyExposed
    ? { ...labels, [PUBLIC_APPLICATION_LABEL]: "true" }
    : labels;
}

interface BuildTenantNetworkPoliciesInput {
  namespace: string;
  gatewayName: string;
  gatewayNamespace: string;
}

export function buildTenantNetworkPolicyManifests({
  namespace,
  gatewayName,
  gatewayNamespace,
}: BuildTenantNetworkPoliciesInput): k8s.V1NetworkPolicy[] {
  return [
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: TENANT_NETWORK_POLICY_NAMES.defaultDenyIngress,
        namespace,
      },
      spec: {
        podSelector: {},
        policyTypes: ["Ingress"],
        ingress: [],
      },
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: TENANT_NETWORK_POLICY_NAMES.allowSameNamespace,
        namespace,
      },
      spec: {
        podSelector: {},
        policyTypes: ["Ingress"],
        ingress: [{ from: [{ podSelector: {} }] }],
      },
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: TENANT_NETWORK_POLICY_NAMES.allowSharedGateway,
        namespace,
      },
      spec: {
        podSelector: {
          matchLabels: { [PUBLIC_APPLICATION_LABEL]: "true" },
        },
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    "kubernetes.io/metadata.name": gatewayNamespace,
                  },
                },
                podSelector: {
                  matchLabels: {
                    "gateway.networking.k8s.io/gateway-name": gatewayName,
                  },
                },
              },
            ],
          },
        ],
      },
    },
  ];
}
