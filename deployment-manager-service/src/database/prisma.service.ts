import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { TenantContextService } from "./tenant-context.service";

const TENANT_MODELS = new Set([
  "App",
  "Deployment",
  "DeploymentHealthSample",
  "Incident",
  "RcaRun",
  "RcaRunEvent",
  "RcaAgentThread",
  "RcaChatMessage",
  "EvidenceSnapshot",
  "RuntimeConfig",
  "Build",
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(tenantContext: TenantContextService) {
    super();
    const base = this;
    return base.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, args, query }) {
            const workspaceId = tenantContext.current()?.workspaceId;
            if (tenantContext.current()?.transactionActive) {
              return query(args);
            }
            if (!workspaceId || !TENANT_MODELS.has(model)) {
              return query(args);
            }
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
              query(args),
            ]);
            return result;
          },
        },
      },
      client: {
        async withTenantTransaction<T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> {
          const current = tenantContext.current();
          const workspaceId = tenantContext.requireWorkspaceId();
          return base.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
            await tx.$executeRaw`SELECT set_config('statement_timeout', '10000', true)`;
            return tenantContext.run(
              { ...current, workspaceId, transactionActive: true },
              () => callback(tx),
            );
          });
        },
        async onModuleInit() {
          await base.$connect();
        },
        async onModuleDestroy() {
          await base.$disconnect();
        },
      },
    }) as unknown as PrismaService;
  }

  async withTenantTransaction<T>(
    _callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    throw new Error("Tenant transaction extension was not initialized");
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
