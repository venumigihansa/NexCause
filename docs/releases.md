# Release process

NexCause uses GitHub Actions for validation and artifact publication. Deployment
and GitOps are intentionally separate from the release pipeline.

## Validation

Pull requests and pushes to `main` run `.github/workflows/ci.yml`. The workflow
builds and tests the TypeScript, Python, and Go services; applies migrations to
PostgreSQL and verifies row-level security; builds every image; and validates
the Helm chart.

## Publish a release

All application and chart versions must match before tagging. Verify them with:

```bash
./scripts/verify-release-version.sh 0.1.1
```

After CI passes on `main`, create the release tag:

```bash
git tag -a v0.1.1 -m "NexCause v0.1.1"
git push origin v0.1.1
```

The tag workflow builds `linux/amd64` and `linux/arm64` images, publishes SBOM
and provenance attestations, and pushes the dependency-complete Helm chart.
The workflow uses its repository-scoped `GITHUB_TOKEN`; no registry token is
stored as a secret.

New GHCR packages are private by default. For this learning project, change the
four image packages and `charts/rca-platform` to public in their GitHub package
settings after the first release. Confirm that every package is connected to
the `venumigihansa/NexCause` repository.

## Verify public artifacts

Log out of GHCR, then verify anonymous access:

```bash
docker logout ghcr.io || true
docker pull ghcr.io/venumigihansa/nexcause-deployment-manager:0.1.1
helm pull oci://ghcr.io/venumigihansa/charts/rca-platform --version 0.1.1
```

Use semantic versions or immutable digests in deployments. The `latest` tag is
only a convenience alias for stable releases and is not a production pin.
