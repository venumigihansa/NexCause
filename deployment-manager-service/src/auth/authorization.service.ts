import { ForbiddenException, Injectable } from "@nestjs/common";
import { TenantContextService } from "../database/tenant-context.service";

@Injectable()
export class AuthorizationService {
  constructor(private readonly tenantContext: TenantContextService) {}

  requirePermissions(...permissions: string[]): void {
    const granted = this.tenantContext.current()?.scopes ?? [];
    if (!permissions.every((permission) => granted.includes(permission))) {
      throw new ForbiddenException("The required permission is missing");
    }
  }
}
