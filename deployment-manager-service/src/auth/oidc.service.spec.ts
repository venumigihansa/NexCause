import { ConfigService } from "@nestjs/config";
import { OidcService } from "./oidc.service";

describe("OidcService authorization request", () => {
  it("uses state, nonce and an S256 PKCE challenge", async () => {
    let parameters: Record<string, string> = {};
    const service = new OidcService(
      new ConfigService({
        auth: {
          callbackUrl: "https://manager.example.com/auth/callback",
          scopes: ["openid", "deployments:read"],
        },
      }),
    );
    Object.assign(service, {
      clientPromise: Promise.resolve({
        authorizationUrl: (input: Record<string, string>) => {
          parameters = input;
          return "https://identity.example.com/oauth2/authorize";
        },
      }),
    });

    const result = await service.authorizationRequest();

    expect(result.state).toHaveLength(43);
    expect(result.nonce).toHaveLength(43);
    expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(parameters.code_challenge_method).toBe("S256");
    expect(parameters.code_challenge).not.toBe(result.codeVerifier);
    expect(parameters.scope).toBe("openid deployments:read");
  });
});
