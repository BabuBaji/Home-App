#!/usr/bin/env sh
# Runs a seed script inside the wallet container, which already has `pg` installed — the repo has no
# host-level node_modules. The wallet container can reach every service DB on the compose network,
# so the same runner seeds worker-db (documents) or wallet-db (earnings). The script to run is the
# first argument (a *.js filename in this folder); everything after it is passed straight through.
#
#   npm run seed:earnings                     # -> worker-earnings.js, worker 1, 60 days
#   npm run seed:earnings  -- 4 --days=90      # -> worker-earnings.js, worker 4, 90 days
#   npm run seed:documents -- --all            # -> worker-documents.js, every active worker
set -e
# Git Bash rewrites container-absolute paths like /app/x into Windows paths; this stops it.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
C=${WALLET_CONTAINER:-infra-wallet-1}
SCRIPT=worker-earnings.js
case "$1" in *.js) SCRIPT="$1"; shift;; esac
# The documents seed also writes placeholder files to object storage, so run it in the worker
# container, which carries the S3_* env the shared storage module needs.
case "$SCRIPT" in worker-documents.js) C=${WORKER_CONTAINER:-infra-worker-1};; esac
docker cp "$(dirname "$0")/$SCRIPT" "$C:/app/seed-$SCRIPT" >/dev/null
exec docker exec \
  -e WALLET_DB_URL="postgres://homehelp:change-me@wallet-db:5432/wallet" \
  -e WORKER_DB_URL="postgres://homehelp:change-me@worker-db:5432/worker" \
  "$C" node "/app/seed-$SCRIPT" "$@"
