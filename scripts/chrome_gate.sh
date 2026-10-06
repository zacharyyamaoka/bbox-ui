#!/usr/bin/env bash
# P1 gate: which refs still touch the chrome write set?
# Distinguishes "diff is non-empty" (a real hit) from "diff could not be computed"
# (unrelated history / tooling failure), which the work order's original `||` arm
# silently reported as a hit.
set -u
PATHS=(apps/systemsketch/src/chrome apps/systemsketch/src/main.tsx apps/systemsketch/src/App.tsx)
hits=0; unrelated=0; multi=0; clean=0
for b in $(git for-each-ref refs/heads --format='%(refname:short)'); do
  case "$b" in main|gh-pages) continue;; esac
  mapfile -t bases < <(git merge-base --all main "$b" 2>/dev/null)
  if [ "${#bases[@]}" -eq 0 ] || [ -z "${bases[0]:-}" ]; then
    echo "UNRELATED  $b  (no merge base with main — NOT a hit)"; unrelated=$((unrelated+1)); continue
  fi
  if [ "${#bases[@]}" -gt 1 ]; then multi=$((multi+1)); note=" [${#bases[@]} merge bases; used ${bases[0]:0:8}]"; else note=""; fi
  git diff --quiet "${bases[0]}" "$b" -- "${PATHS[@]}"
  rc=$?
  case $rc in
    0) clean=$((clean+1));;
    1) echo "TOUCHES    $b$note"; hits=$((hits+1));;
    *) echo "ERROR($rc) $b — diff could not be computed; investigate, do NOT count as a hit";;
  esac
done
echo "--- dirty working trees (a lane mid-edit is invisible to a branch diff) ---"
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
  d=$(git -C "$wt" status --porcelain -- "${PATHS[@]}" 2>/dev/null)
  [ -n "$d" ] && echo "DIRTY      $wt"
done
echo "--- gate: $hits touching · $clean clean · $unrelated unrelated · $multi multi-base ---"
[ "$hits" -eq 0 ] && echo "GATE OPEN" || echo "GATE CLOSED"
