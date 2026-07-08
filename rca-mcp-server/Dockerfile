FROM golang:1.22-alpine AS build

WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/rca-mcp-server ./cmd/rca-mcp-server

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/rca-mcp-server /rca-mcp-server
EXPOSE 8080
ENTRYPOINT ["/rca-mcp-server"]
