import { IsInt, IsOptional, Min } from 'class-validator';

export class StartDeploymentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  replicas?: number;
}
