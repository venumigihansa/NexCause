import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import type { AuthPrincipal } from "./auth.types";
import { OidcService } from "./oidc.service";
import { SessionService } from "./session.service";
import { WorkspaceService } from "./workspace.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly oidc: OidcService,
    private readonly sessions: SessionService,
    private readonly workspaces: WorkspaceService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async beginLogin(returnTo?: string) {
    const safeReturnTo = this.safeReturnTo(returnTo);
    const request = await this.oidc.authorizationRequest();
    await this.sessions.createLoginAttempt({
      ...request,
      returnTo: safeReturnTo,
    });
    return { redirectUrl: request.url };
  }

  async completeLogin(query: Record<string, string | string[] | undefined>) {
    const state = typeof query.state === "string" ? query.state : "";
    if (!state) {
      throw new BadRequestException("OIDC state is missing");
    }
    const attempt = await this.sessions.consumeLoginAttempt(state);
    if (!attempt) {
      throw new UnauthorizedException(
        "The login attempt is invalid or expired",
      );
    }
    const { identity, tokenSet } = await this.oidc.completeCallback(query, {
      state,
      nonce: attempt.nonce,
      codeVerifier: attempt.codeVerifier,
    });
    const { workspace, user } = await this.workspaces.resolveIdentity(identity);
    const session = await this.sessions.createSession({
      userId: user.id,
      workspaceId: workspace.id,
      organizationId: identity.organizationId,
      roles: identity.roles,
      scopes: identity.scopes,
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      accessTokenExpiresAt: tokenSet.expires_at
        ? new Date(tokenSet.expires_at * 1000)
        : undefined,
    });
    await this.audit(user.id, workspace.id, "auth.login", "success");
    return {
      ...session,
      redirectUrl: this.redirectUrl(attempt.returnTo ?? undefined),
    };
  }

  me(principal: AuthPrincipal) {
    return this.prisma.identityUser
      .findUniqueOrThrow({ where: { id: principal.userId } })
      .then((user) => ({
        user: {
          id: user.id,
          subject: user.subject,
          email: user.email,
          displayName: user.displayName,
        },
        workspace: {
          id: principal.workspaceId,
          organizationId: principal.organizationId,
        },
        roles: principal.roles,
        permissions: principal.scopes,
        csrfToken: principal.csrfToken,
      }));
  }

  async metrics(principal: AuthPrincipal) {
    const now = new Date();
    const stuckBefore = new Date(Date.now() - 30 * 60_000);
    const [
      activeSessions,
      failedLogins,
      forbiddenActions,
      auditOutcomes,
      pendingRuns,
      stuckRuns,
      lastCleanup,
    ] = await Promise.all([
      this.prisma.authSession.count({
        where: {
          workspaceId: principal.workspaceId,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          action: "auth.login",
          outcome: "failure",
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          workspaceId: principal.workspaceId,
          outcome: "forbidden",
        },
      }),
      this.prisma.auditEvent.groupBy({
        by: ["outcome"],
        where: { workspaceId: principal.workspaceId },
        _count: true,
      }),
      this.prisma.rcaRun.count({ where: { status: "pending" } }),
      this.prisma.rcaRun.count({
        where: { status: "running", startedAt: { lt: stuckBefore } },
      }),
      this.prisma.auditEvent.findFirst({
        where: { action: "auth.session_cleanup" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, outcome: true, metadata: true },
      }),
    ]);
    return {
      activeSessions,
      failedLogins,
      forbiddenActions,
      auditOutcomes: Object.fromEntries(
        auditOutcomes.map((item) => [item.outcome, item._count]),
      ),
      pendingRcaRuns: pendingRuns,
      stuckRcaRuns: stuckRuns,
      lastSessionCleanup: lastCleanup,
    };
  }

  async recordFailedLogin(): Promise<void> {
    await this.prisma.auditEvent
      .create({
        data: { action: "auth.login", outcome: "failure" },
      })
      .catch(() => undefined);
  }

  async logout(principal: AuthPrincipal) {
    const stored = await this.sessions.getStored(principal.sessionIdHash);
    if (stored) {
      await this.oidc.revokeTokens({
        accessToken: this.sessions.decryptAccessToken(stored),
        refreshToken: this.sessions.decryptRefreshToken(stored),
      });
    }
    await this.sessions.destroy(principal.sessionIdHash);
    await this.audit(
      principal.userId,
      principal.workspaceId,
      "auth.logout",
      "success",
    );
    return {
      redirectUrl: await this.oidc.logoutUrl(
        stored
          ? (this.sessions.decryptIdToken(stored) ?? undefined)
          : undefined,
      ),
    };
  }

  async switchOrganization(principal: AuthPrincipal, organizationId: string) {
    if (!organizationId) {
      throw new BadRequestException("organizationId is required");
    }
    const stored = await this.sessions.getStored(principal.sessionIdHash);
    if (!stored) {
      throw new UnauthorizedException("The session no longer exists");
    }
    let accessToken = this.sessions.decryptAccessToken(stored);
    if (
      stored.accessTokenExpiresAt &&
      stored.accessTokenExpiresAt.getTime() <= Date.now() + 30_000
    ) {
      const refreshToken = this.sessions.decryptRefreshToken(stored);
      if (!refreshToken) {
        throw new UnauthorizedException(
          "The Asgardeo access token has expired",
        );
      }
      const refreshed = await this.oidc.refresh(refreshToken);
      accessToken = refreshed.access_token ?? null;
      await this.sessions.updateTokens(stored.idHash, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        idToken: refreshed.id_token,
        expiresAt: refreshed.expires_at
          ? new Date(refreshed.expires_at * 1000)
          : undefined,
      });
    }
    if (!accessToken) {
      throw new UnauthorizedException(
        "The session cannot switch organizations",
      );
    }
    const switched = await this.oidc.switchOrganization(
      accessToken,
      organizationId,
      principal.subject,
    );
    const { workspace, user } = await this.workspaces.resolveIdentity(
      switched.identity,
    );
    const next = await this.sessions.createSession({
      userId: user.id,
      workspaceId: workspace.id,
      organizationId,
      roles: switched.identity.roles,
      scopes: switched.identity.scopes,
      accessToken: switched.payload.access_token,
      refreshToken: switched.payload.refresh_token,
      idToken: switched.payload.id_token,
      accessTokenExpiresAt: switched.payload.expires_in
        ? new Date(Date.now() + switched.payload.expires_in * 1000)
        : undefined,
      replaceSessionIdHash: principal.sessionIdHash,
    });
    await this.audit(
      user.id,
      workspace.id,
      "auth.organization_switch",
      "success",
    );
    return next;
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>("auth.cookieSecure") ?? false,
      sameSite: "lax" as const,
      path: "/",
      maxAge: this.sessions.cookieMaxAge(),
    };
  }

  clearCookieOptions() {
    const { maxAge: _, ...options } = this.cookieOptions();
    return options;
  }

  private safeReturnTo(returnTo?: string): string | undefined {
    if (!returnTo) return undefined;
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
      throw new BadRequestException(
        "returnTo must be a relative application path",
      );
    }
    return returnTo;
  }

  private redirectUrl(returnTo?: string): string {
    const configured = this.config.get<string>("auth.uiUrl") ?? "";
    if (!returnTo) return configured;
    return new URL(returnTo, configured).toString();
  }

  private async audit(
    actorUserId: string,
    workspaceId: string,
    action: string,
    outcome: string,
  ) {
    await this.prisma.auditEvent.create({
      data: { actorUserId, workspaceId, action, outcome },
    });
  }
}
