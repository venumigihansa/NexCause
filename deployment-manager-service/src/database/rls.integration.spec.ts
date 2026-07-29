import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const describeDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "true"
    ? describe
    : describe.skip;

describeDatabase("PostgreSQL workspace RLS", () => {
  const prisma = new PrismaClient();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const appId = randomUUID();

  beforeAll(async () => {
    await prisma.workspace.createMany({
      data: [
        {
          id: workspaceA,
          asgardeoOrganizationId: `test-${workspaceA}`,
          displayName: "RLS workspace A",
          kubernetesNamespace: `rca-w-${workspaceA.slice(0, 16)}`,
        },
        {
          id: workspaceB,
          asgardeoOrganizationId: `test-${workspaceB}`,
          displayName: "RLS workspace B",
          kubernetesNamespace: `rca-w-${workspaceB.slice(0, 16)}`,
        },
      ],
    });
    await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceA}, true)`,
      prisma.app.create({
        data: {
          id: appId,
          name: `rls-${appId}`,
          displayName: "RLS test app",
        },
      }),
    ]);
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceA}, true)`,
      prisma.app.deleteMany({ where: { id: appId } }),
    ]);
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceA, workspaceB] } },
    });
    await prisma.$disconnect();
  });

  it("hides another workspace's rows and rejects cross-tenant writes", async () => {
    const [, rows] = await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceB}, true)`,
      prisma.app.findMany({ where: { id: appId } }),
    ]);
    expect(rows).toEqual([]);

    await expect(
      prisma.$transaction([
        prisma.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceB}, true)`,
        prisma.app.create({
          data: {
            workspaceId: workspaceA,
            name: `forbidden-${appId}`,
            displayName: "Forbidden cross-tenant app",
          },
        }),
      ]),
    ).rejects.toThrow();
  });

  it("does not retain transaction-local context on a pooled connection", async () => {
    const rowsWithoutContext = await prisma.app.findMany({
      where: { id: appId },
    });
    expect(rowsWithoutContext).toEqual([]);
  });
});
