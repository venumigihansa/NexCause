{{- define "rca-platform.databaseSecretName" -}}
{{- default (printf "%s-database" .Release.Name) .Values.global.database.secretName -}}
{{- end -}}
