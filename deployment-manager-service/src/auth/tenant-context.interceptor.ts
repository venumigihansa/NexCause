import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { TenantContextService } from "../database/tenant-context.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      return next.handle();
    }
    const principal = request.principal;
    return new Observable((subscriber) =>
      this.tenantContext.run(
        {
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          organizationId: principal.organizationId,
          roles: principal.roles,
          scopes: principal.scopes,
        },
        () => next.handle().subscribe(subscriber),
      ),
    );
  }
}
