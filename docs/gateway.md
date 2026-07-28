# Shared kgateway operations

The RCA platform uses one `Gateway` named `rca-gateway`. The separate Envoy Gateway project is not installed. kgateway watches this Gateway and creates the Envoy proxy Deployment and `LoadBalancer` Service.

## Resource ownership

| Owner | Resources |
| --- | --- |
| Cluster prerequisite script | Gateway API CRDs, kgateway CRDs/controller, cert-manager CRDs/controller |
| EKS infrastructure | AWS Load Balancer Controller, IAM, Route 53 records, ACME ClusterIssuer |
| RCA umbrella chart | Gateway, Certificate, local Issuer, Deployment Manager backend and redirect HTTPRoutes, EKS GatewayParameters |
| kgateway | Generated Envoy Deployment, Service, and Envoy route configuration |
| cert-manager | TLS Secret, CertificateRequests, ACME Orders and Challenges |
| Deployment Manager, later phase | HTTPRoutes for dynamically deployed applications |

More HTTPRoutes do not create more Gateways or load balancers. They add hostname and path rules to the Envoy proxies serving `rca-gateway`.

## Readiness checks

```bash
kubectl get gatewayclass kgateway
kubectl get gateway rca-gateway -n rca-platform
kubectl get httproute -n rca-platform
kubectl get certificate rca-gateway -n rca-platform
kubectl get deployment,service -n rca-platform \
  -l gateway.networking.k8s.io/gateway-name=rca-gateway
```

Expected conditions are:

- `GatewayClass/kgateway`: `Accepted=True`
- `Gateway/rca-gateway`: `Accepted=True` and `Programmed=True`
- Both HTTPRoutes: `Accepted=True` and `ResolvedRefs=True`
- `Certificate/rca-gateway`: `Ready=True`

Inspect a failed condition with:

```bash
kubectl describe gateway rca-gateway -n rca-platform
kubectl describe httproute deployment-manager -n rca-platform
kubectl describe certificate rca-gateway -n rca-platform
```

## Kind traffic tests

With cloud-provider-kind running:

```bash
GATEWAY_IP="$(kubectl get gateway rca-gateway -n rca-platform \
  -o jsonpath='{.status.addresses[0].value}')"

curl --resolve "manager.rca.local:80:${GATEWAY_IP}" \
  --head http://manager.rca.local/healthz

curl --resolve "manager.rca.local:443:${GATEWAY_IP}" \
  --insecure https://manager.rca.local/healthz
```

HTTP must return a 308 redirect and HTTPS `/healthz` must return 200. The self-signed local certificate is intentionally not publicly trusted.

If no LoadBalancer implementation is running:

```bash
kubectl port-forward -n rca-platform svc/rca-gateway 8080:80 8443:443

curl --resolve manager.rca.local:8443:127.0.0.1 \
  --insecure https://manager.rca.local:8443/healthz
```

## EKS traffic and TLS

kgateway creates a Kubernetes `LoadBalancer` Service with AWS annotations. AWS Load Balancer Controller converts that request into one internet-facing NLB. The NLB forwards ports 80 and 443 to Envoy; Envoy terminates TLS and applies the HTTPRoutes.

Verify:

```bash
kubectl get svc rca-gateway -n rca-platform
kubectl get gateway,httproute,certificate -n rca-platform
curl --head http://manager.rca.example.com/healthz
curl https://manager.rca.example.com/healthz
```

Do not switch from the ACME staging issuer to `letsencrypt-production` until DNS-01 succeeds and the staging Certificate is `Ready=True`.

## Future application routes

Application routes are not part of the initial delivery. The later Deployment Manager change will create each route in the `apps` namespace, attach it to `rca-platform/rca-gateway`, and point it at the generated application Service. Hostnames will use `<app-slug>.apps.<domain>`, covered by the wildcard DNS record and certificate.
