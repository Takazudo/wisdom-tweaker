---
name: l-sync
description: >-
  Refresh every wisdom repo to a clean, up-to-date main: checkout main and git pull (fast-forward
  only) for each, then re-bake its doc skill for both assistants (pnpm setup:doc-skill:both).
  Never touches a repo that has meaningful uncommitted changes -- reports it instead. Use when the
  user types /l-sync, or asks to "refresh/sync/update each wisdom repo" or "pull latest for all
  wisdom repos".
user-invocable: true
disable-model-invocation: true
argument-hint: (optional) repo names to limit to, e.g. css test
---

# /l-sync — refresh every wisdom repo to a clean, up-to-date main

Lightweight companion to `/l-each`: no dev task is run, no commits/merges happen. This checks out
`main`, pulls (fast-forward only), and re-bakes the doc skill (`pnpm setup:doc-skill:both`) in
every wisdom repo, and reports any repo that can't be safely touched.

If the user named specific repos in `$ARGUMENTS`, operate on just those; otherwise operate on
every discovered repo.

## Phase 1 — Discover the repos

```bash
.claude/skills/l-each/scripts/discover-repos.sh
```

Reuses `/l-each`'s discovery script (generic: every `*-wisdom` git repo next to wisdom-tweaker).

## Phase 2 — Sync each repo

For each discovered repo, run directly (sequentially — these are cheap git operations, no need
for subagents):

```bash
.claude/skills/l-sync/scripts/sync-repo.sh <repo-path>
```

Per repo, the script:

- If the repo has meaningful uncommitted changes (modified/staged tracked files, or untracked
  source files — build noise like `.astro/` is filtered out): does **NOT** touch it. Prints
  `VERDICT: DIRTY` with details and exits 3.
- Otherwise: `git checkout main`, then `git pull --ff-only`, and prints whether it updated or was
  already up to date. Never force-pulls or rebases — a diverged main is reported as
  `PULL_FAILED`, not clobbered.
- After a successful pull, also checks whether local `main` is still ahead of `origin/main` (real
  unpushed local commits — a `--ff-only` pull says nothing about these, so "up to date" alone does
  NOT mean "nothing to push"). Prints `AHEAD_OF_ORIGIN: N` when true.
- Then re-bakes the repo's doc skill: `pnpm setup:doc-skill:both` (exit 6 on failure). Doc content
  itself needs no bake — the generated skill's `docs/` is a symlink into the repo — but the baked
  SKILL.md scaffold (top-level category tree, tracked-skill links, template changes riding a pull)
  does go stale, and the bake is idempotent and cheap. `BAKE: OK` requires 2 `Global symlink:`
  evidence lines in the bake output (claude + codex); an exit-0 bake without them reports
  `BAKE: SUSPECT`, and a repo without the script gets a named `BAKE: SKIPPED` — a bake that did
  nothing is never a silent green. DIRTY repos are not baked (untouched entirely).

`/l-sync` itself never commits, pushes, merges, or force-anything.

## Phase 3 — Report

One consolidated table: repo, branch, outcome (`pulled <old>..<new>` / `up to date` / `DIRTY` /
`PULL_FAILED` / `CHECKOUT_FAILED`), a bake column (`OK` / `SKIPPED` / `SUSPECT` / `FAILED`), plus
an unpushed-commits column. Make DIRTY repos, `AHEAD_OF_ORIGIN` repos, bake failures, and any
other failures impossible to miss — DIRTY/AHEAD usually mean real work (uncommitted or unpushed)
that the user forgot about, which is exactly what they'd want flagged.
