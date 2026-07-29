import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import {
  catchError,
  concatMap,
  from,
  map,
  mergeMap,
  of,
  throwError,
} from "rxjs";
import { PrismaService } from "../database/prisma.service";
import type { AuthenticatedRequest } from "./auth.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method) || !request.principal) {
      return next.handle();
    }
    const rawResourceId = request.params?.id ?? request.params?.appId;
    const resourceId =
      typeof rawResourceId === "string" ? rawResourceId : undefined;
    const record = (outcome: string, statusCode?: number) =>
      this.prisma.auditEvent.create({
        data: {
          actorUserId: request.principal.userId,
          workspaceId: request.principal.workspaceId,
          action: `${request.method} ${request.route?.path ?? request.path}`,
          resourceType: context.getClass().name,
          resourceId,
          outcome,
          metadata: statusCode ? { statusCode } : undefined,
        },
      });
    const ignoreAuditFailure = <T>(fallback: T) =>
      catchError(() => {
        this.logger.error("Failed to persist an audit event");
        return of(fallback);
      });

    return next.handle().pipe(
      concatMap((value) =>
        from(record("success")).pipe(
          map(() => value),
          ignoreAuditFailure(value),
        ),
      ),
      catchError((error: { status?: number }) =>
        from(record("failure", error?.status ?? 500)).pipe(
          ignoreAuditFailure(undefined),
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
