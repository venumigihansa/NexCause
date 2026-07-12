FROM golang:1.22-alpine AS build

ARG VERSION=dev
ARG VCS_REF=unknown
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.version=${VERSION} -X main.revision=${VCS_REF}" \
    -o /out/rca-mcp-server ./cmd/rca-mcp-server

FROM gcr.io/distroless/static-debian12:nonroot

ARG VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="RCA Platform MCP Server" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

COPY --from=build /out/rca-mcp-server /rca-mcp-server
EXPOSE 8080
ENTRYPOINT ["/rca-mcp-server"]
