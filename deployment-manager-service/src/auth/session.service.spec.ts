import { ConfigService } from "@nestjs/config";
import { CryptoService } from "./crypto.service";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  const config = new ConfigService({
    auth: { idleMinutes: 30, absoluteHours: 8 },
  });
  const crypto = new CryptoService(config);

  it("stores only the opaque cookie hash", async () => {
    const prisma = prismaMock();
    const service = new SessionService(prisma as never, crypto, config);

    const result = await service.createSession(sessionInput());
    const data = prisma.authSession.create.mock.calls[0][0].data;

    expect(data.idHash).not.toBe(result.sessionToken);
    expect(crypto.equalHash(result.sessionToken, data.idHash)).toBe(true);
  });

  it("creates the replacement and deletes the previous session atomically", async () => {
    const prisma = prismaMock();
    const service = new SessionService(prisma as never, crypto, config);

    await service.createSession({
      ...sessionInput(),
      replaceSessionIdHash: "old-session-hash",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { idHash: "old-session-hash" },
    });
  });
});

function sessionInput() {
  return {
    userId: "user-a",
    workspaceId: "workspace-a",
    organizationId: "organization-a",
    roles: ["Viewer"],
    scopes: ["deployments:read"],
  };
}

function prismaMock() {
  const create = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  return {
    authSession: { create, deleteMany },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}
