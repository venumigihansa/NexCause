package services

import (
	"context"

	rcacontext "rca-mcp-server/internal/context"
)

type ContextService struct {
	base serviceBase
}

func (s *ContextService) GetRCAContext(ctx context.Context, req EvidenceRequest) (rcacontext.RCAContext, error) {
	c, _, _, err := s.base.scopedContext(ctx, req)
	return c, err
}
