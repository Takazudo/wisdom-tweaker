#!/usr/bin/env bash
# Refresh ONE wisdom repo: checkout main + git pull (fast-forward only), then re-bake
# the repo's doc skill for both assistants (pnpm setup:doc-skill:both).
# If the repo has meaningful uncommitted changes, do NOT touch it -- report DIRTY instead.
# Never force-anything: pull is --ff-only, so a diverged main is reported, not clobbered.
#
# The bake runs even on an "up to date" pull: it is idempotent and cheap (symlinks +
# one generated SKILL.md, no build), and it also repairs a manually broken global
# symlink or a stale category tree the pull state alone can't reveal.
#
# Usage: sync-repo.sh <repo-path>
# Exit:  0 = synced (pulled or already up to date), bake OK or legitimately skipped
#        3 = DIRTY -- skipped, must be reported
#        4 = pull failed (e.g. diverged / no fast-forward)
#        5 = checkout main failed
#        6 = synced, but the doc-skill bake failed -- must be reported
#        2 = bad argument / not a git repo
set -euo pipefail

repo="${1:-}"
[ -n "$repo" ] || { echo "usage: sync-repo.sh <repo-path>" >&2; exit 2; }
[ -d "$repo/.git" ] || { echo "not a git repo: $repo" >&2; exit 2; }

# Same noise filter as l-each/scripts/prep-check.sh -- .astro/ etc. are generated,
# never real work, even when untracked.
noise_re='^(\.astro/?|\.DS_Store|Thumbs\.db)$'

branch_before="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(detached)')"

tracked=()
untracked=()
while IFS= read -r line; do
  [ -n "$line" ] || continue
  code="${line:0:2}"
  path="${line:3}"
  if [ "$code" = "??" ]; then
    if [[ "$path" =~ $noise_re ]]; then
      :
    else
      untracked+=("$path")
    fi
  else
    tracked+=("$code $path")
  fi
done < <(git -C "$repo" status --porcelain=v1)

echo "REPO: $repo"
echo "BRANCH_BEFORE: $branch_before"

if [ "${#tracked[@]}" -gt 0 ] || [ "${#untracked[@]}" -gt 0 ]; then
  echo "VERDICT: DIRTY"
  for t in "${tracked[@]}"; do echo "  tracked-change: $t"; done
  for u in "${untracked[@]}"; do echo "  untracked: $u"; done
  exit 3
fi

if ! checkout_output="$(git -C "$repo" checkout main 2>&1)"; then
  echo "VERDICT: CHECKOUT_FAILED"
  echo "CHECKOUT_OUTPUT: $checkout_output"
  exit 5
fi

before_sha="$(git -C "$repo" rev-parse HEAD)"
if ! pull_output="$(git -C "$repo" pull --ff-only 2>&1)"; then
  echo "VERDICT: PULL_FAILED"
  echo "PULL_OUTPUT: $pull_output"
  exit 4
fi
after_sha="$(git -C "$repo" rev-parse HEAD)"

echo "VERDICT: CLEAN"
if [ "$before_sha" = "$after_sha" ]; then
  echo "PULL_RESULT: up to date ($after_sha)"
else
  echo "PULL_RESULT: updated $before_sha -> $after_sha"
fi

# --ff-only pull only fast-forwards local to remote -- it says nothing about local
# commits remote doesn't have yet. Check explicitly so a forgotten push (the exact
# problem this skill exists to catch) doesn't slip through as a false "up to date".
ahead="$(git -C "$repo" rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
[ "$ahead" != "0" ] && echo "AHEAD_OF_ORIGIN: $ahead (unpushed commits)"

# Re-bake the doc skill (claude + codex). The generated skill's docs/ is a symlink,
# so ordinary article edits need no bake -- what goes stale is the SKILL.md scaffold
# (top-level category tree, tracked-skill links, template changes riding a pull).
# A repo without the script gets a named SKIP line, never a silent green
# ("a guard that reports nothing must not look like a guard that found nothing wrong").
has_bake="$(node -e "
const s = (require('$repo/package.json').scripts) || {};
process.stdout.write(s['setup:doc-skill:both'] ? 'yes' : 'no');
" 2>/dev/null || echo error)"

if [ "$has_bake" = "yes" ]; then
  if bake_output="$(cd "$repo" && pnpm run --silent setup:doc-skill:both 2>&1)"; then
    # An exit-0 bake that linked nothing is a failure in disguise -- require the
    # Global symlink evidence lines before calling it OK.
    links="$(printf '%s\n' "$bake_output" | grep -c 'Global symlink:' || true)"
    if [ "$links" -ge 2 ]; then
      skill_line="$(printf '%s\n' "$bake_output" | grep -m1 "^Done! Skill" || true)"
      echo "BAKE: OK ($links global symlinks refreshed) ${skill_line}"
    else
      echo "BAKE: SUSPECT -- exit 0 but only $links 'Global symlink:' lines (expected 2 for --target both)"
      printf '%s\n' "$bake_output"
      exit 6
    fi
  else
    echo "BAKE: FAILED"
    printf '%s\n' "$bake_output"
    exit 6
  fi
elif [ "$has_bake" = "no" ]; then
  echo "BAKE: SKIPPED (no setup:doc-skill:both script in package.json)"
else
  echo "BAKE: FAILED (could not read package.json scripts)"
  exit 6
fi

exit 0
