FROM docker:27-dind

ARG PACK_VERSION=0.36.0
ARG TARGETARCH
ARG VERSION=dev
ARG VCS_REF=unknown
ARG SOURCE_URL=https://github.com/venumigihansa/NexCause
ARG CREATED=unknown

LABEL org.opencontainers.image.title="RCA Platform Buildpack Runner" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.created="${CREATED}"

RUN apk add --no-cache curl tar ca-certificates \
  && case "${TARGETARCH}" in \
    amd64) PACK_ASSET="linux" ;; \
    arm64) PACK_ASSET="linux-arm64" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && curl -fsSL "https://github.com/buildpacks/pack/releases/download/v${PACK_VERSION}/pack-v${PACK_VERSION}-${PACK_ASSET}.tgz" \
    | tar -xz -C /usr/local/bin pack \
  && pack version
