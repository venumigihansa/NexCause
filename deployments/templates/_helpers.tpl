{{- define "rca-platform.databaseSecretName" -}}
{{- default (printf "%s-database" .Release.Name) .Values.global.database.secretName -}}
{{- end -}}

{{- define "rca-platform.gatewayName" -}}
{{- required "gateway.name is required when gateway.enabled=true" .Values.gateway.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "rca-platform.deploymentManagerServiceName" -}}
{{- printf "%s-deployment-manager" .Release.Name -}}
{{- end -}}
