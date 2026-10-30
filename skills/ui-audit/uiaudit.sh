#!/usr/bin/env bash
# Viewport-sweep layout audit in the official Playwright container. Needs Docker; nothing installs on the host.
#   uiaudit.sh <url | ./page.html> <out-prefix> [--widths 320,768,1440] [--expect "nav .cart"]... [--dark] [--shots]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd -P)
target=$1 out=$2; shift 2
cache=${XDG_CACHE_HOME:-$HOME/.cache}/design-review-playwright
mkdir -p "$cache" "$(dirname "$out")"
out=$(cd "$(dirname "$out")" && pwd -P)/$(basename "$out")
mounts=(-v "$(dirname "$out")":"$(dirname "$out")")
if [ -f "$target" ]; then target=$(cd "$(dirname "$target")" && pwd -P)/$(basename "$target"); mounts+=(-v "$(dirname "$target")":"$(dirname "$target")":ro); fi
# Bridge networking: on host networking Chromium sees each container start as interface churn and drops requests
# (net::ERR_NETWORK_CHANGED), so pages load without CSS. Host networking only for a dev server on this machine.
net=bridge; case " $* $target " in *localhost*|*127.0.0.1*|*'[::1]'*) net=host;; esac
docker run --rm --network "$net" --user "$(id -u):$(id -g)" -e HOME=/tmp "${mounts[@]}" -v "$here":/s:ro -v "$cache":/pw -w /pw \
  mcr.microsoft.com/playwright:v1.62.0-noble bash -c '
    [ -d node_modules/playwright ] || npm i --silent --no-save playwright@1.62.0 >/dev/null
    cp /s/uiaudit.mjs /s/uiaudit.js /pw/ && node /pw/uiaudit.mjs "$@"' _ "$target" --out "$out" "$@"
