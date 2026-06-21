import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';

@Module({
  imports: [AppsModule, KubernetesModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
})
export class DeploymentsModule {}
