/**
 * src/detach/definitions/block.ts — the `"block"` scene-node kind: how a
 * `BlockPort` (`../../components/blockPort.tsx`) reduces itself.
 *
 * Composes `./port.ts`'s primitive PER PORT rather than drawing its own
 * dots — the hierarchical rule Zach asked for ("higher order primitives
 * don't rewrite their own detach; it propagates down through the tree"),
 * concretely: this is the donor's own device (`blockPrimitives.ts`'s header,
 * "The ports are NOT drawn here... the same reduction the standalone
 * `bbox-port` kind uses"), just measured off the DOM instead of computed
 * from a pure layout function — see `../stockShapes.ts`'s header for why.
 *
 * Card + header text only, for THIS pass — `BlockMembers`
 * (`../../components/blockMembers.tsx`, a nested block rendered INSIDE its
 * parent's own DOM, not a separate tldraw shape) is explicitly not lowered
 * here. Zach's own acceptance bar ("getting Port, Block and one composite
 * genuinely pixel-accurate is worth far more than eleven components at
 * roughly right") is why this scope line is drawn where it is — see the
 * report's own "outstanding" table.
 */
import type { Editor, TLShape, TLShapeId, TLShapePartial } from "tldraw";

import type { HostNodeData } from "../../hosts/hostScene";
import { BLOCK_SIDES, type BlockSide } from "../../components/port.layout";
import { DETACH_FORMAT_VERSION } from "../detachModel";
import type { DetachableKind, SceneReader } from "../detachableKind";
import { containerFor } from "../editorContainer";
import { lowerToGroup } from "../lowerShared";
import { boxRelativeTo, geoAtBox, renderedLineMeasureFor, textAtDom, textBoxRelativeTo } from "../stockShapes";
import { emitPortPrimitives } from "./port";

function isBboxNodeShape(shape: TLShape): boolean {
  return shape.type === "bbox-node";
}

function nodeFor(shape: TLShape, reader: SceneReader) {
  const nodeId = (shape.props as { nodeId?: string }).nodeId;
  if (typeof nodeId !== "string") return undefined;
  return reader.scene.nodes.find((candidate) => candidate.id === nodeId);
}

/** Every port id on the node, in the order `HostNodeData.ports` lists them —
 *  the same order `BlockNodeView` (`../../hosts/nodeViews.tsx`) hands to
 *  each wall's `BlockEdgeSpec.items`. */
function allPortIds(data: HostNodeData): { side: BlockSide; portId: string }[] {
  const out: { side: BlockSide; portId: string }[] = [];
  for (const side of BLOCK_SIDES) {
    for (const portId of data.ports?.[side] ?? []) out.push({ side, portId });
  }
  return out;
}

export const blockDetachableKind: DetachableKind = {
  kind: "block",
  nodePhase: "leaf",
  matches(shape, reader) {
    if (!isBboxNodeShape(shape)) return false;
    const node = nodeFor(shape, reader);
    // `SceneNodeView`'s own default (`../../hosts/nodeViews.tsx`'s switch):
    // an absent/unrecognised type renders as a Block, so this kind matches
    // the same way.
    return node !== undefined && (node.type === "block" || node.type === undefined);
  },
  lowerNode(editor, shape, reader) {
    const node = nodeFor(shape, reader);
    if (!node) return null;
    // The wrapper this shape's component rendered — `data-scene-node`,
    // stamped by `BboxNodeShapeComponent` (`../../hosts/tldrawHost.tsx`).
    // Scoped to THIS EDITOR's own registered container (`../editorContainer.ts`),
    // never `document` globally: `shapeIdForNode` mints a DETERMINISTIC id
    // per scene-node id, so a gallery mounting several hosts at once can
    // legitimately have the SAME `data-shape-id`/`data-scene-node` pair on
    // screen more than once — one per host that happens to reuse a node id.
    // A `document`-wide query silently grabbed whichever host's element
    // came first in DOM order (measured 2026-09-18 — see that file's
    // header); scoping to the registered container is the actual fix.
    const scope = containerFor(editor) ?? document;
    const shapeEl = scope.querySelector<HTMLElement>(`[data-shape-id="${shape.id}"]`);
    const wrapper = shapeEl?.querySelector<HTMLElement>(`[data-scene-node="${node.id}"]`);
    if (!wrapper) return null;

    const cardEl = wrapper.querySelector<HTMLElement>('[data-slot="block"]');
    if (!cardEl) return null;

    const measureRendered = renderedLineMeasureFor(editor);
    const shapes: TLShapePartial[] = [];
    // Card first — the anchor primitive, exactly as the donor orders it
    // (`blockPrimitives.ts:90-96`, "Card first — it is the anchor that
    // stands where the Block stood").
    const cardBox = boxRelativeTo(wrapper, cardEl, editor);
    const card = geoAtBox(cardBox, { geo: "rectangle", color: "black", fill: "semi" });
    shapes.push(card);

    const headerEl = cardEl.querySelector<HTMLElement>('[data-slot="block-header"]');
    if (headerEl && headerEl.textContent && headerEl.textContent.trim() !== "") {
      const headerTextBox = textBoxRelativeTo(wrapper, headerEl, editor);
      const fontPx = Math.round(parseFloat(window.getComputedStyle(headerEl).fontSize) || 14);
      shapes.push(
        textAtDom({
          text: headerEl.textContent.trim(),
          px: fontPx,
          box: headerTextBox,
          color: "black",
          measureRendered,
        }),
      );
    }

    const portRows: { portId: string; shapeIds: TLShapeId[] }[] = [];
    for (const { portId } of allPortIds(node.data)) {
      // `[data-slot="block-port-item"]` — `BlockPort`'s own render for both
      // its labelled and collapsed (simple-view bare dot) branches
      // (`../../components/blockPort.tsx`'s `renderItem`). The collapsed
      // branch has no label at all, so `labelEl` legitimately stays null.
      const memberEl = wrapper.querySelector<HTMLElement>(`[data-slot="block-port-item"][data-port-id="${portId}"]`);
      const dotEl = memberEl?.querySelector<HTMLElement>('[data-slot="port-dot"]');
      if (!memberEl || !dotEl) continue;
      const labelEl = memberEl.querySelector<HTMLElement>('[data-slot="port-label-display"]');
      const built = emitPortPrimitives(editor, wrapper, dotEl, labelEl);
      shapes.push(...built.shapes);
      portRows.push({ portId, shapeIds: built.shapes.map((partial) => partial.id as TLShapeId) });
    }

    // Every box measured above (`boxRelativeTo`/`textBoxRelativeTo`) is
    // relative to `wrapper` — i.e. it starts near (0, 0), the WRAPPER's own
    // top-left. But `lowerToGroup` creates these primitives with
    // `parentId: shape.parentId` (the original `bbox-node`'s OWN parent,
    // e.g. the page) — a SIBLING replacement, not a child nested inside the
    // original shape's transform — so a wrapper-relative box has to be
    // shifted into that parent's frame by the original shape's own (x, y)
    // before it means anything there. Measured 2026-09-18: omitting this
    // shift put every detached primitive exactly (shape.x, shape.y) off
    // from the live component it replaced — donor precedent for the fix:
    // `blockPrimitives.ts`'s own `origin = {x: shape.x, y: shape.y}`
    // parameter, added to every box the same way.
    const inParentFrame = shapes.map((partial) => ({
      ...partial,
      x: (partial.x ?? 0) + shape.x,
      y: (partial.y ?? 0) + shape.y,
    }));

    return lowerToGroup(editor, {
      shape,
      shapes: inParentFrame,
      anchorKind: "bbox-node-anchor",
      nestedRows: portRows,
      record: {
        kind: "scene-node",
        version: DETACH_FORMAT_VERSION,
        nodeType: node.type ?? "block",
        nodeId: node.id,
        parentId: node.parentId,
        data: node.data,
      },
    });
  },
};
