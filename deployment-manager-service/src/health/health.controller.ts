import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("healthz")
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("readyz")
  async readiness(): Promise<{
    status: "ready";
    database: "connected";
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", database: "connected" };
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        database: "unavailable",
      });
    }
  }
}
