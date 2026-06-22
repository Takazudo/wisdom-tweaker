#!/usr/bin/env bash
# Read-only safety assessment of ONE wisdom repo for /l-each's preparation phase.
# Never mutates the repo (no checkout, no fetch). The orchestrator decides what to do
# from the VERDICT.
#
# Usage: prep-check.sh <repo-path>
# Exit:  0 = CLEAN (safe to checkout main and run a task)
#        3 = DIRTY (meaningful uncommitted work -- must be reported, do not touch)
#        2 = bad argument / not a git repo
#
# CLEAN/DIRTY is decided purely from the working tree. A non-main branch is NOT a
# problem on its own -- the orchestrator just checks out main on a clean repo.
set -euo pipefail

repo="${1:-}"
[ -n "$repo" ] || { echo "usage: prep-check.sh <repo-path>" >&2; exit 2; }
[ -d "$repo/.git" ] || { echo "not a git repo: $repo" >&2; exit 2; }

# Build/editor artifacts that are safe to ignore even when they surface as untracked.
# .astro/ is Astro's generated type cache; it is listed in .gitignore in some wisdom
# repos but missing from others, so it can show up untracked. It is never real work.
# Anything NOT matched here is treated as meaningful (fail-safe: better to ask than to
# unleash an autonomous task on top of uncommitted work).
noise_re='^(\.astro/?|\.DS_Store|Thumbs\.db)$'

branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(detached)')"

tracked=()        # meaningful tracked changes: modified/staged/deleted/renamed
untracked=()      # meaningful untracked entries (noise filtered out)
ignored_noise=()

while IFS= read -r line; do
  [ -n "$line" ] || continue
  code="${line:0:2}"
  path="${line:3}"
  if [ "$code" = "??" ]; then
    if [[ "$path" =~ $noise_re ]]; then
      ignored_noise+=("$path")
    else
      untracked+=("$path")
    fi
  else
    tracked+=("$code $path")
  fi
done < <(git -C "$repo" status --porcelain=v1)

unpushed=0
if git -C "$repo" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  unpushed="$(git -C "$repo" rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
fi

if [ "${#tracked[@]}" -eq 0 ] && [ "${#untracked[@]}" -eq 0 ]; then
  verdict=CLEAN
else
  verdict=DIRTY
fi

echo "REPO: $repo"
echo "BRANCH: $branch"
echo "VERDICT: $verdict"
[ "$unpushed" != "0" ] && echo "UNPUSHED_COMMITS: $unpushed"
if [ "${#tracked[@]}" -gt 0 ]; then
  for t in "${tracked[@]}"; do echo "  tracked-change: $t"; done
fi
if [ "${#untracked[@]}" -gt 0 ]; then
  for u in "${untracked[@]}"; do echo "  untracked: $u"; done
fi
if [ "${#ignored_noise[@]}" -gt 0 ]; then
  echo "  (ignored noise: ${ignored_noise[*]})"
fi

[ "$verdict" = "CLEAN" ] && exit 0 || exit 3
