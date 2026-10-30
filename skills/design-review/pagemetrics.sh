#!/usr/bin/env bash
# Layout-rhythm metrics (page/footer length, CTA vs fold, section padding) in the official Playwright container. Needs Docker.
#   pagemetrics.sh <out.json> <url | ./page.html> [more urls...]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd -P)
out=$1; shift
cache=${XDG_CACHE_HOME:-$HOME/.cache}/design-review-playwright
mkdir -p "$cache" "$(dirname "$out")"
out=$(cd "$(dirname "$out")" && pwd -P)/$(basename "$out")
mounts=(-v "$(dirname "$out")":"$(dirname "$out")") urls=()
for u in "$@"; do
  if [ -f "$u" ]; then u=$(cd "$(dirname "$u")" && pwd -P)/$(basename "$u"); mounts+=(-v "$(dirname "$u")":"$(dirname "$u")":ro); fi
  urls+=("$u")
done
# Bridge networking (host networking drops requests with net::ERR_NETWORK_CHANGED); host only for a local dev server.
net=bridge; case " ${urls[*]} " in *localhost*|*127.0.0.1*|*'[::1]'*) net=host;; esac
docker run --rm --network "$net" --user "$(id -u):$(id -g)" -e HOME=/tmp "${mounts[@]}" -v "$here":/s:ro -v "$cache":/pw -w /pw \
  mcr.microsoft.com/playwright:v1.62.0-noble bash -c '
    [ -d node_modules/playwright ] || npm i --silent --no-save playwright@1.62.0 >/dev/null
    cp /s/pagemetrics.mjs /pw/ && node /pw/pagemetrics.mjs "$@"' _ "$out" "${urls[@]}"
