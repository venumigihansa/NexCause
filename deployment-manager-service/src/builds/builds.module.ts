import { Module } from "@nestjs/common";
import { AppsModule } from "../apps/apps.module";
import { KubernetesModule } from "../kubernetes/kubernetes.module";
import { BuildsController } from "./builds.controller";
import { BuildsService } from "./builds.service";

@Module({
  imports: [AppsModule, KubernetesModule],
  controllers: [BuildsController],
  providers: [BuildsService],
})
export class BuildsModule {}
