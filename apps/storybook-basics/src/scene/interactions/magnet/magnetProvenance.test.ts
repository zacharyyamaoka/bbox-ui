// src/scene/interactions/magnet/magnetProvenance.test.ts — A12: the attribution gate.
//
// `.claude/feedback.md`, 2026-09-17: "Every file implementing real math
// cites where it came from... A citation must point at a file that exists on
// disk (donor repo + line range) or a source actually fetched and quotable —
// never from memory. A plausible paper title nobody opened is worse than an
// honest 'ours, ad hoc', because it survives review."
//
// A rule that lives only in a comment is one a tidy-up silently deletes, so
// it lives here, as something that can FAIL. Precedent and technique:
// `src/components/elbow/provenance.test.ts` — it reads the source files as
// TEXT on purpose, because importing them would only prove the code still
// RUNS, and only reading the bytes proves the ATTRIBUTION still travels.
//
// This file goes one step further than the elbow gate: it `existsSync`s
// every donor path the headers cite, so a citation cannot be plausible-and
// -wrong. The donor tree is READ-ONLY here; nothing writes to it.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The four sources this gate reads, each by its own path.
 *
 * WHY a table rather than `./${name}` (2026-09-21, the kit refactor): the
 * four files no longer share a directory. The pure model (`magnetProposals`,
 * `magnetPortTypes`) is scene-side; the React binding `useMagnetDrag` is
 * host-side; the paint layer `magnetProposalLayer` is editor-side — the
 * split the DAG asks for. The attribution still has to travel with all four,
 * so the gate follows them instead of assuming they stayed together.
 */
const SOURCE_PATHS = {
  "magnetProposals.ts": "./magnetProposals.ts",
  "magnetPortTypes.ts": "./magnetPortTypes.ts",
  "useMagnetDrag.ts": "../../../hosts/useMagnetDrag.ts",
  "magnetProposalLayer.tsx": "../../../editor/magnetProposalLayer.tsx",
} as const;

const read = (name: keyof typeof SOURCE_PATHS) =>
  readFileSync(fileURLToPath(new URL(SOURCE_PATHS[name], import.meta.url)), "utf8");

/**
 * Comment text with the block-comment furniture removed and whitespace
 * collapsed, so a prose assertion survives a re-wrap of the header — the
 * exact helper (and the exact regex, whose `^...$` multiline anchor matters:
 * see its own note there) that `src/components/elbow/provenance.test.ts`
 * already needed for the same reason.
 */
const flatten = (source: string) => source.replace(/^\s*\*\s?/gm, "").replace(/\s+/g, " ");

const SOURCES = Object.keys(SOURCE_PATHS) as (keyof typeof SOURCE_PATHS)[];

/**
 * Every donor path cited by the four headers, as an absolute path. If a
 * citation is added to a header it belongs here too; the last test in this
 * file checks the reverse direction (every `/home/bam/...` path that appears
 * in the sources is in this list), so the two cannot drift apart.
 */
const CITED_PATHS = [
  // The type gate — ported near-verbatim.
  "/home/bam/systemsketch/src/blocks/connections/connectionModel.ts",
  // The nearest-legal ordering, and the two refusal codes.
  "/home/bam/systemsketch/src/blocks/connections/connectionRules.ts",
  // The radius form (scene units with a screen-px form, capped) and the
  // per-candidate bounds±radius reject.
  "/home/bam/systemsketch/src/blocks/connections/connectionHit.ts",
  "/home/bam/systemsketch/src/blocks/connections/blockPorts.ts",
  // The "host measures, the model never self-measures" contract.
  "/home/bam/systemsketch/src/behaviorTree/liveDragWires.ts",
  // Transient drag state: host-scoped, reset on end, never in the document.
  "/home/bam/systemsketch/src/blocks/ports/portState.ts",
  "/home/bam/systemsketch/src/behaviorTree/treeDragRefusal.ts",
  // The nearest-with-a-radius-cutoff scan whose comment is quoted for
  // "[] is a real answer".
  "/home/bam/systemsketch/src/behaviorTree/behaviorTreeDrag.ts",
] as const;

describe("A12 · every cited donor path exists on disk", () => {
  for (const path of CITED_PATHS) {
    it(`${path.replace("/home/bam/systemsketch/", "systemsketch/")} exists`, () => {
      expect(existsSync(path)).toBe(true);
    });
  }

  it("the React Flow version cited is the one installed in THIS worktree", () => {
    // The spec's draft cited @xyflow/system@0.0.79 with line numbers that do
    // not exist here. Pin the version the headers name against the real
    // package, so a future bump makes the citation fail instead of rot.
    const pkg = fileURLToPath(new URL("../../../../../../node_modules/.pnpm/@xyflow+system@0.0.82/node_modules/@xyflow/system/package.json", import.meta.url));
    expect(existsSync(pkg)).toBe(true);
    expect(JSON.parse(readFileSync(pkg, "utf8")).version).toBe("0.0.82");
  });
});

describe("A12 · the donor's own words travel with the port", () => {
  it("magnetPortTypes.ts names the donor file and the five ported line ranges", () => {
    const text = read("magnetPortTypes.ts");
    expect(text).toContain("connectionModel.ts");
    for (const line of [":138-153", ":155", ":158", ":164-166"]) expect(text).toContain(line);
    // The donor's stated REASON for case-insensitivity is a product
    // decision, not an implementation detail — it has to survive.
    expect(flatten(text)).toContain("text a person typed on a whiteboard");
  });

  it("magnetProposals.ts declares its three provenance classes explicitly", () => {
    const text = read("magnetProposals.ts");
    expect(text).toMatch(/\(a\) PORTED/);
    expect(text).toMatch(/\(b\) A REAL TECHNIQUE/);
    expect(text).toMatch(/\(c\) OURS, ad hoc/);
    // The ordering decision, which is the single most decision-relevant
    // citation in the file.
    expect(flatten(text)).toContain("An illegal dot never shadows a legal one behind it");
    expect(text).toContain("connectionRules.ts:337-360");
    // And the honest counter-citation: per-port radius has NO prior art.
    expect(flatten(text)).toContain("neither is prior art for a per-port magnet");
  });

  it("useMagnetDrag.ts and magnetProposalLayer.tsx say plainly that they are ours", () => {
    expect(read("useMagnetDrag.ts")).toContain("OURS, ad hoc");
    expect(read("magnetProposalLayer.tsx")).toContain("OURS, ad hoc");
  });

  it("no source file cites the false-green `reportedException` probe", () => {
    // CLAUDE.md: `storyRenders[0].reportedException` is NOT a real property;
    // it hid two broken stories for hours. It must not appear anywhere in
    // this lane — not in code, not in a comment.
    for (const name of SOURCES) expect(read(name)).not.toContain("reportedException");
  });

  it("every /home/bam path cited in the sources is in CITED_PATHS", () => {
    const seen = new Set<string>();
    for (const name of SOURCES) {
      for (const match of read(name).matchAll(/\/home\/bam\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|json)/g)) seen.add(match[0]);
    }
    // Sanity: the regex finds something, so a green result cannot be vacuous.
    expect(seen.size).toBeGreaterThan(0);
    for (const path of seen) expect(CITED_PATHS).toContain(path);
  });
});
