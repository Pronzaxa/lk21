#!/bin/sh
set -eu

PACKAGE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR="$PACKAGE_DIR/app"
PORT=4173

open "http://127.0.0.1:$PORT/"
cd "$APP_DIR"

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi

open "$PACKAGE_DIR/nuRESQ.html"
printf '%s\n' "Python 3 tidak tersedia; nuRESQ dibuka dalam mode satu-file."
