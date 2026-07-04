import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { RcaController } from './rca.controller';
import { RcaService } from './rca.service';

@Module({
  imports: [DatabaseModule, EvidenceModule],
  controllers: [RcaController],
  providers: [RcaService],
  exports: [RcaService],
})
export class RcaModule {}
