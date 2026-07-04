import { Controller, Get, Param, Post } from '@nestjs/common';
import { RcaService } from './rca.service';

@Controller()
export class RcaController {
  constructor(private readonly rcaService: RcaService) {}

  // Starts an RCA run for an existing incident.
  @Post('incidents/:id/rca-runs')
  startForIncident(@Param('id') incidentId: string) {
    return this.rcaService.startForIncident(incidentId, 'manual');
  }

  // Lists RCA runs for one incident.
  @Get('incidents/:id/rca-runs')
  findByIncident(@Param('id') incidentId: string) {
    return this.rcaService.findByIncident(incidentId);
  }

  // Starts RCA directly for a deployment by creating a manual incident first.
  @Post('deployments/:id/rca-runs')
  startForDeployment(@Param('id') deploymentId: string) {
    return this.rcaService.startForDeployment(deploymentId);
  }

  // Returns one RCA run with its evidence snapshot.
  @Get('rca-runs/:id')
  findOne(@Param('id') id: string) {
    return this.rcaService.findOne(id);
  }

  // Shows RCA orchestration config.
  @Get('rca/config')
  getConfig() {
    return this.rcaService.getConfig();
  }
}
