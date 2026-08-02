import { buildPublicHostname } from "./deployment-routing";

describe("buildPublicHostname", () => {
  it("builds a unique DNS-safe hostname below the configured wildcard", () => {
    expect(
      buildPublicHostname(
        "My Payments_API",
        "a1b2c3d4-1111-2222-3333-444444444444",
        "*.apps.rca.local",
      ),
    ).toBe("my-payments-api-a1b2c3d4.apps.rca.local");
  });

  it("rejects a missing or non-wildcard application hostname", () => {
    expect(() =>
      buildPublicHostname("app", "a1b2c3d4", "apps.rca.local"),
    ).toThrow("APPLICATION_WILDCARD_HOSTNAME");
  });
});
