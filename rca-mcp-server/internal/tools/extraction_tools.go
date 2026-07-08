package tools

import (
	"context"

	"rca-mcp-server/internal/services"
)

func (r *Registry) extractEvidence(ctx context.Context, args map[string]any) (map[string]any, error) {
	req, err := evidenceRequest(args)
	if err != nil {
		return nil, err
	}
	return r.deps.Services.Evidence.ExtractEvidence(ctx, services.ExtractRequest{
		EvidenceRequest: req,
		Focus:           stringArg(args, "focus", "overview"),
		Depth:           intArg(args, "depth", 0),
	})
}
