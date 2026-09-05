#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vite_bin="${project_dir}/node_modules/.bin/vite"

if [[ ! -x "${vite_bin}" ]]; then
  echo "Dependency build tidak tersedia di mesin pembuat paket." >&2
  exit 69
fi

rm -rf "${project_dir}/portable-dist"
"${vite_bin}" build --config "${project_dir}/portable/vite.config.ts"
node "${project_dir}/scripts/finalize-portable.mjs"
