import { Controller, Get, Param, Post } from '@nestjs/common';
import { EvidenceService } from './evidence.service';

@Controller()
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  // Collects a live RCA-ready evidence bundle without storing it.
  @Get('deployments/:id/evidence')
  collectLive(@Param('id') id: string) {
    return this.evidenceService.collectLive(id);
  }

  // Collects live evidence and stores it as a Postgres snapshot.
  @Post('deployments/:id/evidence/snapshots')
  createSnapshot(@Param('id') id: string) {
    return this.evidenceService.createSnapshot(id);
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
