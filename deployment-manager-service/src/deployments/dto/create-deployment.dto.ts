import { IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

export class CreateDeploymentDto {
  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  buildId?: string;

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
  @IsObject()
  secrets?: Record<string, string>;

  @IsOptional()
  @IsObject()
  files?: Record<string, string>;

  @IsOptional()
  @IsObject()
  secretFiles?: Record<string, string>;
}
