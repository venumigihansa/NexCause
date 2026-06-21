import { Module } from '@nestjs/common';
import { SourceControlService } from './source-control.service';

@Module({
  providers: [SourceControlService],
  exports: [SourceControlService],
})
export class SourceControlModule {}
