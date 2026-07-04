import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentsService } from './incidents.service';

@Controller()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  // Lists incidents, optionally filtered by status.
  @Get('incidents')
  findAll(@Query('status') status?: IncidentStatus) {
    return this.incidentsService.findAll(status);
  }

  // Returns one incident with its RCA runs and deployment context.
  @Get('incidents/:id')
  findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  // Manually opens an incident for one deployment.
  @Post('deployments/:id/incidents')
  createForDeployment(
    @Param('id') deploymentId: string,
    @Body() createIncidentDto: CreateIncidentDto,
  ) {
    return this.incidentsService.createManualIncident(
      deploymentId,
      createIncidentDto,
    );
  }

  // Resolves an open incident.
  @Post('incidents/:id/resolve')
  resolve(@Param('id') id: string) {
    return this.incidentsService.resolve(id);
  }
}
