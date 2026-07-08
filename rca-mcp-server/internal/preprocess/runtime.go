package preprocess

import (
	"encoding/json"
	"fmt"
	"time"

	"rca-mcp-server/internal/evidence"
	"rca-mcp-server/internal/store"
)

func RuntimeConfigs(scope evidence.Scope, start time.Time, end time.Time, configs []store.RuntimeConfig, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceRuntime, scope, start, end)
	sanitized := []any{}
	for _, config := range configs {
		sanitized = append(sanitized, sanitizeRuntimeConfig(config))
	}
	trimmed := trimAny(sanitized, limit)
	bundle.Samples = trimmed.items
	bundle.Truncated = trimmed.truncated
	bundle.Stats = map[string]float64{"runtimeConfigCount": float64(len(configs))}
	bundle.Summary = fmt.Sprintf("Found %d runtime config record(s). Secret values were redacted.", len(configs))
	return bundle
}

func RecentChanges(scope evidence.Scope, start time.Time, end time.Time, changes []store.RecentChange, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceChanges, scope, start, end)
	trimmed := trimAny(toAnySlice(changes), limit)
	bundle.Samples = trimmed.items
	bundle.Truncated = trimmed.truncated
	bundle.Stats = map[string]float64{"changeCount": float64(len(changes))}
	bundle.Summary = fmt.Sprintf("Found %d recent deployment/runtime change(s).", len(changes))
	if len(changes) > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "recent_changes_present", Severity: "info", Value: len(changes)})
	}
	return bundle
}

func sanitizeRuntimeConfig(config store.RuntimeConfig) map[string]any {
	result := map[string]any{
		"id":        config.ID,
		"type":      config.Type,
		"createdAt": config.CreatedAt,
		"updatedAt": config.UpdatedAt,
	}
	var data map[string]any
	if err := json.Unmarshal(config.Data, &data); err != nil {
		result["data"] = map[string]any{"parseError": err.Error()}
		return result
	}

	if config.Type == "secret" {
		result["data"] = map[string]any{
			"envKeys":   objectKeys(data["env"]),
			"filePaths": objectKeys(data["files"]),
		}
		return result
	}

	result["data"] = data
	return result
}

func objectKeys(value any) []string {
	record, ok := value.(map[string]any)
	if !ok {
		return []string{}
	}
	keys := []string{}
	for key := range record {
		keys = append(keys, key)
	}
	return keys
}
