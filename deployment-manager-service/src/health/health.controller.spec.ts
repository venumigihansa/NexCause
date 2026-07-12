import { ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  const queryRaw = jest.fn();
  const controller = new HealthController({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

  beforeEach(() => queryRaw.mockReset());

  it("reports liveness without querying the database", () => {
    expect(controller.health()).toEqual({ status: "ok" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("reports readiness when the database responds", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(controller.readiness()).resolves.toEqual({
      status: "ready",
      database: "connected",
    });
  });

  it("returns a sanitized service-unavailable response", async () => {
    queryRaw.mockRejectedValue(new Error("credential-bearing database error"));

    await expect(controller.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.readiness()).rejects.toMatchObject({
      response: {
        status: "not_ready",
        database: "unavailable",
      },
    });
  });
});
