import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RcaController } from "./rca.controller";
import { RcaService } from "./rca.service";

@Module({
  imports: [DatabaseModule],
  controllers: [RcaController],
  providers: [RcaService],
  exports: [RcaService],
})
export class RcaModule {}
