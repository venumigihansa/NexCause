import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import { RcaService } from "./rca.service";
import { RequirePermissions } from "../auth/permissions.decorator";

class RcaChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}

@Controller()
export class RcaController {
  constructor(private readonly rcaService: RcaService) {}

  // Starts an RCA run for an existing incident.
  @Post("incidents/:id/rca-runs")
  @RequirePermissions("rca:run")
  startForIncident(@Param("id") incidentId: string) {
    return this.rcaService.startForIncident(incidentId, "manual");
  }

  // Lists RCA runs for one incident.
  @Get("incidents/:id/rca-runs")
  @RequirePermissions("rca:read")
  findByIncident(@Param("id") incidentId: string) {
    return this.rcaService.findByIncident(incidentId);
  }

  // Starts RCA directly for a deployment by creating a manual incident first.
  @Post("deployments/:id/rca-runs")
  @RequirePermissions("rca:run")
  startForDeployment(@Param("id") deploymentId: string) {
    return this.rcaService.startForDeployment(deploymentId);
  }

  // Returns one RCA run with its evidence snapshot.
  @Get("rca-runs/:id")
  @RequirePermissions("rca:read")
  findOne(@Param("id") id: string) {
    return this.rcaService.findOne(id);
  }

  @Get("rca-runs/:id/chat")
  @RequirePermissions("rca:chat:read")
  listChat(@Param("id") id: string) {
    return this.rcaService.listChat(id);
  }

  @Post("rca-runs/:id/chat")
  @RequirePermissions("rca:chat:write")
  chat(@Param("id") id: string, @Body() body: RcaChatDto) {
    return this.rcaService.chat(id, body.message);
  }

  // Shows RCA orchestration config.
  @Get("rca/config")
  @RequirePermissions("rca:read")
  getConfig() {
    return this.rcaService.getConfig();
  }
}
