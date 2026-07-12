{{- define "deployment-manager.name" -}}deployment-manager{{- end }}
{{- define "deployment-manager.fullname" -}}{{ .Release.Name }}-deployment-manager{{- end }}
{{- define "deployment-manager.labels" -}}
app.kubernetes.io/name: {{ include "deployment-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}
