package authz

import (
	"context"

	"rca-mcp-server/internal/evidence"
)

type contextKey string

const subjectContextKey contextKey = "authz.subject"

type Subject struct {
	ID    string   `json:"id,omitempty"`
	Roles []string `json:"roles,omitempty"`
}

type Authorizer interface {
	CanReadDeploymentTelemetry(ctx context.Context, subject Subject, scope evidence.Scope) error
}

type AllowAllAuthorizer struct{}

func (AllowAllAuthorizer) CanReadDeploymentTelemetry(_ context.Context, _ Subject, _ evidence.Scope) error {
	return nil
}

func WithSubject(ctx context.Context, subject Subject) context.Context {
	return context.WithValue(ctx, subjectContextKey, subject)
}

func SubjectFromContext(ctx context.Context) Subject {
	subject, ok := ctx.Value(subjectContextKey).(Subject)
	if !ok {
		return Subject{}
	}
	return subject
}
