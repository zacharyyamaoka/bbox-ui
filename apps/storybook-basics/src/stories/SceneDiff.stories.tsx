import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  classifyPoseChange,
  describePoseChange,
  movedEdges,
  type PriorPose,
} from "../scene/fieldDiff";
import { collapseContext, lineDiff, stableJson } from "../scene/lineDiff";
import type { BlockScene, SceneNode } from "../scene/scene";
import { diffScene, type ScenePortsOf } from "../scene/sceneDiff";
import { compactFormerValue, wordDiff } from "../scene/wordDiff";

/**
 * Blocks/Scene/Diff — the pure diff kit's OUTPUT, rendered with story-local
 * markup only (docs/COMPARISON-VIEW-PLAN.md S4's variant gallery, pulled
 * forward into S2's own lane because a lane that produces only unit tests
 * gives Zach nothing to look at).
 *
 * IMPORTANT — this file imports NO component. `wordDiff`, `fieldDiff`,
 * `lineDiff` and `sceneDiff` are surface A only ("diff math", the plan's
 * own §2 table); surface B ("diff paint" — a diff mark drawn ON `Block`/
 * `Port`/`Trace`) is explicitly S3, out of this lane's write set because a
 * concurrent lane is editing every file under `src/components/**` right
 * now. Every span/table/row below is throwaway story markup that will be
 * thrown away once S3 lands a real paint layer — it exists only so the
 * math in `scene/wordDiff.ts`, `scene/fieldDiff.ts`, `scene/lineDiff.ts`
 * and `scene/sceneDiff.ts` is something a person can actually look at
 * today, the same role `Linking.stories.tsx` plays for `scene/linking.ts`.
 */

const meta = {
  title: "Blocks/Scene/Diff",
  tags: ["area:blocks", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Shared story chrome — plain markup, no bbox components               */
/* ------------------------------------------------------------------ */

const REMOVED = "var(--destructive)";
// No "success"/"added" token exists in globals.css's palette (checked:
// only accent/background/border/card/destructive/foreground/input/muted/
// popover/primary/ring/secondary) — seagreen is the same literal
// `Linking.stories.tsx` already reaches for when a story needs a second,
// unambiguously-not-red hue outside the token set.
const ADDED = "seagreen";

function Gallery({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>{children}</div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
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
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Word-level ink — scene/wordDiff.ts                                */
/* ------------------------------------------------------------------ */

function WordDiffRow({ before, after }: { before: string; after: string }) {
  const diff = wordDiff(before, after);
  const compact = compactFormerValue(diff.before);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="word-diff-row">
      <div>
        {compact.length > 0 ? (
          compact.map((token, index) => (
            <span
              key={index}
              style={token.kind === "removed" ? { color: REMOVED, textDecoration: "line-through" } : undefined}
            >
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
      </div>
    </div>
  );
}

export const WordDiffInk: Story = {
  render: () => (
    <Gallery>
      <Panel title="wordDiff — inks only the run that changed">
        {/* Every pair below is exactly one from wordDiff.test.ts / the
         * donor module header, so the "must survive" cases in
         * docs/COMPARISON-VIEW-PLAN.md §2 are the ones on screen, not a
         * different set invented for the story. */}
        <WordDiffRow before="run_inference" after="run_predict" />
        <WordDiffRow before="runInference" after="runPredict" />
        <WordDiffRow before="parseHTTPBody" after="parseHTTPHeaders" />
        <WordDiffRow before="" after="Estimator" />
        <WordDiffRow before="Estimator" after="" />
        <WordDiffRow before="callee" after="callee" />
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

export const PoseClassification: Story = {
  render: () => (
    <Panel title="classifyPoseChange — moved vs resized are different questions">
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
  },
};

/* ------------------------------------------------------------------ */
/* 3. Raw-evidence line diff — scene/lineDiff.ts                        */
/* ------------------------------------------------------------------ */

const RECORD_BEFORE = { id: "n1", type: "Estimator", threshold: 0.5, tags: ["draft"] };
const RECORD_AFTER = { id: "n1", type: "Estimator", threshold: 0.8, tags: ["draft", "reviewed"] };

export const LineDiffCode: Story = {
  render: () => {
    const lines = collapseContext(lineDiff(stableJson(RECORD_BEFORE), stableJson(RECORD_AFTER)));
    return (
      <Panel title="lineDiff — the Code tab's raw evidence, sorted keys so write order never fakes a change">
        <div data-testid="line-diff" style={{ display: "flex", flexDirection: "column" }}>
          {lines.map((line, index) => (
            <div
              key={index}
              data-testid="line-diff-row"
              data-kind={line.kind}
              style={{
                whiteSpace: "pre",
                background: line.kind === "removed" ? "color-mix(in srgb, var(--destructive) 15%, transparent)" : line.kind === "added" ? "color-mix(in srgb, seagreen 15%, transparent)" : undefined,
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
    expect(rows.some((row) => row.dataset.kind === "context" && row.textContent?.includes('"id": "n1"'))).toBe(
      true,
    );
  },
};

/* ------------------------------------------------------------------ */
/* 4. A whole scene, before vs after — scene/sceneDiff.ts               */
/* ------------------------------------------------------------------ */

type NodeData = { name: string };

function sceneNode(id: string, name: string, x: number, y: number): SceneNode<NodeData> {
  return { id, position: { x, y }, data: { name } };
}

const BEFORE_SCENE: BlockScene<NodeData> = {
  nodes: [
    sceneNode("estimator", "Estimator", 0, 0),
    sceneNode("logger", "Logger", 220, 0),
  ],
  edges: [{ id: "e1", source: "estimator", target: "logger", sourceHandle: "out", targetHandle: "in" }],
};

const AFTER_SCENE: BlockScene<NodeData> = {
  nodes: [
    // Renamed AND gained a port — one node, two facts, kept separate below.
    sceneNode("estimator", "Predictor", 0, 0),
    sceneNode("logger", "Logger", 480, 40),
    sceneNode("alert", "Alert", 220, 0),
  ],
  edges: [
    { id: "e1", source: "estimator", target: "logger", sourceHandle: "out", targetHandle: "in" },
    { id: "e2", source: "estimator", target: "alert", sourceHandle: "confidence", targetHandle: "in" },
  ],
};

// Port vocabulary lives OUTSIDE `data` on purpose — a node's port list is
// commonly derived from its TYPE via a registry, not carried per-instance,
// and keeping it out of `data` is what proves `sceneDiff.ts`'s central rule
// live: a port that appeared must show up ONLY in `diff.ports`, never as a
// second, redundant entry in the node's own `fields` (which is exactly what
// happened when this story's first draft put `ports` inside `data` — caught
// by this story's own play function, not by inspection: `estimator`'s field
// list came back containing `ports: [...] -> [...]` alongside the `name`
// change, double-reporting the same fact `diff.ports` already carries).
const BEFORE_PORTS: Record<string, readonly string[]> = { estimator: ["in", "out"], logger: ["in"] };
const AFTER_PORTS: Record<string, readonly string[]> = {
  estimator: ["in", "out", "confidence"],
  logger: ["in"],
  alert: ["in"],
};

const portsOf: ScenePortsOf = {
  before: (nodeId) => BEFORE_PORTS[nodeId],
  after: (nodeId) => AFTER_PORTS[nodeId],
};

export const SceneDiffSummary: Story = {
  render: () => {
    const diff = diffScene(BEFORE_SCENE, AFTER_SCENE, portsOf);
    const colorFor = (operation: string) => (operation === "removed" ? REMOVED : operation === "added" ? ADDED : "var(--foreground)");
    return (
      <Gallery>
        <Panel title="diffScene — nodes">
          <ul style={{ margin: 0, paddingLeft: 16 }} data-testid="node-diff-list">
            {diff.nodes.map((node) => (
              <li key={node.id} data-testid="node-diff-row" style={{ color: colorFor(node.operation) }}>
                {node.id} — {node.operation}
                {node.fields.length > 0 && (
                  <span style={{ color: "var(--muted-foreground)" }}>
                    {" "}
                    ({node.fields.map((f) => `${f.path}: ${f.before} → ${f.after}`).join(", ")})
                  </span>
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
        <Panel title="diffScene — ports (the callback-resolved vocabulary, S3's own field)">
          <ul style={{ margin: 0, paddingLeft: 16 }} data-testid="port-diff-list">
            {diff.ports.map((port) => (
              <li key={`${port.nodeId}/${port.portId}`} data-testid="port-diff-row" style={{ color: colorFor(port.operation) }}>
                {port.nodeId}.{port.portId} — {port.operation}
              </li>
            ))}
          </ul>
        </Panel>
      </Gallery>
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
  },
};
