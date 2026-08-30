# Fleet confirmation report — check-category-meta.mjs generated-dir fix

Confirms sub-issue #4's fix (`shared/scripts/check-category-meta.mjs`) against the six real
`*-wisdom` sibling repos, using real `git clone --no-hardlinks` clones (not `git archive`), so the
fixed script's `.gitignore` resolution actually runs. Method, acceptance criteria, and controls per
issue #5.

Measured 2026-08-31. All six clones were fresh (unbuilt — no `src/content/docs/claude/` present
except in slack-wisdom, where it is committed).

## Per-repo before/after

"Before" = the clone's own committed `scripts/check-category-meta.mjs` (pre-fix). "After" = the
fixed script copied into the clone's `scripts/` and run from there (`ROOT` is derived from
`import.meta.url`, so the copy is mandatory — a script left at `shared/scripts/` resolves against
the wrong repo entirely).

| repo | before | after | exit (before → after) |
|---|---|---|---|
| zudo-cloudflare-wisdom | `⚠️ [UNRESOLVED] headerNav "/docs/claude"` | `[GENERATED] … gitignored by .gitignore:51` | 0 → 0 |
| zudo-codemirror-wisdom | `⚠️ [UNRESOLVED] headerNav "/docs/claude"` | `[GENERATED] … gitignored by .gitignore:46` | 0 → 0 |
| zudo-css-wisdom | `⚠️ [UNRESOLVED] headerNav "/docs/claude"` | `[GENERATED] … gitignored by .gitignore:53` | 0 → 0 |
| zudo-tauri-wisdom | `⚠️ [UNRESOLVED] headerNav "/docs/claude"` | `[GENERATED] … gitignored by .gitignore:44` | 0 → 0 |
| zudo-test-wisdom | `⚠️ [UNRESOLVED] headerNav "/docs/claude"` | `[GENERATED] … gitignored by .gitignore:46` | 0 → 0 |
| zudo-slack-wisdom (control 1) | clean, no note/warning | clean, no note/warning — **byte-identical** to before | 0 → 0 |

All five affected repos flip `[UNRESOLVED]` → `[GENERATED]` for `/docs/claude` exactly as expected.
No repo changed exit code; all six exit 0 both before and after.

## Control 1 — slack-wisdom unchanged (PASS)

slack-wisdom's `src/content/docs/claude/index.mdx` is committed, so it never had the bug. Ran the
clone's own pre-fix script, then the fixed script, and diffed full stdout+exit code:

```
$ diff slack-before.txt slack-after.txt && echo IDENTICAL
IDENTICAL — slack-wisdom output byte-identical before/after
```

The fix is not over-broad: it changes output for exactly the five repos with the bug and touches
nothing in the one repo that never had it.

## Control 2 — typo nav path still warns (PASS, and it discriminates within a single run)

Built a scratch fixture from the test-wisdom clone (`zudo-test-wisdom-typo-fixture`, a throwaway
copy, not one of the six sibling repos) by adding a second `headerNav` entry:

```
{ label: "TypoControl", path: "/docs/totally-nonexistent-typo-path", categoryMatch: "typo" },
```

Verified this path is neither committed nor gitignored before running the check:

```
$ git check-ignore -v "src/content/docs/totally-nonexistent-typo-path/"; echo exit=$?
exit=1
$ ls src/content/docs/totally-nonexistent-typo-path
No such file or directory
```

Running the fixed script against the fixture produces **both** outcomes in the same run:

```
· [GENERATED] headerNav "/docs/claude" — target dir is gitignored by .gitignore:46 (build-generated); resolution deferred to the build.
· probed 2 unique target dir(s) for 2 unresolved nav entr(ies) against in-repo .gitignore rules; 1 exempted as build-generated
⚠️  [UNRESOLVED] headerNav "/docs/totally-nonexistent-typo-path" — no source file found in the default content dir (src/content/docs). Verify this link manually; the check could not.
```

This is the strongest form of the control: the real generated dir gets exempted while the typo path
still warns, in the same process, on the same repo — so the probe is not simply "quiet everywhere,"
it discriminates path-by-path. The probe is not blind.

## Control 3 — every exemption attributed to a tracked .gitignore with a line number (PASS)

Each `[GENERATED]` note names `source:line`. Verified independently against each clone's tracked
`.gitignore`:

| repo | cited rule | `.gitignore` line contents |
|---|---|---|
| zudo-cloudflare-wisdom | `.gitignore:51` | `src/content/docs/claude/` |
| zudo-codemirror-wisdom | `.gitignore:46` | `src/content/docs/claude/` |
| zudo-css-wisdom | `.gitignore:53` | `src/content/docs/claude/` |
| zudo-tauri-wisdom | `.gitignore:44` | `src/content/docs/claude/` |
| zudo-test-wisdom | `.gitignore:46` | `src/content/docs/claude/` |

All five cite the repo's own tracked `.gitignore` (basename `.gitignore`, not `.git/info/exclude` or
a `core.excludesFile`), each with a line number that was confirmed by `sed -n '<N>p' .gitignore` to
be the exact `src/content/docs/claude/` rule. No exemption attributed to any other source.

## Sidecar / NAV-404 — no regression observed (not proof; that proof is #4's cases 10–11)

None of the six repos triggered `[SIDECAR]` or `[NAV-404]` in either the before or after run, and
every run still exited 0. This is only a no-regression observation for the real fleet content —
the fixed script did not introduce a new failure mode there. It is not evidence that sidecar/NAV-404
detection itself works; that is established by the regression harness cases 10 and 11.

## Regression harness — still 11/11

```
$ node shared/scripts/__tests__/check-category-meta.test.mjs
11/11 case(s) passed.
```

No changes were needed to `shared/scripts/check-category-meta.mjs` during this confirmation — the
Wave 1 fix behaved correctly against real fleet content on first measurement.

## Method notes

- Clones: `git clone --no-hardlinks <sibling-repo-path> <tmp>/<repo>` for all six repos discovered
  via `.claude/skills/l-each/scripts/discover-repos.sh` (run from the main, non-worktree checkout —
  the script's path arithmetic assumes it is not itself running from inside a nested worktree, so
  running it from `worktrees/fleet-confirm` under-resolves the sibling search to `worktrees/`
  instead of `repos/wisdom/`; the script content is identical either way, only the cwd matters).
- The fixed script was copied into each clone's own `scripts/` directory before running — required,
  not incidental, since `ROOT` in the script is derived from `import.meta.url`.
- No build was run in any clone. `src/content/docs/claude/` is genuinely absent in the five affected
  clones, which is exactly the state that triggers the bug being fixed.
- All six sibling repos at `/Users/takazudo/repos/wisdom/*-wisdom` were `git status --porcelain`
  clean before this run and confirmed clean again after — nothing in this confirmation pass touched
  them. All work happened in throwaway clones under a scratch temp directory, not committed anywhere
  in those repos.
- Full console logs (before/after per repo, slack before/after, control-2 fixture run) saved to
  `$DROPBOX_CCLOGS_DIR/wisdom-tweaker/fleet-confirm-*.log` for durability beyond this session.

## Verdict

**PASS.** The Wave 1 fix behaves correctly on real fleet content: five affected repos flip from
false `[UNRESOLVED]` to attributed `[GENERATED]` notes, the one repo that never had the bug is
provably untouched, and a deliberately broken nav path still warns in the same run as a correctly
exempted one — proving the probe discriminates rather than going uniformly quiet.
