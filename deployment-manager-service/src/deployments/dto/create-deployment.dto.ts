import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateDeploymentDto {
  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  port?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  replicas?: number;

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsString()
  namespace?: string;
}
