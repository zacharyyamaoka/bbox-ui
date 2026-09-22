#!/usr/bin/env bash
# Start the three sidebar-proposal Storybooks (A :5423, B :5424, C :5425).
# Idempotent: a port already listening is left alone, so pressing it twice is safe.
# WHY one script for three servers: comparing proposals needs all three up at
# once (the toolbar switch jumps between them), and one button beats three.
set -euo pipefail
pkg="$(cd "$(dirname "$0")/.." && pwd)"
for spec in a:5423 b:5424 c:5425; do
  org="${spec%%:*}" port="${spec##*:}"
  if ss -ltn "sport = :$port" | grep -q LISTEN; then
    echo "$org already up  http://localhost:$port"
    continue
  fi
  nohup pnpm --dir "$pkg" exec storybook dev -p "$port" --ci --no-open -c ".storybook-org/$org" \
    >"/tmp/storybook-org-$org.log" 2>&1 &
  echo "$org starting    http://localhost:$port   (log /tmp/storybook-org-$org.log)"
done
