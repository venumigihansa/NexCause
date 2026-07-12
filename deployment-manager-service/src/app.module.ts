import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import appConfig from "./config/app.config";
import databaseConfig from "./config/database.config";
import kubernetesConfig from "./config/kubernetes.config";
import observabilityConfig from "./config/observability.config";
import rcaConfig from "./config/rca.config";
import registryConfig from "./config/registry.config";
import { AppsModule } from "./apps/apps.module";
import { BuildsModule } from "./builds/builds.module";
import { ConfigsModule } from "./configs/configs.module";
import { DatabaseModule } from "./database/database.module";
import { DeploymentsModule } from "./deployments/deployments.module";
import { EvidenceModule } from "./evidence/evidence.module";
import { HealthModule } from "./health/health.module";
import { IncidentsModule } from "./incidents/incidents.module";
import { KubernetesModule } from "./kubernetes/kubernetes.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RcaModule } from "./rca/rca.module";
import { RegistryModule } from "./registry/registry.module";
import { RuntimeModule } from "./runtime/runtime.module";
import { SourceControlModule } from "./source-control/source-control.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        kubernetesConfig,
        observabilityConfig,
        rcaConfig,
        registryConfig,
      ],
    }),
    DatabaseModule,
    HealthModule,
    KubernetesModule,
    AppsModule,
    DeploymentsModule,
    EvidenceModule,
    IncidentsModule,
    ConfigsModule,
    BuildsModule,
    RcaModule,
    RegistryModule,
    SourceControlModule,
    RuntimeModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
