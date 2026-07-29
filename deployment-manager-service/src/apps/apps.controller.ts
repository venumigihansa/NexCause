import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateAppDto } from "./dto/create-app.dto";
import { AppsService } from "./apps.service";
import { RequirePermissions } from "../auth/permissions.decorator";

@Controller("apps")
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Post()
  @RequirePermissions("apps:create")
  create(@Body() createAppDto: CreateAppDto) {
    return this.appsService.create(createAppDto);
  }

  @Get()
  @RequirePermissions("apps:read")
  findAll() {
    return this.appsService.findAll();
  }

  @Get(":id")
  @RequirePermissions("apps:read")
  findOne(@Param("id") id: string) {
    return this.appsService.findOneOrThrow(id);
  }
}
