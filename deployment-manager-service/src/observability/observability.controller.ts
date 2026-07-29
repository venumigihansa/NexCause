import { Controller, Get, Param, Query } from "@nestjs/common";
import { ObservabilityService } from "./observability.service";
import { RequirePermissions } from "../auth/permissions.decorator";

@Controller()
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  // Shows the observability settings the backend injects into app deployments.
  @Get("observability/config")
  @RequirePermissions("deployments:read")
  getConfig() {
    return this.observabilityService.getPublicConfig();
  }

  // Returns the newest stored Kubernetes health sample for one deployment.
  @Get("deployments/:id/health-samples/latest")
  @RequirePermissions("deployments:read")
  getLatestHealthSample(@Param("id") id: string) {
    return this.observabilityService.getLatestHealthSample(id);
  }

  // Returns stored Kubernetes health samples for one deployment.
  @Get("deployments/:id/health-samples")
  @RequirePermissions("deployments:read")
  listHealthSamples(
    @Param("id") id: string,
    @Query("sinceMinutes") sinceMinutes?: string,
  ) {
    return this.observabilityService.listHealthSamples(
      id,
      parseOptionalPositiveInt(sinceMinutes),
    );
  }
}

function parseOptionalPositiveInt(
  value: string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}
