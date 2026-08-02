export default () => ({
  defaultNamespace: process.env.DEFAULT_KUBERNETES_NAMESPACE ?? "apps",
  applicationRoutingEnabled: process.env.APPLICATION_ROUTING_ENABLED === "true",
  applicationGatewayName: process.env.APPLICATION_GATEWAY_NAME ?? "",
  applicationGatewayNamespace: process.env.APPLICATION_GATEWAY_NAMESPACE ?? "",
  applicationWildcardHostname: process.env.APPLICATION_WILDCARD_HOSTNAME ?? "",
  gatewayAccessNamespaceLabelKey:
    process.env.GATEWAY_ACCESS_NAMESPACE_LABEL_KEY ??
    "rca-platform.io/gateway-access",
  gatewayAccessNamespaceLabelValue:
    process.env.GATEWAY_ACCESS_NAMESPACE_LABEL_VALUE ?? "true",
  tenantNetworkPolicyEnabled:
    process.env.TENANT_NETWORK_POLICY_ENABLED === "true",
});
