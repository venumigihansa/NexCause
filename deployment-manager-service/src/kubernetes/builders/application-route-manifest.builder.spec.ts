import {
  buildApplicationRedirectRouteManifest,
  buildApplicationRouteManifest,
} from "./application-route-manifest.builder";

const common = {
  namespace: "rca-w-tenant",
  hostname: "orders-a1b2c3d4.apps.rca.local",
  gatewayName: "rca-gateway",
  gatewayNamespace: "rca-platform",
  labels: { "rca-platform/deployment-id": "deployment-id" },
};

describe("application HTTPRoute manifests", () => {
  it("routes HTTPS traffic to the deployment Service", () => {
    expect(
      buildApplicationRouteManifest({
        ...common,
        name: "orders-a1b2c3d4-route",
        serviceName: "orders-a1b2c3d4-svc",
        servicePort: 8080,
      }),
    ).toMatchObject({
      metadata: { namespace: "rca-w-tenant" },
      spec: {
        parentRefs: [
          {
            name: "rca-gateway",
            namespace: "rca-platform",
            sectionName: "https",
          },
        ],
        hostnames: ["orders-a1b2c3d4.apps.rca.local"],
        rules: [
          {
            matches: [{ path: { type: "PathPrefix", value: "/" } }],
            backendRefs: [{ name: "orders-a1b2c3d4-svc", port: 8080 }],
          },
        ],
      },
    });
  });

  it("redirects HTTP traffic to HTTPS", () => {
    expect(
      buildApplicationRedirectRouteManifest({
        ...common,
        name: "orders-a1b2c3d4-redirect",
      }),
    ).toMatchObject({
      spec: {
        parentRefs: [{ sectionName: "http" }],
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
    });
  });
});
