# Authentication and tenancy operations

The Deployment Manager is the browser-facing OIDC client. RCA Agent and MCP are
internal services and accept only short-lived, run-scoped service JWTs.

## Asgardeo application

Create a confidential server-side OIDC application in the root organization.
Enable Code, Refresh Token, and (after sharing) Organization Switch grants. Add
the following exact redirect URLs as applicable:

- `http://localhost:3000/auth/callback`
- `https://manager.rca.local:8443/auth/callback`
- `https://<production-manager-host>/auth/callback`

Register the RCA API resource and application roles. Share the application with
selected child organizations. Configure the API identifier as
`ASGARDEO_API_AUDIENCE`; the backend rejects access tokens for any other
audience.

Configure `ASGARDEO_ISSUER` with the issuer shown in the application's Info
tab. For Asgardeo cloud it has this form:
`https://api.asgardeo.io/t/<root-organization-name>/oauth2/token`.

Authorize application-audience roles with additive scopes:

| Role | Scopes |
| --- | --- |
| Viewer | `apps:read deployments:read builds:read logs:read incidents:read rca:read rca:chat:read` |
| Developer | Viewer scopes plus `apps:create deployments:write builds:start incidents:manage rca:run rca:chat:write` |
| Administrator | Developer scopes plus `deployments:delete secrets:write members:manage` |

The backend enforces scopes, not display role names. Deployment payloads that
contain secret values additionally require `secrets:write`, even when the
caller has `deployments:write`.

The first verified child-organization login creates its `Workspace` row. The
root organization ID must be configured as `ASGARDEO_ROOT_ORGANIZATION_ID` so
it cannot accidentally become a customer workspace. To attach pre-tenant data,
set `AUTH_BOOTSTRAP_ORGANIZATION_ID` to the first child organization before its
first login.

## Local secrets

Create ignored local files outside the repository:

```text
# asgardeo.env
ASGARDEO_CLIENT_SECRET=<value>
AUTH_SESSION_ENCRYPTION_KEY=<base64-encoded-32-byte-key>

# internal-auth.env
INTERNAL_SERVICE_JWT_SECRET=<at-least-32-random-bytes>
```

Load them without putting values in Helm release values or shell history:

```bash
kubectl create secret generic rca-asgardeo \
  --namespace rca-platform \
  --from-env-file=/absolute/private/path/asgardeo.env

kubectl create secret generic rca-internal-auth \
  --namespace rca-platform \
  --from-env-file=/absolute/private/path/internal-auth.env
```

Supply issuer, client ID, API audience, root organization ID, and scopes as
non-secret Deployment Manager Helm configuration. Trust the local cert-manager
certificate and map `manager.rca.local` before testing the cluster callback.

## PostgreSQL accounts

Run `deployment-manager-service/src/database/postgresql-roles.sql` once using a
database administrator, set passwords outside that file, and create separate
Kubernetes Secrets containing `DATABASE_URL` for:

- `rca_migrator`
- `deployment_manager`
- `rca_agent`
- `rca_mcp`

Set their names through `global.database.migratorSecretName`,
`deploymentManagerSecretName`, `agentSecretName`, and `mcpSecretName`. The
migrator alone runs Prisma migrations; MCP receives SELECT-only grants. Use
connection URLs with bounded pools, acquisition timeouts, statement timeouts,
and `sslmode=verify-full` plus the provider CA in production.

The bundled PostgreSQL chart creates these roles only while initializing an
empty data directory. An older local PVC predating this change must be reset
using the documented development reset process, or an administrator must run
`postgresql-roles.sql` before the migration Job. Never reset a production
volume.

## EKS secrets and routing

Use separate production Asgardeo credentials. Install External Secrets Operator
and an `aws-secrets-manager` `ClusterSecretStore` authenticated with EKS Pod
Identity or IRSA. The production values create `ExternalSecret` resources that
map the following AWS Secrets Manager JSON properties into Kubernetes Secrets:

- `/rca/production/asgardeo`: `clientSecret`, `sessionEncryptionKey`
- `/rca/production/internal-auth`: `jwtSecret`
- `/rca/production/database`: `deploymentManagerUrl`, `migratorUrl`,
  `agentUrl`, `mcpUrl`

Change the remote paths when your AWS naming convention differs. Each database
URL must use the matching restricted login, bounded connection settings, and
managed PostgreSQL TLS with `sslmode=verify-full`.

Only the Deployment Manager has a Gateway route. NetworkPolicies admit Agent
traffic from Deployment Manager and MCP traffic from Agent. Managed application
resources use one immutable namespace per Workspace.

## Browser contract

- Begin login at `GET /auth/login`.
- Read the principal, workspace, permissions, and CSRF token from
  `GET /auth/me`.
- Workspace administrators can inspect session, authorization, cleanup, and
  pending/stuck RCA counters at `GET /auth/metrics`.
- Send cookies with credentials and include `X-CSRF-Token` for unsafe requests.
- Use `POST /auth/switch-organization` with `{"organizationId":"..."}`.
- Use `POST /auth/logout`.

The `rca_session` cookie is opaque, HTTP-only, host-only, and `SameSite=Lax`.
Tokens remain encrypted in PostgreSQL and never reach browser JavaScript.
