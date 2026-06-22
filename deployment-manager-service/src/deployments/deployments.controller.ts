import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsService } from './deployments.service';

@Controller()
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  // Starts a new Kubernetes deployment for an existing app.
  @Post('apps/:appId/deployments')
  create(
    @Param('appId') appId: string,
    @Body() createDeploymentDto: CreateDeploymentDto,
  ) {
    return this.deploymentsService.create(appId, createDeploymentDto);
  }

  // Lists all deployment records that belong to one app.
  @Get('apps/:appId/deployments')
  findByApp(@Param('appId') appId: string) {
    return this.deploymentsService.findByApp(appId);
  }

  // Reads live Kubernetes readiness information for one deployment.
  @Get('deployments/:id/status')
  getStatus(@Param('id') id: string) {
    return this.deploymentsService.getStatus(id);
  }

  // Returns logs from pods created for one deployment.
  @Get('deployments/:id/logs')
  getLogs(@Param('id') id: string) {
    return this.deploymentsService.getLogs(id);
  }

  // Deletes Kubernetes resources for one deployment and marks it deleted.
  @Delete('deployments/:id')
  delete(@Param('id') id: string) {
    return this.deploymentsService.delete(id);
  }
}
