{{- define "rca-agent.name" -}}rca-agent{{- end }}
{{- define "rca-agent.fullname" -}}{{ .Release.Name }}-rca-agent{{- end }}
{{- define "rca-agent.labels" -}}
app.kubernetes.io/name: {{ include "rca-agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}
