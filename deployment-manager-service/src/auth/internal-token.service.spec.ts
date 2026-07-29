import { ConfigService } from "@nestjs/config";
import { jwtVerify } from "jose";
import { InternalTokenService } from "./internal-token.service";

describe("InternalTokenService", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const service = new InternalTokenService(
    new ConfigService({ internalServiceJwtSecret: secret }),
  );

  it("issues short-lived audience and tenant scoped tokens", async () => {
    const token = await service.sign("rca-agent", {
      workspaceId: "workspace-a",
      runId: "run-a",
      incidentId: "incident-a",
    });
    const result = await jwtVerify(token, Buffer.from(secret), {
      issuer: "deployment-manager",
      audience: "rca-agent",
    });

    expect(result.payload.workspaceId).toBe("workspace-a");
    expect(result.payload.runId).toBe("run-a");
    expect((result.payload.exp ?? 0) - (result.payload.iat ?? 0)).toBe(120);
  });

  it("cannot be verified for another audience", async () => {
    const token = await service.sign("rca-agent", {
      workspaceId: "workspace-a",
    });

    await expect(
      jwtVerify(token, Buffer.from(secret), {
        issuer: "deployment-manager",
        audience: "rca-mcp",
      }),
    ).rejects.toThrow();
  });
});
