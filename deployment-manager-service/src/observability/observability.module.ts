import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KubernetesModule } from "../kubernetes/kubernetes.module";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";

@Module({
  imports: [DatabaseModule, KubernetesModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
