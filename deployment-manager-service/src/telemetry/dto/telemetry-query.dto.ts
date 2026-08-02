import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class TelemetryWindowQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(360)
  sinceMinutes?: number;
}

export class MetricsTelemetryQueryDto extends TelemetryWindowQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(15)
  @Max(300)
  stepSeconds?: number;
}

export class LogsTelemetryQueryDto extends TelemetryWindowQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsIn(["error", "warning", "info"])
  level?: "error" | "warning" | "info";
}

export class TracesTelemetryQueryDto extends TelemetryWindowQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return Number(value);
}
