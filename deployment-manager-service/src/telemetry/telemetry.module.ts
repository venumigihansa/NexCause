import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KubernetesModule } from "../kubernetes/kubernetes.module";
import { LokiTelemetryClient } from "./clients/loki-telemetry.client";
import { PrometheusTelemetryClient } from "./clients/prometheus-telemetry.client";
import { TempoTelemetryClient } from "./clients/tempo-telemetry.client";
import { TelemetryController } from "./telemetry.controller";
import { TelemetryService } from "./telemetry.service";

@Module({
  imports: [DatabaseModule, KubernetesModule],
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    PrometheusTelemetryClient,
    LokiTelemetryClient,
    TempoTelemetryClient,
  ],
})
export class TelemetryModule {}
