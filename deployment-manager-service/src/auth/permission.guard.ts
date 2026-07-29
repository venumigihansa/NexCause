import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "./auth.types";
import { REQUIRED_PERMISSIONS_KEY } from "./permissions.decorator";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (!required.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!required.every((scope) => request.principal.scopes.includes(scope))) {
      await this.prisma.auditEvent
        .create({
          data: {
            actorUserId: request.principal.userId,
            workspaceId: request.principal.workspaceId,
            action: `${request.method} ${request.path}`,
            outcome: "forbidden",
            metadata: { requiredPermissions: required },
          },
        })
        .catch(() => undefined);
      throw new ForbiddenException("The required permission is missing");
    }
    return true;
  }
}
