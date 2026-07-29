import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

export interface TenantExecutionContext {
  workspaceId: string;
  userId?: string;
  organizationId?: string;
  roles?: string[];
  scopes?: string[];
  transactionActive?: boolean;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantExecutionContext>();

  enter(context: TenantExecutionContext): void {
    this.storage.enterWith(context);
  }

  run<T>(context: TenantExecutionContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  current(): TenantExecutionContext | undefined {
    return this.storage.getStore();
  }

  requireWorkspaceId(): string {
    const workspaceId = this.current()?.workspaceId;
    if (!workspaceId) {
      throw new UnauthorizedException("A workspace context is required");
    }
    return workspaceId;
  }
}
