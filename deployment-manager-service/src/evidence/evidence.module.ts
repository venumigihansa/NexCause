import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

@Module({
  imports: [DatabaseModule, KubernetesModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
})
export class EvidenceModule {}
