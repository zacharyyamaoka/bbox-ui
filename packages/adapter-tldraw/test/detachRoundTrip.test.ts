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
  receivedPorts,
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
  receivedPorts.set({});
});

afterEach(() => {
  editor.dispose();
  receivedPorts.set({});
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
      makePortProps({ state: "default", label: "" }),
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
});

describe("detach → rebuild: runtime received flag", () => {
  it("stays lit across the round trip and never reaches persisted state", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-block", x: 160, y: 140, props: makeBlockProps() });
    setPortReceived(id, "p1", true);

    runDetachSweep(editor, [id], DETACHABLE_KINDS);
    const carrier = editor
      .getCurrentPageShapes()
      .find((shape) => (shape.meta as any)?.[BBOX_UI_META_KEY]?.props)!;
    // The flag followed the identity onto the carrier, in memory only.
    expect(receivedPorts.get()[`${carrier.id}:p1`]).toBe(true);
    expect(receivedPorts.get()[`${id}:p1`]).toBeUndefined();
    // Nothing about `received` is in the persisted record or any primitive.
    expect(JSON.stringify(editor.getCurrentPageShapes())).not.toContain("received");

    const { createdIds } = rebuildDetachedShapes(editor);
    expect(createdIds).toHaveLength(1);
    const rebuilt = editor.getShape(createdIds[0])!;
    // Still lit at runtime under the minted id…
    expect(receivedPorts.get()[`${rebuilt.id}:p1`]).toBe(true);
    expect(receivedPorts.get()[`${carrier.id}:p1`]).toBeUndefined();
    // …and still absent from persisted props.
    expect((rebuilt.props as BBoxBlockShapeProps).ports[0].state).toBe("wired");
    expect(JSON.stringify(rebuilt.props)).not.toContain("received");
  });
});
