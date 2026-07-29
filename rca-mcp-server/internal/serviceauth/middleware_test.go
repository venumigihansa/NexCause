package serviceauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "0123456789abcdef0123456789abcdef"

func TestMiddlewareAcceptsScopedAgentToken(t *testing.T) {
	handler := Middleware(testSecret, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := FromContext(r.Context())
		if !ok || claims.WorkspaceID != "workspace-a" || claims.RunID != "run-a" {
			t.Fatal("validated claims were not attached to the request")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/mcp", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, "rca-mcp", time.Now().Add(time.Minute)))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", response.Code)
	}
}

func TestMiddlewareRejectsWrongAudienceAndExpiredTokens(t *testing.T) {
	for name, token := range map[string]string{
		"wrong audience": signedToken(t, "rca-agent", time.Now().Add(time.Minute)),
		"expired":        signedToken(t, "rca-mcp", time.Now().Add(-time.Minute)),
	} {
		t.Run(name, func(t *testing.T) {
			handler := Middleware(testSecret, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(http.MethodPost, "/mcp", nil)
			request.Header.Set("Authorization", "Bearer "+token)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d", response.Code)
			}
		})
	}
}

func signedToken(t *testing.T, audience string, expiresAt time.Time) string {
	t.Helper()
	claims := Claims{
		WorkspaceID: "workspace-a",
		RunID:       "run-a",
		IncidentID:  "incident-a",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "rca-agent",
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Second)),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatal(err)
	}
	return token
}
