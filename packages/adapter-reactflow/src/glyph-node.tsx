import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  NodeResizer,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";

import { glyphFootprint, type GlyphSize } from "@bbox-ui/core";
import { GlyphPicker } from "@bbox-ui/glyph-picker";

/**
 * packages/adapter-reactflow/src/glyph-node.tsx — the `bboxGlyph` React Flow
 * node (docs/GLYPH-PLAN.md phase 4). Mirrors `block-node.tsx`'s shape: a
 * typed `Node<Data, "type">`, a plain function component, `NodeResizer` for
 * the stock resize handle. Only rotation is genuinely new here — React Flow
 * has no rotate handle (stock-part table: "none stock … → inspector row +
 * CSS `rotate` on the node"), so `rotation` is painted, never dragged, by
 * this package.
 */

/** Rotation is degrees, a HOST FACT (D2) — never a `Glyph` prop, so it lives
 *  only on the node's own data, exactly like `x`/`y` do one level up in the
 *  scene. `null`, not `undefined`, means "no size override": Node data is
 *  read back off a serialized document, and `undefined` does not survive a
 *  JSON round trip the way an explicit `null` does — `glyphFootprint` (core)
 *  itself distinguishes "no override" from the real override `size: 0` via
 *  `!== undefined`, so this node normalizes `null -> undefined` at the one
 *  seam that calls it (`glyphNodeFootprint`) rather than push that
 *  normalization onto every caller of this data shape. */
export type BBoxGlyphNodeData = {
  content: string;
  sizePreset: GlyphSize;
  size?: number | null;
  padding: number;
  rotation?: number;
};

export type BBoxGlyphNodeType = Node<BBoxGlyphNodeData, "bboxGlyph">;

/**
 * The square footprint (`size + 2*padding`, D1's ladder) this node paints
 * at, independent of any render — the page and the resize-clamp below both
 * need this without mounting the component.
 */
export function glyphNodeFootprint(data: BBoxGlyphNodeData): { w: number; h: number } {
  const { w, h } = glyphFootprint({
    sizePreset: data.sizePreset,
    size: data.size ?? undefined,
    padding: data.padding,
  });
  return { w, h };
}

/**
 * The inverse direction: a dragged `NodeResizer` handle reports a wrapper
 * width/height, and the glyph must stay square (`keepAspectRatio`) at a
 * `size` an inspector row can display and a preset-clear can restore. Takes
 * the SMALLER side (the resizer can report width !== height for a frame or
 * two mid-drag even with `keepAspectRatio`) minus this glyph's own padding,
 * clamped to the same 8-512px domain the `size` field itself declares
 * (`glyph.fields.ts`'s `min`/`max`) — the resizer's own `minWidth`/
 * `maxWidth` below keep the handle from reaching past this floor/ceiling in
 * the first place, but a value computed here is also what a *controlled*
 * host's `onNodesChange` persists, so the clamp has to live here too.
 */
export function glyphSizeFromNodeSize(
  data: BBoxGlyphNodeData,
  width: number,
  height: number,
): number {
  const side = Math.min(width, height) - 2 * data.padding;
  return Math.min(512, Math.max(8, side));
}

/**
 * The page's `onNodesChange` sees every dimension change React Flow reports
 * — a drag-resize through `NodeResizer`, but ALSO a plain DOM remeasure at
 * mount (a `"dimensions"` change with no `resizing` key at all,
 * `@xyflow/system`'s `NodeChange` union) — and only the former is a `size`
 * override the page should persist. `NodeResizer` stamps `resizing: true`
 * on every drag tick and `resizing: false` on the one that ends the
 * gesture; requiring exactly `false` mirrors `BBoxGlyphNode`'s own
 * `onResizeEnd` write below (one override per completed resize, not one
 * per animation frame) and — critically — rejects the mount-time remeasure
 * outright, since that change carries no `resizing` key at all
 * (`undefined !== false`). Get this wrong and every node picks up a fake
 * `size` override the instant it mounts, which pins it off its preset and
 * makes the preset control a one-way trip.
 */
export function sizeChangeFromDimensions(
  change: NodeChange,
  data: BBoxGlyphNodeData,
): number | null {
  if (change.type !== "dimensions" || !change.dimensions || change.resizing !== false) {
    return null;
  }
  return glyphSizeFromNodeSize(data, change.dimensions.width, change.dimensions.height);
}

/**
 * WHY a context and not a prop on `BBoxGlyphNode`: React Flow instantiates
 * node components itself (`nodeTypes`), so the page can never pass a
 * per-node callback prop the way it would to an ordinary child — this is
 * the same "reach the page from inside a host-owned component" problem
 * `block-node.tsx`'s Handles solve by writing straight to core state
 * instead. A glyph's content edit is richer than a state write (it is a
 * whole picker interaction), so the page still wants to hear about it, and
 * a context is the stock way React ships a callback across a boundary
 * neither side owns. The no-op default keeps an uncontrolled host (the
 * scratch demo below, a bare Storybook mount) working with zero setup —
 * `updateNodeData` already makes the node visually correct on its own.
 */
export interface GlyphNodeContextValue {
  onContentChange(id: string, next: string): void;
}

export const GlyphNodeContext = createContext<GlyphNodeContextValue>({
  onContentChange: () => {},
});

export function GlyphNodeProvider({
  value,
  children,
}: {
  value: GlyphNodeContextValue;
  children?: ReactNode;
}) {
  return <GlyphNodeContext.Provider value={value}>{children}</GlyphNodeContext.Provider>;
}

export function useGlyphNodeContext(): GlyphNodeContextValue {
  return useContext(GlyphNodeContext);
}

export function BBoxGlyphNode({ id, data, selected }: NodeProps<BBoxGlyphNodeType>) {
  const { updateNodeData, updateNode } = useReactFlow();
  const { onContentChange } = useGlyphNodeContext();
  const { w, h } = glyphNodeFootprint(data);
  const rotation = data.rotation ?? 0;

  // WHY an effect, not only `onResizeEnd` below: React Flow's own node box
  // (`node.width`/`node.height`) is a SEPARATE field from the footprint
  // painted at `data-slot="rf-glyph"` — it only ever changes when
  // something writes it directly, and a resize handle is not the only way
  // the footprint changes (clearing the `size` override, switching
  // `sizePreset`, editing `padding` all do too, every one of them an
  // inspector edit phase 5 adds). Leaving the box to the resizer alone is
  // exactly the bug this exists to fix: once one drag sets it, it pins
  // there forever and the selection box lies about the glyph again —
  // docs/GLYPH-PLAN.md:14's "the selection box lies about a 44px glyph",
  // now for a stale box instead of a missing one. Same rule
  // `block-node.tsx:107-115` already follows for its own explicit-size
  // contract, generalized from "only on a resize tick" to "whenever the
  // footprint itself changes".
  useEffect(() => {
    updateNode(id, { width: w, height: h });
  }, [id, w, h, updateNode]);

  const handleContentChange = (next: string) => {
    // WHY both: `onContentChange` is how a controlled host (one that keeps
    // its own node array in state) learns about the pick at all; writing
    // through `updateNodeData` too is what makes an UNCONTROLLED host (this
    // node's own `.scratch-host`, `demos/reactflow`) show the new content
    // without the page doing anything — same "both or the uncontrolled case
    // silently does nothing" rule `block-node.tsx`'s resize write already
    // follows for `w`/`h`.
    updateNodeData(id, { content: next });
    onContentChange(id, next);
  };

  return (
    <>
      {/* D5: single click opens the picker, drag moves. No "nodrag" class —
          d3-drag (React Flow's own drag engine) already suppresses `click`
          after a real drag, and `nodeDragThreshold` is 1px, so a plain
          `onClick` on the trigger is the correct, minimal answer; adding
          "nodrag" would instead stop the node from moving at all, which is
          the opposite of D5. Proven in
          .scratch-host/drive.mjs (untracked; the brief's scratch host),
          not asserted from documentation. */}
      <NodeResizer
        keepAspectRatio
        minWidth={8 + 2 * data.padding}
        minHeight={8 + 2 * data.padding}
        maxWidth={512 + 2 * data.padding}
        maxHeight={512 + 2 * data.padding}
        isVisible={selected ?? false}
        onResizeEnd={(_event, params) => {
          updateNodeData(id, { size: glyphSizeFromNodeSize(data, params.width, params.height) });
        }}
      />
      <div
        data-slot="rf-glyph"
        style={{
          width: w,
          height: h,
          transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: "center",
        }}
      >
        <GlyphPicker
          value={data.content}
          sizePreset={data.sizePreset}
          size={data.size ?? undefined}
          padding={data.padding}
          onChange={handleContentChange}
        />
      </div>
    </>
  );
}
