---
name: l-bump-all
description: >-
  Run a complete @takazudo dependency and scaffold update across every sibling *-wisdom repo:
  sync clean mains, use any already-ahead repo as migration evidence, dispatch the autonomous
  per-repo bump/PR/merge workflow, propagate cross-fleet findings, and finish with resolver,
  provenance, CI, cleanup, canonical-script, and doc-skill audits. Use when the user explicitly
  types /l-bump-all or asks for the full hands-off zudo dependency bump across the wisdom fleet.
user-invocable: true
disable-model-invocation: true
---

# /l-bump-all — update the whole wisdom fleet

Run one end-to-end first-party dependency round across every repo discovered by `/l-each`. This
skill owns orchestration; the existing skills own their established safety and implementation
details.

The per-repo task is exactly:

```text
/x -m -a /dev-bump-zudo-deps .
```

`-a` keeps each workflow autonomous and `-m` requires it to merge, watch post-merge CI, and clean
up. Do not silently weaken either flag.

## Phase 1 — sync and gate the fleet

Invoke `/l-sync` with no repo filter. It must discover the fleet dynamically, checkout/pull clean
`main` branches with `--ff-only`, and re-bake both assistants' doc skills.

Stop before dispatching any bump if `/l-sync` reports a dirty repo, an ahead/diverged main, a
checkout/pull failure, or a failed/suspect bake. Report the complete fleet result and let the user
resolve real work; a full-fleet autonomous merge round must not begin from partial readiness.

Run `scripts/check-canonical-sync.sh` from wisdom-tweaker before the round. A mismatch is evidence
to inspect, not permission to overwrite the sibling copy: the sibling may contain the stronger
implementation.

## Phase 2 — find useful migration evidence

Before mutation, run the `/dev-bump-zudo-deps` resolver read-only in every discovered repo and
compare the current and target generations. The resolver is authoritative about today's registry
targets.

If a repo is already on the target generation, use it as a reference candidate:

1. Find its most recent **relevant dependency/scaffold PR**; do not assume the newest PR overall is
   relevant.
2. Read the PR body, changed files, CI result, and focused diff.
3. Extract reusable impact notes and migration evidence for the other repo workers.

`zudo-test-wisdom` is often first to adopt a new zudo-doc generation, but it is not permanently
canonical. A reference PR is evidence only. Every target repo must still run its own resolver,
peer check, upstream-impact assessment, install, and verification.

Never copy a reference scaffold wholesale. Before adopting any generated/vendored file, inspect
the target repo's `.template-drift-allowlist`, `ZUDO_DEPS_PINS.md`, config shape, explicit doc-skill
name, route stubs, setup script, branding, favicons, and other host-owned files. Reconcile old
upstream, current local, and new upstream as a three-way change.

## Phase 3 — dispatch the exact task

Invoke:

```text
Skill tool: skill="l-each" args="/x -m -a /dev-bump-zudo-deps ."
```

Let `/l-each` run its fleet-wide preparation gate before it starts any worker. Each ready repo then
runs the single-topic `/x-as-pr` path: fresh branch, resolver and impact assessment, write/install,
vendored-provenance reconciliation, strongest project checks, review, PR, merge, post-merge CI,
and cleanup.

The `ZUDO_DEPS_PINS.md` phase is mandatory even when a repo has zero registry bumps. An
already-current repo can still need a scaffold reconciliation; conversely, never manufacture
manifest or lockfile changes for a genuine resolver no-op.

## Propagate findings across the whole round

A defect exposed in one repo may invalidate repos that already passed. When a worker finds a
first-party regression or a stronger guard:

1. Confirm it belongs upstream and invoke `/dev-upstream-report` once, after checking duplicates.
2. Give the evidence and minimal repro to every still-running repo worker when the harness permits.
3. Audit repos that already merged and run focused follow-up PRs where the finding applies.
4. Compare the resulting variants before standardizing; adopt the strongest tested version, not
   merely the first one written.

Any local workaround for a scaffold defect must be documented in `.template-drift-allowlist` and
`ZUDO_DEPS_PINS.md`, covered by a focused regression test, and linked to its upstream issue.

### Known divergence to reassess, not preserve forever

The fleet currently carries a local workaround for
[`zudolab/zudo-doc#3720`](https://github.com/zudolab/zudo-doc/issues/3720): the generated link
checker must recognize zfb's unquoted `href`/`id` attributes without misreading escaped serialized
demo markup. On every later zudo-doc bump, inspect the new upstream checker and its tests:

- upstream still lacks the behavior → preserve the tested local divergence;
- upstream fixes both sides → adopt the template version and deliberately remove the local patch,
  allowlist entry, and obsolete workaround note.

Do not decide from version numbers alone; run the discriminator fixtures.

## Phase 4 — prove the fleet converged

Do not stop at “all PRs merged.” Finish with all of these:

1. Invoke `/l-sync` again so every checkout lands on clean current `main` and both assistants'
   generated doc skills are re-baked from the merged scaffold.
2. Rerun the dependency resolver in every repo. Every row must be up to date, with zero pending
   bumps/errors; do not hard-code the package count.
3. Verify every `ZUDO_DEPS_PINS.md` entry points at the release actually reconciled in its files.
4. Confirm each repo is clean on `main`, matches `origin/main`, has green PR and exact-SHA
   post-merge CI, and has no workflow branch/PR/worktree left behind.
5. Run `scripts/check-canonical-sync.sh` again.
6. For any guard changed during the round, run its focused tests and a discriminator that proves it
   catches the broken control instead of merely exiting green.

Report one consolidated table: repo, versions/no-op outcome, PR(s), merge and post-merge CI,
repo-specific reconciliation, and cleanup. Make any skipped repo, failed deploy, stale pin,
remaining branch, or unresolved cross-fleet finding impossible to miss.
