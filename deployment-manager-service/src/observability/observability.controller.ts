import { Controller, Get, Param, Query } from '@nestjs/common';
import { ObservabilityService } from './observability.service';

@Controller()
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  // Shows the observability settings the backend injects into app deployments.
  @Get('observability/config')
  getConfig() {
    return this.observabilityService.getPublicConfig();
  }

  // Returns the newest stored Kubernetes health sample for one deployment.
  @Get('deployments/:id/health-samples/latest')
  getLatestHealthSample(@Param('id') id: string) {
    return this.observabilityService.getLatestHealthSample(id);
  }

  // Returns stored Kubernetes health samples for one deployment.
  @Get('deployments/:id/health-samples')
  listHealthSamples(
    @Param('id') id: string,
    @Query('sinceMinutes') sinceMinutes?: string,
  ) {
    return this.observabilityService.listHealthSamples(
      id,
      parseOptionalPositiveInt(sinceMinutes),
    );
  }
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}
