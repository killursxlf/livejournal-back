#!/usr/bin/env bash
set -e

bunx prisma migrate deploy || true

exec bun run src/start.ts
