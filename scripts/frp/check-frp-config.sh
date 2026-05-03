#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: bash scripts/frp/check-frp-config.sh <frp-config> [more-configs...]" >&2
  exit 2
fi

fail=0

warn() {
  fail=1
  printf 'WARN: %s\n' "$1" >&2
}

for file in "$@"; do
  if [ ! -f "$file" ]; then
    warn "$file does not exist"
    continue
  fi

  if grep -Eq '(^|[^A-Za-z0-9_])(~/.codex/auth\.json|~/.codex/config\.toml)' "$file"; then
    warn "$file mentions Codex runtime auth/config paths"
  fi

  if grep -Eq '^[[:space:]]*dashboard(Port|User|Pwd)[[:space:]]*=' "$file"; then
    warn "$file enables frps dashboard by default"
  fi

  if grep -Eq '^[[:space:]]*localIP[[:space:]]*=[[:space:]]*"0\.0\.0\.0"' "$file"; then
    warn "$file forwards from a non-local cc-web bind"
  fi

  if grep -Eq '^[[:space:]]*localIP[[:space:]]*=' "$file" &&
    ! grep -Eq '^[[:space:]]*localIP[[:space:]]*=[[:space:]]*"127\.0\.0\.1"' "$file"; then
    warn "$file should forward to localIP 127.0.0.1"
  fi

  if grep -Eq '^[[:space:]]*(auth\.)?token[[:space:]]*=' "$file" &&
    ! grep -Eq '^[[:space:]]*(auth\.)?token[[:space:]]*=[[:space:]]*"YOUR_FRP_TOKEN"' "$file"; then
    warn "$file contains a non-placeholder token value"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "frp config safety check failed" >&2
  exit 1
fi

echo "frp config safety check passed"
