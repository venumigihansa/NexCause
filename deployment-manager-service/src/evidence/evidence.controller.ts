import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EvidenceService } from './evidence.service';

@Controller()
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  // Collects a live RCA-ready evidence bundle without storing it.
  @Get('deployments/:id/evidence')
  collectLive(
    @Param('id') id: string,
    @Query('triggeredAt') triggeredAt?: string,
    @Query('lookbackMinutes') lookbackMinutes?: string,
    @Query('lookaheadMinutes') lookaheadMinutes?: string,
  ) {
    return this.evidenceService.collectLive(
      id,
      buildEvidenceWindowOptions(triggeredAt, lookbackMinutes, lookaheadMinutes),
    );
  }

  // Collects live evidence and stores it as a Postgres snapshot.
  @Post('deployments/:id/evidence/snapshots')
  createSnapshot(
    @Param('id') id: string,
    @Query('triggeredAt') triggeredAt?: string,
    @Query('lookbackMinutes') lookbackMinutes?: string,
    @Query('lookaheadMinutes') lookaheadMinutes?: string,
  ) {
    return this.evidenceService.createSnapshot(
      id,
      buildEvidenceWindowOptions(triggeredAt, lookbackMinutes, lookaheadMinutes),
    );
  }

  // Lists stored evidence snapshots for one deployment.
  @Get('deployments/:id/evidence/snapshots')
  listSnapshots(@Param('id') id: string) {
    return this.evidenceService.listSnapshots(id);
  }

  // Returns one full stored evidence snapshot.
  @Get('evidence/snapshots/:id')
  getSnapshot(@Param('id') id: string) {
    return this.evidenceService.getSnapshot(id);
  }
}

function buildEvidenceWindowOptions(
  triggeredAt: string | undefined,
  lookbackMinutes: string | undefined,
  lookaheadMinutes: string | undefined,
) {
  return {
    triggeredAt: parseOptionalDate(triggeredAt),
    lookbackMinutes: parseOptionalPositiveInt(lookbackMinutes),
    lookaheadMinutes: parseOptionalPositiveInt(lookaheadMinutes),
  };
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}
