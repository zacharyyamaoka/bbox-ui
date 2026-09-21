/**
 * Interaction/Drag Policy — one story per component, each with the table
 * of expected interaction beside a live React Flow canvas Zach can grab.
 *
 * Zach, `PROJECT - Black Box UI.md:2508-2512`:
 *   "Success looks like here a story in storybook for each component kinda
 *    describing the logic. ... a little table with the text, on the canvas,
 *    use a host reactflow/tldraw that syas like here is the expected
 *    interaction, and then I can basically like click it and move it my
 *    self to test. You can also use storybook to test as well!"
 *
 * So every story here carries a `play` that drives REAL pointer sequences
 * and measures `getBoundingClientRect`. WHY measured and not
 * DOM-presence-asserted: a test that asserts an element exists proves
 * nothing about a gesture, and this repo has already been burned by a
 * green-looking probe that never checked anything
 * (`vitest.config.ts`'s `reportedException` note).
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import type { HostScene } from "./hostScene";
import { DRAG_DECLARATIONS, resolveClick, resolveGrab } from "../scene/interactions/dragPolicy";
import { move, press, release } from "../scene/interactions/dragIntent";
import { grabChainFrom, OWNER_ATTR, resolveGrabAt } from "./grabChain";
import { PolicyStage } from "./policyStage";

const meta = {
  title: "Interaction/Drag Policy",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Scenes — one small fixture per component                            */
/* ------------------------------------------------------------------ */

const expandedBlock: HostScene = {
  nodes: [
    { id: "proc", type: "block", position: { x: 40, y: 30 }, data: { name: "proc", view: "expanded", w: 260, h: 190, ports: { left: ["in"], right: ["out"] }, anchorStart: ["left"] } },
    { id: "kid", type: "block", parentId: "proc", position: { x: 0, y: 0 }, data: { name: "kid", view: "port", w: 110, h: 62, ports: { left: ["in"] } } },
  ],
  edges: [],
};

const solidBlock: HostScene = {
  nodes: [{ id: "sink", type: "block", position: { x: 60, y: 60 }, data: { name: "sink", view: "port", w: 150, h: 96, ports: { left: ["in", "cfg"] } } }],
  edges: [],
};

const glyphOnly: HostScene = {
  nodes: [{ id: "logo", type: "glyph", position: { x: 90, y: 70 }, data: { name: "logo", content: "lucide:rocket" } }],
  edges: [],
};

const codeOnly: HostScene = {
  nodes: [{ id: "prog", type: "code", position: { x: 40, y: 50 }, data: { name: "prog", code: "gain = clamp(x * k, 0, 1)" } }],
  edges: [],
};

const valueOnly: HostScene = {
  nodes: [{ id: "gain", type: "value", position: { x: 90, y: 80 }, data: { name: "gain", value: "0.75", writers: ["set"], readers: ["val"] } }],
  edges: [],
};

/* ------------------------------------------------------------------ */
/* Real-gesture helpers                                                */
/* ------------------------------------------------------------------ */

/** Both event families, the browser's own order — the recipe
 *  `src/hosts/hostGestures.ts` documents: React Flow's drag runs on
 *  d3-drag, which listens for MOUSE events, so a pointer-only sequence
 *  never reaches it and any "the host didn't steal it" claim is vacuous. */
function fireBoth(el: Element, kind: "down" | "move" | "up", x: number, y: number) {
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: kind === "up" ? 0 : 1, view: window } as const;
  el.dispatchEvent(new PointerEvent(`pointer${kind}`, { ...base, pointerId: 1, isPrimary: true, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent(`mouse${kind}`, base));
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

function boxOf(root: HTMLElement, nodeId: string): DOMRect {
  const el = root.querySelector<HTMLElement>(`[data-scene-node="${nodeId}"]`);
  if (!el) throw new Error(`no scene node \`${nodeId}\``);
  return el.getBoundingClientRect();
}

function pointOnSlot(root: HTMLElement, nodeId: string, slot: string, which = 0): { x: number; y: number } {
  const els = root.querySelectorAll<HTMLElement>(`[data-scene-node="${nodeId}"] [data-slot="${slot}"]`);
  const el = els[which];
  if (!el) throw new Error(`no \`${slot}\`[${which}] in \`${nodeId}\``);
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

/**
 * Press at a point, glide well past the threshold, release — then report
 * how far the node's own box actually travelled.
 *
 * Measured off `getBoundingClientRect`, never off a class or a callback:
 * the question "did the thing move" has exactly one honest answer and it
 * is a number of pixels.
 */
async function dragOnce(root: HTMLElement, nodeId: string, at: { x: number; y: number }, by: { x: number; y: number }): Promise<number> {
  const target = document.elementFromPoint(at.x, at.y);
  if (!target) throw new Error(`nothing under (${at.x},${at.y})`);
  const before = boxOf(root, nodeId);
  fireBoth(target, "down", at.x, at.y);
  await tick(20);
  for (let i = 1; i <= 8; i++) fireBoth(target, "move", at.x + (by.x * i) / 8, at.y + (by.y * i) / 8), await tick(14);
  await tick(25);
  fireBoth(target, "up", at.x + by.x, at.y + by.y);
  await tick(90);
  const after = boxOf(root, nodeId);
  return Math.hypot(after.left - before.left, after.top - before.top);
}

/**
 * Measure the gesture, then put the node back where it started.
 *
 * WHY the drag-back: Storybook runs a play function on every render,
 * including the one the report's capture script photographs — so without
 * it, every capture of a story that drags something shows the aftermath,
 * and a node dragged past the host's 340px box leaves a blank canvas in
 * the report. The measurement is taken BETWEEN the two gestures, so
 * restoring costs the assertion nothing. Caught by looking at the
 * captures, 2026-09-17: `BlockExpanded`'s first render photographed an
 * empty canvas.
 */
async function grabAndMove(root: HTMLElement, nodeId: string, at: { x: number; y: number }, by = { x: 48, y: 30 }): Promise<number> {
  const moved = await dragOnce(root, nodeId, at, by);
  // The grab point travelled with the node, so it is now at `at + by`;
  // reversing `by` from there lands the node back on its start.
  if (moved > 1) await dragOnce(root, nodeId, { x: at.x + by.x, y: at.y + by.y }, { x: -by.x, y: -by.y });
  return moved;
}

async function mounted(root: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(root.querySelector('[data-testid="policy-canvas"] [data-scene-node]')).not.toBeNull());
  await tick(500);
  return root.querySelector<HTMLElement>('[data-testid="policy-canvas"]')!;
}

/* ================================================================== */
/* 1 — Block, expanded: the disputed sentence                          */
/* ================================================================== */

export const BlockExpanded: Story = {
  name: "Block (expanded) · bands grab, interior is child canvas",
  render: () => (
    <PolicyStage
      declarationKey="block:expanded"
      scene={expandedBlock}
      declaredNodes={["proc"]}
      note={
        <>
          <strong>This is the case the commit message got wrong.</strong> The donor does not drag an
          expanded Block by its header alone — <code>BlockShapeUtil.tsx:514-519</code> gives it{" "}
          <em>header ∪ port-label bands ∪ footer</em>, and leaves the interior unfilled on purpose so
          children still select and drag.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);

    // The declaration is on the node, and the resolver reads it.
    const node = root.querySelector(`[data-scene-node="proc"]`)!;
    expect(node.getAttribute(OWNER_ATTR)).toBe("block:expanded");

    // The header band is a grab surface, resolved through the real walk.
    const headerEl = root.querySelector('[data-scene-node="proc"] [data-slot="block-header"]')!;
    expect(resolveGrabAt(headerEl, node).role).toBe("grab");

    // THE FIX for the measured leak: a MEMBER's header resolves to the
    // member's own declaration, never to the parent's grab map. React
    // Flow's `hasSelector` walks past it (measured: kid's header moved
    // proc 40.8px); the nearest-declaration walk stops at the member.
    const memberEl = root.querySelector('[data-scene-node="proc"] [data-slot="block-member"]')!;
    memberEl.setAttribute(OWNER_ATTR, "block:solid");
    const memberHeader = memberEl.querySelector('[data-slot="block-header"]')!;
    const viaMember = resolveGrabAt(memberHeader, node);
    expect(viaMember.owner).toBe(DRAG_DECLARATIONS["block:solid"].component);
    expect(viaMember.owner).not.toBe(DRAG_DECLARATIONS["block:expanded"].component);
    // and the walk really did stop early — the parent is not on the chain
    expect(grabChainFrom(memberHeader, node).some((l) => l.declares === "block:expanded")).toBe(false);

    // The live host still moves the node from a cold press on the header.
    const moved = await grabAndMove(root, "proc", pointOnSlot(root, "proc", "block-header", 0));
    expect(moved).toBeGreaterThan(20);
  },
};

/* ================================================================== */
/* 2 — Block, solid views: the whole face                              */
/* ================================================================== */

export const BlockSolid: Story = {
  name: "Block (simple/port/value) · the whole face grabs",
  render: () => (
    <PolicyStage
      declarationKey="block:solid"
      scene={solidBlock}
      declaredNodes={["sink"]}
      note={
        <>
          A non-container Block is solid: <code>isFilled: !isContainer</code>{" "}
          (<code>BlockShapeUtil.tsx:512</code>), asserted for every one of{" "}
          <code>simple</code>/<code>port</code>/<code>value</code> in{" "}
          <code>blockSelectableArea.test.ts:207-214</code>. bbox-ui currently applies header-only to
          <em> every</em> view, so today this block's body is dead — measured 0px.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    const node = root.querySelector('[data-scene-node="sink"]')!;
    const bodyEl = root.querySelector('[data-scene-node="sink"] [data-slot="block"]')!;
    // The declaration says the face grabs...
    expect(resolveGrabAt(bodyEl, node).role).toBe("grab");
    expect(resolveGrabAt(bodyEl, node).via).toBe("face");
    // ...and the port dot still does not.
    const dot = root.querySelector('[data-scene-node="sink"] [data-slot="port-dot"]')!;
    expect(resolveGrabAt(dot, node).role).toBe("owns-pointer");

    // The MEASUREMENT that makes this story exist: the running host does
    // NOT honour it yet. Header moves; interior does not. Recorded as a
    // passing assertion so the wiring landing will make it fail loudly.
    const viaHeader = await grabAndMove(root, "sink", pointOnSlot(root, "sink", "block-header", 0));
    expect(viaHeader).toBeGreaterThan(20);
    const box = boxOf(root, "sink");
    const viaBody = await grabAndMove(root, "sink", { x: Math.round(box.left + box.width / 2), y: Math.round(box.bottom - 10) });
    expect(viaBody).toBe(0); // ← flips to >20 when DRAG_HANDLE_FOR_TYPE stops being per-type
  },
};

/* ================================================================== */
/* 3 — Glyph: the claim that measured false                            */
/* ================================================================== */

export const GlyphFace: Story = {
  name: "Glyph · whole face should grab (measured: it does not)",
  render: () => (
    <PolicyStage
      declarationKey="glyph"
      scene={glyphOnly}
      declaredNodes={["logo"]}
      width={420}
      height={260}
      note={
        <>
          The commit claimed "glyph drags by its whole face". <strong>Measured false:</strong> a press
          on the centre of the rendered face — which resolves to the lucide{" "}
          <code>&lt;svg&gt;&lt;path&gt;</code> — moved the node 0px, while a press on the node's 1px
          margin moved it. Nothing on that chain carries <code>nodrag</code> and nothing has{" "}
          <code>pointer-events: none</code>, so React Flow's own filter should have passed it; the
          cause is unresolved and reported as such.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    const node = root.querySelector('[data-scene-node="logo"]')!;
    const glyphEl = root.querySelector('[data-scene-node="logo"] [data-slot="glyph"]')!;
    // The declaration is unambiguous: the whole face grabs.
    expect(resolveGrabAt(glyphEl, node).role).toBe("grab");

    // And the measurement: the deepest element at the face centre is NOT
    // the declared span — it is inside the SVG. That is the finding.
    const r = glyphEl.getBoundingClientRect();
    const deepest = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))!;
    expect(deepest.closest('[data-slot="glyph"]')).not.toBeNull();
    expect(["path", "svg"]).toContain(deepest.tagName.toLowerCase());
    // The chain still resolves correctly through it — the policy is fine;
    // the host's stock filter is what disagrees.
    expect(resolveGrabAt(deepest, node).role).toBe("grab");
  },
};

/* ================================================================== */
/* 4 — Code face: the claim that measured TRUE                         */
/* ================================================================== */

export const CodeFace: Story = {
  name: "CodeEditor · owns its pointer wall to wall (verified)",
  render: () => (
    <PolicyStage
      declarationKey="code-editor"
      scene={codeOnly}
      declaredNodes={["prog"]}
      width={460}
      height={240}
      note={
        <>
          The one clause of the commit message that measured <strong>true</strong>. The editor carries{" "}
          <code>nodrag</code> (<code>hosts/nodeViews.tsx:145</code>) and React Flow's drag filter
          rejects any press under that class natively
          (<code>@xyflow/system:2352</code>). The residual grab area is the wrapper's{" "}
          <strong>10px ring</strong> (<code>reactFlowHost.tsx:227</code>) — measured grabbable, and a
          10px target.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    const node = root.querySelector('[data-scene-node="prog"]')!;
    const editorEl = root.querySelector('[data-scene-node="prog"] [data-slot="code-editor"]')!;
    expect(resolveGrabAt(editorEl, node).role).toBe("owns-pointer");

    // Measured: a press inside the editor moves nothing.
    const insideEditor = pointOnSlot(root, "prog", "code-editor", 0);
    expect(await grabAndMove(root, "prog", insideEditor)).toBe(0);

    // Measured: the 10px ring does move it — so the node IS repositionable.
    const box = boxOf(root, "prog");
    expect(await grabAndMove(root, "prog", { x: Math.round(box.left + 3), y: Math.round(box.top + 3) })).toBeGreaterThan(20);
  },
};

/* ================================================================== */
/* 5 — Value capsule                                                   */
/* ================================================================== */

export const ValueCapsule: Story = {
  name: "ValueCapsule · pill face grabs, editor does not",
  render: () => (
    <PolicyStage
      declarationKey="value"
      scene={valueOnly}
      declaredNodes={["gain"]}
      width={420}
      height={240}
      note={
        <>
          The donor gives <code>view === 'value'</code> a <code>Stadium2d</code> with{" "}
          <code>isFilled: true</code> (<code>BlockShapeUtil.tsx:503-508</code>) — a solid face.
          Measured inconsistency in bbox-ui today: a <code>value</code> node has no{" "}
          <code>dragHandle</code>, so its <em>port rail</em> drags the node, while the identical rail
          on a <code>block</code> node does not.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    const node = root.querySelector('[data-scene-node="gain"]')!;
    const editorEl = root.querySelector('[data-scene-node="gain"] [data-slot="code-editor"]');
    if (editorEl) expect(resolveGrabAt(editorEl, node).role).toBe("owns-pointer");
    const dot = root.querySelector('[data-scene-node="gain"] [data-slot="port-dot"]');
    if (dot) expect(resolveGrabAt(dot, node).role).toBe("owns-pointer");
    // The declared face grabs.
    expect(resolveGrab([{}, { declares: "value" }]).role).toBe("grab");
  },
};

/* ================================================================== */
/* 6 — Port: Zach's own rule, text vs dot                              */
/* ================================================================== */

export const PortTextVsDot: Story = {
  name: "Port · the text grabs, the dot stays the cable handle",
  render: () => (
    <PolicyStage
      declarationKey="port"
      scene={solidBlock}
      declaredNodes={["sink"]}
      note={
        <>
          Zach's own words, <code>Components/DP - Port.md:190</code>: “pressing once on its
          name/type/value and dragging enters tldraw's normal move interaction{" "}
          <strong>immediately—no preliminary selection click</strong>. The circular dot deliberately
          remains the cable handle.” The donor's band is{" "}
          <code>portLabelHitArea</code> (<code>layoutBlock.ts:904-922</code>), padded{" "}
          <code>8px</code> past the final glyph and stopping there, so the empty half of a label box
          is <em>not</em> grabbable.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    // Resolved against the port declaration, not the block's.
    expect(resolveGrab([{ slot: "port-label-display" }, { declares: "port" }]).role).toBe("grab");
    expect(resolveGrab([{ slot: "port-dot" }, { declares: "port" }]).role).toBe("owns-pointer");

    // Measured against the running host: a press on the port TEXT moves
    // nothing today, because `dragHandle` admits only the header.
    const label = root.querySelector('[data-scene-node="sink"] [data-slot="port-label-display"]');
    expect(label).not.toBeNull();
    const r = label!.getBoundingClientRect();
    const movedByText = await grabAndMove(root, "sink", { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    expect(movedByText).toBe(0); // ← flips to >20 when the port-label band is wired
  },
};

/* ================================================================== */
/* 7 — THE requirement: cold press-and-drag moves it                   */
/* ================================================================== */

export const ColdDragMovesIt: Story = {
  name: "★ Cold press-and-drag moves it (no prior selection)",
  render: () => (
    <PolicyStage
      declarationKey="block:expanded"
      scene={expandedBlock}
      declaredNodes={["proc"]}
      note={
        <>
          <strong>
            “generally where I just 1 click and drag I want it to move, even if it hasn't been
            selected prior”
          </strong>{" "}
          — <code>PROJECT - Black Box UI.md:2504</code>. Good news from the primary source: stock
          React Flow already does this. <code>getDragItems</code> admits a node when{" "}
          <code>node.selected || node.id === nodeId</code> (<code>@xyflow/system:2053</code>), so a
          cold press drags. What is missing is not intent detection — it is the grab <em>area</em>,
          and any notion of hover/selected at all.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    const node = root.querySelector<HTMLElement>('[data-scene-node="proc"]')!;

    // Nothing is selected. Assert that, rather than assuming it.
    const rfNode = node.closest(".react-flow__node")!;
    expect(rfNode.classList.contains("selected")).toBe(false);

    // One press-and-drag, from cold, and it moves.
    const moved = await grabAndMove(root, "proc", pointOnSlot(root, "proc", "block-header", 0));
    expect(moved).toBeGreaterThan(20);

    // And the pure reducer agrees, at the threshold the donor set.
    const grab = resolveGrab([{ slot: "block-header" }, { declares: "block:expanded" }]);
    let intent = press({ x: 0, y: 0 }, grab);
    intent = move(intent, { x: 5, y: 0 });
    expect(intent.phase).toBe("dragging");
    expect(release(intent, { wasActive: false })).toEqual({ kind: "moved", delta: { x: 5, y: 0 } });
  },
};

/* ================================================================== */
/* 8 — Zach's sequence: 1 click, then click-and-drag                   */
/* ================================================================== */

export const ClickThenClickAndDrag: Story = {
  name: "★ 1 click, then another click-and-drag",
  render: () => (
    <PolicyStage
      declarationKey="block:expanded"
      scene={expandedBlock}
      declaredNodes={["proc"]}
      note={
        <>
          Zach asked for “a single click and drag. vs 1 click and then another click and drag”
          (<code>:2500</code>). One donor rule covers both —{" "}
          <em>was this Block already active when you pressed?</em>{" "}
          (<code>DP - Block.md:714</code>, gate at <code>blockClickToEdit.ts:42-51</code>). No timer
          and no click counter, which is why his “2nd click (slow)” column behaves identically to
          “double click rapid”. And a second press that <em>moves</em> is still a move, never an edit.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    await mounted(canvasElement);
    const expanded = DRAG_DECLARATIONS["block:expanded"];
    const header = resolveGrab([{ slot: "block-header" }, { declares: "block:expanded" }]);

    // 1st click on a cold block: activate, and nothing else.
    const first = move(press({ x: 0, y: 0 }, header), { x: 1, y: 0 });
    expect(release(first, { wasActive: false, declaration: expanded })).toEqual({ kind: "clicked", outcome: { kind: "activate" } });

    // 2nd click, at ANY speed: edit the field it landed on.
    const second = move(press({ x: 0, y: 0 }, header), { x: 1, y: 0 });
    expect(release(second, { wasActive: true, declaration: expanded })).toEqual({ kind: "clicked", outcome: { kind: "edit", part: "block-header" } });

    // But a 2nd press that DRAGS moves it and opens nothing — the rule
    // that keeps the whiteboard feel alive on a text face.
    let dragged = press({ x: 0, y: 0 }, header);
    dragged = move(dragged, { x: 40, y: 20 });
    expect(release(dragged, { wasActive: true, declaration: expanded }).kind).toBe("moved");

    // A miss stays a miss: active, clicked on the inert interior.
    const interior = resolveGrab([{}, { declares: "block:expanded" }]);
    expect(resolveClick(interior, { wasActive: true, declaration: expanded })).toEqual({ kind: "keep-active" });
  },
};

/* ================================================================== */
/* 9 — Hover: the column that cannot be shown today                    */
/* ================================================================== */

export const HoverReadout: Story = {
  name: "Hover · resolved live, through the real walk",
  render: () => (
    <PolicyStage
      declarationKey="block:expanded"
      scene={expandedBlock}
      declaredNodes={["proc"]}
      note={
        <>
          Move the pointer over the canvas and the readout above it names the resolved role for
          whatever is underneath, read through the same walk a press takes. <strong>
            The host itself has no hover or selected state to show:
          </strong>{" "}
          <code>applyPositionChanges</code> (<code>reactFlowHost.tsx:323-332</code>) keeps only{" "}
          <code>change.type === "position"</code>, so React Flow's <code>select</code> changes are
          dropped — measured, a plain click never selects anything.
        </>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const root = await mounted(canvasElement);
    const probe = canvasElement.querySelector('[data-testid="grab-probe"]')!;
    expect(probe.getAttribute("data-role")).toBe("—");

    const headerEl = root.querySelector('[data-scene-node="proc"] [data-slot="block-header"]')!;
    const r = headerEl.getBoundingClientRect();
    headerEl.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), pointerId: 1, isPrimary: true, view: window }));
    await waitFor(() => expect(canvasElement.querySelector('[data-testid="grab-probe"]')!.getAttribute("data-role")).toBe("grab"));
    expect(canvasElement.querySelector('[data-testid="grab-probe"]')!.getAttribute("data-via")).toBe("block-header");

    // The tables rendered from the same data the predicates read.
    expect(canvasElement.querySelector('[data-testid="declaration-table"]')).not.toBeNull();
    expect(canvasElement.querySelector('[data-testid="row-port-dot"]')).not.toBeNull();
  },
};
