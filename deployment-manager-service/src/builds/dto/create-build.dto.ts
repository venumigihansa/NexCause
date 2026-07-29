import { BuildStrategy } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class CreateBuildDto {
  @IsOptional()
  @IsEnum(BuildStrategy)
  strategy?: BuildStrategy;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  buildContext?: string;

  @IsOptional()
  @IsString()
  dockerfilePath?: string;
}
