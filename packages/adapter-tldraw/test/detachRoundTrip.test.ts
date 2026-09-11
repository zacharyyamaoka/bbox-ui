/**
 * The detach → rebuild acceptance matrix, run through a real headless
 * `Editor` (see headlessEditor.ts): every combination lowers to stock
 * primitives and rebuilds to a shape whose props deep-equal the original.
 *
 * This is the fixture net the escaped defects called for: port text layouts
 * × sides, offset layouts, unicode, empty optional fields, truncating
 * titles, non-default sizes, resized and rotated shapes, and the runtime
 * `received` flag surviving the id changes without ever being persisted.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createShapeId } from "tldraw";
import type { Editor, TLShapeId } from "tldraw";

import { PORT_TEXT_LAYOUTS, type BlockSide, type PortTextLayout } from "@bbox-ui/core";

import {
  BBOX_UI_META_KEY,
  DETACHABLE_KINDS,
  rebuildDetachedShapes,
  runDetachSweep,
} from "../src/index";
import {
  receivedPortsAtom,
  registerReceivedPortCleanup,
  setPortReceived,
  type BBoxBlockShapeProps,
  type BBoxShapePort,
} from "../src/block-shape-util";
import type { BBoxPortShapeProps } from "../src/port-shape-util";
import { createHeadlessEditor } from "./headlessEditor";

const SIDES: BlockSide[] = ["left", "right", "top", "bottom"];

function makePort(overrides: Partial<BBoxShapePort> = {}): BBoxShapePort {
  return {
    id: "p1",
    direction: "input",
    state: "wired",
    size: "md",
    label: "image",
    textLayout: "right",
    side: "left",
    t: 0.35,
    ...overrides,
  };
}

function makeBlockProps(
  overrides: Partial<BBoxBlockShapeProps> = {},
): BBoxBlockShapeProps {
  return {
    w: 384,
    h: 258,
    title: "Detect",
    titleSize: "xl",
    blockType: "dataflow",
    description: "blackbox modelling",
    icon: "🔍",
    tag: "Draft 1",
    orientation: "horizontal",
    ports: [makePort()],
    ...overrides,
  };
}

function makePortProps(
  overrides: Partial<BBoxPortShapeProps> = {},
): BBoxPortShapeProps {
  return {
    w: 25,
    h: 25,
    state: "wired",
    size: "md",
    label: "tick",
    textLayout: "right",
    ...overrides,
  };
}

let editor: Editor;

beforeEach(() => {
  editor = createHeadlessEditor();
  // The same wiring every host app does on mount — the leak tests below
  // exercise it, and the round-trip tests prove it never races the rekey.
  // No manual receivedPorts reset here: the flags are scoped per editor,
  // and a reset would mask exactly the cross-editor leak the disposal
  // tests below assert against.
  registerReceivedPortCleanup(editor);
});

afterEach(() => {
  editor.dispose();
});

/** Create → detach → rebuild; returns the rebuilt shape. */
function roundTrip(
  type: "bbox-block" | "bbox-port",
  props: BBoxBlockShapeProps | BBoxPortShapeProps,
  options: { rotateBy?: number } = {},
) {
  const id = createShapeId();
  editor.createShape({ id, type, x: 160, y: 140, props });
  if (options.rotateBy) editor.rotateShapesBy([id], options.rotateBy);
  const original = editor.getShape(id)!;

  runDetachSweep(editor, [id], DETACHABLE_KINDS);
  expect(editor.getShape(id)).toBeUndefined();
  const remaining = editor.getCurrentPageShapes();
  expect(remaining.some((shape) => shape.type.startsWith("bbox-"))).toBe(false);
  // The carrier keeps the untruncated, unabridged props in meta.
  const carrier = remaining.find(
    (shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.props !== undefined,
  )!;
  expect(carrier).toBeDefined();
  expect((carrier.meta as any)[BBOX_UI_META_KEY].props).toEqual(original.props);

  const { createdIds } = rebuildDetachedShapes(editor);
  expect(createdIds).toHaveLength(1);
  const rebuilt = editor.getShape(createdIds[0])!;
  expect(rebuilt.type).toBe(type);
  return { original, rebuilt, carrierId: carrier.id as TLShapeId };
}

function expectSamePose(
  original: { x: number; y: number; rotation: number },
  rebuilt: { x: number; y: number; rotation: number },
) {
  expect(rebuilt.x).toBeCloseTo(original.x, 6);
  expect(rebuilt.y).toBeCloseTo(original.y, 6);
  expect(rebuilt.rotation).toBeCloseTo(original.rotation, 6);
}

describe("detach → rebuild: block port matrix", () => {
  for (const side of SIDES) {
    for (const textLayout of PORT_TEXT_LAYOUTS) {
      it(`round-trips a block port on ${side} with textLayout ${textLayout}`, () => {
        const props = makeBlockProps({
          ports: [makePort({ side, textLayout, t: 0.5 })],
        });
        const { original, rebuilt } = roundTrip("bbox-block", props);
        expect(rebuilt.props).toEqual(original.props);
        expectSamePose(original, rebuilt);
      });
    }
  }
});

describe("detach → rebuild: standalone port matrix", () => {
  for (const textLayout of PORT_TEXT_LAYOUTS) {
    it(`round-trips a standalone port with textLayout ${textLayout}`, () => {
      const { original, rebuilt } = roundTrip(
        "bbox-port",
        makePortProps({ textLayout }),
      );
      expect(rebuilt.props).toEqual(original.props);
      expectSamePose(original, rebuilt);
    });
  }
});

describe("detach → rebuild: content edge cases", () => {
  it("round-trips unicode and emoji in title, tag, description and labels", () => {
    const props = makeBlockProps({
      title: "Дете́ктор 🚀 → ψ",
      tag: "试验 β",
      description: "détection ✓ — ประมวลผล",
      blockType: "データフロー",
      icon: "🧿",
      ports: [makePort({ label: "入力🎯" })],
    });
    const { original, rebuilt } = roundTrip("bbox-block", props);
    expect(rebuilt.props).toEqual(original.props);
  });

  it("round-trips a block with every optional field empty", () => {
    const props = makeBlockProps({
      icon: "",
      tag: "",
      description: "",
      blockType: "",
      ports: [makePort({ label: "" })],
    });
    const { original, rebuilt } = roundTrip("bbox-block", props);
    expect(rebuilt.props).toEqual(original.props);
  });

  it("round-trips a block with no ports at all", () => {
    const props = makeBlockProps({ ports: [] });
    const { original, rebuilt } = roundTrip("bbox-block", props);
    expect(rebuilt.props).toEqual(original.props);
  });

  it("round-trips an unlabeled standalone port (single-primitive fallback)", () => {
    const { original, rebuilt } = roundTrip(
      "bbox-port",
      makePortProps({ state: "valueSet", label: "" }),
    );
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("a long truncating title with a chip keeps the full string in props", () => {
    const props = makeBlockProps({ title: "W".repeat(40), tag: "Draft 1" });
    const { original, rebuilt } = roundTrip("bbox-block", props);
    expect(rebuilt.props).toEqual(original.props);
    expect((rebuilt.props as BBoxBlockShapeProps).title).toBe("W".repeat(40));
  });

  it("round-trips a non-default titleSize", () => {
    const props = makeBlockProps({ titleSize: "md" });
    const { original, rebuilt } = roundTrip("bbox-block", props);
    expect(rebuilt.props).toEqual(original.props);
  });

  it("round-trips a resized block", () => {
    const props = makeBlockProps({ w: 520, h: 340 });
    const { original, rebuilt } = roundTrip("bbox-block", props);
    expect(rebuilt.props).toEqual(original.props);
    expect((rebuilt.props as BBoxBlockShapeProps).w).toBe(520);
    expect((rebuilt.props as BBoxBlockShapeProps).h).toBe(340);
  });
});

describe("detach → rebuild: rotation", () => {
  it("a rotated block detaches to rotated primitives and rebuilds rotated", () => {
    const { original, rebuilt } = roundTrip("bbox-block", makeBlockProps(), {
      rotateBy: Math.PI / 4,
    });
    expect(original.rotation).toBeCloseTo(Math.PI / 4, 6);
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("the lowered primitives themselves carry the rotation", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    editor.rotateShapesBy([id], Math.PI / 4);
    runDetachSweep(editor, [id], DETACHABLE_KINDS);
    // Every leaf primitive's page rotation matches the original's.
    const leaves = editor
      .getCurrentPageShapes()
      .flatMap(function collect(shape): { id: TLShapeId }[] {
        const childIds = editor.getSortedChildIdsForParent(shape.id);
        if (childIds.length === 0) return [{ id: shape.id }];
        return childIds
          .map((childId) => editor.getShape(childId)!)
          .flatMap(collect);
      });
    expect(leaves.length).toBeGreaterThan(3);
    for (const leaf of leaves) {
      const pageRotation = editor.getShapePageTransform(leaf.id).rotation();
      expect(pageRotation).toBeCloseTo(Math.PI / 4, 6);
    }
  });

  it("a rotated standalone port rebuilds rotated", () => {
    const { original, rebuilt } = roundTrip("bbox-port", makePortProps(), {
      rotateBy: -Math.PI / 6,
    });
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  /** Angle equality on the circle: a − b ≡ 0 (mod 2π). */
  function expectSameAngle(actual: number, expected: number) {
    const TAU = Math.PI * 2;
    const difference = ((actual - expected) % TAU + TAU + Math.PI) % TAU - Math.PI;
    expect(difference).toBeCloseTo(0, 6);
  }

  it("rotations beyond 2π (and large negative ones) survive the round trip", () => {
    for (const angle of [Math.PI * 2 + Math.PI / 3, -Math.PI * 2.5]) {
      const id = createShapeId();
      editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
      editor.rotateShapesBy([id], angle);
      const original = editor.getShape(id)!;
      const originalPage = editor.getShapePageTransform(id);
      const originalPoint = originalPage.applyToPoint({ x: 0, y: 0 });

      runDetachSweep(editor, [id], DETACHABLE_KINDS);
      const { createdIds } = rebuildDetachedShapes(editor);
      expect(createdIds).toHaveLength(1);
      const rebuilt = editor.getShape(createdIds[0])!;
      expect(rebuilt.props).toEqual(original.props);
      const rebuiltPage = editor.getShapePageTransform(rebuilt.id);
      const rebuiltPoint = rebuiltPage.applyToPoint({ x: 0, y: 0 });
      expect(rebuiltPoint.x).toBeCloseTo(originalPoint.x, 6);
      expect(rebuiltPoint.y).toBeCloseTo(originalPoint.y, 6);
      // The stored number may normalize onto (−π, π]; the page POSE is what
      // must match, so compare on the circle, not the raw prop.
      expectSameAngle(rebuiltPage.rotation(), originalPage.rotation());
      editor.deleteShape(rebuilt.id);
    }
  });

  it("a block nested inside a rotated parent group keeps its page pose through the round trip", () => {
    const blockId = createShapeId();
    const buddyId = createShapeId();
    editor.createShape({ id: blockId, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    editor.createShape({ id: buddyId, type: "geo", x: 700, y: 600, props: { w: 50, h: 50 } });
    const parentGroupId = createShapeId();
    editor.groupShapes([blockId, buddyId], { groupId: parentGroupId });
    editor.rotateShapesBy([parentGroupId], Math.PI / 5);

    const originalProps = editor.getShape(blockId)!.props;
    const originalPage = editor.getShapePageTransform(blockId);
    const originalPoint = originalPage.applyToPoint({ x: 0, y: 0 });
    const originalRotation = originalPage.rotation();

    runDetachSweep(editor, [blockId], DETACHABLE_KINDS);
    expect(editor.getShape(blockId)).toBeUndefined();
    // Every leaf primitive's PAGE rotation composes the parent's rotation.
    const leafIds: TLShapeId[] = [];
    const collect = (id: TLShapeId) => {
      const childIds = editor.getSortedChildIdsForParent(id);
      if (childIds.length === 0) leafIds.push(id);
      for (const childId of childIds) collect(childId);
    };
    for (const shape of editor.getCurrentPageShapes()) collect(shape.id);
    const primitiveLeafIds = leafIds.filter((id) => id !== buddyId);
    expect(primitiveLeafIds.length).toBeGreaterThan(3);
    for (const leafId of primitiveLeafIds) {
      expectSameAngle(editor.getShapePageTransform(leafId).rotation(), originalRotation);
    }

    const { createdIds } = rebuildDetachedShapes(editor);
    expect(createdIds).toHaveLength(1);
    const rebuilt = editor.getShape(createdIds[0])!;
    expect(rebuilt.props).toEqual(originalProps);
    const rebuiltPage = editor.getShapePageTransform(rebuilt.id);
    const rebuiltPoint = rebuiltPage.applyToPoint({ x: 0, y: 0 });
    expect(rebuiltPoint.x).toBeCloseTo(originalPoint.x, 6);
    expect(rebuiltPoint.y).toBeCloseTo(originalPoint.y, 6);
    expectSameAngle(rebuiltPage.rotation(), originalRotation);
  });

  it("rotating the detached group before rebuilding lands the shape at the rotated pose", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    const originalProps = editor.getShape(id)!.props;
    runDetachSweep(editor, [id], DETACHABLE_KINDS);
    const carrier = editor
      .getCurrentPageShapes()
      .find((shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.props)!;
    editor.rotateShapesBy([carrier.id], Math.PI / 3);

    // The anchor card's pose after the user's rotation is where the rebuilt
    // block must stand.
    const anchor = editor
      .getCurrentPageShapes()
      .flatMap((shape) => [shape, ...editor.getSortedChildIdsForParent(shape.id).map((childId) => editor.getShape(childId)!)])
      .find((shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.kind === "block-card")!;
    const anchorPage = editor.getShapePageTransform(anchor.id);
    const anchorPoint = anchorPage.applyToPoint({ x: 0, y: 0 });
    const anchorRotation = anchorPage.rotation();
    expectSameAngle(anchorRotation, Math.PI / 3);

    editor.setSelectedShapes([carrier.id]);
    const { createdIds } = rebuildDetachedShapes(editor);
    expect(createdIds).toHaveLength(1);
    const rebuilt = editor.getShape(createdIds[0])!;
    expect(rebuilt.props).toEqual(originalProps);
    const rebuiltPage = editor.getShapePageTransform(rebuilt.id);
    const rebuiltPoint = rebuiltPage.applyToPoint({ x: 0, y: 0 });
    expect(rebuiltPoint.x).toBeCloseTo(anchorPoint.x, 6);
    expect(rebuiltPoint.y).toBeCloseTo(anchorPoint.y, 6);
    expectSameAngle(rebuiltPage.rotation(), anchorRotation);
  });
});

describe("detach → rebuild: runtime received flag", () => {
  it("stays lit across the round trip and never reaches persisted state", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    setPortReceived(editor, id, "p1", true);

    runDetachSweep(editor, [id], DETACHABLE_KINDS);
    const carrier = editor
      .getCurrentPageShapes()
      .find((shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.props)!;
    // The flag followed the identity onto the carrier, in memory only.
    expect(receivedPortsAtom(editor).get()[carrier.id]?.p1).toBe(true);
    expect(receivedPortsAtom(editor).get()[id]).toBeUndefined();
    // Nothing about `received` is in the persisted record or any primitive.
    expect(JSON.stringify(editor.getCurrentPageShapes())).not.toContain("received");

    const { createdIds } = rebuildDetachedShapes(editor);
    expect(createdIds).toHaveLength(1);
    const rebuilt = editor.getShape(createdIds[0])!;
    // Still lit at runtime under the minted id…
    expect(receivedPortsAtom(editor).get()[rebuilt.id]?.p1).toBe(true);
    expect(receivedPortsAtom(editor).get()[carrier.id]).toBeUndefined();
    // …and still absent from persisted props.
    expect((rebuilt.props as BBoxBlockShapeProps).ports[0].state).toBe("wired");
    expect(JSON.stringify(rebuilt.props)).not.toContain("received");
  });

  it("a false delivery prunes the entry instead of storing false", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    setPortReceived(editor, id, "p1", true);
    expect(receivedPortsAtom(editor).get()).toEqual({ [id]: { p1: true } });
    setPortReceived(editor, id, "p1", false);
    expect(receivedPortsAtom(editor).get()).toEqual({});
  });

  it("deleting a live block drops its flags", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    setPortReceived(editor, id, "p1", true);
    editor.deleteShape(id);
    expect(receivedPortsAtom(editor).get()).toEqual({});
  });

  it("deleting a detached carrier WITHOUT rebuilding drops the rekeyed flags", () => {
    // The escaped leak: receive → detach → delete the carrier. Nothing ever
    // rebuilt, so nothing ever rekeyed the entry away — it lived forever.
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    setPortReceived(editor, id, "p1", true);
    runDetachSweep(editor, [id], DETACHABLE_KINDS);
    const carrier = editor
      .getCurrentPageShapes()
      .find((shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.props)!;
    expect(receivedPortsAtom(editor).get()[carrier.id]?.p1).toBe(true);
    editor.deleteShape(carrier.id);
    expect(receivedPortsAtom(editor).get()).toEqual({});
  });

  it("repeated receive → detach → delete flows never grow the map", () => {
    for (let flow = 0; flow < 5; flow++) {
      const id = createShapeId();
      editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
      setPortReceived(editor, id, "p1", true);
      runDetachSweep(editor, [id], DETACHABLE_KINDS);
      const carrier = editor
        .getCurrentPageShapes()
        .find((shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.props)!;
      editor.deleteShape(carrier.id);
    }
    expect(receivedPortsAtom(editor).get()).toEqual({});
  });

  it("a disposed editor's flags never light the same ids in a later editor", () => {
    // The escaped leak: `dispose()` drops the document WITHOUT deleting its
    // shapes, so no delete handler fires — and a module-global table let a
    // NEW editor opening a different document that reuses the shape id (and
    // port id) paint a port received that never received anything. Two real
    // editors in one process, no manual reset anywhere.
    const sharedId = createShapeId("shared");
    editor.createShape({
      id: sharedId, type: "bbox-block", x: 160, y: 140, props: makeBlockProps(),
    });
    setPortReceived(editor, sharedId, "p1", true);
    expect(receivedPortsAtom(editor).get()[sharedId]?.p1).toBe(true);
    editor.dispose();

    const editorB = createHeadlessEditor();
    try {
      registerReceivedPortCleanup(editorB);
      editorB.createShape({
        id: sharedId, type: "bbox-block", x: 160, y: 140, props: makeBlockProps(),
      });
      // Same shape id, same port id, no delivery in THIS editor: dark.
      expect(receivedPortsAtom(editorB).get()).toEqual({});
      expect(receivedPortsAtom(editorB).get()[sharedId]).toBeUndefined();
      // And the disposed editor's table is gone, not lingering in memory.
      expect(receivedPortsAtom(editor).get()).toEqual({});
    } finally {
      editorB.dispose();
    }
  });

  it("shape and port ids containing ':' cannot collide on one flag", () => {
    // `${shapeId}:${portId}` was ambiguous: "shape:a" + "b:c" and
    // "shape:a:b" + "c" both flattened to "shape:a:b:c" — receiving on one
    // lit the other, clearing one cleared both. The nested table keeps them
    // distinct.
    setPortReceived(editor, "shape:a", "b:c", true);
    expect(receivedPortsAtom(editor).get()["shape:a:b"]).toBeUndefined();
    setPortReceived(editor, "shape:a:b", "c", true);
    setPortReceived(editor, "shape:a", "b:c", false);
    expect(receivedPortsAtom(editor).get()["shape:a:b"]).toEqual({ c: true });
    expect(receivedPortsAtom(editor).get()["shape:a"]).toBeUndefined();
  });
});
