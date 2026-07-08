package preprocess

import (
	"regexp"
	"strings"
	"time"

	"rca-mcp-server/internal/adapters"
	"rca-mcp-server/internal/evidence"
)

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(password|secret|token|api[_-]?key)=\S+`),
	regexp.MustCompile(`(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._~+/-]+=*`),
}

func Logs(scope evidence.Scope, start time.Time, end time.Time, logs []adapters.PodLog, maxLines int) evidence.Bundle {
	bundle := evidence.NewBundle(evidence.SourceLogs, scope, start, end)
	lines := []map[string]string{}
	patterns := map[string]int{}
	errorCount := 0
	stackTraceCount := 0
	truncated := false

	for _, podLog := range logs {
		for _, line := range strings.Split(podLog.Logs, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if len(lines) >= maxLines {
				truncated = true
				continue
			}
			redacted := redact(line)
			class := classifyLogLine(redacted)
			if class == "error" {
				errorCount++
			}
			if strings.HasPrefix(redacted, "at ") || strings.Contains(redacted, "Traceback") {
				stackTraceCount++
			}
			patterns[normalizeLogPattern(redacted)]++
			lines = append(lines, map[string]string{"podName": podLog.PodName, "line": redacted, "class": class})
		}
	}

	samples := make([]any, 0, len(lines))
	for _, line := range lines {
		samples = append(samples, line)
	}

	bundle.Samples = samples
	bundle.Truncated = truncated
	bundle.Stats = map[string]float64{
		"sampleLineCount": float64(len(lines)),
		"errorLineCount":  float64(errorCount),
		"stackTraceCount": float64(stackTraceCount),
	}
	bundle.Summary = "Logs were collected and normalized."
	if errorCount > 0 {
		bundle.Summary = "Logs contain error-like lines in the incident window."
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "log_errors_present", Severity: "warning", Value: errorCount, Attributes: map[string]any{"patterns": topPatterns(patterns, 8)}})
	}
	if stackTraceCount > 0 {
		bundle.Signals = append(bundle.Signals, evidence.Signal{Name: "stack_traces_present", Severity: "warning", Value: stackTraceCount})
	}
	return bundle
}

func redact(line string) string {
	redacted := line
	for _, pattern := range secretPatterns {
		redacted = pattern.ReplaceAllString(redacted, "$1[REDACTED]")
	}
	return redacted
}

func classifyLogLine(line string) string {
	lower := strings.ToLower(line)
	if strings.Contains(lower, "error") || strings.Contains(lower, "exception") || strings.Contains(lower, "failed") || strings.Contains(lower, "panic") {
		return "error"
	}
	if strings.Contains(lower, "warn") {
		return "warning"
	}
	return "info"
}

func normalizeLogPattern(line string) string {
	line = regexp.MustCompile(`\b[0-9a-f]{8,}\b`).ReplaceAllString(line, "<id>")
	line = regexp.MustCompile(`\b\d+\b`).ReplaceAllString(line, "<number>")
	if len(line) > 160 {
		return line[:160]
	}
	return line
}

func topPatterns(patterns map[string]int, limit int) []map[string]any {
	type pair struct {
		pattern string
		count   int
	}
	pairs := []pair{}
	for pattern, count := range patterns {
		pairs = append(pairs, pair{pattern: pattern, count: count})
	}
	for i := 0; i < len(pairs); i++ {
		for j := i + 1; j < len(pairs); j++ {
			if pairs[j].count > pairs[i].count {
				pairs[i], pairs[j] = pairs[j], pairs[i]
			}
		}
	}
	if len(pairs) > limit {
		pairs = pairs[:limit]
	}
	out := make([]map[string]any, 0, len(pairs))
	for _, item := range pairs {
		out = append(out, map[string]any{"pattern": item.pattern, "count": item.count})
	}
	return out
}
