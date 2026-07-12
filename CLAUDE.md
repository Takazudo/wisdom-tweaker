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
├── zudo-tauri-wisdom/
└── zudo-test-wisdom/      ← …and more added over time
```

They are all built the same way: zudo-doc / zfb-stack Astro + MDX documentation sites (pnpm,
Tailwind v4), each deployed to Cloudflare and each generating a global `<topic>-wisdom` Claude
skill (e.g. `/css-wisdom`, `/cloudflare-wisdom`) that is symlinked into `~/.claude/skills/`. Their
shared shape is what makes "do X to every one" a sensible operation.

Do not assume the list above is complete or fixed — always discover the current set with
`.claude/skills/l-each/scripts/discover-repos.sh` (any `*-wisdom` git repo next to wisdom-tweaker).

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
