#!/usr/bin/env bash
set -euo pipefail

url="http://127.0.0.1:8083/"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "$url" >/dev/null; then
    echo "cc-web is reachable at $url"
    exit 0
  fi
  echo "cc-web is not reachable at $url" >&2
  exit 1
fi

node -e '
const http = require("http");
const req = http.get("http://127.0.0.1:8083/", (res) => {
  res.resume();
  process.exit(res.statusCode >= 200 && res.statusCode < 500 ? 0 : 1);
});
req.setTimeout(3000, () => {
  req.destroy(new Error("timeout"));
});
req.on("error", () => process.exit(1));
'
