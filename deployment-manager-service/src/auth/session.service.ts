import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthSession, IdentityUser, Workspace } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CryptoService } from "./crypto.service";
import type { AuthPrincipal } from "./auth.types";

type SessionWithRelations = AuthSession & {
  user: IdentityUser;
  workspace: Workspace;
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async createLoginAttempt(input: {
    state: string;
    nonce: string;
    codeVerifier: string;
    returnTo?: string;
  }): Promise<void> {
    await this.prisma.authLoginAttempt.create({
      data: {
        stateHash: this.crypto.hash(input.state),
        nonce: input.nonce,
        codeVerifierEncrypted: this.crypto.encrypt(input.codeVerifier),
        returnTo: input.returnTo,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  }

  async consumeLoginAttempt(state: string) {
    const stateHash = this.crypto.hash(state);
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.authLoginAttempt.findUnique({
        where: { stateHash },
      });
      if (!attempt || attempt.expiresAt <= new Date()) {
        if (attempt) {
          await tx.authLoginAttempt.delete({ where: { stateHash } });
        }
        return null;
      }
      await tx.authLoginAttempt.delete({ where: { stateHash } });
      return {
        nonce: attempt.nonce,
        codeVerifier: this.crypto.decrypt(attempt.codeVerifierEncrypted),
        returnTo: attempt.returnTo,
      };
    });
  }

  async createSession(input: {
    userId: string;
    workspaceId: string;
    organizationId: string;
    roles: string[];
    scopes: string[];
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accessTokenExpiresAt?: Date;
    replaceSessionIdHash?: string;
  }): Promise<{ sessionToken: string; csrfToken: string }> {
    const sessionToken = this.crypto.randomToken();
    const csrfToken = this.crypto.randomToken();
    const now = Date.now();
    const data = {
      idHash: this.crypto.hash(sessionToken),
      userId: input.userId,
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      roles: input.roles,
      scopes: input.scopes,
      csrfToken,
      accessTokenEncrypted: input.accessToken
        ? this.crypto.encrypt(input.accessToken)
        : undefined,
      refreshTokenEncrypted: input.refreshToken
        ? this.crypto.encrypt(input.refreshToken)
        : undefined,
      idTokenEncrypted: input.idToken
        ? this.crypto.encrypt(input.idToken)
        : undefined,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      idleExpiresAt: new Date(now + this.idleMs()),
      absoluteExpiresAt: new Date(now + this.absoluteMs()),
    };
    if (input.replaceSessionIdHash) {
      await this.prisma.$transaction([
        this.prisma.authSession.create({ data }),
        this.prisma.authSession.deleteMany({
          where: { idHash: input.replaceSessionIdHash },
        }),
      ]);
    } else {
      await this.prisma.authSession.create({ data });
    }
    return { sessionToken, csrfToken };
  }

  async authenticate(sessionToken: string): Promise<AuthPrincipal | null> {
    const idHash = this.crypto.hash(sessionToken);
    const session = await this.prisma.authSession.findUnique({
      where: { idHash },
      include: { user: true, workspace: true },
    });
    if (
      !session ||
      session.idleExpiresAt <= new Date() ||
      session.absoluteExpiresAt <= new Date() ||
      session.workspace.status !== "active"
    ) {
      if (session) {
        await this.prisma.authSession.delete({ where: { idHash } });
      }
      return null;
    }
    await this.prisma.authSession.update({
      where: { idHash },
      data: {
        lastSeenAt: new Date(),
        idleExpiresAt: new Date(
          Math.min(
            Date.now() + this.idleMs(),
            session.absoluteExpiresAt.getTime(),
          ),
        ),
      },
    });
    return this.toPrincipal(session);
  }

  async getStored(sessionIdHash: string): Promise<SessionWithRelations | null> {
    return this.prisma.authSession.findUnique({
      where: { idHash: sessionIdHash },
      include: { user: true, workspace: true },
    });
  }

  decryptAccessToken(session: AuthSession): string | null {
    return session.accessTokenEncrypted
      ? this.crypto.decrypt(session.accessTokenEncrypted)
      : null;
  }

  decryptIdToken(session: AuthSession): string | null {
    return session.idTokenEncrypted
      ? this.crypto.decrypt(session.idTokenEncrypted)
      : null;
  }

  decryptRefreshToken(session: AuthSession): string | null {
    return session.refreshTokenEncrypted
      ? this.crypto.decrypt(session.refreshTokenEncrypted)
      : null;
  }

  async updateTokens(
    idHash: string,
    input: {
      accessToken?: string;
      refreshToken?: string;
      idToken?: string;
      expiresAt?: Date;
    },
  ): Promise<void> {
    await this.prisma.authSession.update({
      where: { idHash },
      data: {
        accessTokenEncrypted: input.accessToken
          ? this.crypto.encrypt(input.accessToken)
          : undefined,
        refreshTokenEncrypted: input.refreshToken
          ? this.crypto.encrypt(input.refreshToken)
          : undefined,
        idTokenEncrypted: input.idToken
          ? this.crypto.encrypt(input.idToken)
          : undefined,
        accessTokenExpiresAt: input.expiresAt,
      },
    });
  }

  async destroy(sessionIdHash: string): Promise<void> {
    await this.prisma.authSession.deleteMany({
      where: { idHash: sessionIdHash },
    });
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    const [attempts, sessions] = await this.prisma.$transaction([
      this.prisma.authLoginAttempt.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      this.prisma.authSession.deleteMany({
        where: {
          OR: [
            { idleExpiresAt: { lte: now } },
            { absoluteExpiresAt: { lte: now } },
          ],
        },
      }),
    ]);
    return attempts.count + sessions.count;
  }

  cookieMaxAge(): number {
    return this.absoluteMs();
  }

  private toPrincipal(session: SessionWithRelations): AuthPrincipal {
    return {
      userId: session.userId,
      subject: session.user.subject,
      workspaceId: session.workspaceId,
      organizationId: session.organizationId,
      sessionIdHash: session.idHash,
      roles: session.roles,
      scopes: session.scopes,
      csrfToken: session.csrfToken,
    };
  }

  private idleMs(): number {
    return (this.config.get<number>("auth.idleMinutes") ?? 30) * 60_000;
  }

  private absoluteMs(): number {
    return (this.config.get<number>("auth.absoluteHours") ?? 8) * 3_600_000;
  }
}
