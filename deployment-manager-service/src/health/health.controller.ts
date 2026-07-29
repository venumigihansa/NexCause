import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Public } from "../auth/public.decorator";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("healthz")
  @Public()
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("readyz")
  @Public()
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
