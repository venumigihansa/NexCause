import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../database/prisma.service";
import type { VerifiedIdentity } from "./auth.types";

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async resolveIdentity(identity: VerifiedIdentity) {
    const rootOrganizationId =
      this.config.get<string>("auth.rootOrganizationId") ?? "";
    if (!rootOrganizationId) {
      throw new InternalServerErrorException(
        "ASGARDEO_ROOT_ORGANIZATION_ID must be configured",
      );
    }
    if (rootOrganizationId && identity.organizationId === rootOrganizationId) {
      throw new ForbiddenException(
        "Root organization users cannot use a customer workspace",
      );
    }
    if (!identity.organizationId || !identity.subject) {
      throw new UnauthorizedException(
        "The organization-scoped identity is incomplete",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const bootstrapOrganizationId =
        this.config.get<string>("auth.bootstrapOrganizationId") ?? "";
      if (bootstrapOrganizationId === identity.organizationId) {
        const legacy = await tx.workspace.findUnique({
          where: { id: "legacy-workspace" },
        });
        if (
          legacy &&
          legacy.asgardeoOrganizationId === "legacy-bootstrap-required"
        ) {
          await tx.workspace.update({
            where: { id: legacy.id },
            data: {
              asgardeoOrganizationId: identity.organizationId,
              displayName: identity.organizationName,
            },
          });
        }
      }

      const newWorkspaceId = randomUUID();
      const workspace = await tx.workspace.upsert({
        where: { asgardeoOrganizationId: identity.organizationId },
        create: {
          id: newWorkspaceId,
          asgardeoOrganizationId: identity.organizationId,
          displayName: identity.organizationName,
          kubernetesNamespace: this.namespaceFor(newWorkspaceId),
        },
        update: { displayName: identity.organizationName },
      });
      if (workspace.status !== "active") {
        throw new ForbiddenException("The workspace is not active");
      }

      const user = await tx.identityUser.upsert({
        where: { subject: identity.subject },
        create: {
          subject: identity.subject,
          email: identity.email,
          displayName: identity.displayName,
        },
        update: {
          email: identity.email,
          displayName: identity.displayName,
        },
      });
      await tx.workspaceMembership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: user.id,
          },
        },
        create: {
          workspaceId: workspace.id,
          userId: user.id,
          roles: identity.roles,
          scopes: identity.scopes,
        },
        update: {
          roles: identity.roles,
          scopes: identity.scopes,
          lastSeenAt: new Date(),
        },
      });
      return { workspace, user };
    });
  }

  private namespaceFor(workspaceId: string): string {
    const suffix = createHash("sha256")
      .update(workspaceId)
      .digest("hex")
      .slice(0, 16);
    return `rca-w-${suffix}`;
  }
}
