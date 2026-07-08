package preprocess

import (
	"fmt"
	"math"
	"sort"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

func Metrics(scope evidence.Scope, start time.Time, end time.Time, series []adapters.MetricSeries, limit int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceMetrics, scope, start, end)
	samples := []any{}
	spikeCount := 0
	stats := map[string]float64{}

	for _, item := range series {
		values := []float64{}
		for _, point := range item.Values {
			values = append(values, point.Value)
		}
		if len(values) == 0 {
			continue
		}
		itemStats := calculateStats(values)
		stats[item.Name+".min"] = itemStats["min"]
		stats[item.Name+".max"] = itemStats["max"]
		stats[item.Name+".avg"] = itemStats["avg"]
		stats[item.Name+".p95"] = itemStats["p95"]
		if itemStats["max"] > itemStats["avg"]*2 && itemStats["max"] > 0 {
			spikeCount++
			bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "metric_spike", Severity: "warning", Value: item.Name, Attributes: map[string]any{"max": itemStats["max"], "avg": itemStats["avg"]}})
		}
		samples = append(samples, item)
	}

	trimmed := trimAny(samples, limit)
	bundle.Samples = trimmed.items
	bundle.Truncated = trimmed.truncated
	bundle.Stats = stats
	bundle.Summary = fmt.Sprintf("Processed %d metric series with %d spike signal(s).", len(series), spikeCount)
	return bundle
}

func calculateStats(values []float64) map[string]float64 {
	sorted := append([]float64{}, values...)
	sort.Float64s(sorted)
	sum := 0.0
	for _, value := range sorted {
		sum += value
	}
	return map[string]float64{
		"min": sorted[0],
		"max": sorted[len(sorted)-1],
		"avg": sum / float64(len(sorted)),
		"p95": percentile(sorted, 0.95),
	}
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	index := int(math.Ceil(p*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}
