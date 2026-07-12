# Phase 2 runtime defaults

These are initial Kubernetes settings to validate during Kind and EKS testing.

| Service | CPU request | CPU limit | Memory request | Memory limit |
|---|---:|---:|---:|---:|
| Deployment manager | `100m` | `500m` | `256Mi` | `512Mi` |
| RCA agent | `100m` | `1` | `256Mi` | `1Gi` |
| MCP server | `50m` | `500m` | `64Mi` | `256Mi` |

All workloads should use `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, a read-only root filesystem, dropped Linux capabilities, and the `RuntimeDefault` seccomp profile. Node and Python workloads receive an explicit ephemeral `/tmp` mount instead of write access to the root filesystem.
