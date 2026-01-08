#!/usr/bin/env bash
set -e

bunx prisma migrate deploy || true

bun run src/server.ts
