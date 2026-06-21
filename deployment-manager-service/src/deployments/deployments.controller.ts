import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsService } from './deployments.service';

@Controller()
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post('apps/:appId/deployments')
  create(
    @Param('appId') appId: string,
    @Body() createDeploymentDto: CreateDeploymentDto,
  ) {
    return this.deploymentsService.create(appId, createDeploymentDto);
  }

  @Get('apps/:appId/deployments')
  findByApp(@Param('appId') appId: string) {
    return this.deploymentsService.findByApp(appId);
  }

  @Get('deployments/:id/status')
  getStatus(@Param('id') id: string) {
    return this.deploymentsService.getStatus(id);
  }

  @Get('deployments/:id/logs')
  getLogs(@Param('id') id: string) {
    return this.deploymentsService.getLogs(id);
  }

  @Delete('deployments/:id')
  delete(@Param('id') id: string) {
    return this.deploymentsService.delete(id);
  }
}
