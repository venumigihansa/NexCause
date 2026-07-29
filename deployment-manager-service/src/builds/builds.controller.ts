import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { BuildsService } from "./builds.service";
import { CreateBuildDto } from "./dto/create-build.dto";
import { RequirePermissions } from "../auth/permissions.decorator";

@Controller()
export class BuildsController {
  constructor(private readonly buildsService: BuildsService) {}

  // Starts an in-cluster Dockerfile build for a git-backed app.
  @Post("apps/:appId/builds")
  @RequirePermissions("builds:start")
  create(
    @Param("appId") appId: string,
    @Body() createBuildDto: CreateBuildDto,
  ) {
    return this.buildsService.create(appId, createBuildDto ?? {});
  }

  // Lists build records that belong to one app.
  @Get("apps/:appId/builds")
  @RequirePermissions("builds:read")
  findByApp(@Param("appId") appId: string) {
    return this.buildsService.findByApp(appId);
  }

  // Returns one stored build record.
  @Get("builds/:id")
  @RequirePermissions("builds:read")
  findOne(@Param("id") id: string) {
    return this.buildsService.findOneOrThrow(id);
  }

  // Reads live Kubernetes Job state and updates the stored build status.
  @Get("builds/:id/status")
  @RequirePermissions("builds:read")
  getStatus(@Param("id") id: string) {
    return this.buildsService.getStatus(id);
  }

  // Returns logs from pods created by the build Job.
  @Get("builds/:id/logs")
  @RequirePermissions("logs:read")
  getLogs(@Param("id") id: string) {
    return this.buildsService.getLogs(id);
  }
}
