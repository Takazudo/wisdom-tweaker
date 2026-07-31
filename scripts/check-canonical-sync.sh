#!/usr/bin/env bash
set -euo pipefail

# check-canonical-sync.sh — verify every wisdom repo carries the current
# canonical copy of each file in shared/scripts/.
#
# Why this exists:
#
#   shared/scripts/ is the single source of truth for guards distributed to all
#   the wisdom repos, but "all five are byte-identical" is only true at an
#   instant. During one /l-each run the canonical category-meta script moved
#   four times as reviews found bugs, and repos that had already merged were
#   silently left a revision behind — including on a fix for a CI-blocking false
#   positive. Nothing anywhere would have reported that.
#
#   Both zudo-cloudflare-wisdom and zudo-tauri-wisdom independently asked for
#   this check, with the same reasoning: undetected divergence is the exact
#   failure class the distributed guards were written to catch, so the
#   distribution mechanism should not itself be unguarded.
#
# This is a CONTROL-REPO check, deliberately not a per-repo one: a wisdom repo
# has no access to wisdom-tweaker in CI, so it cannot compare itself against
# canonical. Run it here, before and after an /l-each sync round.
#
# Exit: 0 = every repo matches, 1 = at least one repo is stale or missing a file.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_DIR="$ROOT_DIR/shared/scripts"
DISCOVER="$ROOT_DIR/.claude/skills/l-each/scripts/discover-repos.sh"

if [[ ! -d "$SHARED_DIR" ]]; then
  echo "Error: $SHARED_DIR not found." >&2
  exit 1
fi

mapfile -t REPOS < <("$DISCOVER")
mapfile -t CANONICAL < <(find "$SHARED_DIR" -maxdepth 1 -type f -name '*.mjs' -o -maxdepth 1 -type f -name '*.sh' | sort)

if ((${#CANONICAL[@]} == 0)); then
  echo "No canonical files in shared/scripts/ — nothing to check."
  exit 0
fi

echo "Canonical files in shared/scripts/:"
for f in "${CANONICAL[@]}"; do
  printf "  %-28s %s\n" "$(basename "$f")" "$(md5sum "$f" | cut -c1-12)"
done
echo ""

STALE=()

for repo in "${REPOS[@]}"; do
  repo_name="$(basename "$repo")"
  for canon in "${CANONICAL[@]}"; do
    base="$(basename "$canon")"
    target="$repo/scripts/$base"

    if [[ ! -f "$target" ]]; then
      printf "  %-26s %-28s MISSING\n" "$repo_name" "$base"
      STALE+=("$repo_name/$base (missing)")
      continue
    fi

    if diff -q "$canon" "$target" >/dev/null 2>&1; then
      printf "  %-26s %-28s ok\n" "$repo_name" "$base"
    else
      printf "  %-26s %-28s STALE (%s vs canonical %s)\n" \
        "$repo_name" "$base" \
        "$(md5sum "$target" | cut -c1-12)" "$(md5sum "$canon" | cut -c1-12)"
      STALE+=("$repo_name/$base")
    fi
  done
done

echo ""
if ((${#STALE[@]} == 0)); then
  echo "OK — all ${#REPOS[@]} repo(s) carry the current canonical scripts."
  exit 0
fi

echo "FAILED — ${#STALE[@]} file(s) out of sync with shared/scripts/:"
for s in "${STALE[@]}"; do
  echo "   - $s"
done
echo ""
echo "Re-sync with /l-each, then re-run this check."
exit 1
