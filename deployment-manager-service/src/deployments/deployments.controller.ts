import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { ScaleDeploymentDto } from "./dto/scale-deployment.dto";
import { StartDeploymentDto } from "./dto/start-deployment.dto";
import { DeploymentsService } from "./deployments.service";
import { RequirePermissions } from "../auth/permissions.decorator";

@Controller()
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  // Starts a new Kubernetes deployment for an existing app.
  @Post("apps/:appId/deployments")
  @RequirePermissions("deployments:write")
  create(
    @Param("appId") appId: string,
    @Body() createDeploymentDto: CreateDeploymentDto,
  ) {
    return this.deploymentsService.create(appId, createDeploymentDto);
  }

  // Lists all deployment records that belong to one app.
  @Get("apps/:appId/deployments")
  @RequirePermissions("deployments:read")
  findByApp(@Param("appId") appId: string) {
    return this.deploymentsService.findByApp(appId);
  }

  // Reads live Kubernetes readiness information for one deployment.
  @Get("deployments/:id/status")
  @RequirePermissions("deployments:read")
  getStatus(@Param("id") id: string) {
    return this.deploymentsService.getStatus(id);
  }

  // Returns logs from pods created for one deployment.
  @Get("deployments/:id/logs")
  @RequirePermissions("logs:read")
  getLogs(@Param("id") id: string) {
    return this.deploymentsService.getLogs(id);
  }

  // Returns current pods selected by one deployment.
  @Get("deployments/:id/pods")
  @RequirePermissions("deployments:read")
  getPods(@Param("id") id: string) {
    return this.deploymentsService.getPods(id);
  }

  // Returns Kubernetes events related to one deployment and its pods.
  @Get("deployments/:id/events")
  @RequirePermissions("deployments:read")
  getEvents(@Param("id") id: string) {
    return this.deploymentsService.getEvents(id);
  }

  // Triggers a rollout restart for one deployment.
  @Post("deployments/:id/restart")
  @RequirePermissions("deployments:write")
  restart(@Param("id") id: string) {
    return this.deploymentsService.restart(id);
  }

  // Changes the desired replica count for one deployment.
  @Post("deployments/:id/scale")
  @RequirePermissions("deployments:write")
  scale(
    @Param("id") id: string,
    @Body() scaleDeploymentDto: ScaleDeploymentDto,
  ) {
    return this.deploymentsService.scale(id, scaleDeploymentDto);
  }

  // Scales one deployment to zero without deleting it.
  @Post("deployments/:id/stop")
  @RequirePermissions("deployments:write")
  stop(@Param("id") id: string) {
    return this.deploymentsService.stop(id);
  }

  // Starts one stopped deployment.
  @Post("deployments/:id/start")
  @RequirePermissions("deployments:write")
  start(
    @Param("id") id: string,
    @Body() startDeploymentDto: StartDeploymentDto,
  ) {
    return this.deploymentsService.start(id, startDeploymentDto ?? {});
  }

  // Deletes Kubernetes resources for one deployment and marks it deleted.
  @Delete("deployments/:id")
  @RequirePermissions("deployments:delete")
  delete(@Param("id") id: string) {
    return this.deploymentsService.delete(id);
  }
}
