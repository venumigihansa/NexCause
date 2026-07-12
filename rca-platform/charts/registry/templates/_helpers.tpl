{{- define "registry.fullname" -}}{{ .Release.Name }}-registry{{- end }}
{{- define "registry.labels" -}}
app.kubernetes.io/name: registry
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}
