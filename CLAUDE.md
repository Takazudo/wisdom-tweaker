# wisdom-tweaker

Control repo for tweaking the family of **`*-wisdom`** documentation repos in bulk.

This repo holds no documentation of its own. Its job is to apply a single change — a dependency
bump, a shared fix, a convention update — across every wisdom repo at once, instead of repeating
the same edit by hand in each one. New wisdom repos are added over time; the tooling here
discovers them automatically.

## The wisdom repos

Each wisdom repo is an independent git repository that lives as a **sibling** of wisdom-tweaker
(same parent directory), named `<topic>-wisdom`:

```
repos/wisdom/
├── wisdom-tweaker/        ← this repo (the control repo)
├── zudo-cloudflare-wisdom/
├── zudo-codemirror-wisdom/
├── zudo-css-wisdom/
├── zudo-slack-wisdom/
├── zudo-tauri-wisdom/
└── zudo-test-wisdom/      ← …and more added over time
```

They are all built the same way: zudo-doc / zfb-stack Astro + MDX documentation sites (pnpm,
Tailwind v4), each deployed to Cloudflare and each generating a global `<topic>-wisdom` Claude
skill (e.g. `/css-wisdom`, `/cloudflare-wisdom`) that is symlinked into `~/.claude/skills/`. Their
shared shape is what makes "do X to every one" a sensible operation.

Do not assume the list above is complete or fixed — always discover the current set with
`.claude/skills/l-each/scripts/discover-repos.sh` (any `*-wisdom` git repo next to wisdom-tweaker).

### The fleet spans two toolchain generations

"Built the same way" stopped meaning "built identically" when zudo-slack-wisdom arrived scaffolded
on the **next** generation:

| | zfb | zudo-doc | `create-zudo-doc` devDep |
|---|---|---|---|
| cloudflare, codemirror, css, tauri, test | `0.1.0-next.99` | `^4.4.13` | `^4.4.13` |
| **slack** | `2.2.0` | `^5.2.0` | **absent by design** |

The 5.x scaffold treats `create-zudo-doc` as a one-shot `pnpm create zudo-doc` CLI run rather than a
retained toolchain piece. A new repo is therefore **not** automatically a sixth instance of the same
thing — check its generation before assuming a canonical script applies to it.

## /l-each — the one skill that matters here

`/l-each <task>` runs the same task across every discovered wisdom repo. See
`.claude/skills/l-each/SKILL.md`. In short:

- `/l-each /some-command` → runs that slash command verbatim in each repo.
- `/l-each <natural-language request>` → runs `/x -m -a <request>` in each repo (full
  plan → implement → merge → cleanup automation).

Before running anything, `/l-each` enforces a **preparation safety gate**: every repo must be on a
clean `main`. If a repo has meaningful uncommitted work (a modified doc, an untracked source file —
often a doc edit someone forgot to commit), `/l-each` stops, reports it, and asks before touching
anything. Build noise like `.astro/` is ignored; real work is never bulldozed.

## /l-sync — refresh every repo to a clean, up-to-date main

`/l-sync` is the lightweight companion to `/l-each`: no dev task, no commits/merges — it just
`git checkout main` + `git pull --ff-only` in every discovered wisdom repo. A repo with meaningful
uncommitted changes is never touched, only reported. See `.claude/skills/l-sync/SKILL.md`.

## shared/ — canonical files distributed to every wisdom repo

`shared/scripts/` holds the **canonical copy** of scripts that every wisdom repo carries verbatim.
The point is that a family-wide guard has exactly one source of truth: edit it here, then re-sync it
outward with `/l-each`. Five repos independently inventing five variants of the same check is the
failure mode this directory exists to prevent.

- `check-category-meta.mjs` → each repo's `scripts/check-category-meta.mjs`, run as
  `pnpm check:category-meta` and wired into `b4push`. Guards the
  [zudo-css-wisdom#183](https://github.com/Takazudo/zudo-css-wisdom/issues/183) class of bug:
  zudo-doc silently ignores `_category_.json` under zfb (its `node:fs` read throws into a bare
  `catch`), so category `label`/`position`/`description`/`noPage` are discarded with a green build.
  It fails on any surviving sidecar, and on a `headerNav` entry pointing at a
  `category_no_page: true` page — a 404 that `check:links --strict-broken` provably does not catch.
- `check-pin-parity.mjs` → each repo's `scripts/check-pin-parity.mjs`. Enforces that the zfb family and
  the zudo-doc family each move in lockstep. `@takazudo/zfb-md-wasm` was missing from its `ZFB_PACKAGES`
  list, so a stale md-wasm passed silently — found only when the family moved off `next.89`.

### Verifying the fleet is actually in sync

```bash
scripts/check-canonical-sync.sh
```

Diffs every discovered wisdom repo's `scripts/<name>` against `shared/scripts/<name>` and fails on
any mismatch. Run it **before and after** an `/l-each` sync round.

This is a control-repo check by necessity: a wisdom repo has no access to wisdom-tweaker in CI, so it
cannot compare itself against canonical. "All five are byte-identical" is only ever true at an
instant — during one `/l-each` run the category-meta script moved four times as reviews found bugs,
and repos that had already merged were silently left behind, including on a fix for a CI-blocking
false positive. Nothing would have reported that. Undetected divergence is the same failure class the
distributed guards exist to catch, so the distribution mechanism must not itself be unguarded.

### Promoting a file into shared/

Before promoting an existing per-repo script to `shared/scripts/`, **diff that file across every
repo and adopt the strongest version** — do not assume a chosen reference repo is representative.

`check-pin-parity.mjs` was canonicalized from zudo-test-wisdom, whose `ZFB_PACKAGES` omitted
`@takazudo/zfb-md-wasm`. Two repos (codemirror, tauri) already had the complete four-package list;
two (test, cloudflare) did not; css had no copy and inherited the gap when one was created for it by
copying test's. Canonicalizing from the weaker copy meant distributing the worse structure
family-wide and then "fixing" it back to what half the fleet already had. `check-canonical-sync.sh`
now makes that divergence visible, but only after the fact — the diff belongs *before* promotion.

The same diff is owed to a **newly added** repo, in reverse: its copy may be ahead of canonical, and
`check-canonical-sync.sh` reports only "STALE" — a word that quietly asserts canonical is the better
version. When zudo-slack-wisdom arrived, its `check-pin-parity.mjs` read as stale but actually held
one improvement canonical lacked (an exact-pin regex, rejecting `^`/`~` on the zfb group, which the
wrangler-pin gate depends on) and one correct-for-5.x change canonical would have destroyed. Read
the diff before overwriting; do not treat "STALE" as a verdict about quality.

### Optionality must be keyed on a detected generation, never on absence

Distributing one script to repos of two generations forces the question of what to do when a member
is legally missing. The cheap answer — *optional: skip it if absent* — is wrong, and the control that
caught it is worth keeping: with `create-zudo-doc` blanket-optional, a 4.x repo that silently **lost**
its `create-zudo-doc` pin passed green, indistinguishable from a legitimate 5.x repo. The guard went
blind on exactly the drift it exists to catch.

So `check-pin-parity.mjs` keys optionality on the zudo-doc **major** read off the one package present
in every generation: mandatory on 4.x, optional only on 5.x+, and an unparseable pin yields `NaN`,
which fails every predicate — an unreadable version makes members *more* required, not less. Absence
still prints a named `SKIPPED` line, per the "a guard that reports nothing must not look like a guard
that found nothing wrong" rule below.

Generalized: **an exemption must be earned by a positive signal, not granted by a missing one.**
Absence is what the failure looks like too.

### Verifying a rendering change across the fleet

A green build, a passing type-check and a clean link check say nothing about whether a page still
*looks* right. When a change touches rendering (adopting a package-owned route, a layout toggle, a
CSS token), three traps bit real repos during one `/l-each` round:

- **Proxy metrics that match while measuring the wrong element.** Three of five repos hit this. A
  probe reported "all metrics match" — one even reported 1 column on a visibly 4-column grid —
  because it had latched onto an outer wrapper instead of the grid. Measure the computed
  `gridTemplateColumns` of an element confirmed to be `display: grid`, rather than inferring columns
  from bounding boxes of guessed selectors.
- **`fullPage: true` screenshots are not comparable.** Two repos saw a phantom 3-columns-to-2
  collapse that the DOM contradicted; on a ~3100px page these captures are unstable, and async
  webfont resolution alone made one repo's baseline differ from every later capture. Use
  viewport-sized captures **plus** a DOM measurement — never either alone.
- **Pick a viewport that can discriminate — a byte-identical screenshot is not self-validating.** The
  default content band caps at `80rem` = 1280px, so at a 1280 viewport a widened and un-widened home
  render identically. One repo compared before and after with a sound method and got byte-identical
  PNGs in both locales — from `headless-check.js`'s default 1280×720 viewport, which cannot tell the
  two apart. It was the most confident-sounding claim of the round and it proved nothing. This is the
  cleanest example in this section precisely because nothing else about the method was wrong. Verify
  at ≥1440.

**The rule that subsumes all three: prove the instrument discriminates before trusting what it says.**
Build a control in which the change is deliberately *absent*, and confirm the measurement actually
reports a difference. One repo re-verified a layout change at 1600px and also built a control with the
toggle removed:

| variant | band @1600 | columns |
|---|---|---|
| old hand-rolled `wide` | 1416px | 4 |
| new `home.wide` | 1416px | 4 |
| **control — toggle removed** | **1216px** | **3** |

Only the third row makes the first two mean anything. Without it, "before and after are identical" is
equally consistent with "the change works" and "the check is blind" — and every failure in this
section is an instance of not being able to tell those apart.

The corollary inverts the usual reading of a pixel-identical result: **sometimes identical output is
proof the fix did *not* land.** Retiring the hand-rolled home routes also restored a `tags` prop the
reconstructions had stopped forwarding, so on a site that actually used tags, byte-identical rendering
afterwards would have meant the package route was still being shadowed. It was safe to read identity as
success here only because no wisdom repo sets `docTags` or has a doc with `tags:` frontmatter. Establish
what a *failed* change would look like before deciding what an identical one proves.

Also: `dist/index.html` built locally will never byte-match the deployed artifact in these repos —
`src/content/docs/claude-skills/` is gitignored and generated by `setup:doc-skill`, so CI never has
it. Byte-identical proofs are valid local-vs-local only; extending one to production chases a phantom.

### Two lessons worth keeping

A guard that reports nothing must never be indistinguishable from a guard that found nothing wrong.
The first `check-category-meta.mjs` printed a green `OK` on codemirror-wisdom after parsing **zero**
`headerNav` entries, because that repo declares its nav in `src/config/settings.ts` and the script only
grepped `zfb.config.ts`. Sandbox verification read "no warnings" as "all links fine". Anything added to
`shared/` should print the counts it actually inspected, and treat "found nothing to check" as a warning
rather than success — otherwise the tooling manufactures confidence, which is worse than no tooling.

And a guard that blocks correct code is worse than the gap it closed. Fixing the false-green above, the
`category_no_page` matcher was widened to accept `yes` and `on` — but `gray-matter`/`js-yaml` use the
YAML **1.2 core schema**, where those parse as the *strings* `"yes"`/`"on"`, not booleans. Such a page
publishes normally, so the widened check would have failed CI in all five repos on correct frontmatter.
Match what the parser actually produces, verified by running it — not what the spec appears to allow.

Note that `check:template-drift` already covers "does this repo still match clean scaffolding" by
diffing against `node_modules/create-zudo-doc/templates/`, with `.template-drift-allowlist`
documenting each intentional divergence. Prefer bumping in place and reconciling that diff over
re-scaffolding a site and moving content across — a re-scaffold silently drops the host
customizations the allowlist exists to record.

## Conventions

- Project-scope skills in this family use an **`l-` prefix** (`l-each`, `l-sync`, and `l-translate` /
  `l-writing` / etc. inside individual wisdom repos). Personal/global tooling skills use other
  prefixes (`dev-*`, `gh-*`, …).
- File names: kebab-case.
- Scripts that operate across repos self-locate relative to wisdom-tweaker and act on siblings —
  they take no hardcoded absolute paths, so the tooling keeps working when the repo set changes.

## Safety

- `/l-each` never commits, pushes, or merges on its own — the dispatched task owns that. The gate
  exists so an autonomous, merging task (`/x -m -a`) is never unleashed on top of uncommitted work.
- `rm -rf`: relative paths only (`./path`), never absolute.
- No force push, no `--amend` unless explicitly permitted.
