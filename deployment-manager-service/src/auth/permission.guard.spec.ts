import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionGuard } from "./permission.guard";

describe("PermissionGuard", () => {
  it("allows a principal with every required permission", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["deployments:write"]),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector, prismaMock());

    return expect(
      guard.canActivate(contextWithScopes(["deployments:write"])),
    ).resolves.toBe(true);
  });

  it("rejects a principal without a required permission", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["deployments:delete"]),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector, prismaMock());

    await expect(
      guard.canActivate(contextWithScopes(["deployments:read"])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function contextWithScopes(scopes: string[]): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        path: "/deployments",
        principal: {
          scopes,
          userId: "user-1",
          workspaceId: "workspace-1",
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

function prismaMock() {
  return {
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  } as never;
}
