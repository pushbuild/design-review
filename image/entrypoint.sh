#!/usr/bin/env bash
# design-review image entrypoint: ui-audit | pagemetrics | mockup | source <file>
# Relative paths resolve against the working directory (the SKILL.md mounts the user's folder there).
set -euo pipefail
abs() { case "$1" in http://*|https://*|file:*) printf '%s' "$1";; /*) printf '%s' "$1";; *) printf '%s/%s' "$PWD" "$1";; esac; }
cmd=${1:-help}; shift || true
case "$cmd" in
  ui-audit)
    [ $# -ge 2 ] || { echo "usage: ui-audit <url | page.html> <out-prefix> [--widths ..] [--expect sel].. [--dark] [--shots] [--text-scale k]" >&2; exit 64; }
    target=$(abs "$1") out=$(abs "$2"); shift 2
    mkdir -p "$(dirname "$out")"
    exec node /app/uiaudit.mjs "$target" --out "$out" "$@" ;;
  pagemetrics)
    [ $# -ge 2 ] || { echo "usage: pagemetrics <out.json> <url | page.html> [more ...]" >&2; exit 64; }
    out=$(abs "$1"); shift; urls=()
    for u in "$@"; do urls+=("$(abs "$u")"); done
    mkdir -p "$(dirname "$out")"
    exec node /app/pagemetrics.mjs "$out" "${urls[@]}" ;;
  mockup)
    exec python3 /app/mockup.py "$@" ;;
  source)
    # print a bundled file, e.g. `source uiaudit.js` for running the audit in a logged-in browser
    case "${1:-}" in uiaudit.js|fixture.html) exec cat "/app/$1";; *) echo "source: uiaudit.js | fixture.html" >&2; exit 64;; esac ;;
  help|-h|--help)
    echo "commands: ui-audit, pagemetrics, mockup, source <uiaudit.js|fixture.html>" ;;
  *) exec "$cmd" "$@" ;;
esac
