import { AppSourceType } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from "class-validator";

export class CreateAppDto {
  @IsString()
  name: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsEnum(AppSourceType)
  sourceType?: AppSourceType;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultPort?: number;

  @IsOptional()
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
  })
  repoUrl?: string;

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
