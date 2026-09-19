#!/usr/bin/env node
/**
 * "What's New" — derive a story changelog from git, never hand-tag it.
 *
 * Zach, 2026-09-17: "I also wonder if the branches should start to tag the
 * stories or something so I can quickly sort and see the ones that have
 * recently been edited." The brief itself rules out hand-tagging: a `new`
 * tag is right the day it is written and wrong a week later, and nobody
 * prunes it. git already knows exactly which commit touched which story
 * file and when — that is the tag, for free, and it cannot go stale because
 * it is regenerated every run instead of stored.
 *
 * WHAT THIS PRODUCES: a JSON file (apps/storybook-basics/src/stories/
 * whats-new.generated.json, gitignored — see the root .gitignore) — one
 * entry per commit that touched a story file, newest first, each carrying
 * the story ids it resolved to so WhatsNew.stories.tsx can link straight
 * into them. The commit SUBJECT is the heading, on purpose: it carries the
 * "why" a tag cannot.
 *
 * HOW A STORY ID IS RESOLVED: this repo has no story-manifest API to query,
 * so the id is derived the same way Storybook itself derives one —
 * `sanitize(meta.title) + "--" + sanitize(storyNameFromExport(exportName))`
 * — reimplemented here byte-for-byte from
 * storybook/dist/_browser-chunks/chunk-NULBREPZ.js's `sanitize` and
 * `toStartCaseStr`. Each *file* touched by a commit is read at its CURRENT
 * (working-tree) content — not the historical blob — because the point is
 * "where do I click today," not an archaeology of what the commit itself
 * changed. Verified against every story file in the app: 151/151 exports
 * resolve (matches `pnpm test-stories`'s own count), 0 use an explicit
 * `name:` override that would need reading a second way.
 *
 * WHEN A TITLE CANNOT BE PARSED: every story file in this app declares
 * `const meta = { ... title: "...", ... }` (one file, TraceRouting, spells
 * it `const meta: Meta = {` — same shape, different type-annotation style),
 * because that is what CSF3 looks like. The object's extent is found with a
 * string-aware brace matcher (so a `{`/`}` inside a quoted title cannot
 * mis-close it), not by grepping for a following `satisfies Meta` — that
 * marker is absent in exactly the file above. If a file lacks a `const
 * meta` declaration, lacks a `{` after it, or the object has no quoted
 * `title:`, that file's entry is NOT silently dropped — it is recorded
 * under the commit's `unresolved` array with a one-line reason, so a future
 * story file that breaks this shape shows up as a visible gap in the JSON
 * rather than a missing link nobody notices.
 *
 * WINDOW: by default, every commit since this branch diverged from `main`
 * (`git merge-base main HEAD`). --since accepts either a revision (tried
 * first via `git rev-parse --verify`) or anything `git log --since`
 * understands (a date, "3 days ago", …) as a fallback.
 *
 *   node docs/build_whats_new.mjs
 *   node docs/build_whats_new.mjs --since origin/main
 *   node docs/build_whats_new.mjs --since "2026-09-10"
 *
 * Wired as `pnpm whats-new` in apps/storybook-basics/package.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORY_GLOB = "apps/storybook-basics/src/stories/*.stories.tsx";
const OUT = path.join(repoRoot, "apps/storybook-basics/src/stories/whats-new.generated.json");

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};

function git(...cmdArgs) {
  return execFileSync("git", cmdArgs, { cwd: repoRoot, encoding: "utf8" });
}

// ---------------------------------------------------------------------------
// storyId resolution — ported from storybook's own sanitize()/toStartCaseStr(),
// see the header comment above for the exact source.
// ---------------------------------------------------------------------------
function sanitize(str) {
  return str
    .toLowerCase()
    .replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function toStartCaseStr(str) {
  return str
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\./g, " ")
    .replace(/([^\n])([A-Z])([a-z])/g, (_m, a, b, c) => `${a} ${b}${c}`)
    .replace(/([a-z])([A-Z])/g, (_m, a, b) => `${a} ${b}`)
    .replace(/([a-z])([0-9])/gi, (_m, a, b) => `${a} ${b}`)
    .replace(/([0-9])([a-z])/gi, (_m, a, b) => `${a} ${b}`)
    .replace(/(\s|^)(\w)/g, (_m, a, b) => `${a}${b.toUpperCase()}`)
    .replace(/ +/g, " ")
    .trim();
}

function toId(kind, name) {
  return `${sanitize(kind)}--${sanitize(name)}`;
}

/** Find the object literal opened by the `{` at `openIndex` and return the
 * index just past its matching `}` — string-aware, so a brace inside a
 * quoted value (e.g. a title) cannot close it early. */
function matchingBraceEnd(text, openIndex) {
  let depth = 0;
  let quote = null; // '"' | "'" | "`" | null
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++; // skip an escaped char, including an escaped quote
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Parse one story file at its CURRENT content into { title, stories } or
 * { error }. See the header comment for the exact failure conditions. */
function parseStoryFile(relPath) {
  const absPath = path.join(repoRoot, relPath);
  if (!existsSync(absPath)) {
    return { file: relPath, error: "file no longer exists in the working tree" };
  }
  const text = readFileSync(absPath, "utf8");

  const metaDeclMatch = text.match(/^const meta\b/m);
  if (!metaDeclMatch) {
    return { file: relPath, error: "no `const meta` declaration found" };
  }
  const braceOpen = text.indexOf("{", metaDeclMatch.index);
  if (braceOpen === -1) {
    return { file: relPath, error: "`const meta` declaration has no `{`" };
  }
  const braceEnd = matchingBraceEnd(text, braceOpen);
  if (braceEnd === -1) {
    return { file: relPath, error: "meta object literal's braces never balance" };
  }
  const metaBlock = text.slice(braceOpen, braceEnd);
  // WHY the backreference: the first cut was /title:\s*["'`]([^"'`]+)["'`]/,
  // which opens on ANY quote and closes on ANY quote — so `title: "What's New"`
  // captured `What` and stopped at the apostrophe. Measured: the What's New
  // story rendered its own links as "What · Timeline". Match the opening quote
  // and require the SAME character to close, allowing escapes.
  const titleMatch = metaBlock.match(/title:\s*(["'`])((?:\\.|(?!\1).)*?)\1/);
  if (!titleMatch) {
    return { file: relPath, error: "meta block has no parseable `title:` string" };
  }
  const title = titleMatch[2];

  // WHY `: Story` in the export regex: every export in every stories file in
  // this app is typed this way (grepped 151/151) — this is what tells a
  // story export apart from a helper component or a type declaration that
  // also starts `export const`.
  const exportNames = [...text.matchAll(/^export const (\w+)\s*:\s*Story\b/gm)].map((m) => m[1]);
  if (exportNames.length === 0) {
    return { file: relPath, title, error: "no `export const X: Story` exports found" };
  }

  const stories = exportNames.map((exportName) => {
    const name = toStartCaseStr(exportName);
    const id = toId(title, name);
    return { exportName, name, title, id, url: `/?path=/story/${id}` };
  });
  return { file: relPath, title, stories };
}

// ---------------------------------------------------------------------------
// the window
// ---------------------------------------------------------------------------
const sinceArg = argOf("--since");
let logRangeArgs;
let sinceDescription;

if (sinceArg) {
  try {
    git("rev-parse", "--verify", sinceArg);
    logRangeArgs = [`${sinceArg}..HEAD`];
    sinceDescription = `since ${sinceArg} (revision)`;
  } catch {
    logRangeArgs = [`--since=${sinceArg}`];
    sinceDescription = `since "${sinceArg}" (date, ${sinceArg} did not resolve as a git revision)`;
  }
} else {
  const mergeBase = git("merge-base", "main", "HEAD").trim();
  logRangeArgs = [`${mergeBase}..HEAD`];
  sinceDescription = `since branch diverged from main (${mergeBase.slice(0, 7)})`;
}

// ---------------------------------------------------------------------------
// walk the log
// ---------------------------------------------------------------------------
const FIELD_SEP = "\x1f"; // unit separator — a commit subject cannot contain it
const raw = git(
  "log",
  "--name-only",
  `--pretty=format:%n===${FIELD_SEP}%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%aI${FIELD_SEP}%an`,
  ...logRangeArgs,
  "--",
  STORY_GLOB,
);

const commits = [];
const fileCache = new Map(); // relPath -> parseStoryFile() result, resolved once per run

for (const block of raw.split(`===${FIELD_SEP}`).map((b) => b.trim()).filter(Boolean)) {
  const lines = block.split("\n");
  const [sha, shortSha, subject, date, author] = lines[0].split(FIELD_SEP);
  const files = lines
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".stories.tsx"));

  // Merge commits show no file list here (git log's default merge-diff
  // behaviour) — nothing to report for them, so they are dropped rather
  // than shown as an empty, unexplained entry.
  if (files.length === 0) continue;

  const stories = [];
  const unresolved = [];
  for (const file of files) {
    if (!fileCache.has(file)) fileCache.set(file, parseStoryFile(file));
    const result = fileCache.get(file);
    if (result.error) unresolved.push({ file, reason: result.error });
    else stories.push(...result.stories);
  }

  commits.push({ sha, shortSha, subject, date, author, stories, unresolved });
}

const data = {
  generatedAt: new Date().toISOString(),
  sinceDescription,
  headSha: git("rev-parse", "HEAD").trim(),
  headShortSha: git("rev-parse", "--short", "HEAD").trim(),
  commits,
};

writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");

const totalStories = commits.reduce((n, c) => n + c.stories.length, 0);
const totalUnresolved = commits.reduce((n, c) => n + c.unresolved.length, 0);
console.log(`wrote ${OUT}`);
console.log(`${commits.length} commits, ${totalStories} resolved story links, ${totalUnresolved} unresolved`);
if (totalUnresolved > 0) {
  for (const c of commits) {
    for (const u of c.unresolved) console.log(`  unresolved: ${u.file} (${c.shortSha}) — ${u.reason}`);
  }
}
