import { registerAs } from "@nestjs/config";

export default registerAs("auth", () => ({
  issuer: process.env.ASGARDEO_ISSUER ?? "",
  clientId: process.env.ASGARDEO_CLIENT_ID ?? "",
  clientSecret: process.env.ASGARDEO_CLIENT_SECRET ?? "",
  audience: process.env.ASGARDEO_API_AUDIENCE ?? "",
  rootOrganizationId: process.env.ASGARDEO_ROOT_ORGANIZATION_ID ?? "",
  callbackUrl:
    process.env.AUTH_CALLBACK_URL ?? "http://localhost:3000/auth/callback",
  uiUrl: process.env.APP_UI_URL ?? "http://localhost:3000/auth/me",
  postLogoutUrl:
    process.env.AUTH_POST_LOGOUT_URL ?? "http://localhost:3000/auth/me",
  scopes: (
    process.env.ASGARDEO_SCOPES ??
    "openid profile email apps:read deployments:read builds:read logs:read incidents:read rca:read rca:chat:read"
  )
    .split(/\s+/)
    .filter(Boolean),
  allowedOrigins: (process.env.APP_UI_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  cookieSecure:
    process.env.AUTH_COOKIE_SECURE !== undefined
      ? process.env.AUTH_COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
  idleMinutes: Number(process.env.AUTH_SESSION_IDLE_MINUTES ?? 30),
  absoluteHours: Number(process.env.AUTH_SESSION_ABSOLUTE_HOURS ?? 8),
  encryptionKey: process.env.AUTH_SESSION_ENCRYPTION_KEY ?? "",
  encryptionKeyVersion: process.env.AUTH_SESSION_KEY_VERSION ?? "v1",
  bootstrapOrganizationId: process.env.AUTH_BOOTSTRAP_ORGANIZATION_ID ?? "",
}));
