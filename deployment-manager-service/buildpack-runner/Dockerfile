FROM docker:27-dind

ARG PACK_VERSION=0.36.0
ARG TARGETARCH

RUN apk add --no-cache curl tar ca-certificates \
  && case "${TARGETARCH}" in \
    amd64) PACK_ARCH="amd64" ;; \
    arm64) PACK_ARCH="arm64" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && curl -fsSL "https://github.com/buildpacks/pack/releases/download/v${PACK_VERSION}/pack-v${PACK_VERSION}-linux-${PACK_ARCH}.tgz" \
    | tar -xz -C /usr/local/bin pack \
  && pack version
