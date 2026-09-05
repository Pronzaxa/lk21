#!/bin/sh
set -eu

PACKAGE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR="$PACKAGE_DIR/app"
PORT=4173

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "http://127.0.0.1:$PORT/") >/dev/null 2>&1 &
fi

cd "$APP_DIR"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi
if command -v busybox >/dev/null 2>&1; then
  exec busybox httpd -f -p "127.0.0.1:$PORT"
fi

printf '%s\n' "Server lokal tidak tersedia. Buka nuRESQ.html langsung di browser."
