// src/regionRigid.smoke.test.tsx — a region and its corner card are ONE object.
//
// Zach, 2026-09-21, on a For Loop and a Branch whose cards sat ~26px inset
// from the frame's top-left (the Branch card overlapping its own `if` row):
// "You need to rigidly connect the for loop and branch block to the region
// frame. It should conceptually be one object." ... "Same issue with branch."
//
// Four claims, each measured in the real mounted app:
//   1. PINNED — the card's region-local position is exactly (0, 0), rotation
//      0, parent = its region, after every write that could move it: a drag,
//      a nudge/align/distribute naming it, a duplicate, a paste, undo/redo,
//      Group from the pill, the Open Python import, a reparent attempted
//      mid-gesture on the card itself, and a stored board loaded with the card
//      at (40, 30). A DELIBERATE scene write may still take the card out
//      (applySceneDiff's hoist) — rigidity is a property of the hand, not of
//      every writer — including while an unrelated shape is mid-drag.
//   2. ONE OBJECT — a press-drag on the card moves the whole region, and a
//      click on the card leaves the REGION selected, never the card.
//   3. STILL WORKS — a dot still starts a wire, the glyph picker and the
//      in-place title rename still reach the card, a rail still reorders, an
//      ordinary member still selects and drags on its own, Enter on the region
//      renames the card, and Delete takes
//      region + card as one undo step.
//   4. NO OVERLAP — a Branch's first arm header and a Loop's body start at or
//      below the card's bottom edge (getBoundingClientRect, never presence).
//   5. HOVER + NOT ALONE (Zach, 2026-09-22) — a real pointer over the card
//      paints tldraw's hover outline on the frame's box, never the card's; no
//      select-all, Tab or first-child gesture leaves the card selected alone,
//      and the pill offers no view toggle for it, even mid-rename.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, react, type TLShapeId } from "tldraw";

import { BACKEND_SETTING_STORAGE_KEY, DEFAULT_PYBLOCKS_URL } from "@trunk/backend/backendSetting";

import regionForIf from "../../../docs/fixtures/pyblocks-scene/region_for_if.scene.json";
import { setBlockView } from "./chrome/ContextualPopupMenu/selectionActions";
import { loadBoardText, serializeBoard } from "./chrome/FileMenu/fileActions";
import { applyScene } from "./document/applySceneDiff";
import { sceneFromRecords } from "./document/sceneFromStore";
import { createCornerBlock, type RegionKind } from "./shapes/region";
import { createWire } from "./shapes/wire/createWire";
import { wireDrag } from "./shapes/wire/wireGesture";
import { BLOCK_SHAPE_TYPE, BRANCH_TOOL_ID, LOOP_TOOL_ID, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
let restoreFetch: (() => void) | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
  restoreFetch?.();
  restoreFetch = null;
  window.localStorage.removeItem(BACKEND_SETTING_STORAGE_KEY);
});

interface ShapeLike {
  id: TLShapeId;
  parentId: string;
  x: number;
  y: number;
  rotation: number;
}
interface RegionLike extends ShapeLike {
  props: { w: number; h: number; kind: string; name: string; cornerBlockId: string; arms: { id: string; title: string; open: boolean; h: number }[] };
}
interface BlockLike extends ShapeLike {
  props: { name: string; glyph: string; ports: Record<string, { id: string; declaration: string }[]> };
}

const shape = <T = ShapeLike>(id: TLShapeId) => app!.editor.getShape(id) as unknown as T | undefined;
const regions = () => app!.editor.getCurrentPageShapes().filter((s) => s.type === REGION_SHAPE_TYPE) as unknown as RegionLike[];
const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

/** A region exactly as its dock row mints one — region, then its corner card,
 *  one undo step — placed programmatically where the thing under test is not
 *  the placement gesture. */
function placeRegion(kind: RegionKind, x: number, y: number): { id: TLShapeId; cornerId: TLShapeId } {
  const id = createShapeId();
  const arms =
    kind === "branch"
      ? [
          { id: "if", title: "if", open: true, h: 160 },
          { id: "else", title: "else", open: true, h: 160 },
        ]
      : [];
  let cornerId: TLShapeId | null = null;
  app!.editor.markHistoryStoppingPoint("place region");
  app!.editor.run(() => {
    app!.editor.createShape({ id, type: REGION_SHAPE_TYPE, x, y, props: { kind, name: kind, w: 480, h: 320, arms } } as never);
    cornerId = createCornerBlock(app!.editor, id, kind);
  });
  if (!cornerId) throw new Error(`a ${kind} region always has a corner block`);
  return { id, cornerId };
}

/** THE PIN, asserted exactly — no tolerance. */
function expectPinned(regionId: TLShapeId, what: string) {
  const region = shape<RegionLike>(regionId);
  expect(region, `${what}: the region exists`).toBeTruthy();
  const cornerId = region!.props.cornerBlockId as TLShapeId;
  expect(cornerId, `${what}: the region names a card`).not.toBe("");
  const corner = shape<BlockLike>(cornerId);
  expect(corner, `${what}: the card exists`).toBeTruthy();
  expect(String(corner!.parentId), `${what}: the card's parent is its region`).toBe(String(regionId));
  expect({ x: corner!.x, y: corner!.y, rotation: corner!.rotation }, `${what}: the card sits on the corner slot`).toEqual({ x: 0, y: 0, rotation: 0 });
}

async function cardFace(cornerId: TLShapeId) {
  return waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="block"]`), { what: "the corner card's face" });
}

async function cardHeader(cornerId: TLShapeId) {
  return waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="block-header"]`), { what: "the corner card's header" });
}

async function dotOf(blockId: TLShapeId, portId: string) {
  return waitFor(() => app!.root.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-port-id="${portId}"] [data-slot="port-dot"]`), {
    what: `${blockId}/${portId} dot`,
  });
}

/** A real press-drag from a screen point, by a delta — the pattern
 *  `blockBodyPress.smoke.test.tsx` uses. */
async function dragFromScreen(screen: { x: number; y: number }, by: { dx: number; dy: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  const rect = element.getBoundingClientRect();
  await userEvent.dragAndDrop(element, canvasOf(app!.root), {
    sourcePosition: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) },
    targetPosition: { x: Math.round(screen.x + by.dx), y: Math.round(screen.y + by.dy) },
  });
}

/** A free point on the card's header: past the glyph slot, clear of anything
 *  the header's content owns. */
function headerPoint(header: HTMLElement): { x: number; y: number } {
  const rect = header.getBoundingClientRect();
  return { x: rect.right - 12, y: rect.top + rect.height / 2 };
}

/** FALLBACK (`testing/harness.tsx` §9 note): a claim about what a write does
 *  WHILE the select tool is mid-translate has to stand inside the gesture
 *  between its press and its release, which `userEvent.dragAndDrop` cannot
 *  pause. tldraw's own input pipeline is driven directly for that window. */
const POINTER_BASE = {
  type: "pointer" as const,
  target: "canvas" as const,
  pointerId: 1,
  button: 0,
  isPen: false,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  accelKey: false,
};
let translateFrom: { x: number; y: number } | null = null;

async function startTranslating(point: { x: number; y: number }) {
  translateFrom = point;
  app!.editor.dispatch({ ...POINTER_BASE, name: "pointer_down", point: { x: point.x, y: point.y, z: 0.5 } });
  for (let step = 1; step <= 6; step++) {
    app!.editor.dispatch({ ...POINTER_BASE, name: "pointer_move", point: { x: point.x + step * 10, y: point.y + step * 6, z: 0.5 } });
    await settle(20);
  }
  await waitFor(() => (app!.editor.isIn("select.translating") ? true : null), { what: "the select tool translating" });
}

async function endTranslating() {
  const point = translateFrom!;
  app!.editor.dispatch({ ...POINTER_BASE, name: "pointer_up", point: { x: point.x + 60, y: point.y + 36, z: 0.5 } });
  await waitFor(() => (app!.editor.isIn("select.idle") ? true : null), { what: "the gesture ended" });
}

async function pickSystemRow(pattern: RegExp) {
  const face = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-system"]'), { what: "system face" });
  const chevron = face.parentElement?.querySelector<HTMLElement>("[aria-haspopup]") ?? face;
  await userEvent.click(chevron);
  const row = await waitFor(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => pattern.test(el.textContent ?? "")), { what: `a ${pattern} row` });
  await userEvent.click(row);
}

/** A region placed with the dock's own tool and a real click. */
async function placeWithTool(row: RegExp, toolId: string): Promise<RegionLike> {
  await pickSystemRow(row);
  await waitFor(() => app!.editor.getCurrentToolId() === toolId, { what: `${toolId} tool` });
  const canvas = canvasOf(app!.root);
  const rect = canvas.getBoundingClientRect();
  await userEvent.click(canvas, { position: { x: Math.round(rect.width * 0.35), y: Math.round(rect.height * 0.3) } });
  const region = await waitFor(() => regions()[0], { what: "an ss-region" });
  await waitFor(() => (shape<RegionLike>(region.id)!.props.cornerBlockId ? true : null), { what: "the corner card" });
  return shape<RegionLike>(region.id)!;
}

describe("PINNED — the corner card never leaves region-local (0, 0)", () => {
  it("writes that name the card directly — move, nudge, align, distribute, rotate — all leave it on the slot", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const other = createShapeId();
    app.editor.createShape({ id: other, type: BLOCK_SHAPE_TYPE, x: 900, y: 600, props: { name: "other", view: "port" } } as never);
    await cardFace(cornerId);

    app.editor.updateShape({ id: cornerId, type: BLOCK_SHAPE_TYPE, x: 40, y: 30 });
    expectPinned(id, "updateShape to (40, 30)");
    app.editor.nudgeShapes([cornerId], { x: 10, y: 10 });
    expectPinned(id, "nudgeShapes");
    app.editor.alignShapes([cornerId, other], "right");
    expectPinned(id, "alignShapes right");
    app.editor.alignShapes([cornerId, other], "bottom");
    expectPinned(id, "alignShapes bottom");
    const third = createShapeId();
    app.editor.createShape({ id: third, type: BLOCK_SHAPE_TYPE, x: 1400, y: 900, props: { name: "third", view: "port" } } as never);
    app.editor.distributeShapes([other, cornerId, third], "horizontal");
    expectPinned(id, "distributeShapes");
    app.editor.updateShape({ id: cornerId, type: BLOCK_SHAPE_TYPE, rotation: 0.5 });
    expectPinned(id, "rotation");
  });

  it("the backstop: mid-translate, a reparent of a card that is ITSELF selected is refused", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const header = await cardHeader(cornerId);
    await startTranslating(headerPoint(header));
    // No real gesture can get here: the redirect only lets a card be selected
    // during its own rename, and tldraw leaves that session before it can
    // translate (see `gestureMovesCard`'s WHY — measured: writing an editing
    // session mid-translate knocks the select tool out of `translating`). So
    // the selection is written with side effects OFF, bypassing the redirect,
    // to stand in for whatever future path lets a card be selected on its
    // own. What is under test is the backstop's predicate, not how it is
    // reached.
    const pageState = app.editor.getCurrentPageState();
    // `Store.atomic(fn, false)` is the same side-effects-off switch
    // `Store.loadStoreSnapshot` uses; it is marked internal in tldraw's
    // public types, hence the narrow cast — a test-only stand-in, never app code.
    const store = app.editor.store as unknown as { atomic(fn: () => void, runCallbacks: boolean): void };
    store.atomic(() => app!.editor.store.put([{ ...pageState, selectedShapeIds: [cornerId] }]), false);
    expect(app.editor.getSelectedShapeIds()).toEqual([cornerId]);
    expect(app.editor.isIn("select.translating")).toBe(true);
    app.editor.reparentShapes([cornerId], app.editor.getCurrentPageId());
    expect(String(shape(cornerId)!.parentId), "mid-gesture, the selected card stayed in its region").toBe(String(id));
    await endTranslating();
    expectPinned(id, "after the gesture");
  });

  it("THE RACE: a scene write landing while an UNRELATED block is mid-translate still hoists the card the scene keeps", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    await cardFace(cornerId);
    const other = createShapeId();
    app.editor.createShape({ id: other, type: BLOCK_SHAPE_TYPE, x: 1000, y: 150, props: { name: "unrelated()", view: "port" } } as never);
    const otherHeader = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${other}"] [data-slot="block-header"]`), { what: "the unrelated block's header" });
    await startTranslating(headerPoint(otherHeader));
    expect(app.editor.getSelectedShapeIds()).toEqual([other]);

    // An async scene response (the Open Python shape of it) lands NOW: the
    // region's node is gone, the card's node survives with no parent.
    const scene = sceneFromRecords(app.editor.store.allRecords());
    const next = {
      ...scene,
      nodes: scene.nodes
        .filter((node) => node.id !== id)
        .map((node) => {
          if (node.id !== cornerId) return node;
          const { parentId: _dropped, ...rest } = node;
          return rest;
        }),
    };
    applyScene(app.editor, next, { kind: "document" });
    expect(app.editor.isIn("select.translating"), "the scene landed mid-gesture").toBe(true);
    expect(shape(id), "the region was removed").toBeUndefined();
    const card = shape<BlockLike>(cornerId);
    expect(card, "the card the scene kept survived the region's delete").toBeTruthy();
    expect(String(card!.parentId)).toBe(String(app.editor.getCurrentPageId()));

    await endTranslating();
    expect(shape(cornerId), "the card is still there once the gesture ends").toBeTruthy();
  });

  it("THE RACE, region variant: a scene write landing while the card's OWN region is mid-translate still hoists the card the scene keeps", async () => {
    // WHY this exists beside the unrelated-block race (Codex, 2026-09-22): the
    // load-bearing rule is that a selected ANCESTOR does not arm the veto
    // (`gestureMovesCard`'s WHY). Widen it to "card or selected ancestor" and
    // the unrelated-block race stays green while this — the person dragging
    // the very region the scene deletes — loses the card again.
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    const face = await cardFace(cornerId);
    const header = await cardHeader(cornerId);
    // A real press on the REGION: its title strip, beside the card.
    const c = face.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    const onStrip = { x: c.right + 60, y: h.top + h.height / 2 };
    expect(face.contains(document.elementFromPoint(onStrip.x, onStrip.y)), "the press is beside the card, not on it").toBe(false);
    await startTranslating(onStrip);
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);

    const scene = sceneFromRecords(app.editor.store.allRecords());
    const next = {
      ...scene,
      nodes: scene.nodes
        .filter((node) => node.id !== id)
        .map((node) => {
          if (node.id !== cornerId) return node;
          const { parentId: _dropped, ...rest } = node;
          return rest;
        }),
    };
    applyScene(app.editor, next, { kind: "document" });
    expect(app.editor.isIn("select.translating"), "the scene landed mid-gesture").toBe(true);
    expect(shape(id), "the region was removed").toBeUndefined();
    const card = shape<BlockLike>(cornerId);
    expect(card, "the card the scene kept survived its own region's delete").toBeTruthy();
    expect(String(card!.parentId)).toBe(String(app.editor.getCurrentPageId()));

    await endTranslating();
    expect(shape(cornerId), "the card is still there once the gesture ends").toBeTruthy();
  });

  it("a DELIBERATE scene write can take the card out: applyScene removing the region but keeping the card leaves it on the page", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    await cardFace(cornerId);
    const scene = sceneFromRecords(app.editor.store.allRecords());
    // The region's node is gone; the card's node survives with no parent —
    // the exact shape `hoistedSurvivors` exists for (applySceneDiff.ts).
    const next = {
      ...scene,
      nodes: scene.nodes
        .filter((node) => node.id !== id)
        .map((node) => {
          if (node.id !== cornerId) return node;
          const { parentId: _dropped, ...rest } = node;
          return rest;
        }),
    };
    applyScene(app.editor, next, { kind: "document" });
    expect(shape(id), "the region was removed").toBeUndefined();
    const card = shape<BlockLike>(cornerId);
    expect(card, "the card the scene kept survived the region's delete").toBeTruthy();
    expect(String(card!.parentId)).toBe(String(app.editor.getCurrentPageId()));
  });

  it("arrow-key nudge after clicking the card moves the region, never the card off its slot", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    const header = await cardHeader(cornerId);
    // A person reaches the nudge by clicking what they want to move — which is
    // also what puts keyboard focus inside tldraw's container, where its
    // arrow-key handling listens (a bare `editor.focus()` leaves the DOM
    // focus on <body> and the keys go nowhere, measured).
    const point = headerPoint(header);
    const hit = document.elementFromPoint(point.x, point.y)!;
    const rect = hit.getBoundingClientRect();
    await userEvent.click(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection" });
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    // And a programmatic selection naming the card comes out naming the region too.
    app.editor.select(cornerId);
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    const before = shape<RegionLike>(id)!;
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    await waitFor(() => (shape<RegionLike>(id)!.y !== before.y ? true : null), { what: "the nudge moved the region" });
    expect(shape<RegionLike>(id)!.x).toBeGreaterThan(before.x);
    expect(shape<RegionLike>(id)!.y).toBeGreaterThan(before.y);
    expectPinned(id, "after arrow keys");
  });

  it("duplicate and copy-paste: every copy's card is its own, on its own slot", async () => {
    app = await mountApp();
    const { id } = placeRegion("for", 300, 200);
    app.editor.select(id);
    app.editor.duplicateShapes([id], { x: 600, y: 0 });
    await waitFor(() => (regions().length === 2 ? true : null), { what: "the duplicate" });

    const content = app.editor.getContentFromCurrentPage([id]);
    if (!content) throw new Error("no content to paste");
    app.editor.putContentOntoCurrentPage(content, { point: { x: 300, y: 700 }, select: true });
    await waitFor(() => (regions().length === 3 ? true : null), { what: "the pasted copy" });

    const all = regions();
    for (const region of all) expectPinned(region.id, `region ${region.id}`);
    // Each copy names ITS OWN card, never the original's.
    expect(new Set(all.map((region) => region.props.cornerBlockId)).size).toBe(3);
  });

  it("undo and redo of a region drag land the card on its slot every time", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    const header = await cardHeader(cornerId);
    const start = shape<RegionLike>(id)!;
    await dragFromScreen(headerPoint(header), { dx: 120, dy: 80 });
    await waitFor(() => (shape<RegionLike>(id)!.x !== start.x ? true : null), { what: "the drag moved the region" });
    expectPinned(id, "after the drag");
    app.editor.undo();
    expect(shape<RegionLike>(id)!.x).toBe(start.x);
    expectPinned(id, "after undo");
    app.editor.redo();
    expect(shape<RegionLike>(id)!.x).not.toBe(start.x);
    expectPinned(id, "after redo");
  });

  it("Group from the selection pill mints a card on the slot", async () => {
    app = await mountApp();
    const a = createShapeId();
    const b = createShapeId();
    app.editor.createShape({ id: a, type: BLOCK_SHAPE_TYPE, x: 200, y: 200, props: { name: "A", view: "port", ports: { left: [], right: [{ id: "out", declaration: "out: Pose" }], top: [], bottom: [] } } } as never);
    app.editor.createShape({ id: b, type: BLOCK_SHAPE_TYPE, x: 520, y: 240, props: { name: "B", view: "port", ports: { left: [{ id: "in", declaration: "in: Pose" }], right: [], top: [], bottom: [] } } } as never);
    createWire(app.editor, { from: { nodeId: a, portId: "out" }, to: { nodeId: b, portId: "in" } });
    app.editor.select(b);
    const bar = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), { what: "the floating toolbar" });
    const group = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-selection-group"]'), { what: "the Group cell" });
    await userEvent.click(group);
    const region = await waitFor(() => regions()[0], { what: "the grouped region" });
    await waitFor(() => (shape<RegionLike>(region.id)!.props.cornerBlockId ? true : null), { what: "a promoted card" });
    expectPinned(region.id, "after Group");
  });

  it("the Open Python import lands every region's card on its slot", async () => {
    window.localStorage.setItem(BACKEND_SETTING_STORAGE_KEY, JSON.stringify({ kind: "pyblocks", url: DEFAULT_PYBLOCKS_URL }));
    const real = window.fetch.bind(window);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/health")) return json({ status: "ok", analyzer: "pyblocks-blockview-v1", systemsketch: { scene: 1, events: 1 } });
      if (url.endsWith("/api/systemsketch/events")) return json({ accepted: 0, applied: 0, classified: [] });
      if (url.endsWith("/api/systemsketch/scene")) return json(regionForIf);
      return real(input as RequestInfo, init);
    }) as typeof window.fetch;
    restoreFetch = () => {
      window.fetch = real;
    };
    app = await mountApp();
    const input = await waitFor(() => app!.root.querySelector<HTMLInputElement>('[data-testid="ss-backend-file"]'), { what: "the Open Python file… input" });
    const transfer = new DataTransfer();
    transfer.items.add(new File(["# sort_frame.py\n"], "sort_frame.py", { type: "text/x-python" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // The fixture carries three regions: the function boundary, the `for` and
    // the `if` nested inside it.
    await waitFor(() => (regions().length === 3 && regions().every((region) => region.props.cornerBlockId) ? true : null), { what: "three imported regions with cards" });
    await settle();
    for (const region of regions()) expectPinned(region.id, `imported ${region.props.kind} region`);
  });

  it("a stored board whose card sits at (40, 30) — beyond the old 24px slack — opens with the card on its slot", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    await cardFace(cornerId);
    const text = await serializeBoard(app.editor);
    const file = JSON.parse(text) as { records: { id: string; x?: number; y?: number }[] };
    const card = file.records.find((record) => record.id === cornerId);
    if (!card) throw new Error("the card is not in the serialized board");
    card.x = 40;
    card.y = 30;
    expect(loadBoardText(app.editor, JSON.stringify(file))).toEqual({ ok: true });
    await waitFor(() => {
      const loaded = shape<BlockLike>(cornerId);
      return loaded && loaded.x === 0 && loaded.y === 0 ? true : null;
    }, { what: "the loaded card snapped to the slot" });
    expectPinned(id, "after File › Open");
  });
});

describe("ONE OBJECT — a gesture on the card is a gesture on the region", () => {
  it("a click on the card selects the REGION, never the card alone", async () => {
    app = await mountApp();
    const region = await placeWithTool(/loop/i, LOOP_TOOL_ID);
    const cornerId = region.props.cornerBlockId as TLShapeId;
    await userEvent.keyboard("{Escape}");
    app.editor.selectNone();
    const header = await cardHeader(cornerId);
    const point = headerPoint(header);
    const hit = document.elementFromPoint(point.x, point.y)!;
    const rect = hit.getBoundingClientRect();
    await userEvent.click(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection" });
    expect(app.editor.getSelectedShapeIds()).toEqual([region.id]);
    // A second click (the region is now an ancestor-selected shape) still
    // resolves to the region.
    await settle(500);
    await userEvent.click(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
    await settle();
    expect(app.editor.getSelectedShapeIds()).toEqual([region.id]);
  });

  it("a selection naming ONLY the card comes out naming the region", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    await cardFace(cornerId);
    app.editor.setSelectedShapes([cornerId]);
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
  });

  it("a marquee over the card but not the whole region selects the REGION", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 400, 250);
    const face = await cardFace(cornerId);
    const card = face.getBoundingClientRect();
    // From empty canvas above-left of the frame to the card's middle: the
    // brush covers part of the card and a sliver of the frame's corner, never
    // the whole region.
    await userEvent.dragAndDrop(canvasOf(app.root), canvasOf(app.root), {
      sourcePosition: { x: Math.round(card.left - 60), y: Math.round(card.top - 60) },
      targetPosition: { x: Math.round(card.left + card.width / 2), y: Math.round(card.top + card.height / 2) },
    });
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "the marquee selected something" });
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
  });

  for (const [label, where] of [
    ["header", "header"],
    ["body", "body"],
  ] as const) {
    it(`a press-drag on the card's ${label} moves frame + card + members by the drag delta`, async () => {
      app = await mountApp();
      const { id, cornerId } = placeRegion("for", 300, 200);
      const member = createShapeId();
      app.editor.createShape({ id: member, type: BLOCK_SHAPE_TYPE, parentId: id, x: 60, y: 160, props: { name: "member()", view: "port" } } as never);
      const face = await cardFace(cornerId);
      const header = await cardHeader(cornerId);
      const regionBefore = app.editor.getShapePageBounds(id)!;
      const memberBefore = app.editor.getShapePageBounds(member)!;
      const cardBefore = app.editor.getShapePageBounds(cornerId)!;
      let point = headerPoint(header);
      if (where === "body") {
        const f = face.getBoundingClientRect();
        const h = header.getBoundingClientRect();
        point = { x: f.left + f.width / 2, y: (h.bottom + f.bottom) / 2 };
        const under = document.elementFromPoint(point.x, point.y);
        expect(under && face.contains(under), "the aimed body point is on the card").toBe(true);
        expect(under?.closest('[data-slot="block-port-rail"]'), "the aimed point is the body, not a rail").toBeNull();
      }
      await dragFromScreen(point, { dx: 150, dy: 90 });
      await waitFor(() => (app!.editor.getShapePageBounds(id)!.x !== regionBefore.x ? true : null), { what: "the region moved" });
      const regionAfter = app.editor.getShapePageBounds(id)!;
      const dx = regionAfter.x - regionBefore.x;
      const dy = regionAfter.y - regionBefore.y;
      // Snapping may round the delta a few px; the claim is that it is the
      // drag's delta and that all three moved by the SAME amount.
      expect(Math.abs(dx - 150)).toBeLessThanOrEqual(12);
      expect(Math.abs(dy - 90)).toBeLessThanOrEqual(12);
      const memberAfter = app.editor.getShapePageBounds(member)!;
      const cardAfter = app.editor.getShapePageBounds(cornerId)!;
      expect({ x: memberAfter.x - memberBefore.x, y: memberAfter.y - memberBefore.y }).toEqual({ x: dx, y: dy });
      expect({ x: cardAfter.x - cardBefore.x, y: cardAfter.y - cardBefore.y }).toEqual({ x: dx, y: dy });
      expect(app.editor.getSelectedShapeIds()).toEqual([id]);
      expectPinned(id, `after a ${label} drag`);
    });
  }
});

describe("STILL WORKS — what the card owns keeps working", () => {
  it("a press-drag from each corner dot (Iterable, Iter, input 1) starts a wire gesture, never a region drag; Iter lands a real cable on a member", async () => {
    app = await mountApp();
    const loop = placeRegion("for", 500, 120);
    const branch = placeRegion("branch", 500, 520);
    const source = createShapeId();
    app.editor.createShape({ id: source, type: BLOCK_SHAPE_TYPE, x: 80, y: 300, props: { name: "frames()", view: "port", ports: { left: [], right: [{ id: "out", declaration: "out" }], top: [], bottom: [] } } } as never);
    const member = createShapeId();
    app.editor.createShape({ id: member, type: BLOCK_SHAPE_TYPE, parentId: loop.id, x: 220, y: 170, props: { name: "use()", view: "port", ports: { left: [{ id: "in", declaration: "in" }], right: [], top: [], bottom: [] } } } as never);
    const loopBefore = shape<RegionLike>(loop.id)!;
    const branchBefore = shape<RegionLike>(branch.id)!;
    const wireCount = () => app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE).length;
    // Whether the WIRE gesture owned the press is read off its own in-flight
    // atom (the one `WireFace`'s preview paints from), watched for the whole
    // drag — the commit is a separate question, answered by the judge below.
    let wireGestures = 0;
    let inFlight = false;
    const stopWatching = react("regionRigid wire in flight", () => {
      const live = wireDrag(app!.editor).get() !== null;
      if (live && !inFlight) wireGestures += 1;
      inFlight = live;
    });
    try {
      await userEvent.dragAndDrop(await dotOf(loop.cornerId, "iter"), await dotOf(member, "in"));
      await waitFor(() => (wireCount() === 1 ? true : null), { what: "a cable from the Iter dot to the member" });
      expect(wireGestures).toBe(1);

      // From the loop's Iterable and the branch's input 1 to a block OUTSIDE
      // the region. The gesture must start (the press is the wire's, not the
      // select tool's). Whether it then COMMITS is the connection judge's
      // call, and at the default `guided` level it refuses with
      // `no-shared-scope` — measured with this lane's handlers switched off
      // too, so that is pre-existing and not asserted either way here.
      await userEvent.dragAndDrop(await dotOf(loop.cornerId, "iterable"), await dotOf(source, "out"));
      await waitFor(() => (wireGestures === 2 && !inFlight ? true : null), { what: "a wire gesture from the Iterable dot" });
      await userEvent.dragAndDrop(await dotOf(branch.cornerId, "input_1"), await dotOf(source, "out"));
      await waitFor(() => (wireGestures === 3 && !inFlight ? true : null), { what: "a wire gesture from the input 1 dot" });
    } finally {
      stopWatching();
    }

    expect({ x: shape<RegionLike>(loop.id)!.x, y: shape<RegionLike>(loop.id)!.y }).toEqual({ x: loopBefore.x, y: loopBefore.y });
    expect({ x: shape<RegionLike>(branch.id)!.x, y: shape<RegionLike>(branch.id)!.y }).toEqual({ x: branchBefore.x, y: branchBefore.y });
    expectPinned(loop.id, "the loop after the wire drags");
    expectPinned(branch.id, "the branch after the wire drag");
  });

  it("the card's glyph picker opens and a pick writes the CARD's glyph", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    const face = await cardFace(cornerId);
    const trigger = await waitFor(() => face.querySelector<HTMLElement>('[data-slot="glyph-picker-trigger"]'), { what: "the card's glyph trigger" });
    await userEvent.click(trigger);
    const panel = await waitFor(() => document.querySelector<HTMLElement>('[data-slot="glyph-picker-panel"]'), { what: "the glyph picker panel" });
    const filter = await waitFor(() => panel.querySelector<HTMLInputElement>('[data-testid="glyph-picker-filter"]'), { what: "the filter" });
    await userEvent.fill(filter, "rocket");
    const cell = await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="glyph-picker-cell-lucide-rocket"]'), { what: "the rocket cell" });
    await userEvent.click(cell);
    await waitFor(() => (shape<BlockLike>(cornerId)!.props.glyph === "lucide:rocket" ? true : null), { what: "the card's glyph written" });
    expectPinned(id, "after a glyph pick");
  });

  it("a double-click on the card's title renames the CARD in place; ending the session hands the selection back to the region", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const title = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="ss-block-title"][data-editing="false"]`), { what: "the card's title" });
    await userEvent.dblClick(title);
    await waitFor(() => (app!.editor.getEditingShapeId() === cornerId ? true : null), { what: "the card's editing session" });
    expect(app.editor.getSelectedShapeIds()).toEqual([cornerId]);
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${cornerId}"] [data-slot="editable-text-input"]`), { what: "the in-place control" });
    await userEvent.keyboard("{Control>}a{/Control}each_frame");
    await waitFor(() => (shape<BlockLike>(cornerId)!.props.name === "each_frame" ? true : null), { what: "the card's name written" });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => (app!.editor.getEditingShapeId() === null ? true : null), { what: "the session ended" });
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    expectPinned(id, "after the rename");
  });

  it("Enter with the region selected renames the CARD in place, as a double-click does; committing hands the selection back to the region", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    const header = await cardHeader(cornerId);
    // Select the region the way a person does — a click on its card — which
    // also puts keyboard focus inside tldraw's container.
    const point = headerPoint(header);
    const hit = document.elementFromPoint(point.x, point.y)!;
    const rect = hit.getBoundingClientRect();
    await userEvent.click(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection" });
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    await settle(500);

    await userEvent.keyboard("{Enter}");
    await waitFor(() => (app!.editor.getEditingShapeId() === cornerId ? true : null), { what: "Enter opened the card's editing session" });
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${cornerId}"] [data-slot="editable-text-input"]`), { what: "the in-place control" });
    await userEvent.keyboard("{Control>}a{/Control}pick_path");
    await waitFor(() => (shape<BlockLike>(cornerId)!.props.name === "pick_path" ? true : null), { what: "the card's name written" });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => (app!.editor.getEditingShapeId() === null ? true : null), { what: "the session ended" });
    expect(shape<BlockLike>(cornerId)!.props.name).toBe("pick_path");
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    expectPinned(id, "after the Enter rename");
  });

  it("a port-rail drag on the card reorders its ports and never moves the region", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    app.editor.updateShape({
      id: cornerId,
      type: BLOCK_SHAPE_TYPE,
      props: { ports: { left: [{ id: "input_1", declaration: "input 1" }, { id: "input_2", declaration: "input 2" }], right: [], top: [], bottom: [] } },
    } as never);
    await cardFace(cornerId);
    // The rails are siblings of the card's `[data-slot="block"]` face inside
    // `BlockPort`, so they are found from the shape's own container.
    const cards = await waitFor(() => {
      const found = Array.from(app!.root.querySelectorAll<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="port-edge-card"]`));
      return found.length >= 2 ? found : null;
    }, { what: "two rail cards" });
    const before = shape<RegionLike>(id)!;
    // A real PointerSensor session, the technique PortEdge.stories.tsx's own
    // `dragCard` documents: `isPrimary` and the >4px first move are both
    // load-bearing for dnd-kit.
    const fire = (el: Element, type: string, x: number, y: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }));
    const from = cards[0].getBoundingClientRect();
    const to = cards[1].getBoundingClientRect();
    const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    const end = { x: to.left + to.width / 2, y: to.bottom - 2 };
    fire(cards[0], "pointerdown", start.x, start.y);
    await settle(30);
    fire(cards[0], "pointermove", start.x, start.y + 10);
    await settle(30);
    fire(cards[0], "pointermove", end.x, end.y);
    await settle(30);
    fire(cards[0], "pointerup", end.x, end.y);
    await waitFor(() => (shape<BlockLike>(cornerId)!.props.ports.left[0]?.id === "input_2" ? true : null), { what: "the rail reordered" });
    expect({ x: shape<RegionLike>(id)!.x, y: shape<RegionLike>(id)!.y }).toEqual({ x: before.x, y: before.y });
    expectPinned(id, "after the reorder");
  });

  it("an ordinary NON-corner block inside a region still selects and drags on its own", async () => {
    app = await mountApp();
    const { id } = placeRegion("for", 300, 200);
    const member = createShapeId();
    app.editor.createShape({ id: member, type: BLOCK_SHAPE_TYPE, parentId: id, x: 80, y: 180, props: { name: "member()", view: "port" } } as never);
    const header = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${member}"] [data-slot="block-header"]`), { what: "the member's header" });
    const regionBefore = shape<RegionLike>(id)!;
    const memberBefore = shape<BlockLike>(member)!;
    const point = headerPoint(header);
    const hit = document.elementFromPoint(point.x, point.y)!;
    const rect = hit.getBoundingClientRect();
    await userEvent.click(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection" });
    expect(app.editor.getSelectedShapeIds()).toEqual([member]);
    // Let tldraw's click counter lapse, or the drag's press is a double-click.
    await settle(500);
    await dragFromScreen(point, { dx: 60, dy: 40 });
    await waitFor(() => (shape<BlockLike>(member)!.x !== memberBefore.x ? true : null), { what: "the member moved" });
    expect(String(shape<BlockLike>(member)!.parentId)).toBe(String(id));
    expect({ x: shape<RegionLike>(id)!.x, y: shape<RegionLike>(id)!.y }).toEqual({ x: regionBefore.x, y: regionBefore.y });
    expectPinned(id, "after moving a member");
  });

  it("Delete with the region selected removes region + card as ONE undo step; one Ctrl+Z restores both", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("branch", 300, 200);
    await cardFace(cornerId);
    app.editor.select(id);
    app.editor.focus();
    await userEvent.keyboard("{Delete}");
    await waitFor(() => (!shape(id) && !shape(cornerId) ? true : null), { what: "region and card both gone" });
    await userEvent.keyboard("{Control>}z{/Control}");
    await waitFor(() => (shape(id) && shape(cornerId) ? true : null), { what: "one undo restores both" });
    expectPinned(id, "after undo of Delete");
  });
});

/**
 * The box tldraw's overlay canvas actually PAINTED, in viewport px — read off
 * the pixels of `.tl-canvas-overlays`, never off `getHoveredShapeId` or the
 * indicator path's own maths. With nothing selected and no gesture running,
 * the only thing that canvas draws is the hover indicator
 * (`ShapeIndicatorOverlayUtil.getOverlays`), so the bounding box of its
 * non-transparent pixels IS the outline a person sees.
 */
function paintedOverlayBox(): { left: number; top: number; right: number; bottom: number } | null {
  const canvas = app!.root.querySelector<HTMLCanvasElement>("canvas.tl-canvas-overlays");
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return null;
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / canvas.width;
  const sy = rect.height / canvas.height;
  return { left: rect.left + minX * sx, top: rect.top + minY * sy, right: rect.left + (maxX + 1) * sx, bottom: rect.top + (maxY + 1) * sy };
}

/** tldraw paints hover only while `isHoveringCanvas`, which its canvas
 *  `onPointerEnter` sets — see the frame tests below for the measurement. */
async function enterCanvasFromOutside() {
  const outside = document.createElement("div");
  outside.style.cssText = "position:fixed;left:0;top:0;width:8px;height:8px;z-index:2147483647;";
  document.body.appendChild(outside);
  await userEvent.hover(outside);
  outside.remove();
}

/** The painted overlay (after it settles) is the region FRAME's box, and is
 *  nowhere near the card's. Same tolerance as the frame tests below. */
async function expectPaintedIsFrame(regionId: TLShapeId, face: HTMLElement, first?: { left: number }) {
  if (!first) await waitFor(() => paintedOverlayBox(), { what: "a painted outline" });
  await settle(150);
  const painted = paintedOverlayBox()!;
  const frame = app!.root.querySelector<HTMLElement>(`[data-shape-id="${regionId}"]`)!.getBoundingClientRect();
  const card = face.getBoundingClientRect();
  const offBy = (r: { left: number; top: number; right: number; bottom: number }) =>
    Math.max(Math.abs(painted.left - r.left), Math.abs(painted.top - r.top), Math.abs(painted.right - r.right), Math.abs(painted.bottom - r.bottom));
  const text = (r: { left: number; top: number; right: number; bottom: number }) =>
    `${r.left.toFixed(1)},${r.top.toFixed(1)} → ${r.right.toFixed(1)},${r.bottom.toFixed(1)}`;
  expect(offBy(frame), `painted ${text(painted)} vs frame ${text(frame)} (card ${text(card)})`).toBeLessThanOrEqual(2.5);
  expect(offBy(card), "the card's own outline was painted").toBeGreaterThan(50);
}

describe("HOVER — pointing at the card outlines the WHOLE region", () => {
  // Zach, 2026-09-22: "when you hover on the corner block its the entire out
  // frame that should become highlighted in blue". Real mouse moves (vitest's
  // Playwright `hover`), then the PAINTED outline measured against the frame.
  // Deliberately mechanism-agnostic — it reads pixels, not `hoveredShapeId`:
  // redirecting that RECORD to the region was tried and breaks the card's
  // double-click rename (tldraw's `Idle.onDoubleClick` edits the HOVERED
  // shape, and a region cannot edit). The fix is paint-only
  // (`shapes/region/regionHoverIndicator.ts`); the record stays the card.
  for (const where of ["header", "body"] as const) {
    it(`a real pointer over the card's ${where} paints the hover outline on the frame's box, never the card's`, async () => {
      app = await mountApp();
      const { id, cornerId } = placeRegion("for", 300, 200);
      const face = await cardFace(cornerId);
      const header = await cardHeader(cornerId);
      app.editor.selectNone();
      let point = headerPoint(header);
      if (where === "body") {
        const f = face.getBoundingClientRect();
        const h = header.getBoundingClientRect();
        point = { x: f.left + f.width / 2, y: (h.bottom + f.bottom) / 2 };
      }
      const hit = document.elementFromPoint(point.x, point.y)!;
      expect(face.contains(hit), `the aimed ${where} point is on the card`).toBe(true);
      const rect = hit.getBoundingClientRect();
      // Arrive from empty canvas first, so tldraw sees a real pointer enter.
      // WHY the detour through a throwaway element: tldraw paints hover only
      // while `isHoveringCanvas`, which its canvas `onPointerEnter` sets. The
      // app mounts full-viewport UNDER a mouse that has not moved, so the
      // pointer is already "inside" and no enter ever fires — measured:
      // `isHoveringCanvas` stayed null through every move. A person always
      // arrives from outside the canvas; this makes the test do the same.
      const outside = document.createElement("div");
      outside.style.cssText = "position:fixed;left:0;top:0;width:8px;height:8px;z-index:2147483647;";
      document.body.appendChild(outside);
      await userEvent.hover(outside);
      outside.remove();
      // (Above-left of the frame — clear of every chrome surface.)
      const canvasRect = canvasOf(app.root).getBoundingClientRect();
      const card0 = face.getBoundingClientRect();
      await userEvent.hover(canvasOf(app.root), { position: { x: Math.round(card0.left - 60 - canvasRect.left), y: Math.round(card0.top - 60 - canvasRect.top) } });
      expect(app.editor.getHoveredShapeId(), "empty canvas hovers nothing").toBeNull();
      await userEvent.hover(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
      await waitFor(() => (app!.editor.getHoveredShapeId() ? true : null), { what: "something is hovered" });
      await waitFor(() => paintedOverlayBox(), { what: "a painted hover outline" });
      await settle(150);
      const painted = paintedOverlayBox()!;

      const frame = app.root.querySelector<HTMLElement>(`[data-shape-id="${id}"]`)!.getBoundingClientRect();
      const card = face.getBoundingClientRect();
      const text = (r: { left: number; top: number; right: number; bottom: number }) =>
        `${r.left.toFixed(1)},${r.top.toFixed(1)} → ${r.right.toFixed(1)},${r.bottom.toFixed(1)}`;
      const offBy = (r: { left: number; top: number; right: number; bottom: number }) =>
        Math.max(Math.abs(painted.left - r.left), Math.abs(painted.top - r.top), Math.abs(painted.right - r.right), Math.abs(painted.bottom - r.bottom));
      // The stroke is centred on the path (1.5px, antialiased), so the
      // painted box may overhang the frame's box by ~1px on each side.
      expect(offBy(frame), `painted ${text(painted)} vs frame ${text(frame)} (card ${text(card)}, hovered ${String(app.editor.getHoveredShapeId())})`).toBeLessThanOrEqual(2.5);
      // ...and it is NOT the card's outline: the card is a fraction of it.
      expect(frame.width - card.width).toBeGreaterThan(100);
      expect(offBy(card), "the card's own outline was painted").toBeGreaterThan(50);
    });
  }

  it("renaming the card (double-click the title): the editing session is the CARD's, and the painted outline is still the FRAME", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const face = await cardFace(cornerId);
    await enterCanvasFromOutside();
    const title = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="ss-block-title"][data-editing="false"]`), { what: "the card's title" });
    await userEvent.dblClick(title);
    await waitFor(() => (app!.editor.getEditingShapeId() === cornerId ? true : null), { what: "the card's editing session" });
    expect(app.editor.getSelectedShapeIds(), "the card is selected for its own rename").toEqual([cornerId]);
    // Off the card, onto empty canvas: now only the SELECTION is painted —
    // the hover path cannot be what makes this pass.
    // (Below the frame's bottom-left — the pill sits ABOVE the selection.)
    const canvasRect = canvasOf(app.root).getBoundingClientRect();
    const frameRect = app.root.querySelector<HTMLElement>(`[data-shape-id="${id}"]`)!.getBoundingClientRect();
    await userEvent.hover(canvasOf(app.root), { position: { x: Math.round(frameRect.left + 40 - canvasRect.left), y: Math.round(frameRect.bottom + 60 - canvasRect.top) } });
    await waitFor(() => (app!.editor.getHoveredShapeId() === null ? true : null), { what: "nothing hovered" });
    expect(app.editor.getEditingShapeId(), "moving off the card does not end the rename").toBe(cornerId);
    await expectPaintedIsFrame(id, face);
    await userEvent.keyboard("{Escape}");
  });

  it("a HINTED card paints the frame, not the card (the hint list is swapped too)", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const face = await cardFace(cornerId);
    app.editor.selectNone();
    app.editor.setHintingShapes([cornerId]);
    await expectPaintedIsFrame(id, face, await waitFor(() => paintedOverlayBox(), { what: "a painted hint outline" }));
  });

  it("hovering the card still reveals a tunnelled cable on the card's port — the hovered record is still the CARD (wireTunnel.ts)", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 520, 160);
    const source = createShapeId();
    app.editor.createShape({ id: source, type: BLOCK_SHAPE_TYPE, x: 60, y: 420, props: { name: "frames()", view: "port", ports: { left: [], right: [{ id: "out", declaration: "out" }], top: [], bottom: [] } } } as never);
    // A member with a cable of its own: hovering the CARD must not reveal it —
    // that is what the region-as-hovered-record variant would have changed
    // (`wireContextFocused` walks ancestors, so the region reveals every
    // member's cable).
    const member = createShapeId();
    app.editor.createShape({ id: member, type: BLOCK_SHAPE_TYPE, parentId: id, x: 240, y: 170, props: { name: "use()", view: "port", ports: { left: [{ id: "in", declaration: "in" }], right: [], top: [], bottom: [] } } } as never);
    await dotOf(cornerId, "iterable");
    await dotOf(member, "in");
    const cardWire = createWire(app.editor, { from: { nodeId: source, portId: "out" }, to: { nodeId: cornerId, portId: "iterable" } });
    const memberWire = createWire(app.editor, { from: { nodeId: source, portId: "out" }, to: { nodeId: member, portId: "in" } });
    if (!cardWire || !memberWire) throw new Error("both cables bind");
    app.editor.updateShapes([cardWire, memberWire].map((wire) => ({ id: wire, type: WIRE_SHAPE_TYPE, props: { tunnel: true } })) as never);
    const drawn = (wire: TLShapeId) => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`)?.getTotalLength() ?? 0;
    app.editor.selectNone();

    // Arrive from outside the canvas (see the frame tests above for why), then
    // rest on empty canvas: nothing is about either cable, so both hide.
    const outside = document.createElement("div");
    outside.style.cssText = "position:fixed;left:0;top:0;width:8px;height:8px;z-index:2147483647;";
    document.body.appendChild(outside);
    await userEvent.hover(outside);
    outside.remove();
    const canvasRect = canvasOf(app.root).getBoundingClientRect();
    await userEvent.hover(canvasOf(app.root), { position: { x: Math.round(canvasRect.width - 120), y: 120 } });
    await waitFor(() => (app!.editor.getHoveredShapeId() === null ? true : null), { what: "nothing hovered" });
    const hiddenCard = await waitFor(() => { const l = drawn(cardWire); return l > 0 && l < 120 ? l : null; }, { what: "the card's cable hidden" });
    await waitFor(() => { const l = drawn(memberWire); return l > 0 && l < 120 ? l : null; }, { what: "the member's cable hidden" });

    const header = await cardHeader(cornerId);
    const point = headerPoint(header);
    const hit = document.elementFromPoint(point.x, point.y)!;
    const rect = hit.getBoundingClientRect();
    await userEvent.hover(hit, { position: { x: Math.round(point.x - rect.left), y: Math.round(point.y - rect.top) } });
    await waitFor(() => (app!.editor.getHoveredShapeId() === cornerId ? true : null), { what: "the CARD is the hovered record" });
    await waitFor(() => (drawn(cardWire) > hiddenCard + 100 ? true : null), { what: "hovering the card reveals its own cable" });
    await settle(200);
    expect(drawn(memberWire), "a member's cable stays hidden — the hover is the card's, not the region's").toBeLessThan(120);
  });
});

describe("VIEW — the card always wears the corner view (`port`), whoever writes it", () => {
  // Zach, 2026-09-22: "I don't want to give people the option to expand the
  // region header block". A document invariant, held by the same pin as the
  // card's position — not only by the pill and the hotkeys.
  const viewOf = (cornerId: TLShapeId) => (shape(cornerId) as unknown as { props: { view: string } }).props.view;
  const paintedView = (cornerId: TLShapeId) =>
    app!.root.querySelector(`[data-shape-id="${cornerId}"] [data-block-id="${cornerId}"]`)?.getAttribute("data-view") ?? null;

  it("a direct editor.updateShape({ view: 'expanded' }) on the card leaves it `port`", async () => {
    app = await mountApp();
    const { cornerId } = placeRegion("for", 300, 200);
    await cardFace(cornerId);
    app.editor.updateShape({ id: cornerId, type: BLOCK_SHAPE_TYPE, props: { view: "expanded" } } as never);
    expect(viewOf(cornerId)).toBe("port");
    app.editor.updateShape({ id: cornerId, type: BLOCK_SHAPE_TYPE, props: { view: "simple" } } as never);
    expect(viewOf(cornerId)).toBe("port");
    await settle();
    expect(paintedView(cornerId)).toBe("port");
  });

  it("an applyScene that sets the card's view to expanded leaves it `port`", async () => {
    app = await mountApp();
    const { cornerId } = placeRegion("branch", 300, 200);
    await cardFace(cornerId);
    const scene = sceneFromRecords(app.editor.store.allRecords());
    const next = {
      ...scene,
      nodes: scene.nodes.map((node) => (node.id === cornerId ? { ...node, data: { ...node.data, view: "expanded" } } : node)),
    } as typeof scene;
    expect(next.nodes.some((node) => node.id === cornerId && (node.data as { view?: string }).view === "expanded"), "the scene really asks for expanded").toBe(true);
    applyScene(app.editor, next, { kind: "document" });
    expect(viewOf(cornerId)).toBe("port");
    await settle();
    expect(paintedView(cornerId)).toBe("port");
  });

  for (const stored of ["expanded", "simple"] as const) {
    it(`File › Open of a board whose card is stored ${stored} renders it \`port\``, async () => {
      app = await mountApp();
      const { cornerId } = placeRegion("for", 300, 200);
      await cardFace(cornerId);
      const file = JSON.parse(await serializeBoard(app.editor)) as { records: { id: string; props?: { view?: string } }[] };
      const card = file.records.find((record) => record.id === cornerId);
      if (!card?.props) throw new Error("the card is not in the serialized board");
      card.props.view = stored;
      expect(loadBoardText(app.editor, JSON.stringify(file))).toEqual({ ok: true });
      await waitFor(() => (viewOf(cornerId) === "port" ? true : null), { what: `the loaded ${stored} card back on port` });
      await waitFor(() => (paintedView(cornerId) === "port" ? true : null), { what: "the card painted as port" });
    });
  }
});

describe("NOT SELECTABLE ALONE — no gesture leaves the card selected by itself", () => {
  // Zach, 2026-09-22: "When you hover on it by itself shouldn't be
  // selectable." Click, marquee and a raw setSelectedShapes are covered in
  // ONE OBJECT above; these are the remaining doors.
  it("select-all (Ctrl+A) from nothing and from a member never selects the card", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const member = createShapeId();
    app.editor.createShape({ id: member, type: BLOCK_SHAPE_TYPE, parentId: id, x: 80, y: 180, props: { name: "member()", view: "port" } } as never);
    await cardFace(cornerId);
    app.editor.selectNone();
    app.editor.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "select-all selected something" });
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);

    // From a member, stock select-all selects every SIBLING — the card is one
    // of them. It comes out as the region, never the card.
    app.editor.select(member);
    app.editor.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await settle();
    expect(app.editor.getSelectedShapeIds()).not.toContain(cornerId);
    expect(app.editor.getSelectedShapeIds()).toContain(id);
  });

  it("keyboard navigation — Tab from a member and Ctrl+Shift+↓ from the region — never selects the card", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    const member = createShapeId();
    app.editor.createShape({ id: member, type: BLOCK_SHAPE_TYPE, parentId: id, x: 80, y: 180, props: { name: "member()", view: "port" } } as never);
    await cardFace(cornerId);
    const seen = new Set<string>();
    const stopWatching = react("regionRigid selections", () => {
      const ids = app!.editor.getSelectedShapeIds();
      if (ids.length === 1) seen.add(ids[0]);
    });
    try {
      // Tab walks the member's siblings in reading order; the card is the
      // first of them, so a Tab or two lands on it.
      app.editor.select(member);
      app.editor.focus();
      for (let press = 0; press < 3; press++) {
        await userEvent.keyboard("{Tab}");
        await settle(80);
        expect(app.editor.getSelectedShapeIds()).not.toEqual([cornerId]);
      }
      // Ctrl+Shift+↓ is stock "select first child" — the card is the first.
      app.editor.select(id);
      app.editor.focus();
      await userEvent.keyboard("{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}");
      await settle(80);
      expect(app.editor.getSelectedShapeIds()).not.toEqual([cornerId]);
    } finally {
      stopWatching();
    }
    expect(seen.has(cornerId), "the card was never the sole selection").toBe(false);
  });

  it("the selection pill never offers Simple/Ports/Expanded for the card — not while the card is being renamed, and not for the region", async () => {
    app = await mountApp();
    const { id, cornerId } = placeRegion("for", 300, 200);
    await cardFace(cornerId);
    // The one window the card IS selected alone: its own rename session.
    const title = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="ss-block-title"][data-editing="false"]`), { what: "the card's title" });
    await userEvent.dblClick(title);
    await waitFor(() => (app!.editor.getEditingShapeId() === cornerId ? true : null), { what: "the card's editing session" });
    expect(app.editor.getSelectedShapeIds()).toEqual([cornerId]);
    await waitFor(() => app!.root.querySelector('[data-slot="floating-toolbar"][data-visible="true"]'), { what: "the pill over the card" });
    await settle(300);
    expect(app.root.querySelector('[data-testid="ss-selection-view"]'), "no view toggle while the card is renamed").toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => (app!.editor.getEditingShapeId() === null ? true : null), { what: "the session ended" });

    app.editor.select(id);
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === id ? true : null), { what: "the region selected" });
    await waitFor(() => app!.root.querySelector('[data-slot="floating-toolbar"][data-visible="true"]'), { what: "the pill over the region" });
    await settle(300);
    expect(app.root.querySelector('[data-testid="ss-selection-view"]'), "no view toggle for the region").toBeNull();
  });

  it("the view setter every 1/2/3 hotkey and pill click goes through refuses the card", async () => {
    app = await mountApp();
    const { cornerId } = placeRegion("for", 300, 200);
    await cardFace(cornerId);
    const before = (shape<BlockLike>(cornerId) as unknown as { props: { view: string } }).props.view;
    setBlockView(app.editor, cornerId, "expanded");
    expect((shape<BlockLike>(cornerId) as unknown as { props: { view: string } }).props.view).toBe(before);
    expect(before).not.toBe("expanded");
  });
});

describe("NO OVERLAP — the rows start below the card", () => {
  it("Branch (placed with the tool): the first arm's header row starts at or below the card's bottom edge, and the card is flush with the frame", async () => {
    app = await mountApp();
    const region = await placeWithTool(/branch/i, BRANCH_TOOL_ID);
    const cornerId = region.props.cornerBlockId as TLShapeId;
    const card = await cardFace(cornerId);
    const frame = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${region.id}"] [data-slot="region"]`), { what: "the region face" });
    const header = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${region.id}"] [data-slot="region-arm"][data-arm-id="if"] [data-slot="region-arm-header"]`), { what: "the if arm header" });
    await settle(300);
    const c = card.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    expect(Math.abs(c.left - f.left), "card flush with the frame's left edge").toBeLessThanOrEqual(1);
    expect(Math.abs(c.top - f.top), "card flush with the frame's top edge").toBeLessThanOrEqual(1);
    expect(h.top, "the if row starts at or below the card's bottom").toBeGreaterThanOrEqual(c.bottom - 0.5);
    expectPinned(region.id, "a tool-placed Branch");
  });

  it("Loop (placed with the tool): the body starts at or below the card's bottom edge, and the card is flush with the frame", async () => {
    app = await mountApp();
    const region = await placeWithTool(/loop/i, LOOP_TOOL_ID);
    const cornerId = region.props.cornerBlockId as TLShapeId;
    const card = await cardFace(cornerId);
    const frame = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${region.id}"] [data-slot="region"]`), { what: "the region face" });
    const body = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${region.id}"] [data-slot="region-body"]`), { what: "the loop body" });
    await settle(300);
    const c = card.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    expect(Math.abs(c.left - f.left), "card flush with the frame's left edge").toBeLessThanOrEqual(1);
    expect(Math.abs(c.top - f.top), "card flush with the frame's top edge").toBeLessThanOrEqual(1);
    expect(b.top, "the body starts at or below the card's bottom").toBeGreaterThanOrEqual(c.bottom - 0.5);
    expectPinned(region.id, "a tool-placed Loop");
  });
});
