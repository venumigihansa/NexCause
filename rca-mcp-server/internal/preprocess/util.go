package preprocess

type trimResult struct {
	items     []any
	truncated bool
}

func trimAny(items []any, limit int) trimResult {
	if limit <= 0 || len(items) <= limit {
		return trimResult{items: items, truncated: false}
	}
	return trimResult{items: items[:limit], truncated: true}
}

func toAnySlice[T any](items []T) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
