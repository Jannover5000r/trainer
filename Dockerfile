# syntax=docker/dockerfile:1

# Build stage: static binary (modernc.org/sqlite is pure Go, so CGO stays off).
FROM golang:1.26-alpine AS builder

WORKDIR /src

ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0
RUN apk add --no-cache ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-arm64} \
    go build -trimpath -ldflags="-s -w" -o /out/trainer ./cmd/server

# Runtime stage: minimal image, runs as an unprivileged user.
FROM alpine:3.20 AS runner

RUN apk add --no-cache ca-certificates su-exec tzdata \
    && addgroup -g 10001 -S app \
    && adduser -u 10001 -S -G app -h /app -s /sbin/nologin app

WORKDIR /app

ENV TRAINER_ADDR=":8080" \
    TRAINER_DB="/app/data/trainer.db" \
    TRAINER_STATIC="/app/web/static" \
    TRAINER_TOKEN_TTL="720h"

COPY --from=builder /out/trainer /app/trainer
COPY web/static /app/web/static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/data \
    && chown -R app:app /app

VOLUME ["/app/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
