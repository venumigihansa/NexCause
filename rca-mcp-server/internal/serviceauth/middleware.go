package serviceauth

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	WorkspaceID string `json:"workspaceId"`
	RunID       string `json:"runId"`
	IncidentID  string `json:"incidentId"`
	jwt.RegisteredClaims
}

type contextKey struct{}

func Middleware(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if len(secret) < 32 || !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, "service authentication required", http.StatusUnauthorized)
			return
		}
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(
			strings.TrimPrefix(header, "Bearer "),
			claims,
			func(token *jwt.Token) (any, error) { return []byte(secret), nil },
			jwt.WithValidMethods([]string{"HS256"}),
			jwt.WithIssuer("rca-agent"),
			jwt.WithAudience("rca-mcp"),
			jwt.WithExpirationRequired(),
		)
		if err != nil || !token.Valid || claims.WorkspaceID == "" || claims.RunID == "" || claims.IncidentID == "" {
			http.Error(w, "invalid service token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, claims)))
	})
}

func FromContext(ctx context.Context) (Claims, bool) {
	claims, ok := ctx.Value(contextKey{}).(*Claims)
	if !ok || claims == nil {
		return Claims{}, false
	}
	return *claims, true
}

func WorkspaceID(ctx context.Context) (string, bool) {
	claims, ok := FromContext(ctx)
	return claims.WorkspaceID, ok
}
