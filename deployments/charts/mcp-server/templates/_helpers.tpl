{{- define "mcp-server.name" -}}mcp-server{{- end }}
{{- define "mcp-server.fullname" -}}{{ .Release.Name }}-mcp-server{{- end }}
{{- define "mcp-server.labels" -}}
app.kubernetes.io/name: {{ include "mcp-server.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}
