package tools

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"rca-mcp-server/internal/serviceauth"
)

type MCPHandler struct {
	registry *Registry
	logger   *slog.Logger
}

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      any           `json:"id,omitempty"`
	Result  any           `json:"result,omitempty"`
	Error   *jsonRPCError `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func NewMCPHandler(registry *Registry, logger *slog.Logger) http.Handler {
	return &MCPHandler{registry: registry, logger: logger}
}

func (h *MCPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "only POST is supported"})
		return
	}

	var req jsonRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, jsonRPCResponse{JSONRPC: "2.0", Error: &jsonRPCError{Code: -32700, Message: err.Error()}})
		return
	}

	result, rpcErr := h.dispatch(r, req)
	response := jsonRPCResponse{JSONRPC: "2.0", ID: req.ID, Result: result, Error: rpcErr}
	writeJSON(w, http.StatusOK, response)
}

func (h *MCPHandler) dispatch(r *http.Request, req jsonRPCRequest) (any, *jsonRPCError) {
	switch req.Method {
	case "initialize":
		return map[string]any{
			"protocolVersion": "2024-11-05",
			"serverInfo": map[string]any{
				"name":    "rca-mcp-server",
				"version": "0.1.1",
			},
			"capabilities": map[string]any{
				"tools": map[string]any{},
			},
		}, nil
	case "tools/list":
		return map[string]any{"tools": h.registry.ListTools()}, nil
	case "tools/call":
		var params struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return nil, &jsonRPCError{Code: -32602, Message: err.Error()}
		}
		claims, ok := serviceauth.FromContext(r.Context())
		if !ok ||
			stringArgument(params.Arguments, "runId") != claims.RunID ||
			stringArgument(params.Arguments, "incidentId") != claims.IncidentID {
			return nil, &jsonRPCError{Code: -32602, Message: "tool scope does not match the authenticated RCA run"}
		}
		result, err := h.registry.Call(r.Context(), params.Name, params.Arguments)
		if err != nil {
			h.logger.Warn("tool call failed", "tool", params.Name, "error", err)
			return nil, &jsonRPCError{Code: -32000, Message: err.Error()}
		}
		return map[string]any{
			"content": []map[string]any{
				{
					"type": "text",
					"text": mustJSONString(result),
				},
			},
			"structuredContent": result,
		}, nil
	default:
		return nil, &jsonRPCError{Code: -32601, Message: "method not found"}
	}
}

func stringArgument(arguments map[string]any, key string) string {
	value, _ := arguments[key].(string)
	return value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func mustJSONString(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return `{"error":"failed to marshal tool result"}`
	}
	return string(data)
}
