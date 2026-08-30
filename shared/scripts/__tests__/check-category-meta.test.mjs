#!/usr/bin/env node

/**
 * Regression harness for shared/scripts/check-category-meta.mjs.
 *
 * Run: node shared/scripts/__tests__/check-category-meta.test.mjs
 * Exit: 0 = all cases pass, 1 = at least one failed.
 *
 * ── WHY THE FIXTURES COPY THE SCRIPT ──────────────────────────────────────
 * The script computes ROOT from `import.meta.url` as its own PARENT directory,
 * never from cwd — so the canonical copy at shared/scripts/ has ROOT=shared/.
 * Invoking the canonical path with `cwd` pointed at a fixture would inspect
 * shared/ and pass for reasons that have nothing to do with the fixture. Every
 * case therefore gets its own copy at <fixture>/scripts/check-category-meta.mjs
 * and runs THAT.
 *
 * ── WHY CASES 3–9 AND 12 EXIST ────────────────────────────────────────────
 * Case 1 alone would pass for a script that simply suppressed every warning.
 * Cases 3–9 and 12 are the controls: each one is a situation where the
 * exemption must NOT fire, and several carry a precondition assertion proving the fixture
 * really does reproduce the condition being guarded against (e.g. case 8 first
 * confirms the outer repo WOULD answer "ignored", so the surviving warning is
 * attributable to the top-level guard and not to a fixture that never armed).
 * Cases 10–11 are the other half: only a fixture that must FAIL can show that
 * SIDECAR and NAV-404 detection still work.
 *
 * All git state is scoped to the fixtures — GIT_CONFIG_GLOBAL points at a
 * throwaway file and the system config is disabled, so nothing here can read
 * or write the developer's real git configuration.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CANONICAL = join(HERE, "..", "check-category-meta.mjs");
const TMP = mkdtempSync(join(realpathSync(tmpdir()), "check-category-meta-"));

// ── fixture plumbing ──────────────────────────────────────────────────────

function envFor(name, extra = {}) {
  const cfg = join(TMP, `${name}.gitconfig`);
  if (!existsSync(cfg)) writeFileSync(cfg, "");
  const env = { ...process.env };
  // The script is supposed to sanitize these; the harness must not depend on
  // whatever the surrounding shell happened to export.
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return {
    ...env,
    GIT_CONFIG_GLOBAL: cfg,
    GIT_CONFIG_SYSTEM: "/dev/null", // POSIX-only; this fleet runs on macOS/WSL
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "harness",
    GIT_AUTHOR_EMAIL: "harness@example.invalid",
    GIT_COMMITTER_NAME: "harness",
    GIT_COMMITTER_EMAIL: "harness@example.invalid",
    ...extra,
  };
}

function git(dir, args, env) {
  return spawnSync("git", args, { cwd: dir, env, encoding: "utf-8" });
}

function gitOk(dir, args, env) {
  const r = git(dir, args, env);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${dir}: ${r.stderr.trim()}`);
  return r;
}

function write(dir, rel, content) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/** Creates <dir>/scripts/check-category-meta.mjs — the copy every case runs. */
function fixture(dir) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(CANONICAL, join(dir, "scripts", "check-category-meta.mjs"));
  return dir;
}

function config(navPaths, extra = "") {
  return `export default {
  docsDir: "src/content/docs",
  base: "/",
${extra}  headerNav: [
${navPaths.map((p) => `    { label: "${p}", path: "${p}" },`).join("\n")}
  ],
};
`;
}

function page(title, extraFrontmatter = "") {
  return `---\ntitle: ${title}\n${extraFrontmatter}---\n\n# ${title}\n`;
}

/** A minimal site: nav entries, plus a real page for /docs/overview. */
function site(dir, navPaths) {
  write(dir, "zfb.config.ts", config(navPaths));
  write(dir, "src/content/docs/overview/index.mdx", page("Overview"));
}

function initRepo(dir, env) {
  gitOk(dir, ["init", "-q", "-b", "main"], env);
  gitOk(dir, ["add", "-A"], env);
  gitOk(dir, ["commit", "-qm", "init"], env);
}

function runCheck(dir, env) {
  const r = spawnSync(process.execPath, [join(dir, "scripts", "check-category-meta.mjs")], {
    cwd: dir,
    env,
    encoding: "utf-8",
  });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

// ── assertions ────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Channel-aware: [GENERATED] must be stdout, [UNRESOLVED] must be stderr. */
function assertGenerated(r, navPath) {
  assert(r.out.includes(`[GENERATED] headerNav "${navPath}"`), `expected [GENERATED] note on STDOUT for ${navPath}\n--- stdout ---\n${r.out}\n--- stderr ---\n${r.err}`);
  assert(!r.err.includes("[GENERATED]"), `[GENERATED] must not appear on stderr\n${r.err}`);
}

function assertUnresolved(r, navPath) {
  assert(r.err.includes(`[UNRESOLVED] headerNav "${navPath}"`), `expected [UNRESOLVED] warning on STDERR for ${navPath}\n--- stdout ---\n${r.out}\n--- stderr ---\n${r.err}`);
  assert(!r.out.includes("[UNRESOLVED]"), `[UNRESOLVED] must not appear on stdout\n${r.out}`);
}

function assertNoUnresolved(r) {
  assert(!r.err.includes("[UNRESOLVED]") && !r.out.includes("[UNRESOLVED]"), `unexpected [UNRESOLVED]\n--- stdout ---\n${r.out}\n--- stderr ---\n${r.err}`);
}

function assertNoGenerated(r) {
  assert(!r.out.includes("[GENERATED]") && !r.err.includes("[GENERATED]"), `unexpected [GENERATED]\n--- stdout ---\n${r.out}\n--- stderr ---\n${r.err}`);
}

// ── cases ─────────────────────────────────────────────────────────────────

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test("1. gitignored generated dir, absent → [GENERATED] note, exit 0", () => {
  const env = envFor("case01");
  const dir = fixture(join(TMP, "case01"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  write(dir, ".gitignore", "src/content/docs/claude/\n");
  initRepo(dir, env);

  const r = runCheck(dir, env);
  assert(r.status === 0, `expected exit 0, got ${r.status}\n${r.err}`);
  assertGenerated(r, "/docs/claude");
  assertNoUnresolved(r);
  assert(r.out.includes(".gitignore:1"), `note must cite the rule source and line\n${r.out}`);
  // The counts invariant: an exemption must stay countable, never silent.
  assert(r.out.includes("probed 1 unique target dir(s)") && r.out.includes("1 exempted as build-generated"), `expected the probe count note\n${r.out}`);
});

test("2. committed dir present → clean, no note, exit 0", () => {
  const env = envFor("case02");
  const dir = fixture(join(TMP, "case02"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  write(dir, "src/content/docs/claude/index.mdx", page("Claude"));
  initRepo(dir, env);

  const r = runCheck(dir, env);
  assert(r.status === 0, `expected exit 0, got ${r.status}\n${r.err}`);
  assertNoGenerated(r);
  assertNoUnresolved(r);
});

test("3. nav path matching nothing, not gitignored → [UNRESOLVED], exit 0", () => {
  const env = envFor("case03");
  const dir = fixture(join(TMP, "case03"));
  site(dir, ["/docs/overview", "/docs/typo-nowhere"]);
  write(dir, ".gitignore", "node_modules/\n");
  initRepo(dir, env);

  const r = runCheck(dir, env);
  assert(r.status === 0, `expected exit 0, got ${r.status}\n${r.err}`);
  assertUnresolved(r, "/docs/typo-nowhere");
  assertNoGenerated(r);
});

test("4. not a git work tree → [UNRESOLVED] (probe failure must not exempt)", () => {
  const env = envFor("case04");
  const dir = fixture(join(TMP, "case04"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  write(dir, ".gitignore", "src/content/docs/claude/\n");
  // deliberately no git init

  // Precondition: the fixture really is outside any work tree, otherwise this
  // case would be measuring nothing.
  assert(git(dir, ["rev-parse", "--show-toplevel"], env).status !== 0, "fixture unexpectedly inside a git work tree");

  const r = runCheck(dir, env);
  assertUnresolved(r, "/docs/claude");
  assertNoGenerated(r);
  // A probe that never ran must say so — "probed 1 dir(s) … 0 exempted" would
  // claim git was consulted when it was not.
  assert(r.err.includes("[PROBE-SKIPPED]"), `expected [PROBE-SKIPPED] warning\n${r.err}`);
  assert(!r.out.includes("probed 1 unique target dir(s)"), `must not claim a probe that did not run\n${r.out}`);
});

test("5. ignored only via .git/info/exclude → [UNRESOLVED] (local state is not evidence)", () => {
  const env = envFor("case05");
  const dir = fixture(join(TMP, "case05"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  write(dir, ".gitignore", "node_modules/\n");
  initRepo(dir, env);
  write(dir, ".git/info/exclude", "src/content/docs/claude/\n");

  // Precondition: git DOES ignore the dir — so a surviving warning is the
  // source filter working, not a rule that never applied.
  const probe = git(dir, ["check-ignore", "-v", "--", "src/content/docs/claude/"], env);
  assert(probe.status === 0, "fixture failed to arm: .git/info/exclude did not ignore the dir");
  assert(probe.stdout.includes(".git/info/exclude"), `expected the exclude file as source, got: ${probe.stdout}`);

  const r = runCheck(dir, env);
  assertUnresolved(r, "/docs/claude");
  assertNoGenerated(r);
});

test("6. ignored only via core.excludesFile → [UNRESOLVED] (global state is not evidence)", () => {
  const globalIgnore = join(TMP, "case06-global-ignore");
  writeFileSync(globalIgnore, "src/content/docs/claude/\n");
  const cfg = join(TMP, "case06.gitconfig");
  writeFileSync(cfg, `[core]\n\texcludesFile = ${globalIgnore}\n`);
  const env = envFor("case06");

  const dir = fixture(join(TMP, "case06"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  write(dir, ".gitignore", "node_modules/\n");
  initRepo(dir, env);

  // Precondition: the global ignore is live and is the matching source.
  const probe = git(dir, ["check-ignore", "-v", "--", "src/content/docs/claude/"], env);
  assert(probe.status === 0, "fixture failed to arm: core.excludesFile did not ignore the dir");
  assert(probe.stdout.includes(globalIgnore), `expected the global ignore file as source, got: ${probe.stdout}`);

  const r = runCheck(dir, env);
  assertUnresolved(r, "/docs/claude");
  assertNoGenerated(r);
});

test("7. broad *.mdx rule, no rule for the dir → [UNRESOLVED] (probe targets the dir)", () => {
  const env = envFor("case07");
  const dir = fixture(join(TMP, "case07"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  write(dir, ".gitignore", "*.mdx\n");
  initRepo(dir, env);

  // Precondition: the synthetic index.mdx IS ignored while the dir is NOT —
  // exactly the asymmetry that a file-level probe would get wrong.
  assert(git(dir, ["check-ignore", "-q", "--", "src/content/docs/claude/index.mdx"], env).status === 0, "fixture failed to arm: *.mdx did not match index.mdx");
  assert(git(dir, ["check-ignore", "-q", "--", "src/content/docs/claude/"], env).status === 1, "fixture invalid: *.mdx unexpectedly matched the directory");

  const r = runCheck(dir, env);
  assertUnresolved(r, "/docs/claude");
  assertNoGenerated(r);
});

test("8. nested inside an unrelated outer repo → [UNRESOLVED]", () => {
  const env = envFor("case08");
  const outer = join(TMP, "case08-outer");
  mkdirSync(outer, { recursive: true });
  write(outer, ".gitignore", "inner/src/content/docs/claude/\n");
  write(outer, "README.md", "outer\n");
  initRepo(outer, env);

  const dir = fixture(join(outer, "inner"));
  site(dir, ["/docs/overview", "/docs/claude"]);
  // deliberately no git init in inner/

  // Precondition: the outer repo WOULD answer "ignored" — so the surviving
  // warning is attributable to the top-level guard, not to an inert fixture.
  assert(git(dir, ["check-ignore", "-q", "--", "src/content/docs/claude/"], env).status === 0, "fixture failed to arm: outer repo did not ignore the nested dir");
  const top = gitOk(dir, ["rev-parse", "--show-toplevel"], env).stdout.trim();
  assert(realpathSync(top) === realpathSync(outer), `expected the outer repo as top level, got ${top}`);

  const r = runCheck(dir, env);
  assertUnresolved(r, "/docs/claude");
  assertNoGenerated(r);
});

test("9. linked git worktree → behaves like its main checkout", () => {
  const env = envFor("case09");
  const main = fixture(join(TMP, "case09-main"));
  site(main, ["/docs/overview", "/docs/claude"]);
  write(main, ".gitignore", "src/content/docs/claude/\n");
  initRepo(main, env);

  const linked = join(TMP, "case09-linked");
  gitOk(main, ["worktree", "add", "-q", "-b", "topic", linked], env);
  assert(existsSync(join(linked, "scripts", "check-category-meta.mjs")), "worktree checkout is missing the script copy");

  const r = runCheck(linked, env);
  assert(r.status === 0, `expected exit 0, got ${r.status}\n${r.err}`);
  assertGenerated(r, "/docs/claude");
  assertNoUnresolved(r);
});

test("12. broad ancestor rule → [UNRESOLVED] (inherited ignore is not evidence)", () => {
  const env = envFor("case12");
  const dir = fixture(join(TMP, "case12"));
  site(dir, ["/docs/overview", "/docs/claude", "/docs/typo-nowhere"]);
  // `docs/` matches every directory named docs at any depth, so it ignores the
  // whole content tree — including a genuinely mistyped nav target.
  write(dir, ".gitignore", "docs/\n");
  initRepo(dir, env);

  // Precondition: git DOES report both the generated dir and the typo as
  // ignored, so a surviving warning is the parent test working.
  assert(git(dir, ["check-ignore", "-q", "--", "src/content/docs/claude/"], env).status === 0, "fixture failed to arm: docs/ did not ignore the target dir");
  assert(git(dir, ["check-ignore", "-q", "--", "src/content/docs/"], env).status === 0, "fixture failed to arm: docs/ did not ignore the parent dir");

  const r = runCheck(dir, env);
  assert(r.status === 0, `expected exit 0, got ${r.status}\n${r.err}`);
  assertUnresolved(r, "/docs/typo-nowhere");
  assertUnresolved(r, "/docs/claude");
  assertNoGenerated(r);
});

test("10. _category_.json sidecar under src/ → [SIDECAR] failure, exit 1", () => {
  const env = envFor("case10");
  const dir = fixture(join(TMP, "case10"));
  site(dir, ["/docs/overview"]);
  write(dir, "src/content/docs/overview/_category_.json", `{ "label": "Overview" }\n`);
  initRepo(dir, env);

  const r = runCheck(dir, env);
  assert(r.status === 1, `expected exit 1, got ${r.status}\n--- stdout ---\n${r.out}\n--- stderr ---\n${r.err}`);
  assert(r.err.includes("[SIDECAR]"), `expected [SIDECAR] on stderr\n${r.err}`);
  assert(!r.out.includes("[SIDECAR]"), `[SIDECAR] must not appear on stdout\n${r.out}`);
});

test("11. headerNav target with category_no_page: true → [NAV-404] failure, exit 1", () => {
  const env = envFor("case11");
  const dir = fixture(join(TMP, "case11"));
  write(dir, "zfb.config.ts", config(["/docs/overview"]));
  write(dir, "src/content/docs/overview/index.mdx", page("Overview", "category_no_page: true\n"));
  initRepo(dir, env);

  const r = runCheck(dir, env);
  assert(r.status === 1, `expected exit 1, got ${r.status}\n--- stdout ---\n${r.out}\n--- stderr ---\n${r.err}`);
  assert(r.err.includes("[NAV-404]"), `expected [NAV-404] on stderr\n${r.err}`);
  assert(!r.out.includes("[NAV-404]"), `[NAV-404] must not appear on stdout\n${r.out}`);
});

// ── run ───────────────────────────────────────────────────────────────────

let failed = 0;
for (const c of cases) {
  try {
    c.fn();
    console.log(`  ✅ ${c.name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${c.name}`);
    console.error(`     ${e.message.split("\n").join("\n     ")}`);
  }
}

if (!process.env.KEEP_FIXTURES) rmSync(TMP, { recursive: true, force: true });
else console.log(`\nfixtures kept at ${TMP}`);

console.log(`\n${cases.length - failed}/${cases.length} case(s) passed.`);
process.exit(failed === 0 ? 0 : 1);
