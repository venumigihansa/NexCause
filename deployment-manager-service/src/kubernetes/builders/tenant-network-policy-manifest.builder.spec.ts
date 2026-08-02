import {
  buildApplicationPodLabels,
  buildTenantNetworkPolicyManifests,
  PUBLIC_APPLICATION_LABEL,
  TENANT_NETWORK_POLICY_NAMES,
} from "./tenant-network-policy-manifest.builder";

describe("buildTenantNetworkPolicyManifests", () => {
  const policies = buildTenantNetworkPolicyManifests({
    namespace: "rca-w-tenant",
    gatewayName: "rca-gateway",
    gatewayNamespace: "rca-platform",
  });

  it("denies ingress to every pod by default", () => {
    expect(policies[0]).toMatchObject({
      metadata: {
        name: TENANT_NETWORK_POLICY_NAMES.defaultDenyIngress,
        namespace: "rca-w-tenant",
      },
      spec: { podSelector: {}, policyTypes: ["Ingress"], ingress: [] },
    });
  });

  it("allows ingress from pods in the same namespace", () => {
    expect(policies[1]).toMatchObject({
      metadata: { name: TENANT_NETWORK_POLICY_NAMES.allowSameNamespace },
      spec: {
        podSelector: {},
        ingress: [{ from: [{ podSelector: {} }] }],
      },
    });
  });

  it("allows only the shared gateway to reach public application pods", () => {
    expect(policies[2]).toMatchObject({
      metadata: { name: TENANT_NETWORK_POLICY_NAMES.allowSharedGateway },
      spec: {
        podSelector: {
          matchLabels: { [PUBLIC_APPLICATION_LABEL]: "true" },
        },
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    "kubernetes.io/metadata.name": "rca-platform",
                  },
                },
                podSelector: {
                  matchLabels: {
                    "gateway.networking.k8s.io/gateway-name": "rca-gateway",
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("does not define any egress isolation", () => {
    for (const policy of policies) {
      expect(policy.spec?.policyTypes).toEqual(["Ingress"]);
      expect(policy.spec?.egress).toBeUndefined();
    }
  });
});

describe("buildApplicationPodLabels", () => {
  it("marks only publicly exposed application pods", () => {
    const labels = { "rca-platform/deployment-id": "deployment-id" };

    expect(buildApplicationPodLabels(labels, true)).toEqual({
      ...labels,
      [PUBLIC_APPLICATION_LABEL]: "true",
    });
    expect(buildApplicationPodLabels(labels, false)).toBe(labels);
  });
});
