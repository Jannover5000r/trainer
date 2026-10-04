#!/bin/sh
# Runs as root, makes the (possibly bind-mounted) data directory writable by the
# app user, then drops privileges for the server process.
set -eu

DB_DIR="$(dirname "${TRAINER_DB:-/app/data/trainer.db}")"
mkdir -p "$DB_DIR"
chown -R app:app "$DB_DIR" 2>/dev/null || true

exec su-exec app:app /app/trainer
