// src/chromeActionsAreWired.test.ts — the guard that stops a CONTROL shipping
// dead, the way `settingsAreWired.test.ts` stops a SETTING shipping dead.
//
// Zach, 2026-09-23: "rename is not saving on the file name: I click it, type in
// the new name but it doesn't update when I press enter or click away." That
// one was worse than dead — it was a lie, a row that looked live and quietly
// renamed something invisible (fixed in `files/session.tsx`'s `commitRename`).
// Chasing it turned up the same question one level up: which of this app's
// chrome controls RENDER but do nothing? The app-polish review of 2026-09-22
// had already counted three; this scan is the mechanical version of that
// count, so the number cannot drift again without someone saying so.
//
// It is a RATCHET, not a pass/fail on perfection. What is inert TODAY is listed
// below with what it would take, and the list can only shrink: a quarantined
// control that gains a real handler FAILS this test until its excuse is
// deleted, and a control that goes inert without an excuse fails it too.
//
// TWO MECHANICS, both inherited from `settingsAreWired.test.ts`, both learned
// there by getting it wrong first:
//
//   - COMMENTS ARE STRIPPED FIRST. This repo documents its own honest
//     disabling in prose — `chrome/TitleBar/chromeBar.tsx` carries nine lines
//     explaining why the history arrows are hard-`false` — and a raw text scan
//     reads that explanation as the thing it describes. A self-description is
//     not the artifact. `codeOnly` has its own test at the bottom so the
//     stripping cannot quietly stop working and take the whole scan with it.
//   - THE SCAN MUST BE PROVED NON-EMPTY. A bad root directory finds zero
//     matches, and zero matches is indistinguishable from a perfectly wired
//     app: every check passes, vacuously. The corpus test at the bottom is
//     what makes a green run mean something.
//
// WHAT THIS CANNOT SEE, stated rather than implied: it proves a handler is not
// literally empty, never that it does the RIGHT thing. `copyPath` and `reveal`
// would pass this scan whatever they wrote to the clipboard. Behaviour needs a
// behavioural test beside this one — theirs are in `files.smoke.test.tsx`
// ("Copy Absolute Path copies the open board's path") and, for the host half,
// `scripts/tests/test_systemsketch_files_http.py`.
//
// SCOPE: this app's own `src/`, deliberately not the trunk. A trunk component
// takes its callbacks as props and a `() => {}` there is a story's default,
// not a dead control — it is THIS app's wiring that decides what Zach can
// actually click.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Inert today, each with what it would actually take — never a silent deletion
 * and never a fake wiring. THIS LIST MAY ONLY SHRINK.
 *
 * Keyed `<file relative to src/> :: <name>`.
 */
const QUARANTINE: Record<string, string> = {
  // The bar's `history` is DEPTH navigation — "back to the level you came
  // from" — and this app has no depth model yet. Honestly disabled: both
  // arrows render greyed (`canGoBack`/`canGoForward` are hard-`false`), so
  // nobody can click them and get nothing. Wiring them to the camera would
  // make Back mean something different here than in the surface they were
  // ported from; wiring them to undo/redo would make two controls that look
  // like navigation do document surgery.
  "chrome/TitleBar/chromeBar.tsx :: onBack": "needs a depth model (drill-in); honestly disabled until there is a level to go back to",
  "chrome/TitleBar/chromeBar.tsx :: onForward": "needs a depth model (drill-in); honestly disabled until there is a level to go back to",
  // These three are the depth BADGE, and unlike the arrows it is not honestly
  // disabled — it renders as an ordinary enabled control reading "0" and
  // opens a menu. `atRoot` in the trunk is `crumbs.length === 0`
  // (`@trunk/editor/chromeBar`), so with `crumbs={[]}` the menu's only row is
  // permanently `disabled`: a live-looking control whose popup can never say
  // anything. It is the one entry here Zach should decide about rather than
  // inherit — see the handoff.
  "chrome/TitleBar/chromeBar.tsx :: onJumpToLevel": "needs a depth model; no crumb can be clicked while crumbs is empty",
  "chrome/TitleBar/chromeBar.tsx :: crumbs": "needs a depth model; empty makes the trunk's atRoot always true",
  "chrome/TitleBar/chromeBar.tsx :: depth": "needs a depth model; the badge reads 0 forever",
  // The dock's library cell. Honest about itself in words, which is why it is
  // quarantined rather than treated as the rename-class bug: it says "Coming
  // soon" on the cell and "Nothing here yet" inside.
  "chrome/Toolbar/dock.tsx :: Coming soon": "needs a saved-shape/component library surface to open",
  "chrome/Toolbar/dock.tsx :: Nothing here yet": "needs a saved-shape/component library surface to open",
};

/** Block comments first, then line comments — prose is not evidence. */
export function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^.*?\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, " "));
}

/** A callback handed over as a literal empty function: `onFoo={() => {}}`,
 *  `run: () => {}`, `run() {}`. An identifier (`run: beginRename`) is not
 *  matched — this asks whether anything was passed, not whether it works. */
const NO_OP_HANDLER = /\b(on[A-Z]\w*|run)\s*(?:[:=]\s*\{?\s*\(\s*\)\s*=>\s*\{\s*\}|\(\s*\)\s*\{\s*\})/g;

/** Copy that admits the feature does not exist. */
const PLACEHOLDER_COPY = /\b(Coming soon|Nothing here yet|Not implemented)\b/g;

/** A capability prop supplied as a hardcoded empty value. Narrow on purpose:
 *  these two are what the trunk's ChromeBar reads to decide whether its depth
 *  badge can ever say anything. */
const EMPTY_CAPABILITY_PROP = /\b(crumbs)\s*=\s*\{\s*\[\s*\]\s*\}|\b(depth)\s*=\s*\{\s*0\s*\}/g;

const HERE = path.dirname(new URL(import.meta.url).pathname);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.(test\.tsx?|stories\.tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

const FILES = sourceFiles(HERE).map((file) => ({
  file: path.relative(HERE, file),
  raw: readFileSync(file, "utf8"),
  code: codeOnly(readFileSync(file, "utf8")),
}));

/** Every inert control the scan can see, as `<file> :: <name>`. */
function inertControls(): string[] {
  const found: string[] = [];
  for (const { file, code } of FILES) {
    for (const match of code.matchAll(NO_OP_HANDLER)) found.push(`${file} :: ${match[1]}`);
    for (const match of code.matchAll(PLACEHOLDER_COPY)) found.push(`${file} :: ${match[1]}`);
    for (const match of code.matchAll(EMPTY_CAPABILITY_PROP)) found.push(`${file} :: ${match[1] ?? match[2]}`);
  }
  return [...new Set(found)].sort();
}

describe("every chrome control this app renders is wired, or quarantined with a reason", () => {
  const found = inertControls();

  it.each(found)("%s is quarantined with what it would take", (key) => {
    expect(
      QUARANTINE[key],
      `${key} renders a control that does nothing, and nothing here says why. This is the class of bug Zach `
        + "reported on 2026-09-22 (seven dead settings) and again on 2026-09-23 (Rename). Wire it, or add it to "
        + "QUARANTINE with what it would take — and prefer an honestly DISABLED control over one that looks live.",
    ).toBeTruthy();
  });

  it("the quarantine has no stale excuses — a control that came alive loses its entry", () => {
    const live = Object.keys(QUARANTINE).filter((key) => !found.includes(key));
    expect(
      live,
      `these are quarantined as inert but the scan no longer finds them — they were wired, renamed or removed. `
        + "Delete their QUARANTINE entries; the list may only shrink.",
    ).toEqual([]);
  });

  it("scans a real corpus — a guard that silently matched no files would pass everything", () => {
    // Without this, a wrong root turns the whole file vacuous: zero files
    // means zero findings means nothing to quarantine and a green run.
    expect(FILES.length, "source files scanned").toBeGreaterThan(40);
    expect(FILES.map((entry) => entry.file)).toContain("chrome/TitleBar/chromeBar.tsx");
    // And the scan really can find something — the arrows are the fixture.
    expect(found).toContain("chrome/TitleBar/chromeBar.tsx :: onBack");
  });

  it("strips comments before scanning, so the repo's own prose about a dead control is not read as the control", () => {
    // Measured on the real file 2026-09-22 in the settings guard: a raw scan
    // called three inert settings LIVE by matching only the comments saying
    // they were inert. Same trap here, opposite direction — this file's
    // findings must come from code, never from a WHY comment discussing one.
    const prose = [
      "// the arrows used to be onBack: () => {} before we wired them",
      "/* Coming soon is what the old dock said */",
      "const real = { onBack: goBack };",
    ].join("\n");
    const stripped = codeOnly(prose);
    expect(stripped).not.toMatch(NO_OP_HANDLER);
    expect(stripped).not.toMatch(PLACEHOLDER_COPY);
    expect(stripped).toContain("onBack: goBack");
  });
});
