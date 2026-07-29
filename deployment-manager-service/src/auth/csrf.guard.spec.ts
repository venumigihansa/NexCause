import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { CryptoService } from "./crypto.service";
import { CsrfGuard } from "./csrf.guard";

describe("CsrfGuard", () => {
  const crypto = new CryptoService(new ConfigService());
  const guard = new CsrfGuard(
    {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector,
    new ConfigService({
      auth: { allowedOrigins: ["https://ui.example.com"] },
    }),
    crypto,
  );

  it("accepts the session CSRF token from an exact allowed origin", () => {
    expect(
      guard.canActivate(
        context("csrf-value", "csrf-value", "https://ui.example.com"),
      ),
    ).toBe(true);
  });

  it("rejects a valid token from a different origin", () => {
    expect(() =>
      guard.canActivate(
        context("csrf-value", "csrf-value", "https://evil.example.com"),
      ),
    ).toThrow(ForbiddenException);
  });
});

function context(
  storedToken: string,
  submittedToken: string,
  origin: string,
): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        header: (name: string) =>
          name === "x-csrf-token" ? submittedToken : origin,
        principal: { csrfToken: storedToken },
      }),
    }),
  } as unknown as ExecutionContext;
}
