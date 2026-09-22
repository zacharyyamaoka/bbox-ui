import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  classifyPoseChange,
  describePoseChange,
  movedEdges,
  type PoseEdges,
  type PriorPose,
} from "./fieldDiff";
import { collapseContext, lineDiff, stableJson } from "./lineDiff";
import { diffScene, type ScenePortsOf } from "./sceneDiff";
import type { BlockScene, SceneEdge, SceneNode } from "./scene";
import { compactFormerValue, wordDiff } from "./wordDiff";
import { Block } from "../components/block";
import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import type { WireStyleData } from "./sceneWires";

/**
 * Scene/Model & Diff/SceneDiff — the pure diff kit, rendered ON the things it
 * describes.
 *
 * WHY this file now imports components when its previous version
 * deliberately imported none: Zach, 2026-09-21 — "a lot of those tests
 * basically operate on the model and the model we can visualize using the
 * components." The old header's "this file imports NO component" was a
 * concurrent lane's WRITE-SET fence (S3 owned `src/components/**` at the
 * time), not an architectural rule, and `docs/COMPARISON-VIEW-PLAN.md`'s
 * surface B is no longer a hypothetical: `Block`, `DomCanvas` and
 * `sceneWires`' per-edge colour are all here and a scene story is allowed
 * to be a host.
 *
 * Two of these four stories became pictures and two deliberately did not:
 *
 *   WordDiffInk       — PICTURE (partly). The math is still a table of
 *                       pairs, because six pairs read faster as six rows
 *                       than as six cards; but the one thing a table could
 *                       not show — that the ink survives inside a real
 *                       `Block` header, at header type size — is now a row
 *                       of real Blocks beside it.
 *   PoseClassification— PICTURE. "moved vs resized are different questions"
 *                       is a question ABOUT TWO RECTANGLES, and four rows
 *                       of the word "resized" is the worst possible way to
 *                       ask it. Each case now draws its prior pose as a
 *                       ghost under the live Block with the moved edges
 *                       struck heavy, and the play function measures the
 *                       rendered rectangles rather than re-running the
 *                       function it is testing.
 *   LineDiffCode      — STAYS TEXT, on purpose. `lineDiff` is a diff of
 *                       JSON LINES; its output IS text and its whole
 *                       subject is which characters sit on which row. A
 *                       picture of it would be a picture of a diff, which
 *                       is a diff. This is the "some tests will just be
 *                       purely quantitative" case, and it is the honest
 *                       one.
 *   SceneDiffSummary  — PICTURE. Before and after are SCENES; they are now
 *                       two benches with the diff painted on them, and the
 *                       silence the old play function asserted ("logger
 *                       only moved, so no row") is now visible as a block
 *                       that plainly moved while the list stays quiet.
 */

const meta = {
  title: "Scene/Model & Diff/SceneDiff",
  tags: ["object:scene", "host:dom", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Story chrome                                                        */
/* ------------------------------------------------------------------ */

const REMOVED = "var(--destructive)";
// No "success"/"added" token exists in globals.css's palette (checked:
// only accent/background/border/card/destructive/foreground/input/muted/
// popover/primary/ring/secondary) — seagreen is the same literal
// `Linking.stories.tsx` already reaches for when a story needs a second,
// unambiguously-not-red hue outside the token set.
const ADDED = "seagreen";
/** Neither added nor removed: the SAME thing, differently. */
const MODIFIED = "darkorange";

function Gallery({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>{children}</div>;
}

function Panel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        minWidth: 260,
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        background: "var(--card)",
        color: "var(--card-foreground)",
      }}
    >
      <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontWeight: 600, fontSize: 12 }}>{title}</div>
      {note && <div style={{ fontFamily: "ui-sans-serif, sans-serif", color: "var(--muted-foreground)", maxWidth: 640 }}>{note}</div>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Word-level ink — scene/wordDiff.ts                                */
/* ------------------------------------------------------------------ */

/** The ink itself: former value (compacted) struck through, current value
 *  with only the changed run marked. One renderer, used both in the table
 *  below and inside a real `Block` header beside it. */
function Ink({ before, after }: { before: string; after: string }) {
  const diff = wordDiff(before, after);
  const compact = compactFormerValue(diff.before);
  return (
    <>
      {compact.length > 0 ? (
        compact.map((token, index) => (
          <span key={index} style={token.kind === "removed" ? { color: REMOVED, textDecoration: "line-through" } : undefined}>
            {token.text}
          </span>
        ))
      ) : (
        <span style={{ color: "var(--muted-foreground)" }}>(nothing removed)</span>
      )}
      <span style={{ color: "var(--muted-foreground)" }}> → </span>
      {diff.after.map((token, index) => (
        <span key={index} style={token.kind === "added" ? { color: ADDED, fontWeight: 600 } : undefined}>
          {token.text}
        </span>
      ))}
    </>
  );
}

function WordDiffRow({ before, after }: { before: string; after: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="word-diff-row">
      <div>
        <Ink before={before} after={after} />
      </div>
    </div>
  );
}

/** Every pair below is exactly one from wordDiff.test.ts / the donor module
 *  header, so the "must survive" cases in docs/COMPARISON-VIEW-PLAN.md §2
 *  are the ones on screen, not a different set invented for the story. */
const WORD_CASES: readonly (readonly [string, string])[] = [
  ["run_inference", "run_predict"],
  ["runInference", "runPredict"],
  ["parseHTTPBody", "parseHTTPHeaders"],
  ["", "Estimator"],
  ["Estimator", ""],
  ["callee", "callee"],
];

export const WordDiffInk: Story = {
  render: () => (
    <Gallery>
      <Panel title="wordDiff — inks only the run that changed">
        {WORD_CASES.map(([before, after]) => (
          <WordDiffRow key={`${before}->${after}`} before={before} after={after} />
        ))}
      </Panel>
      <Panel
        title="the same ink, in the place it is actually read"
        note={
          <>
            A rename is read on a block's header, not in a table — at header type size, against the card's own background, next to
            everything else the header carries. These are real <code>Block</code>s; nothing about the ink changed to get here.
          </>
        }
      >
        <div data-testid="header-bench" style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 4 }}>
          {WORD_CASES.slice(0, 3).map(([before, after]) => (
            <div key={`${before}->${after}`} data-testid="header-card" data-case={`${before}->${after}`}>
              <Block header={<Ink before={before} after={after} />} width={240} />
            </div>
          ))}
        </div>
      </Panel>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByTestId("word-diff-row");
    // `run_` is shared and must carry NO strike-through span of its own —
    // proven by reading the actually-rendered text, not by re-deriving it.
    expect(rows[0].textContent).toContain("inference");
    expect(rows[0].textContent).toContain("predict");
    // camelCase splits at the hump: "run" is shared on both sides, so on the
    // FORMER value (compacted) it elides to "…" while the current value
    // (never compacted — `compactFormerValue` only touches the "former"
    // side, per its own header) still shows it whole.
    expect(rows[1].textContent).toBe("…Inference → runPredict");
    // The unchanged pair draws nothing removed and nothing added.
    expect(rows[5].textContent).toBe("(nothing removed) → callee");

    // The ink survives the trip into a real header: same text, and the
    // struck run is STILL struck once `Block`'s own header typography has
    // had its say. A `text-decoration` that a header style quietly reset
    // would read identical in the table and be gone on the card — which is
    // exactly the failure the table alone could never catch.
    const card = canvas.getAllByTestId("header-card")[1];
    expect(card.textContent).toBe("…Inference → runPredict");
    const struck = Array.from(card.querySelectorAll("span")).filter((span) => getComputedStyle(span).textDecorationLine === "line-through");
    expect(struck.length, "the former value is struck through inside the header too").toBeGreaterThan(0);
    expect(struck.map((span) => span.textContent).join("")).toBe("Inference");
  },
};

/* ------------------------------------------------------------------ */
/* 2. Field pairs + pose classification — scene/fieldDiff.ts            */
/* ------------------------------------------------------------------ */

const POSE_CASES: { label: string; prior: PriorPose; live: PriorPose }[] = [
  { label: "moved", prior: { x: 0, y: 0, w: 200, h: 100 }, live: { x: 40, y: -12, w: 200, h: 100 } },
  { label: "resized (left edge dragged)", prior: { x: 100, y: 0, w: 200, h: 100 }, live: { x: 60, y: 0, w: 240, h: 100 } },
  { label: "moved + resized", prior: { x: 100, y: 0, w: 200, h: 100 }, live: { x: 300, y: 80, w: 240, h: 130 } },
  { label: "none (sub-pixel jitter)", prior: { x: 0, y: 0, w: 200, h: 100 }, live: { x: 0.2, y: 0, w: 200, h: 100 } },
];

/** Every case drawn in ONE coordinate frame so the four are comparable:
 *  the origin is the min corner of every prior and live box in the set. */
const POSE_FRAME = (() => {
  const boxes = POSE_CASES.flatMap((row) => [row.prior, row.live]);
  const x = Math.min(...boxes.map((box) => box.x)) - 16;
  const y = Math.min(...boxes.map((box) => box.y)) - 16;
  return { x, y, w: Math.max(...boxes.map((box) => box.x + box.w)) - x + 16, h: Math.max(...boxes.map((box) => box.y + box.h)) - y + 16 };
})();

const EDGE_RULE: Record<keyof PoseEdges, (box: PriorPose) => { left: number; top: number; width: number; height: number }> = {
  left: (box) => ({ left: box.x, top: box.y, width: 0, height: box.h }),
  right: (box) => ({ left: box.x + box.w, top: box.y, width: 0, height: box.h }),
  top: (box) => ({ left: box.x, top: box.y, width: box.w, height: 0 }),
  bottom: (box) => ({ left: box.x, top: box.y + box.h, width: box.w, height: 0 }),
};

/**
 * One case: the prior pose as a dashed ghost, the live pose as a real
 * `Block`, and every edge `movedEdges` names struck heavy on the LIVE box.
 * Nothing here re-derives the classification — `classifyPoseChange` is
 * called once and everything drawn comes out of its answer.
 */
function PoseCase({ label, prior, live }: { label: string; prior: PriorPose; live: PriorPose }) {
  const change = classifyPoseChange(prior, live);
  const moved = movedEdges(change);
  const at = (box: PriorPose) => ({ left: box.x - POSE_FRAME.x, top: box.y - POSE_FRAME.y });
  return (
    <div data-testid="pose-case" data-case={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontSize: 11 }}>
        <span style={{ color: "var(--muted-foreground)" }}>{label} → </span>
        <span data-testid="pose-kind" style={{ fontWeight: 600, color: change.kind === "none" ? "var(--muted-foreground)" : MODIFIED }}>
          {describePoseChange(change) || "no change"}
        </span>
      </div>
      <div style={{ position: "relative", width: POSE_FRAME.w, height: POSE_FRAME.h }}>
        <div
          data-testid="pose-prior"
          style={{
            position: "absolute",
            ...at(prior),
            width: prior.w,
            height: prior.h,
            border: "1.5px dashed var(--muted-foreground)",
            borderRadius: 10,
            opacity: 0.7,
            // WHY the ghost paints OVER the live card instead of under it:
            // in the resize case the two boxes share three edges, so a
            // ghost behind an opaque card is invisible exactly when it
            // matters most — the reader cannot see where the dragged edge
            // came FROM. A dashed outline over the card costs nothing and
            // is the only thing that makes "left edge dragged" legible.
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
        <div data-testid="pose-live" style={{ position: "absolute", ...at(live) }}>
          <Block header={label.split(" ")[0]} width={live.w} height={live.h} />
        </div>
        {moved.map((edge) => {
          const rule = EDGE_RULE[edge](live);
          return (
            <div
              key={edge}
              data-testid="pose-moved-edge"
              data-edge={edge}
              style={{
                position: "absolute",
                left: rule.left - POSE_FRAME.x,
                top: rule.top - POSE_FRAME.y,
                width: rule.width,
                height: rule.height,
                outline: `3px solid ${MODIFIED}`,
                borderRadius: 3,
                pointerEvents: "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export const PoseClassification: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel
        title="classifyPoseChange — moved vs resized are different questions, drawn"
        note={
          <>
            Dashed = the prior pose. Solid card = the live one. Orange = the edges <code>movedEdges</code> says actually moved — which is
            the whole difference between "it moved" (every edge moved, so marking them says nothing) and "it was resized" (one edge did,
            and that is where the handle was).
          </>
        }
      >
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {POSE_CASES.map((row) => (
            <PoseCase key={row.label} {...row} />
          ))}
        </div>
      </Panel>
      <Panel title="the same four, as the numbers the drawing came from">
        <table style={{ borderCollapse: "collapse", width: "100%" }} data-testid="pose-table">
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
              <th style={{ paddingRight: 12 }}>case</th>
              <th style={{ paddingRight: 12 }}>kind</th>
              <th style={{ paddingRight: 12 }}>badge</th>
              <th>heavy edges</th>
            </tr>
          </thead>
          <tbody>
            {POSE_CASES.map((row) => {
              const change = classifyPoseChange(row.prior, row.live);
              return (
                <tr key={row.label} data-testid="pose-row">
                  <td style={{ paddingRight: 12, paddingTop: 4 }}>{row.label}</td>
                  <td style={{ paddingRight: 12, paddingTop: 4 }}>{change.kind}</td>
                  <td style={{ paddingRight: 12, paddingTop: 4 }}>{describePoseChange(change) || "—"}</td>
                  <td style={{ paddingTop: 4 }}>{movedEdges(change).join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByTestId("pose-row");
    // "resized (left edge dragged)" — a corner survives, so this is a
    // resize, not a move, and only the LEFT edge is drawn heavier.
    expect(rows[1].textContent).toContain("resized");
    expect(rows[1].textContent).toContain("left");
    // Sub-pixel jitter classifies as no change at all (POSE_EPSILON_PX).
    expect(rows[3].textContent).toContain("none");

    // The DRAWING agrees with the classification, measured off the two
    // rendered rectangles rather than by asking `classifyPoseChange` twice.
    const resized = caseOf(canvasElement, "resized (left edge dragged)");
    const priorBox = rectOf(resized, '[data-testid="pose-prior"]');
    const liveBox = rectOf(resized, '[data-testid="pose-live"] [data-slot="block"]');
    // A resize keeps a corner: the right edge is where it was, the left moved.
    expect(Math.abs(liveBox.right - priorBox.right), "the right edge is the corner that survived").toBeLessThanOrEqual(1);
    expect(priorBox.left - liveBox.left, "the left edge is the one that was dragged").toBeGreaterThan(30);
    // …and exactly that one edge is marked heavy, on the live box's left.
    const marks = Array.from(resized.querySelectorAll<HTMLElement>('[data-testid="pose-moved-edge"]'));
    expect(marks.map((mark) => mark.dataset.edge)).toEqual(["left"]);
    expect(Math.abs(marks[0].getBoundingClientRect().left - liveBox.left), "the heavy mark sits on the live left edge").toBeLessThanOrEqual(3);

    // A MOVE marks nothing, because every edge moved and marking all four
    // would say "resized" in the only language this drawing has.
    expect(caseOf(canvasElement, "moved").querySelectorAll('[data-testid="pose-moved-edge"]')).toHaveLength(0);
    // Sub-pixel jitter draws the ghost exactly under the card.
    const jitter = caseOf(canvasElement, "none (sub-pixel jitter)");
    const ghost = rectOf(jitter, '[data-testid="pose-prior"]');
    const card = rectOf(jitter, '[data-testid="pose-live"] [data-slot="block"]');
    expect(Math.abs(ghost.left - card.left), "no change means no visible offset").toBeLessThanOrEqual(1);
  },
};

/* ------------------------------------------------------------------ */
/* 3. Raw-evidence line diff — scene/lineDiff.ts                        */
/*                                                                      */
/* STAYS TEXT. See this file's header: a line diff's subject is which    */
/* characters sit on which row, so the text IS the picture.             */
/* ------------------------------------------------------------------ */

const RECORD_BEFORE = { id: "n1", type: "Estimator", threshold: 0.5, tags: ["draft"] };
const RECORD_AFTER = { id: "n1", type: "Estimator", threshold: 0.8, tags: ["draft", "reviewed"] };

export const LineDiffCode: Story = {
  render: () => {
    const lines = collapseContext(lineDiff(stableJson(RECORD_BEFORE), stableJson(RECORD_AFTER)));
    return (
      <Panel
        title="lineDiff — the Code tab's raw evidence, sorted keys so write order never fakes a change"
        note="Deliberately not a picture: this is the one surface whose subject is the text itself."
      >
        <div data-testid="line-diff" style={{ display: "flex", flexDirection: "column" }}>
          {lines.map((line, index) => (
            <div
              key={index}
              data-testid="line-diff-row"
              data-kind={line.kind}
              style={{
                whiteSpace: "pre",
                background:
                  line.kind === "removed"
                    ? "color-mix(in srgb, var(--destructive) 15%, transparent)"
                    : line.kind === "added"
                      ? "color-mix(in srgb, seagreen 15%, transparent)"
                      : undefined,
                color: line.kind === "removed" ? REMOVED : line.kind === "added" ? ADDED : undefined,
              }}
            >
              {line.kind === "removed" ? "- " : line.kind === "added" ? "+ " : "  "}
              {line.text}
            </div>
          ))}
        </div>
      </Panel>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByTestId("line-diff-row");
    const removed = rows.filter((row) => row.dataset.kind === "removed");
    const added = rows.filter((row) => row.dataset.kind === "added");
    expect(removed.some((row) => row.textContent?.includes('"threshold": 0.5'))).toBe(true);
    expect(added.some((row) => row.textContent?.includes('"threshold": 0.8'))).toBe(true);
    // "id" and "type" are unchanged and sort before "tags"/"threshold" —
    // stableJson's sorted-keys rule means this ordering is deterministic.
    expect(rows.some((row) => row.dataset.kind === "context" && row.textContent?.includes('"id": "n1"'))).toBe(true);
  },
};

/* ------------------------------------------------------------------ */
/* 4. A whole scene, before vs after — scene/sceneDiff.ts                */
/* ------------------------------------------------------------------ */

/* The DOCUMENT — what `diffScene` compares. `data` carries `name` and
 * nothing else, which is the point below.                              */

type NodeData = { name: string };

function docNode(id: string, name: string, x: number, y: number): SceneNode<NodeData> {
  return { id, position: { x, y }, data: { name } };
}

const BEFORE_SCENE: BlockScene<NodeData> = {
  nodes: [docNode("estimator", "Estimator", 0, 0), docNode("logger", "Logger", 260, 0)],
  edges: [{ id: "e1", source: "estimator", target: "logger", sourceHandle: "out", targetHandle: "in" }],
};

const AFTER_SCENE: BlockScene<NodeData> = {
  nodes: [
    // Renamed AND gained a port — one node, two facts, kept separate below.
    docNode("estimator", "Predictor", 0, 0),
    docNode("logger", "Logger", 520, 130),
    docNode("alert", "Alert", 260, 0),
  ],
  edges: [
    { id: "e1", source: "estimator", target: "logger", sourceHandle: "out", targetHandle: "in" },
    { id: "e2", source: "estimator", target: "alert", sourceHandle: "confidence", targetHandle: "in" },
  ],
};

/**
 * Port vocabulary lives OUTSIDE `data` on purpose — a node's port list is
 * commonly derived from its TYPE via a registry, not carried per-instance,
 * and keeping it out of `data` is what proves `sceneDiff.ts`'s central rule
 * live: a port that appeared must show up ONLY in `diff.ports`, never as a
 * second, redundant entry in the node's own `fields`.
 *
 * That rule cost this story a round when it was FIRST drawn: the natural
 * way to render a bench is to hand `DomCanvas` a `HostScene` whose
 * `data.ports` names the walls, and doing that put the port list back
 * inside `data`, where `diffScene` duly reported it a second time —
 * `estimator — modified (name: … , ports: {…} → {…, "confidence"})`.
 * Caught by this story's own play function, exactly as the first draft of
 * it was in 2026-09-18.
 *
 * The fix is the split below, and it is also the honest architecture: the
 * DOCUMENT is what gets diffed, and the WALLS are host dressing derived
 * from one vocabulary that both the diff and the paint read. One source,
 * two consumers — never two copies.
 */
type Walls = { left?: string[]; right?: string[] };

const BEFORE_PORTS: Record<string, Walls> = { estimator: { left: ["in"], right: ["out"] }, logger: { left: ["in"] } };
const AFTER_PORTS: Record<string, Walls> = {
  estimator: { left: ["in"], right: ["out", "confidence"] },
  logger: { left: ["in"] },
  alert: { left: ["in"] },
};

function flatten(walls: Walls | undefined): readonly string[] | undefined {
  return walls && [...(walls.left ?? []), ...(walls.right ?? [])];
}

const portsOf: ScenePortsOf = { before: (id) => flatten(BEFORE_PORTS[id]), after: (id) => flatten(AFTER_PORTS[id]) };

/** The document, dressed for a host: the walls from the vocabulary above,
 *  one size for every card so nothing on screen differs except what the
 *  diff says differs. */
function hosted(scene: BlockScene<NodeData>, walls: Record<string, Walls>): HostScene {
  return {
    nodes: scene.nodes.map((node) => ({
      id: node.id,
      type: "block",
      position: node.position,
      data: { name: node.data.name, view: "port" as const, w: 150, h: 72, ports: walls[node.id] },
    })),
    edges: scene.edges.map((edge) => ({ ...edge })),
  };
}

const DIFF_BENCH = { width: 700, height: 250 } as const;

/**
 * The diff, as paint. One `<style>` block generated FROM the diff — no
 * hand-written selector names a node — plus the added edge inked green
 * through the same `data.color` seam `sceneWires` already carries.
 *
 * WHY a stylesheet rather than `Block.diagnostics`: `diagnostics` is the
 * ERROR axis (docs/INVALID-STATES-PLAN.md §5), and "this node is new" is
 * not a problem with the node. Borrowing the error treatment to mean
 * "added" is how a board ends up shouting at its own history.
 */
function DiffBench({ scene, side, diff }: { scene: HostScene; side: "before" | "after"; diff: ReturnType<typeof diffScene> }) {
  const ring = (ids: readonly string[], color: string) =>
    ids.map((id) => `[data-bench="${side}"] [data-scene-node="${id}"] [data-slot="block"] { outline: 2px solid ${color}; outline-offset: 3px; }`).join("\n");
  const present = new Set(scene.nodes.map((n) => n.id));
  const css = [
    ring(
      diff.nodes.filter((n) => n.operation === (side === "after" ? "added" : "removed")).map((n) => n.id),
      ADDED,
    ),
    ring(
      diff.nodes.filter((n) => n.operation === "modified").map((n) => n.id),
      MODIFIED,
    ),
    diff.ports
      .filter((port) => port.operation === "added" && present.has(port.nodeId))
      .map(
        (port) =>
          `[data-bench="${side}"] [data-block-id="${port.nodeId}"] [data-port-id="${port.portId}"] [data-slot="port-dot"] { outline: 2px solid ${ADDED}; outline-offset: 2px; border-radius: 50%; }`,
      )
      .join("\n"),
  ].join("\n");

  const added = new Set(diff.edges.filter((edge) => edge.operation === "added").map((edge) => edge.id));
  const inked: HostScene = {
    ...scene,
    edges: scene.edges.map((edge): SceneEdge<WireStyleData> => (added.has(edge.id) ? { ...edge, data: { ...edge.data, color: ADDED } } : edge)),
  };

  return (
    <div data-slot="diff-bench" data-bench={side} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <style>{css}</style>
      <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontSize: 11, color: "var(--muted-foreground)" }}>{side}</div>
      <DomCanvas scene={inked} width={DIFF_BENCH.width} height={DIFF_BENCH.height} />
    </div>
  );
}

export const SceneDiffSummary: Story = {
  render: () => {
    const diff = diffScene(BEFORE_SCENE, AFTER_SCENE, portsOf);
    const colorFor = (operation: string) => (operation === "removed" ? REMOVED : operation === "added" ? ADDED : "var(--foreground)");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel
          title="diffScene — the two scenes, with the diff painted on them"
          note={
            <>
              Green ring = added, orange ring = modified, green cable = an added edge, green dot = an added port. <code>logger</code>{" "}
              carries no ring at all and yet it plainly moved — that silence is <code>diffScene</code>'s rule that POSITION is not a
              field, and it is far easier to believe once you can see the thing it stayed quiet about.
            </>
          }
        >
          <Gallery>
            <DiffBench scene={hosted(BEFORE_SCENE, BEFORE_PORTS)} side="before" diff={diff} />
            <DiffBench scene={hosted(AFTER_SCENE, AFTER_PORTS)} side="after" diff={diff} />
          </Gallery>
        </Panel>
        <Gallery>
          <Panel title="diffScene — nodes">
            <ul style={{ margin: 0, paddingLeft: 16 }} data-testid="node-diff-list">
              {diff.nodes.map((node) => (
                <li key={node.id} data-testid="node-diff-row" style={{ color: colorFor(node.operation) }}>
                  {node.id} — {node.operation}
                  {node.fields.length > 0 && (
                    <span style={{ color: "var(--muted-foreground)" }}> ({node.fields.map((f) => `${f.path}: ${f.before} → ${f.after}`).join(", ")})</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="diffScene — edges">
            <ul style={{ margin: 0, paddingLeft: 16 }} data-testid="edge-diff-list">
              {diff.edges.length === 0 ? (
                <li style={{ color: "var(--muted-foreground)" }}>(no edge changes)</li>
              ) : (
                diff.edges.map((edge) => (
                  <li key={edge.id} data-testid="edge-diff-row" style={{ color: colorFor(edge.operation) }}>
                    {edge.id} — {edge.operation}
                  </li>
                ))
              )}
            </ul>
          </Panel>
          <Panel title="diffScene — ports (the callback-resolved vocabulary)">
            <ul style={{ margin: 0, paddingLeft: 16 }} data-testid="port-diff-list">
              {diff.ports.map((port) => (
                <li key={`${port.nodeId}/${port.portId}`} data-testid="port-diff-row" style={{ color: colorFor(port.operation) }}>
                  {port.nodeId}.{port.portId} — {port.operation}
                </li>
              ))}
            </ul>
          </Panel>
        </Gallery>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nodeRows = canvas.getAllByTestId("node-diff-row");
    // "estimator" renamed AND persisted — one modified row, naming the
    // FIELD that changed (name), never mentioning the port it also gained.
    const estimatorRow = nodeRows.find((row) => row.textContent?.startsWith("estimator"));
    expect(estimatorRow?.textContent).toContain("modified");
    expect(estimatorRow?.textContent).toContain("name: Estimator → Predictor");
    expect(estimatorRow?.textContent).not.toContain("confidence");
    // "logger" only moved (position is excluded from fields) — no row.
    expect(nodeRows.some((row) => row.textContent?.startsWith("logger"))).toBe(false);
    // "alert" is new.
    const alertRow = nodeRows.find((row) => row.textContent?.startsWith("alert"));
    expect(alertRow?.textContent).toContain("added");

    const edgeRows = canvas.getAllByTestId("edge-diff-row");
    expect(edgeRows.map((row) => row.textContent)).toEqual(["e2 — added"]);

    const portRows = canvas.getAllByTestId("port-diff-row");
    expect(portRows.map((row) => row.textContent)).toEqual(["estimator.confidence — added"]);

    /* ---- and the same four facts, measured on the benches ---- */
    const before = benchOf(canvasElement, "before");
    const after = benchOf(canvasElement, "after");
    await waitForResolvedWires(before);
    await waitForResolvedWires(after);

    // Added: `alert` and `estimator/confidence` exist on one side only.
    expect(before.querySelector('[data-scene-node="alert"]'), "alert does not exist before").toBeNull();
    expect(after.querySelector('[data-scene-node="alert"]'), "alert renders after").not.toBeNull();
    expect(before.querySelector('[data-block-id="estimator"] [data-port-id="confidence"]')).toBeNull();
    expect(after.querySelector('[data-block-id="estimator"] [data-port-id="confidence"]')).not.toBeNull();

    // Renamed: the header text really changed on the card, not just in the list.
    expect(textOf(before, '[data-block-id="estimator"] [data-slot="block-header"]')).toContain("Estimator");
    expect(textOf(after, '[data-block-id="estimator"] [data-slot="block-header"]')).toContain("Predictor");

    // THE SILENCE, measured: `logger` moved by exactly the (260, 130) the two
    // scene records differ by — on screen — while `diffScene` reported
    // nothing about it. A position that moved and a diff that stayed quiet
    // is a deliberate rule; this is the assertion that it is deliberate.
    const moved = offsetInBench(after, "logger");
    const was = offsetInBench(before, "logger");
    expect(Math.round(moved.x - was.x), "logger moved 260px right on screen").toBe(260);
    expect(Math.round(moved.y - was.y), "logger moved 130px down on screen").toBe(130);
  },
};

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                  */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(root: ParentNode, side: "before" | "after"): HTMLElement {
  return required<HTMLElement>(root, `[data-slot="diff-bench"][data-bench="${side}"]`, `the \`${side}\` bench`);
}

function caseOf(root: ParentNode, label: string): HTMLElement {
  return required<HTMLElement>(root, `[data-testid="pose-case"][data-case="${label}"]`, `the \`${label}\` pose case`);
}

function rectOf(root: ParentNode, selector: string): DOMRect {
  return required<HTMLElement>(root, selector, selector).getBoundingClientRect();
}

function textOf(root: ParentNode, selector: string): string {
  return required<HTMLElement>(root, selector, selector).textContent ?? "";
}

/** A node's painted offset inside its own canvas — comparable across two
 *  benches that sit at different places on the page. */
function offsetInBench(bench: HTMLElement, nodeId: string): { x: number; y: number } {
  const origin = rectOf(bench, '[data-host="dom-canvas"]');
  const box = rectOf(bench, `[data-scene-node="${nodeId}"]`);
  return { x: box.left - origin.left, y: box.top - origin.top };
}

async function waitForResolvedWires(bench: HTMLElement): Promise<void> {
  const layer = required<HTMLElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
  await waitFor(() => expect(layer.getAttribute("data-unresolved-wires")).toBe(""), { timeout: 3000 });
}
