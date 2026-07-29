import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RcaModule } from "../rca/rca.module";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";

@Module({
  imports: [DatabaseModule, RcaModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
