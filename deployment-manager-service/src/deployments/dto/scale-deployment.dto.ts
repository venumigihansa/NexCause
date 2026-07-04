import { IsInt, Min } from 'class-validator';

export class ScaleDeploymentDto {
  @IsInt()
  @Min(0)
  replicas: number;
}
