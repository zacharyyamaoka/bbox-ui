#!/usr/bin/env bash
# Reproduce the Cloudflare build locally, so an agent can iterate without a human
# copy-pasting dashboard logs.
#
# WHY this exists: the first two deploys of bbox-ui.com failed for reasons that were
# fully knowable before pushing — HEAD was not on origin/main, and the build shelled
# out to a runtime the build image resolved differently. Cloudflare Workers Builds
# posts NO commit status or check-run back to GitHub (verified: check-runs total_count
# is 0), so there is nothing to poll from here. The only fast feedback loop is to run
# the same steps locally, in the same order, and fail the same way.
#
#   ./scripts/preflight.sh          before pushing
#   ./scripts/preflight.sh --live   after deploying, to check what is actually served
#
# Exit code is 0 only if every check passes, so an agent can gate on it.

set -uo pipefail
cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
FAILED=0
pass() { printf "  ${GRN}✓${OFF} %s\n" "$1"; }
fail() { printf "  ${RED}✗${OFF} ${BOLD}%s${OFF}\n    %s\n" "$1" "$2"; FAILED=1; }
warn() { printf "  ${YEL}!${OFF} %s\n    %s\n" "$1" "$2"; }
step() { printf "\n${BOLD}%s${OFF}\n" "$1"; }

SITE="${BBOX_SITE:-https://bbox-ui.com}"

# ---------------------------------------------------------------- git reachability
step "Can Cloudflare see your work?"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  warn "working tree has uncommitted changes" \
       "CI builds the pushed commit, not your disk. These changes will NOT deploy."
else
  pass "working tree clean"
fi

git fetch origin --quiet 2>/dev/null
LOCAL=$(git rev-parse HEAD)
if ! REMOTE=$(git rev-parse origin/main 2>/dev/null); then
  fail "cannot resolve origin/main" "check your remote"
elif [ "$LOCAL" = "$REMOTE" ]; then
  pass "HEAD is on origin/main ($(git rev-parse --short HEAD))"
elif git merge-base --is-ancestor "$LOCAL" "$REMOTE" 2>/dev/null; then
  pass "HEAD is an ancestor of origin/main — already deployed or superseded"
else
  AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "?")
  fail "HEAD is $AHEAD commit(s) ahead of origin/main" \
       "Cloudflare builds origin/main. Push first, or the build runs old code:
      git push origin main"
fi

# ------------------------------------------------------------------ what CI runs
step "The exact sequence Cloudflare runs"

printf "  ${DIM}pnpm install --frozen-lockfile${OFF}\n"
if OUT=$(pnpm install --frozen-lockfile 2>&1); then
  pass "lockfile satisfies --frozen-lockfile"
else
  fail "pnpm install --frozen-lockfile" \
       "$(printf '%s' "$OUT" | tail -4 | sed 's/^/      /')
      Fix: run 'pnpm install' and commit pnpm-lock.yaml"
fi

printf "  ${DIM}pnpm docs:build${OFF}\n"
if OUT=$(pnpm docs:build 2>&1); then
  pass "docs build succeeded"
else
  fail "pnpm docs:build" "$(printf '%s' "$OUT" | tail -12 | sed 's/^/      /')"
fi

printf "  ${DIM}npx wrangler deploy --dry-run${OFF}\n"
if OUT=$(npx --yes wrangler@latest deploy --dry-run 2>&1); then
  N=$(printf '%s' "$OUT" | grep -oE 'Read [0-9]+ files' | grep -oE '[0-9]+' | head -1)
  pass "wrangler config valid — ${N:-?} files ready to upload"
else
  fail "wrangler deploy --dry-run" "$(printf '%s' "$OUT" | tail -8 | sed 's/^/      /')"
fi

# ------------------------------------------------------------- what is really live
if [ "${1:-}" = "--live" ]; then
  step "What $SITE is actually serving"

  # WHY the body is checked and not the status code: an unconfigured Worker returns
  # 200 with "Hello world" on EVERY path, so a 200 proves nothing. That is exactly
  # how the first deploy looked healthy while serving the default scaffold.
  BODY=$(curl -s --max-time 20 "$SITE/r/port.json" 2>/dev/null)
  if printf '%s' "$BODY" | head -c 400 | grep -q '"name"[[:space:]]*:[[:space:]]*"port"'; then
    pass "/r/port.json returns the real registry payload"
  elif printf '%s' "$BODY" | grep -qi "hello world"; then
    fail "$SITE is still the default Worker scaffold" \
         "Every path returns \"Hello world\". The build never replaced it —
      check the Deployments tab for a failed build."
  else
    fail "/r/port.json is not the expected registry JSON" \
         "got: $(printf '%s' "$BODY" | head -c 120)"
  fi

  MISS=$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "$SITE/__preflight_should_404__" 2>/dev/null)
  if [ "$MISS" = "404" ]; then
    pass "unknown paths 404 (asset routing is live, not a catch-all)"
  else
    fail "unknown path returned $MISS, expected 404" \
         "a catch-all 200 means a placeholder Worker is still in front of the assets"
  fi

  for P in / /docs/components/port /docs/components/block; do
    CODE=$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' "$SITE$P" 2>/dev/null)
    [ "$CODE" = "200" ] && pass "$P -> 200" || fail "$P -> $CODE" "expected 200"
  done
fi

# ------------------------------------------------------------------------ verdict
if [ "$FAILED" = "0" ]; then
  printf "\n${GRN}${BOLD}preflight passed${OFF} — this commit will build on Cloudflare.\n\n"
else
  printf "\n${RED}${BOLD}preflight failed${OFF} — fix the above; the Cloudflare build would fail the same way.\n\n"
fi
exit "$FAILED"
