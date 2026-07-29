import { Module } from "@nestjs/common";
import { AppsModule } from "../apps/apps.module";
import { KubernetesModule } from "../kubernetes/kubernetes.module";
import { ObservabilityModule } from "../observability/observability.module";
import { DeploymentsController } from "./deployments.controller";
import { DeploymentsService } from "./deployments.service";

@Module({
  imports: [AppsModule, KubernetesModule, ObservabilityModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
})
export class DeploymentsModule {}
