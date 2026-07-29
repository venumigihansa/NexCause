import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  Client,
  custom,
  generators,
  Issuer,
  type ClientMetadata,
  type TokenSet,
} from "openid-client";
import type { VerifiedIdentity } from "./auth.types";

@Injectable()
export class OidcService {
  private clientPromise?: Promise<Client>;

  constructor(private readonly config: ConfigService) {
    custom.setHttpOptionsDefaults({ timeout: 10_000 });
  }

  async authorizationRequest(): Promise<{
    url: string;
    state: string;
    nonce: string;
    codeVerifier: string;
  }> {
    const client = await this.client();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    return {
      state,
      nonce,
      codeVerifier,
      url: client.authorizationUrl({
        scope: this.scopes().join(" "),
        redirect_uri: this.required("auth.callbackUrl"),
        response_type: "code",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }),
    };
  }

  async completeCallback(
    params: Record<string, string | string[] | undefined>,
    checks: { state: string; nonce: string; codeVerifier: string },
  ): Promise<{ identity: VerifiedIdentity; tokenSet: TokenSet }> {
    const client = await this.client();
    let tokenSet: TokenSet;
    try {
      tokenSet = await client.callback(
        this.required("auth.callbackUrl"),
        params,
        {
          state: checks.state,
          nonce: checks.nonce,
          code_verifier: checks.codeVerifier,
          response_type: "code",
        },
      );
    } catch {
      throw new UnauthorizedException(
        "The OIDC callback could not be validated",
      );
    }
    return {
      identity: await this.identityFromTokenSet(tokenSet),
      tokenSet,
    };
  }

  async switchOrganization(
    accessToken: string,
    organizationId: string,
    expectedSubject: string,
  ) {
    const client = await this.client();
    const tokenEndpoint = client.issuer.metadata.token_endpoint;
    if (!tokenEndpoint) {
      throw new InternalServerErrorException(
        "OIDC token endpoint is unavailable",
      );
    }
    const body = new URLSearchParams({
      grant_type: "organization_switch",
      token: accessToken,
      switching_organization: organizationId,
      scope: this.scopes().join(" "),
    });
    const credentials = Buffer.from(
      `${this.required("auth.clientId")}:${this.required("auth.clientSecret")}`,
    ).toString("base64");
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new UnauthorizedException("Organization switch was rejected");
    }
    const payload = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const claims = payload.access_token.includes(".")
      ? await this.verifyAccessToken(payload.access_token)
      : await this.introspectAccessToken(payload.access_token);
    const identity = this.identityFromClaims(claims, payload.scope);
    identity.subject ||= expectedSubject;
    identity.organizationId ||= organizationId;
    identity.organizationName ||= organizationId;
    if (
      identity.subject !== expectedSubject ||
      identity.organizationId !== organizationId
    ) {
      throw new UnauthorizedException(
        "The switched token identity does not match the request",
      );
    }
    return { payload, identity };
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    try {
      return await (await this.client()).refresh(refreshToken);
    } catch {
      throw new UnauthorizedException(
        "The Asgardeo session could not be refreshed",
      );
    }
  }

  async logoutUrl(idToken?: string): Promise<string> {
    const client = await this.client();
    return client.endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri: this.required("auth.postLogoutUrl"),
    });
  }

  async revokeTokens(tokens: {
    accessToken?: string | null;
    refreshToken?: string | null;
  }): Promise<void> {
    const client = await this.client();
    const requests: Promise<void>[] = [];
    if (tokens.refreshToken) {
      requests.push(client.revoke(tokens.refreshToken, "refresh_token"));
    }
    if (tokens.accessToken) {
      requests.push(client.revoke(tokens.accessToken, "access_token"));
    }
    await Promise.allSettled(requests);
  }

  private async identityFromTokenSet(
    tokenSet: TokenSet,
  ): Promise<VerifiedIdentity> {
    const idClaims = tokenSet.claims();
    let accessClaims: JWTPayload = {};
    if (tokenSet.access_token?.includes(".")) {
      accessClaims = await this.verifyAccessToken(tokenSet.access_token);
    }
    return this.identityFromClaims(
      { ...idClaims, ...accessClaims },
      tokenSet.scope,
    );
  }

  private identityFromClaims(
    claims: JWTPayload,
    responseScope?: string,
  ): VerifiedIdentity {
    const organizationId = stringClaim(
      claims.org_id ?? claims.organization_id ?? claims.organizationId,
    );
    const issuerOrganization = stringClaim(claims.iss).match(
      /\/o\/([^/]+)/,
    )?.[1];
    const resolvedOrganizationId = organizationId || issuerOrganization || "";
    const scopeClaim = stringClaim(claims.scope);
    return {
      subject: stringClaim(claims.sub),
      organizationId: resolvedOrganizationId,
      organizationName:
        stringClaim(claims.org_name ?? claims.organization_name) ||
        resolvedOrganizationId,
      email: optionalString(claims.email),
      displayName:
        optionalString(claims.name) ??
        optionalString(claims.preferred_username),
      roles: stringArray(claims.roles),
      scopes: [
        ...new Set(`${responseScope ?? ""} ${scopeClaim}`.split(/\s+/)),
      ].filter(Boolean),
    };
  }

  private async verifyAccessToken(token: string): Promise<JWTPayload> {
    const client = await this.client();
    const jwksUri = client.issuer.metadata.jwks_uri;
    if (!jwksUri) {
      throw new InternalServerErrorException(
        "OIDC JWKS endpoint is unavailable",
      );
    }
    try {
      const audience =
        this.config.get<string>("auth.audience") ||
        this.required("auth.clientId");
      const result = await jwtVerify(
        token,
        createRemoteJWKSet(new URL(jwksUri)),
        { audience },
      );
      return result.payload;
    } catch {
      throw new UnauthorizedException("The access token is invalid");
    }
  }

  private async introspectAccessToken(token: string): Promise<JWTPayload> {
    try {
      const result = await (await this.client()).introspect(token);
      if (!result.active) {
        throw new UnauthorizedException("The access token is inactive");
      }
      return result as JWTPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("The access token is invalid");
    }
  }

  private client(): Promise<Client> {
    this.clientPromise ??= (async () => {
      try {
        const issuer = await Issuer.discover(this.required("auth.issuer"));
        const metadata: ClientMetadata = {
          client_id: this.required("auth.clientId"),
          client_secret: this.required("auth.clientSecret"),
          redirect_uris: [this.required("auth.callbackUrl")],
          response_types: ["code"],
          token_endpoint_auth_method: "client_secret_basic",
        };
        return new issuer.Client(metadata);
      } catch (error) {
        if (error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new BadGatewayException("Asgardeo discovery failed");
      }
    })();
    return this.clientPromise;
  }

  private scopes(): string[] {
    return this.config.get<string[]>("auth.scopes") ?? ["openid"];
  }

  private required(key: string): string {
    const value = this.config.get<string>(key) ?? "";
    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured`);
    }
    return value;
  }
}

function stringClaim(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  const result = stringClaim(value);
  return result || undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}
