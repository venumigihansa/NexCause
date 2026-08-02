import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import {
  LogsTelemetryQueryDto,
  MetricsTelemetryQueryDto,
  TracesTelemetryQueryDto,
} from "./telemetry-query.dto";

describe("telemetry query DTOs", () => {
  it("accepts valid bounded query values", () => {
    const metrics = plainToInstance(MetricsTelemetryQueryDto, {
      sinceMinutes: "60",
      stepSeconds: "30",
    });
    const logs = plainToInstance(LogsTelemetryQueryDto, {
      sinceMinutes: "30",
      limit: "200",
      level: "error",
    });
    const traces = plainToInstance(TracesTelemetryQueryDto, {
      sinceMinutes: "30",
      limit: "100",
    });

    expect(validateSync(metrics)).toEqual([]);
    expect(validateSync(logs)).toEqual([]);
    expect(validateSync(traces)).toEqual([]);
  });

  it("rejects out-of-bounds and unknown enum query values", () => {
    const metrics = plainToInstance(MetricsTelemetryQueryDto, {
      sinceMinutes: "361",
      stepSeconds: "5",
    });
    const logs = plainToInstance(LogsTelemetryQueryDto, {
      limit: "501",
      level: "debug",
    });

    expect(validateSync(metrics)).toHaveLength(2);
    expect(validateSync(logs)).toHaveLength(2);
  });
});
