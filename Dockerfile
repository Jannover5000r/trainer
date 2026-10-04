# syntax=docker/dockerfile:1

# ---- Stage 1: build ---------------------------------------------------------
# The SQLite driver is modernc.org/sqlite (pure Go), so no CGO, gcc or musl-dev
# are needed. This keeps the build simple and the resulting binary static.
FROM golang:1.26-alpine AS builder

WORKDIR /src

# TARGETOS/TARGETARCH are populated automatically by BuildKit (arm64 on the Pi).
ARG TARGETOS
ARG TARGETARCH

ENV CGO_ENABLED=0
RUN apk add --no-cache ca-certificates

# Cache dependencies separately from the source.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-arm64} \
    go build -trimpath -ldflags="-s -w" -o /out/trainer ./cmd/server

# ---- Stage 2: runtime -------------------------------------------------------
FROM alpine:3.20 AS runner

# su-exec lets the entrypoint fix volume ownership as root and then drop to the
# unprivileged app user.
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
