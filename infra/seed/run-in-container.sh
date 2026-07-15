#!/usr/bin/env sh
# Runs a seed script inside the wallet container, which already has `pg` installed — the repo has no
# host-level node_modules. Passes every argument straight through to the script.
#
#   npm run seed:earnings
#   npm run seed:earnings -- 4 --days=90
set -e
# Git Bash rewrites container-absolute paths like /app/x into Windows paths; this stops it.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
C=${WALLET_CONTAINER:-infra-wallet-1}
docker cp "$(dirname "$0")/worker-earnings.js" "$C:/app/seed-worker-earnings.js" >/dev/null
exec docker exec \
  -e WALLET_DB_URL="postgres://homehelp:change-me@wallet-db:5432/wallet" \
  -e WORKER_DB_URL="postgres://homehelp:change-me@worker-db:5432/worker" \
  "$C" node /app/seed-worker-earnings.js "$@"
