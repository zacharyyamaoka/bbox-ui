import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import type { BlockView } from "../components/blockPort.layout";
import type { PortEdgeItem } from "../components/portEdge";
import { WireLayer } from "../components/wireLayer";
import {
  commitDefinitionName,
  definitionBadge,
  definitionOccurrences,
  deleteNode,
  type DeletedNodeEdgePolicy,
  type OccurrenceData,
  parkedEnds,
  setDefinitionData,
  unlinkOccurrence,
} from "../scene/linking";
import { type BlockScene, findDanglingEdges, portKey, type SceneNode } from "../scene/scene";
import { sceneWires, type WireStyleData } from "../scene/sceneWires";

/**
 * Blocks/Scene/Linking — definition linking rendered live: "same name =
 * same thing", the software model (src/scene/linking.ts, ported from
 * SystemSketch's definitionLinking.ts — provenance in the module header).
 *
 * Nested under Blocks/Scene ON PURPOSE: these are scene-kit derivations,
 * exactly like SceneDriven — one `BlockScene` record, pure functions over
 * it, the view kit only ever repeating what the record says. No component
 * imports the scene; this story file is the host.
 *
 * Every story is a live host: React state holds the scene, the buttons
 * call the pure operations, and a `data-slot="scene-json"` dump renders
 * the actual record so the play functions can assert BYTE-level facts
 * (L1's "the other occurrence is untouched" is a string equality over the
 * serialized node, not a vibe).
 */

/* ------------------------------------------------------------------ */
/* Host data vocabulary                                                */
/* ------------------------------------------------------------------ */

type LinkScene = BlockScene<OccurrenceData, WireStyleData>;
type LinkedContent = { ports?: { left?: string[]; right?: string[] }; gain?: number };
type ExpandedLook = { fill?: string };
type Look = { view?: BlockView; w?: number; accent?: string };

function node(
  id: string,
  data: OccurrenceData,
  position: { x: number; y: number },
  definitionId?: string,
): SceneNode<OccurrenceData> {
  return definitionId ? { id, position, data, definitionId } : { id, position, data };
}

/** The lint's port-vocabulary reader — ports live in this host's
 *  `linked.ports`, so the scene can say which handles a node speaks. */
function portsOf(scene: LinkScene): (nodeId: string) => readonly string[] | undefined {
  return (nodeId) => {
    const owner = scene.nodes.find((candidate) => candidate.id === nodeId);
    if (!owner) return undefined;
    const ports = (owner.data.linked as LinkedContent | undefined)?.ports;
    return [...(ports?.left ?? []), ...(ports?.right ?? [])];
  };
}

/* ------------------------------------------------------------------ */
/* The host renderer — scene in, view-kit props out                    */
/* ------------------------------------------------------------------ */

function OccurrenceCard({ node: occurrence }: { node: SceneNode<OccurrenceData> }) {
  const look = (occurrence.data.appearance ?? {}) as Look;
  const linked = (occurrence.data.linked ?? {}) as LinkedContent;
  const expanded = (occurrence.data.expanded ?? {}) as ExpandedLook;
  const badge = definitionBadge(occurrence.data);
  const view: BlockView = look.view ?? "port";
  const rail = (ids: string[] | undefined) =>
    ids && ids.length > 0 ? { items: ids.map((id): PortEdgeItem => ({ id, label: id })) } : undefined;
  const edges = {
    ...(rail(linked.ports?.left) ? { left: rail(linked.ports?.left)! } : {}),
    ...(rail(linked.ports?.right) ? { right: rail(linked.ports?.right)! } : {}),
  };
  return (
    <BlockPort id={occurrence.id} view={view} edges={edges}>
      <Block
        width={look.w ?? 150}
        header={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span data-slot="occurrence-name" style={{ whiteSpace: "nowrap" }}>
              {String(occurrence.data.name ?? "")}
            </span>
            {badge && (
              <span
                data-slot="definition-badge"
                style={{
                  fontSize: 10,
                  lineHeight: "14px",
                  padding: "0 6px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
              >
                {badge}
              </span>
            )}
          </span>
        }
        body={
          view === "expanded" ? (
            <div
              data-slot="expanded-body"
              // WHY the fixed dark ink: the linked fill is authored LIGHT
              // data, so inheriting the theme's foreground turns white-on-
              // pastel in dark mode — the linked body must read in both.
              style={{ background: expanded.fill ?? "transparent", color: "#1f2937", borderRadius: 6, padding: "6px 8px", fontSize: 11 }}
            >
              gain = <span data-slot="gain">{String(linked.gain ?? "—")}</span>
            </div>
          ) : (
            <div data-slot="compact-body" data-accent={look.accent ?? ""} style={{ fontSize: 11, color: look.accent }}>
              gain = <span data-slot="gain">{String(linked.gain ?? "—")}</span>
            </div>
          )
        }
      />
    </BlockPort>
  );
}

/** `name[id+id]` per definition group, scene order — the literal the
 *  plays assert, so a linkage change is unmissable in one string. */
function groupSummary(scene: LinkScene): string {
  const groups = new Map<string, { name: string; ids: string[] }>();
  for (const occurrence of scene.nodes) {
    const key = occurrence.definitionId ?? `(unlinked ${occurrence.id})`;
    const entry = groups.get(key) ?? { name: String(occurrence.data.name ?? ""), ids: [] };
    entry.ids.push(occurrence.id);
    groups.set(key, entry);
  }
  return [...groups.values()].map((entry) => `${entry.name}[${entry.ids.join("+")}]`).join(" · ");
}

function danglingSummary(scene: LinkScene): string {
  const report = findDanglingEdges(scene, portsOf(scene));
  if (report.length === 0) return "none";
  return report
    .map((entry) => {
      const edge = scene.edges.find((candidate) => candidate.id === entry.edgeId);
      const parked = edge && parkedEnds(edge).includes(entry.end) ? "(parked)" : "";
      return `${entry.edgeId}:${entry.end}${parked}`;
    })
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* The interactive harness                                             */
/* ------------------------------------------------------------------ */

interface HarnessAction {
  label: string;
  testId: string;
  apply: (scene: LinkScene, mintId: () => string, policy: DeletedNodeEdgePolicy) => LinkScene;
}

function Harness({
  initial,
  actions = [],
  caption,
  height = 190,
  width = 700,
  showWires = false,
  policyToggle = false,
}: {
  initial: LinkScene;
  actions?: HarnessAction[];
  caption: ReactNode;
  height?: number;
  width?: number;
  showWires?: boolean;
  policyToggle?: boolean;
}) {
  const [scene, setScene] = useState(initial);
  const [policy, setPolicy] = useState<DeletedNodeEdgePolicy>("drop");
  const counter = useRef(0);
  const mintId = () => `lk-${(counter.current += 1)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "28px 40px" }}>
      <div data-slot="link-bench" style={{ position: "relative", width, height }}>
        <BenchContent scene={scene} showWires={showWires} />
      </div>
      {(actions.length > 0 || policyToggle) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {policyToggle && (
            <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              edges of a deleted node:{" "}
              <select
                data-testid="edge-policy"
                value={policy}
                onChange={(event) => setPolicy(event.target.value as DeletedNodeEdgePolicy)}
              >
                <option value="drop">drop</option>
                <option value="dangle">dangle</option>
                <option value="park">park</option>
              </select>
            </label>
          )}
          {actions.map((action) => (
            <button
              key={action.testId}
              type="button"
              data-testid={action.testId}
              onClick={() => setScene((current) => action.apply(current, mintId, policy))}
              style={{
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--background)",
                cursor: "pointer",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", display: "flex", gap: 24 }}>
        <span>
          groups: <span data-slot="link-groups">{groupSummary(scene)}</span>
        </span>
        <span>
          dangling: <span data-slot="link-dangling">{danglingSummary(scene)}</span>
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 640 }}>{caption}</div>
      <details style={{ fontSize: 11 }}>
        <summary style={{ cursor: "pointer", color: "var(--muted-foreground)" }}>scene record</summary>
        <pre data-slot="scene-json" style={{ maxWidth: 660, overflowX: "auto" }}>
          {JSON.stringify(scene, null, 1)}
        </pre>
      </details>
    </div>
  );
}

function BenchContent({ scene, showWires }: { scene: LinkScene; showWires: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      {scene.nodes
        .filter((occurrence) => occurrence.parentId === undefined)
        .map((occurrence) => (
          <div
            key={occurrence.id}
            style={{ position: "absolute", left: occurrence.position.x, top: occurrence.position.y }}
          >
            <OccurrenceCard node={occurrence} />
          </div>
        ))}
      {showWires && <WireLayer wires={sceneWires(scene)} containerRef={containerRef} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play plumbing                                                       */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function readScene(canvasElement: HTMLElement): LinkScene {
  return JSON.parse(required<HTMLPreElement>(canvasElement, '[data-slot="scene-json"]', "the scene dump").textContent ?? "");
}

function serializedNode(scene: LinkScene, nodeId: string): string {
  const found = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!found) throw new Error(`no node \`${nodeId}\` in the dumped scene`);
  return JSON.stringify(found);
}

function nameIn(canvasElement: HTMLElement, blockId: string): string {
  return (
    required<HTMLElement>(canvasElement, `[data-block-id="${blockId}"] [data-slot="occurrence-name"]`, `${blockId}'s name`)
      .textContent ?? ""
  );
}

function badgeIn(canvasElement: HTMLElement, blockId: string): string | null {
  return (
    canvasElement.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-slot="definition-badge"]`)?.textContent ??
    null
  );
}

function gainIn(canvasElement: HTMLElement, blockId: string): string {
  return (
    required<HTMLElement>(canvasElement, `[data-block-id="${blockId}"] [data-slot="gain"]`, `${blockId}'s gain readout`)
      .textContent ?? ""
  );
}

async function expectGroups(canvasElement: HTMLElement, literal: string): Promise<void> {
  await waitFor(() =>
    expect(required<HTMLElement>(canvasElement, '[data-slot="link-groups"]', "the groups line").textContent).toBe(literal),
  );
}

async function expectDangling(canvasElement: HTMLElement, literal: string): Promise<void> {
  await waitFor(() =>
    expect(required<HTMLElement>(canvasElement, '[data-slot="link-dangling"]', "the dangling line").textContent).toBe(
      literal,
    ),
  );
}

async function click(canvasElement: HTMLElement, testId: string): Promise<void> {
  await userEvent.click(required<HTMLButtonElement>(canvasElement, `[data-testid="${testId}"]`, `the ${testId} button`));
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const FILTER: LinkedContent = { ports: { left: ["in"], right: ["out"] }, gain: 3 };
const FILTER_FILL: ExpandedLook = { fill: "rgb(214, 228, 255)" };

function filterPair(): LinkScene {
  return {
    nodes: [
      node(
        "f1",
        { name: "filter", linked: structuredClone(FILTER), expanded: structuredClone(FILTER_FILL), appearance: { view: "expanded", w: 190, accent: "steelblue" } },
        { x: 8, y: 16 },
        "g-filter",
      ),
      // f2 sits BELOW the f1→sink wire's flight path on purpose — the
      // wire must not read as passing through an uninvolved occurrence.
      node(
        "f2",
        { name: "filter", linked: structuredClone(FILTER), expanded: structuredClone(FILTER_FILL), appearance: { view: "port", accent: "firebrick" } },
        { x: 250, y: 118 },
        "g-filter",
      ),
      node("sink", { name: "sink", linked: { ports: { left: ["in"] } } }, { x: 500, y: 26 }, "g-sink"),
    ],
    edges: [{ id: "e1", source: "f1", sourceHandle: "out", target: "sink", targetHandle: "in" }],
  };
}

/* ------------------------------------------------------------------ */
/* The stories                                                         */
/* ------------------------------------------------------------------ */

const meta: Meta = {
  title: "Blocks/Scene/Linking",
};

export default meta;
type Story = StoryObj;

/** Two occurrences of ONE definition: same name, same data, same port
 *  vocabulary — different looks, different port KEYS. */
export const LinkedPair: Story = {
  render: () => (
    <Harness
      initial={filterPair()}
      showWires
      caption={
        <>
          <b>f1</b> and <b>f2</b> are occurrences of one definition — the data is linked, the styling is each
          occurrence's own. Their port vocabularies are identical; their port <i>keys</i> are namespaced per node, so
          the wire into <b>f1/out</b> says nothing about f2's.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await expectGroups(canvasElement, "filter[f1+f2] · sink[sink]");
    const scene = readScene(canvasElement);

    /* Same thing: one definition, both occurrences in it. */
    expect(definitionOccurrences(scene, "f1").map((occurrence) => occurrence.id)).toEqual(["f1", "f2"]);
    expect(nameIn(canvasElement, "f1")).toBe("filter");
    expect(nameIn(canvasElement, "f2")).toBe("filter");
    expect(gainIn(canvasElement, "f1")).toBe("3");
    expect(gainIn(canvasElement, "f2")).toBe("3");
    expect(badgeIn(canvasElement, "f1")).toBeNull();
    expect(badgeIn(canvasElement, "f2")).toBeNull();

    /* L4 — one vocabulary, disjoint keys, and BOTH facts measured. */
    const f1 = scene.nodes.find((occurrence) => occurrence.id === "f1")!;
    const f2 = scene.nodes.find((occurrence) => occurrence.id === "f2")!;
    expect(f1.data.linked).toEqual(f2.data.linked);
    const vocabulary = ["in", "out"];
    const keys1 = vocabulary.map((port) => portKey("f1", port));
    const keys2 = vocabulary.map((port) => portKey("f2", port));
    expect(keys1.filter((key) => keys2.includes(key))).toEqual([]);
    /* …and the DOM agrees: each occurrence owns its own dot for `out`. */
    const dot1 = required(canvasElement, '[data-block-id="f1"] [data-port-id="out"]', "f1's out dot");
    const dot2 = required(canvasElement, '[data-block-id="f2"] [data-port-id="out"]', "f2's out dot");
    expect(dot1).not.toBe(dot2);
  },
};

/** THE bug story. Renaming one occurrence detaches IT — it must never
 *  rename its links, "otherwise you can never link". */
export const RenameDetaches: Story = {
  render: () => (
    <Harness
      initial={filterPair()}
      actions={[
        {
          label: "rename f2 → smooth",
          testId: "rename-f2",
          apply: (scene, mintId) => commitDefinitionName(scene, "f2", "smooth", mintId),
        },
      ]}
      caption={
        <>
          Rename <b>f2</b> and ONLY f2 changes: it moves to its own fresh definition, and <b>f1</b> — name, data,
          record — is untouched, byte for byte. The donor's WHY: "the title is the escape seam between two
          occurrences."
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await expectGroups(canvasElement, "filter[f1+f2] · sink[sink]");
    const before = serializedNode(readScene(canvasElement), "f1");

    await click(canvasElement, "rename-f2");
    await expectGroups(canvasElement, "filter[f1] · smooth[f2] · sink[sink]");

    /* L1 — the assertion lands on the OTHER node: byte-identical. */
    const after = readScene(canvasElement);
    expect(serializedNode(after, "f1")).toBe(before);
    expect(nameIn(canvasElement, "f1")).toBe("filter");
    expect(nameIn(canvasElement, "f2")).toBe("smooth");
    /* The detached occurrence kept its data — it left, it wasn't reset. */
    expect(after.nodes.find((occurrence) => occurrence.id === "f2")!.data.linked).toEqual(FILTER);
    expect(definitionOccurrences(after, "f1").map((occurrence) => occurrence.id)).toEqual(["f1"]);
    expect(definitionOccurrences(after, "f2").map((occurrence) => occurrence.id)).toEqual(["f2"]);
  },
};

/** Same name over different content drafts automatically — Draft 1, then
 *  Draft 2; and after Draft 1 dies, the next collision takes Draft 3:
 *  ordinals always increment, freed numbers are not refilled. */
export const DraftOnCollision: Story = {
  render: () => (
    <Harness
      initial={{
        nodes: [
          node("f1", { name: "filter", linked: structuredClone(FILTER) }, { x: 8, y: 16 }, "g-filter"),
          node("gate", { name: "gate", linked: { ports: { left: ["in"] }, gain: 9 } }, { x: 190, y: 16 }, "g-gate"),
          node("trim", { name: "trim", linked: { ports: { left: ["in"] }, gain: 5 } }, { x: 360, y: 16 }, "g-trim"),
          node("late", { name: "late", linked: { ports: { left: ["in"] }, gain: 11 } }, { x: 530, y: 16 }, "g-late"),
        ],
        edges: [],
      }}
      height={150}
      actions={[
        { label: "rename gate → filter", testId: "rename-gate", apply: (scene, mintId) => commitDefinitionName(scene, "gate", "filter", mintId) },
        { label: "rename trim → filter", testId: "rename-trim", apply: (scene, mintId) => commitDefinitionName(scene, "trim", "filter", mintId) },
        { label: "delete the Draft 1 block", testId: "delete-gate", apply: (scene) => deleteNode(scene, "gate", "drop") },
        { label: "rename late → filter", testId: "rename-late", apply: (scene, mintId) => commitDefinitionName(scene, "late", "filter", mintId) },
      ]}
      caption={
        <>
          Naming something <b>filter</b> when a different-content <b>filter</b> already exists does not reject and does
          not merge — it quietly becomes a numbered Draft. The number only ever counts up: delete Draft 1 and the next
          collision is Draft 3, never a recycled 1.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await click(canvasElement, "rename-gate");
    await waitFor(() => expect(badgeIn(canvasElement, "gate")).toBe("Draft 1"));
    /* L2 — the ordinal VALUE, from the record, not just a badge's presence. */
    expect(readScene(canvasElement).nodes.find((occurrence) => occurrence.id === "gate")!.data.draftOrdinal).toBe(1);
    expect(badgeIn(canvasElement, "f1")).toBeNull(); // the canonical is not the draft

    await click(canvasElement, "rename-trim");
    await waitFor(() => expect(badgeIn(canvasElement, "trim")).toBe("Draft 2"));
    expect(readScene(canvasElement).nodes.find((occurrence) => occurrence.id === "trim")!.data.draftOrdinal).toBe(2);

    await click(canvasElement, "delete-gate");
    await waitFor(() => expect(canvasElement.querySelector('[data-block-id="gate"]')).toBeNull());

    await click(canvasElement, "rename-late");
    /* L3 — Draft 1 is free, Draft 2 is in use: the newcomer takes 3. */
    await waitFor(() => expect(badgeIn(canvasElement, "late")).toBe("Draft 3"));
    expect(readScene(canvasElement).nodes.find((occurrence) => occurrence.id === "late")!.data.draftOrdinal).toBe(3);
  },
};

/** Delete a node and watch the OTHERS update — with the edge policy as a
 *  live toggle (drop / dangle / park), because whether a dead node's
 *  edges are an error or an interaction is the host's call. */
export const DeleteOccurrence: Story = {
  render: () => {
    const AMP: LinkedContent = { ports: { left: ["in"] }, gain: 2 };
    return (
      <Harness
        initial={{
          nodes: [
            node("src", { name: "src", linked: { ports: { right: ["out"] } } }, { x: 8, y: 60 }, "g-src"),
            node("a1", { name: "amp", linked: structuredClone(AMP) }, { x: 200, y: 8 }, "g-amp"),
            node("a2", { name: "amp", linked: structuredClone(AMP) }, { x: 200, y: 96 }, "g-amp"),
            node("a3", { name: "amp", linked: structuredClone(AMP) }, { x: 200, y: 184 }, "g-amp"),
            node("d1", { name: "amp", linked: { ports: { left: ["in"] }, gain: 7 }, draftOrdinal: 1 }, { x: 440, y: 96 }, "g-amp-d1"),
          ],
          edges: [
            { id: "e1", source: "src", sourceHandle: "out", target: "a1", targetHandle: "in" },
            { id: "e2", source: "src", sourceHandle: "out", target: "a2", targetHandle: "in" },
            { id: "e3", source: "src", sourceHandle: "out", target: "a3", targetHandle: "in" },
          ],
        }}
        height={270}
        showWires
        policyToggle
        actions={[
          { label: "delete a1", testId: "delete-a1", apply: (scene, _mint, policy) => deleteNode(scene, "a1", policy) },
          { label: "delete a2", testId: "delete-a2", apply: (scene, _mint, policy) => deleteNode(scene, "a2", policy) },
          { label: "delete a3", testId: "delete-a3", apply: (scene, _mint, policy) => deleteNode(scene, "a3", policy) },
        ]}
        caption={
          <>
            Three occurrences of <b>amp</b>, plus its <b>Draft 1</b>. Deleting occurrences never disturbs the
            survivors; the edge toggle decides what a deleted node's wires do (drop / dangle / park — parked ends are
            dangling <i>on purpose</i>, and the lint can tell). Delete the LAST canonical occurrence and watch the
            draft: it is promoted — the badge disappears.
          </>
        }
      />
    );
  },
  play: async ({ canvasElement }) => {
    await expectGroups(canvasElement, "src[src] · amp[a1+a2+a3] · amp[d1]");
    await expectDangling(canvasElement, "none");
    const before = readScene(canvasElement);
    const beforeA2 = serializedNode(before, "a2");
    const beforeA3 = serializedNode(before, "a3");

    /* drop: the edge dies with the node, nothing dangles. */
    await click(canvasElement, "delete-a1");
    await expectGroups(canvasElement, "src[src] · amp[a2+a3] · amp[d1]");
    await expectDangling(canvasElement, "none");
    let scene = readScene(canvasElement);
    expect(scene.edges.map((edge) => edge.id)).toEqual(["e2", "e3"]);
    /* L5 — the survivors are byte-identical, and their edges still resolve. */
    expect(serializedNode(scene, "a2")).toBe(beforeA2);
    expect(serializedNode(scene, "a3")).toBe(beforeA3);
    expect(badgeIn(canvasElement, "d1")).toBe("Draft 1");

    /* dangle: the edge survives, and the lint names exactly it. */
    await userEvent.selectOptions(required<HTMLSelectElement>(canvasElement, '[data-testid="edge-policy"]', "the policy select"), "dangle");
    await click(canvasElement, "delete-a2");
    await expectGroups(canvasElement, "src[src] · amp[a3] · amp[d1]");
    await expectDangling(canvasElement, "e2:target");
    scene = readScene(canvasElement);
    expect(scene.edges.map((edge) => edge.id)).toEqual(["e2", "e3"]);
    expect(findDanglingEdges(scene).map((entry) => `${entry.edgeId}:${entry.end}`)).toEqual(["e2:target"]);
    expect(serializedNode(scene, "a3")).toBe(beforeA3);
    /* The wire layer reports the same fact in paint: e2 cannot resolve. */
    await waitFor(() => {
      const layer = required<SVGSVGElement>(canvasElement, '[data-slot="wire-layer"]', "the wire layer");
      expect((layer.getAttribute("data-unresolved-wires") ?? "").split(",")).toContain("e2");
    });

    /* park: still dangling, but stamped as deliberate. */
    await userEvent.selectOptions(required<HTMLSelectElement>(canvasElement, '[data-testid="edge-policy"]', "the policy select"), "park");
    await click(canvasElement, "delete-a3");
    await expectDangling(canvasElement, "e2:target e3:target(parked)");
    scene = readScene(canvasElement);
    expect(parkedEnds(scene.edges.find((edge) => edge.id === "e3")!)).toEqual(["target"]);
    expect(parkedEnds(scene.edges.find((edge) => edge.id === "e2")!)).toEqual([]);

    /* The last canonical occurrence is gone — the draft got PROMOTED. */
    await expectGroups(canvasElement, "src[src] · amp[d1]");
    await waitFor(() => expect(badgeIn(canvasElement, "d1")).toBeNull());
    expect(readScene(canvasElement).nodes.find((occurrence) => occurrence.id === "d1")!.data.draftOrdinal).toBeUndefined();
  },
};

/** Unlink: the occurrence steps out under a numbered name and stops
 *  hearing definition edits. */
export const UnlinkOccurrence: Story = {
  render: () => (
    <Harness
      initial={{
        nodes: [
          node("m1", { name: "mix", linked: { ports: { left: ["in"] }, gain: 2 } }, { x: 8, y: 16 }, "g-mix"),
          node("m2", { name: "mix", linked: { ports: { left: ["in"] }, gain: 2 } }, { x: 240, y: 16 }, "g-mix"),
        ],
        edges: [],
      }}
      height={150}
      actions={[
        { label: "set gain = 7 (via m1)", testId: "set-7", apply: (scene) => setDefinitionData(scene, "m1", { linked: { ports: { left: ["in"] }, gain: 7 } }) },
        { label: "unlink m2", testId: "unlink-m2", apply: (scene, mintId) => unlinkOccurrence(scene, "m2", mintId) },
        { label: "set gain = 9 (via m1)", testId: "set-9", apply: (scene) => setDefinitionData(scene, "m1", { linked: { ports: { left: ["in"] }, gain: 9 } }) },
      ]}
      caption={
        <>
          While linked, editing the definition through EITHER occurrence updates both. Unlink <b>m2</b> and it becomes
          <b> mix_1</b> — a different name, because "if you just want to style it uniquely yourself, no point in even
          calling it the same thing" — and the next definition edit no longer reaches it.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await expectGroups(canvasElement, "mix[m1+m2]");

    await click(canvasElement, "set-7");
    await waitFor(() => expect(gainIn(canvasElement, "m1")).toBe("7"));
    expect(gainIn(canvasElement, "m2")).toBe("7"); // linked: the edit reached both

    await click(canvasElement, "unlink-m2");
    await expectGroups(canvasElement, "mix[m1] · mix_1[m2]");
    expect(nameIn(canvasElement, "m2")).toBe("mix_1");

    await click(canvasElement, "set-9");
    await waitFor(() => expect(gainIn(canvasElement, "m1")).toBe("9"));
    expect(gainIn(canvasElement, "m2")).toBe("7"); // independent now: frozen at the unlink-time value
  },
};

/** The linked/free split, both directions: the EXPANDED view's paint is
 *  definition content (the function body); compact styling is each
 *  occurrence's own — and diverging it never detaches. */
export const ExpandedIsLinked: Story = {
  render: () => {
    const STAGE: LinkedContent = { ports: { left: ["in"], right: ["out"] }, gain: 4 };
    return (
      <Harness
        initial={{
          nodes: [
            node("x1", { name: "stage", linked: structuredClone(STAGE), expanded: { fill: "rgb(214, 228, 255)" }, appearance: { view: "expanded", w: 190, accent: "steelblue" } }, { x: 8, y: 16 }, "g-stage"),
            node("x2", { name: "stage", linked: structuredClone(STAGE), expanded: { fill: "rgb(214, 228, 255)" }, appearance: { view: "expanded", w: 190, accent: "seagreen" } }, { x: 250, y: 16 }, "g-stage"),
            node("x3", { name: "stage", linked: structuredClone(STAGE), expanded: { fill: "rgb(214, 228, 255)" }, appearance: { view: "port", accent: "firebrick" } }, { x: 500, y: 30 }, "g-stage"),
          ],
          edges: [],
        }}
        actions={[
          { label: "repaint the expanded body (via x1)", testId: "repaint", apply: (scene) => setDefinitionData(scene, "x1", { expanded: { fill: "rgb(255, 214, 214)" } }) },
          {
            label: "restyle x2's accent (host write)",
            testId: "restyle",
            apply: (scene) => ({
              ...scene,
              nodes: scene.nodes.map((occurrence) =>
                occurrence.id === "x2"
                  ? { ...occurrence, data: { ...occurrence.data, appearance: { ...(occurrence.data.appearance ?? {}), accent: "purple" } } }
                  : occurrence,
              ),
            }),
          },
        ]}
        caption={
          <>
            Repainting the expanded body through <b>x1</b> repaints <b>x2</b> too — the expanded view IS the
            definition, the function-body model. Restyling <b>x2</b>'s own accent touches only x2, and the group line
            does not move: free appearance never detaches an occurrence.
          </>
        }
      />
    );
  },
  play: async ({ canvasElement }) => {
    await expectGroups(canvasElement, "stage[x1+x2+x3]");
    const fillOf = (blockId: string) =>
      getComputedStyle(required<HTMLElement>(canvasElement, `[data-block-id="${blockId}"] [data-slot="expanded-body"]`, `${blockId}'s expanded body`))
        .backgroundColor;
    expect(fillOf("x1")).toBe("rgb(214, 228, 255)");
    expect(fillOf("x2")).toBe("rgb(214, 228, 255)");

    /* L6, direction one: expanded appearance is LINKED. */
    await click(canvasElement, "repaint");
    await waitFor(() => expect(fillOf("x1")).toBe("rgb(255, 214, 214)"));
    expect(fillOf("x2")).toBe("rgb(255, 214, 214)");
    /* The record agrees, on every occurrence — the compact one included. */
    for (const id of ["x1", "x2", "x3"]) {
      expect(readScene(canvasElement).nodes.find((occurrence) => occurrence.id === id)!.data.expanded).toEqual({ fill: "rgb(255, 214, 214)" });
    }

    /* L6, direction two: non-expanded appearance is NOT linked. */
    const accentOf = (blockId: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-slot="compact-body"]`)?.getAttribute("data-accent");
    await click(canvasElement, "restyle");
    await waitFor(() =>
      expect(readScene(canvasElement).nodes.find((occurrence) => occurrence.id === "x2")!.data.appearance).toEqual({ view: "expanded", w: 190, accent: "purple" }),
    );
    const scene = readScene(canvasElement);
    expect(scene.nodes.find((occurrence) => occurrence.id === "x1")!.data.appearance).toEqual({ view: "expanded", w: 190, accent: "steelblue" });
    expect(accentOf("x3")).toBe("firebrick"); // untouched bystander, still rendering its own accent
    /* …and diverged styling did NOT split the definition. */
    await expectGroups(canvasElement, "stage[x1+x2+x3]");
    expect(definitionOccurrences(scene, "x2").map((occurrence) => occurrence.id)).toEqual(["x1", "x2", "x3"]);
  },
};
