import { Controller, Get, Param, Query } from "@nestjs/common";
import { RequirePermissions } from "../auth/permissions.decorator";
import {
  LogsTelemetryQueryDto,
  MetricsTelemetryQueryDto,
  TelemetryWindowQueryDto,
  TracesTelemetryQueryDto,
} from "./dto/telemetry-query.dto";
import { TelemetryService } from "./telemetry.service";

@Controller("apps/:appId/deployments/:deploymentId/telemetry")
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get("overview")
  @RequirePermissions("deployments:read")
  getOverview(
    @Param("appId") appId: string,
    @Param("deploymentId") deploymentId: string,
  ): Promise<unknown> {
    return this.telemetryService.getOverview(appId, deploymentId);
  }

  @Get("metrics")
  @RequirePermissions("deployments:read")
  getMetrics(
    @Param("appId") appId: string,
    @Param("deploymentId") deploymentId: string,
    @Query() query: MetricsTelemetryQueryDto,
  ): Promise<unknown> {
    return this.telemetryService.getMetrics(appId, deploymentId, query);
  }

  @Get("logs")
  @RequirePermissions("logs:read")
  getLogs(
    @Param("appId") appId: string,
    @Param("deploymentId") deploymentId: string,
    @Query() query: LogsTelemetryQueryDto,
  ): Promise<unknown> {
    return this.telemetryService.getLogs(appId, deploymentId, query);
  }

  @Get("traces")
  @RequirePermissions("deployments:read")
  getTraces(
    @Param("appId") appId: string,
    @Param("deploymentId") deploymentId: string,
    @Query() query: TracesTelemetryQueryDto,
  ): Promise<unknown> {
    return this.telemetryService.getTraces(appId, deploymentId, query);
  }

  @Get("kubernetes")
  @RequirePermissions("deployments:read")
  getKubernetes(
    @Param("appId") appId: string,
    @Param("deploymentId") deploymentId: string,
    @Query() query: TelemetryWindowQueryDto,
  ): Promise<unknown> {
    return this.telemetryService.getKubernetes(appId, deploymentId, query);
  }
}
