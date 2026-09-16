"use client";

import "tldraw/tldraw.css";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  Tldraw,
  createShapeId,
  resizeBox,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
  type TLShapeId,
} from "tldraw";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import { claimInstancePointerDown, effectiveProps, isInstancePointerDownClaimed, nextSelectionForRootPress } from "@bbox-ui/panel";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import { glyphFootprint, textBoxFontPx, type GlyphSize, type PortEdgeId } from "@bbox-ui/core";
import { BBoxGlyphShapeUtil, type BBoxGlyphShape, type BBoxGlyphShapeProps } from "@bbox-ui/adapter-tldraw";
import type { CanvasPosition, CanvasTransform } from "../contract";
import { centrePivotFor, normalizeDeg, tldrawOriginFor } from "../glyph-geometry";
import { renderInstance, type EditBundle } from "../render-instance";
import { HostZoomContext } from "../port-dnd";

// The same host-neutral marker `TextBoxControl` puts on its own control
// (packages/bbox-ui/src/textBox.tsx) — see the CSS rule added in
// app/global.css and the `markEventAsHandled` call below, both keyed off it.
const BBOX_INTERACTIVE_SELECTOR = "[data-bbox-interactive]";

declare global {
  interface Window {
    /** See this file's `onMount`: a test-only read of tldraw's own
     *  select-tool path, for proving a Port press never enters it. */
    __bboxEditorPath?: () => string;
    /** The same debug seam, widened to the editor itself — a CDP script has
     *  no other way to read the live zoom or a shape's x/y mid-drag. Never
     *  read by product code; deleted on unmount like its sibling above. */
    __bboxEditor?: Editor;
  }
}

/**
 * Content rides a React context, not shape props: tldraw validates and
 * persists props as JSON, so a rendered component cannot live there. The
 * shape stores only WHICH instance it is; the component method looks the
 * live one up. Same mechanism as demos/story-hosts, for the same reason.
 *
 * `edit` rides the same context as `selectedIds` for the same reason:
 * `editingId` must reach whichever shape is currently rendering, and a
 * shape has no prop channel for it (tldraw props are JSON, `EditBundle`
 * carries functions).
 *
 * `onMovePort`/`zoom` ride the same context (Zach, 2026-09-12: dnd-kit owns
 * every Port drag, tldraw included) — `onMovePort` is `renderInstance`'s
 * trailing argument, the same one `dom-preview.tsx` already threads, and
 * `zoom` is this Block's live `HostZoomContext` value so `PortDndProvider`'s
 * `DragOverlay` (rendered inside tldraw's own scaled shape layer, unlike the
 * DOM render's unscaled well) divides its drag translation back down and
 * the ghost still tracks the pointer 1:1 at any zoom.
 */
const BenchContext = createContext<{
  entries: ComponentEntry[];
  instances: Instance[];
  byId: Map<string, Instance>;
  selectedIds: string[];
  onSelectInstance: (id: string, additive: boolean) => void;
  /** Direct root-level selection — see `nextSelectionForRootPress`'s call
   *  site below (verify-round-4 F1) for why a root press can't go through
   *  `onSelectInstance`/the engine's own echo alone. */
  onSelectionChange: (ids: string[]) => void;
  edit: EditBundle;
  onMovePort?: (blockId: string, portIds: string[], edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  zoom: number;
  highlightSlots: boolean;
}>({
  entries: [],
  instances: [],
  byId: new Map(),
  selectedIds: [],
  onSelectInstance: () => {},
  onSelectionChange: () => {},
  edit: { editingId: null, editSnapshot: null, onRequestEdit: () => {}, onEditEnd: () => {}, onInstancePropChange: () => {} },
  zoom: 1,
  highlightSlots: false,
});

/**
 * `canResize`/`onResize` are plain `ShapeUtil` methods — no React context
 * reaches them. `component()` (which DOES have `BenchContext`) refreshes
 * this per-editor side table on every render, the same WeakMap-by-editor
 * trick `block-shape-util.tsx`'s `receivedPortsAtom` already uses to bridge
 * a live editor to state that isn't a shape prop.
 */
interface BenchResizeLookup {
  entries: ComponentEntry[];
  instances: Instance[];
  byId: Map<string, Instance>;
  onInstancePropChange: (id: string, fieldId: string, value: FieldValue) => void;
}
const benchResizeLookupByEditor = new WeakMap<Editor, BenchResizeLookup>();

/**
 * A bench instance is only draggable-resizable when its OWN component
 * declares a real field pair to write the drag into — "the size prop"
 * Zach's ask names. Two shapes of that pair exist today:
 *
 * - BOX: numeric `width` + `height` (Block, Region, PortEdges — block.
 *   fields.ts, region.fields.ts, this file's own PORT_EDGES_FIELDS in
 *   bench.tsx). `benchInstanceSizeFields` below. The `kind === "number"`
 *   check (not just matching `.id`) is deliberate: a hypothetical future
 *   field merely NAMED "width"/"height" that meant something else (an
 *   enum, a boolean) must not silently qualify.
 * - SCALE: a named ladder (`kind: "segments"`) with a `"custom"` rung,
 *   paired by a shared `FieldSpec.group` with a numeric escape-hatch field
 *   (TextBox's `size` + `sizePx`, both `group: "size"` — textBox.fields.
 *   ts). `benchInstanceScaleField` below. Resizing drives it the way stock
 *   tldraw's own text shape scales font size on resize — a component that
 *   is otherwise intrinsically sized gets a literal number to grow.
 *
 * Neither check names a component: a third component gains box-resize or
 * scale-resize for free the moment it declares the matching field shape.
 *
 * Everything else (Port, Pill, Glyph, Flex, Stack, Bar) stays
 * non-resizable on purpose: this shape's own `w`/`h` are a MEASUREMENT of
 * intrinsic content (the `ResizeObserver` effect below), not a setting —
 * dragging a handle would resize the box without the content following
 * and immediately snap back on the next measurement. Mirrors stock
 * tldraw's own convention (e.g. a note's fixed size vs. a rectangle's
 * free one) rather than inventing a bbox-ui-specific rule.
 */
interface BenchSizeFields {
  widthField: FieldSpec;
  heightField: FieldSpec;
}
function benchInstanceSizeFields(lookup: BenchResizeLookup, instanceId: string): BenchSizeFields | null {
  const inst = lookup.byId.get(instanceId);
  if (!inst) return null;
  const entry = lookup.entries.find((e) => e.name === inst.type);
  if (!entry) return null;
  const widthField = entry.fields.find((f) => f.id === "width" && f.kind === "number");
  const heightField = entry.fields.find((f) => f.id === "height" && f.kind === "number");
  return widthField && heightField ? { widthField, heightField } : null;
}

/** A written value clamped to a field's own declared `min`/`max` — the
 *  same bound the Inspector's number input ADVERTISES (as HTML `min`/`max`
 *  attributes) but does not itself enforce (`NumberInput.tsx` forwards
 *  them without clamping). A drag is a second way to reach the same
 *  write, so it clamps here rather than reproducing the Inspector's own
 *  gap — PortEdges declares `width: 240–720`, `height: 160–480`
 *  (bench.tsx's `PORT_EDGES_FIELDS`); Block/Region declare no `min`/`max`
 *  at all, so this is a no-op for them, same as today. */
function benchClampToField(value: number, field: FieldSpec): number {
  const min = field.min ?? -Infinity;
  const max = field.max ?? Infinity;
  return Math.min(max, Math.max(min, value));
}

/** The ladder/escape-hatch field pair for a "SCALE" instance — see
 *  `BenchResizeLookup`'s own doc comment — or `null` when its component
 *  declares no such pair. Full `FieldSpec`s, not just ids: resolving the
 *  CURRENT value (`benchCurrentScalePx` below) needs each field's own
 *  `defaultValue` too. */
interface BenchScaleFields {
  ladderField: FieldSpec;
  pxField: FieldSpec;
}
function benchInstanceScaleField(lookup: BenchResizeLookup, instanceId: string): BenchScaleFields | null {
  const inst = lookup.byId.get(instanceId);
  if (!inst) return null;
  const entry = lookup.entries.find((e) => e.name === inst.type);
  if (!entry) return null;
  const ladderField = entry.fields.find(
    (f) => f.kind === "segments" && f.group != null && f.options?.some((o) => o.value === "custom"),
  );
  if (!ladderField?.group) return null;
  const pxField = entry.fields.find((f) => f.kind === "number" && f.group === ladderField.group && f.id !== ladderField.id);
  return pxField ? { ladderField, pxField } : null;
}

/**
 * The scale factor a resize gesture applied, from the shape's own box
 * change — averaging width's and height's ratio rather than picking one
 * axis, so a corner drag (which moves both) and an edge drag (which only
 * moves one) both produce a sane single number to scale a font by.
 */
function benchResizeScaleFactor(initial: BenchShapeProps, current: BenchShapeProps): number {
  const scaleW = initial.w > 0 ? current.w / initial.w : 1;
  const scaleH = initial.h > 0 ? current.h / initial.h : 1;
  return (scaleW + scaleH) / 2;
}

/**
 * The CURRENT effective px for a scale-resizable instance's escape-hatch
 * field — not just its raw `sizePx`, which is stale/irrelevant while the
 * ladder sits on a NAMED rung (a person who set `size: "xl"` in the
 * Inspector without ever touching `sizePx` renders at 44px, but `sizePx`
 * itself still reads its own default, 24 — scaling from that stale 24
 * would jump the font on the very first drag). `effectiveProps` (@bbox-ui/panel)
 * only returns a value CASCADED from an ancestor or EXPLICITLY set on the
 * instance — a field a person has never touched is simply absent, same as
 * the real component's own JS default parameter fills it at render time —
 * so `?? field.defaultValue` below is required, not defensive filler:
 * without it, a fresh instance's `effective[ladderField.id]` is
 * `undefined`, `textBoxFontPx(undefined, …)` returns `undefined`, and the
 * eventual `Math.round(undefined * scale)` is `NaN` (measured live: it
 * rendered `<TextBox size="custom" sizePx={null} />` and the browser
 * console read "NaN is an invalid value for fontSize").
 *
 * `textBoxFontPx` is the one function that already resolves "named rung or
 * custom px" for TextBox (textBox.layout.ts) — reused here rather than
 * re-deriving its ladder. WHY a per-component resolver instead of a fully
 * generic one: the MEANING of a named rung (TextBox's `sm`/`md`/`lg`/`xl`
 * map to specific px) is that component's own knowledge, the same way
 * `renderBlock`/`renderRegion` (packages/panel/src/bench.tsx) each know
 * how to read their own props — there is exactly one component with this
 * field shape today, so this stays a single named case rather than an
 * abstraction built for a second one that doesn't exist yet.
 */
function benchCurrentScalePx(entryName: string, effective: Record<string, unknown>, fields: BenchScaleFields): number {
  const rawPx = effective[fields.pxField.id];
  const pxValue = typeof rawPx === "number" ? rawPx : ((fields.pxField.defaultValue as number | undefined) ?? 0);
  if (entryName === "TextBox") {
    const ladderValue = effective[fields.ladderField.id] ?? fields.ladderField.defaultValue;
    return textBoxFontPx(ladderValue as Parameters<typeof textBoxFontPx>[0], pxValue);
  }
  return pxValue;
}

interface BenchShapeProps {
  instanceId: string;
  w: number;
  h: number;
}
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-bench": BenchShapeProps;
  }
}
type BenchShape = TLBaseShape<"bbox-bench", BenchShapeProps>;

class BenchShapeUtil extends ShapeUtil<BenchShape> {
  static override type = "bbox-bench" as const;
  static override props = { instanceId: T.string, w: T.number, h: T.number };
  override getDefaultProps(): BenchShapeProps {
    return { instanceId: "", w: 180, h: 80 };
  }
  override getGeometry(shape: BenchShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  // Resizable when the instance behind it has EITHER a real `width`/
  // `height` pair or a ladder+px scale pair to write the drag into — see
  // `BenchResizeLookup`'s own doc comment for both shapes. No registered
  // lookup (nothing has rendered yet) fails closed, matching this
  // override's old unconditional `false`.
  override canResize(shape: BenchShape) {
    const lookup = benchResizeLookupByEditor.get(this.editor);
    if (!lookup) return false;
    return (
      benchInstanceSizeFields(lookup, shape.props.instanceId) !== null ||
      benchInstanceScaleField(lookup, shape.props.instanceId) !== null
    );
  }
  // Stock tldraw's own `resizeBox` scales `w`/`h` like any built-in
  // rectangle — LIVE, on every pointer-move tick, purely so the box tracks
  // the cursor during the drag. It does NOT touch the instance's fields;
  // see `onResizeEnd` for that.
  override onResize(shape: BenchShape, info: TLResizeInfo<BenchShape>) {
    return resizeBox(shape, info);
  }
  // The bbox-specific step — feeding the drag's result into the
  // component's OWN `width`/`height` fields (not just the shape's box), so
  // the Inspector's number fields agree with a dragged size ("the size
  // prop", per Zach's ask) — fires ONCE here, at gesture end, not on every
  // tick of `onResize` above. WHY: a component whose rendered floor is
  // stricter than its field declares (Block's bench wrapper imposes
  // `minHeight: 120` on a `HEIGHT_FIELD` with no `min` of its own) can
  // legitimately disagree with a written value — same as typing a too-small
  // number into the Inspector today — but writing on every `onResize` tick
  // turned that one settled disagreement into a live fight: each tick wrote
  // the raw drag value, the component re-rendered, the `ResizeObserver`
  // effect below corrected the shape's box back to its real floor with
  // `history: "ignore"`, and the next still-mid-drag tick wrote the raw
  // value right back — visible jitter for the whole shrink-below-floor
  // gesture. Writing only once, after the pointer is released, keeps the
  // field write and the live drag feedback from ever occupying the same
  // frame.
  override onResizeEnd(initial: BenchShape, current: BenchShape) {
    const lookup = benchResizeLookupByEditor.get(this.editor);
    if (!lookup) return;
    const instanceId = current.props.instanceId;
    const sizeFields = benchInstanceSizeFields(lookup, instanceId);
    if (sizeFields) {
      lookup.onInstancePropChange(instanceId, "width", benchClampToField(Math.round(current.props.w), sizeFields.widthField));
      lookup.onInstancePropChange(instanceId, "height", benchClampToField(Math.round(current.props.h), sizeFields.heightField));
      return;
    }
    // SCALE path (TextBox today): there is no width/height to write, so a
    // drag instead grows/shrinks the one number that exists — scaled off
    // the box change itself, same reasoning as stock tldraw's own text
    // shape (installed tldraw's TextShapeUtil.onResize: a corner drag
    // scales `props.scale`). `Math.max(pxField.min ?? 1, …)` keeps a
    // shrink-to-nothing drag from writing a zero or negative font size.
    const inst = lookup.byId.get(instanceId);
    const scaleFields = inst && benchInstanceScaleField(lookup, instanceId);
    if (!scaleFields || !inst) return;
    const effective = effectiveProps(lookup.instances, lookup.entries, inst);
    const currentPx = benchCurrentScalePx(inst.type, effective, scaleFields);
    const scale = benchResizeScaleFactor(initial.props, current.props);
    const nextPx = Math.max(scaleFields.pxField.min ?? 1, Math.round(currentPx * scale));
    lookup.onInstancePropChange(instanceId, scaleFields.ladderField.id, "custom");
    lookup.onInstancePropChange(instanceId, scaleFields.pxField.id, nextPx);
  }
  // WHY explicit rather than relying on the inherited default: tldraw's own
  // "edit" state is a SEPARATE mode (double-click a text shape, get its
  // native editor) that this shape never enters — the create page owns
  // "editing" as its own React state (`editingId`) and draws it by
  // swapping in a real `<input>`/`<textarea>` inside the SAME shape, not by
  // asking tldraw to switch tools. Returning `true` here would let tldraw
  // start its own edit session on double-click, racing the two-click rule
  // this shape's `onPointerDown` (below) already implements.
  override canEdit() {
    return false;
  }
  // WHY: tldraw's stock select tool has a fallback for double-clicking any
  // shape whose `canEdit()` is false (installed tldraw 5.3.2
  // Idle.js's onDoubleClick, `case "shape"`): `handleDoubleClickOnCanvas`,
  // which CREATES A NEW STOCK TEXT SHAPE at the click point and starts
  // EDITING IT — a convenience for "double-click a rectangle to label it,"
  // never asked for here. tldraw tracks double-clicks itself from raw
  // pointer_down/up dispatches (PointingShape's own `isDoubleClick`), not
  // from the browser's native `dblclick` event, so this can't be gated by
  // stopping propagation of any one event type the way the drag/pan fixes
  // above do — the SAME pointer stream has to reach tldraw for a drag to
  // still work. Returning a (no-op) shape update here is tldraw's own
  // sanctioned "this shape handles its own double-click" escape hatch: a
  // truthy return short-circuits the `canEditShape` fallback entirely
  // (Idle.js: `if (change) { editor.updateShapes([change]); return; }`).
  // Measured without this: two of THIS shape's own two-click-to-edit
  // presses, close enough together for tldraw's internal click counter,
  // silently spawned a stray "text" shape and entered ITS edit mode
  // instead of ours — every second press failed identically.
  override onDoubleClick(shape: BenchShape) {
    return { id: shape.id, type: shape.type };
  }
  override component(shape: BenchShape) {
    const {
      entries,
      instances,
      byId,
      selectedIds,
      onSelectInstance,
      onSelectionChange,
      edit,
      onMovePort,
      zoom,
      highlightSlots,
    } = useContext(BenchContext);
    const inst = byId.get(shape.props.instanceId);
    const editor = this.editor;
    const contentRef = useRef<HTMLDivElement>(null);

    // Keeps `canResize`/`onResize`/`onResizeEnd` (plain ShapeUtil methods,
    // no React context) current — see `BenchResizeLookup`'s own doc
    // comment. No dependency array: cheap (one WeakMap.set), and every
    // value here can change from a render this shape wasn't even the
    // cause of.
    useEffect(() => {
      benchResizeLookupByEditor.set(editor, { entries, instances, byId, onInstancePropChange: edit.onInstancePropChange });
    });

    // WHY: `getDefaultProps` guesses 180×80, but a fresh instance can be
    // anything from a small Pill to a 384×258 Block — content sized by ITS
    // OWN layout, never by this shape. Left unmeasured, tldraw's hit-test
    // (`getGeometry`) and selection outline (`getIndicatorPath`, below)
    // both use the STALE guessed `w`/`h` while the real content renders
    // wherever it naturally overflows that box — verify-round-1 measured
    // a Block's real content (384×258) overflowing a 180×80 shape on
    // every side, so the selection outline drawn around "the shape" never
    // matched what a person actually sees. (The double-click-spawns-a-
    // stray-text-shape regression turned out to be a SEPARATE bug, fixed
    // by `onDoubleClick` above — this effect's own job is purely keeping
    // tldraw's geometry truthful to the real rendered size.)
    useLayoutEffect(() => {
      const el = contentRef.current;
      if (!el) return;
      const apply = (w: number, h: number) => {
        const cur = editor.getShape(shape.id);
        if (!cur || cur.type !== "bbox-bench") return;
        if (Math.abs(cur.props.w - w) < 0.5 && Math.abs(cur.props.h - h) < 0.5) return;
        // WHY `history: "ignore"`: this is the shape correcting its OWN
        // geometry to match its real content — even for a resizable
        // instance, this fires after `onResizeEnd` already wrote the drag
        // into the instance's fields and the component re-rendered,
        // reconciling the box to what that render actually measured —
        // never a person resizing THIS shape directly, so it must never
        // show up as an undo step.
        editor.run(() => editor.updateShape({ id: shape.id, type: "bbox-bench", props: { w, h } }), { history: "ignore" });
      };
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) apply(rect.width, rect.height);
      const observer = new ResizeObserver((entries2) => {
        const entry = entries2[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) apply(width, height);
      });
      observer.observe(el);
      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `editor` and
      // `shape.id` are stable for this shape's lifetime; re-running on
      // every `shape.props` change would fight the very update this effect
      // itself makes.
    }, []);

    return (
      <HTMLContainer
        data-slot="tl-instance"
        data-instance-id={shape.props.instanceId}
        style={{ width: shape.props.w, height: shape.props.h, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "all" }}
        // WHY: a pointer-down that lands on the editing control (the real
        // `<input>`/`<textarea>`, marked `data-bbox-interactive` by
        // packages/bbox-ui/src/textBox.tsx) must not let tldraw start its
        // own gesture (a drag-to-move, a marquee) underneath it. The
        // control already stops React's OWN propagation on its pointerdown
        // (so this shape's onPointerDown never even fires for it), but
        // tldraw's gesture recognizer listens on the native document, not
        // through React — `markEventAsHandled` is tldraw's own escape
        // hatch for exactly this (its doc: "stop other parts of tldraw
        // from handling the event without impacting other... handlers").
        onPointerDown={(e) => {
          if (e.target instanceof Element && e.target.closest(BBOX_INTERACTIVE_SELECTOR)) {
            editor.markEventAsHandled(e);
          }
          // WHY this shape now selects itself directly, deliberately NOT
          // relying on tldraw's own native click + the editor→page echo
          // below (verify-round-4 F1 — see bareAreaSelect.ts's own doc
          // comment for the full mechanism): a press that reaches here
          // unclaimed landed on THIS shape's own bare area — a member's
          // wrapper (render-instance.tsx) always claims the event first —
          // so it means exactly what a member's own direct
          // `onSelect`/`onSelectionChange` call already means, and must be
          // just as unconditional. Left to tldraw's own store-diff echo
          // (the ONLY mechanism a bare-root press used to have), a press on
          // a shape tldraw's OWN memory already (possibly stalely)
          // considers selected produces no store change at all, so the
          // page never hears about it. Calling `onSelectionChange` directly
          // here removes that dependency entirely; tldraw's own native
          // click/drag handling for this SAME press still runs alongside
          // (nothing here calls `markEventAsHandled`, on purpose — a drag
          // that starts on this bare padding must still move the shape),
          // and if it also changes tldraw's own store, the echo below is a
          // harmless no-op re-assertion of the identical selection.
          if (!isInstancePointerDownClaimed(e)) {
            claimInstancePointerDown(e);
            const additive = e.shiftKey || e.metaKey || e.ctrlKey;
            onSelectionChange(
              nextSelectionForRootPress({
                rootId: shape.props.instanceId,
                additive,
                selectedIds,
                isKnownRoot: (id) => !!editor.getShape(shapeIdFor(id)),
              }),
            );
          }
        }}
        // WHY a SEPARATE mark on pointer-UP, not just pointer-down (verify
        // round 3 F1 — a right-click on the control opened tldraw's own
        // context menu instead of the browser's): the control's own
        // `onContextMenu` stopPropagation (textBox.tsx) only stops the
        // REAL, trusted contextmenu event; installed @tldraw/editor 5.3.2
        // `useCanvasEvents.mjs`'s `.tl-canvas` `onPointerUp` handler is a
        // SEPARATE listener that reacts to the right button's pointer-UP
        // itself — `if (rightClickPanning && button === 2 && …)` it
        // synthesizes and dispatches a BRAND NEW untrusted `contextmenu`
        // event directly on the canvas element, bypassing the control
        // entirely (proven live: the installed source's exact branch,
        // and the synthetic event's target was the canvas DIV, not the
        // input). Marking pointerdown handled does nothing for this —
        // it is a different native event object. Marking THIS pointerup
        // handled (same WeakSet-by-nativeEvent mechanism, same
        // `HTMLContainer` — an ANCESTOR of `.tl-canvas`'s own listener in
        // the bubble path) makes `useCanvasEvents`'s own
        // `wasEventAlreadyHandled` guard bail out before it ever
        // synthesizes that event, so the browser's native cut/copy/paste
        // menu (opened by the real, still-unstopped, contextmenu event)
        // is the only one that shows. Deliberately NOT done by adding a
        // 5th `stopPropagation` to textBox.tsx's shared control: tldraw's
        // own doc for `markEventAsHandled` warns that a blanket
        // `stopPropagation()` "can impact non-tldraw event handlers set
        // up elsewhere" (this file's own `armEditOnRelease`
        // `document`-level pointerup listener among them) — this stays
        // scoped to tldraw's own pipeline, in the file the contract (§3)
        // already assigns this responsibility to, and leaves the core
        // control exactly matching the spec's literal four events.
        onPointerUp={(e) => {
          if (e.target instanceof Element && e.target.closest(BBOX_INTERACTIVE_SELECTOR)) {
            editor.markEventAsHandled(e);
          }
        }}
      >
        {/* One HostZoomContext per Block, read from this shape's own
            HTMLContainer — same value for every Block on the page (tldraw
            has one zoom, not one per shape), but provided here rather than
            wrapped once around <Tldraw> because `PortDndProvider` is
            mounted by `renderInstance`, INSIDE this returned tree. */}
        <div ref={contentRef} style={{ display: "inline-flex" }}>
          <HostZoomContext.Provider value={zoom}>
            {inst ? renderInstance(entries, byId, inst, selectedIds, onSelectInstance, edit, false, onMovePort, highlightSlots) : null}
          </HostZoomContext.Provider>
        </div>
      </HTMLContainer>
    );
  }
  // tldraw 5.3 draws the selection outline from a Path2D, not from JSX.
  override getIndicatorPath(shape: BenchShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 6);
    return path;
  }
}

const shapeUtils = [BenchShapeUtil, BBoxGlyphShapeUtil];

/**
 * The page's selection, reduced to the ids tldraw has a shape for.
 *
 * WHY the editor→page listeners compare against THIS and not the raw
 * selection: a member (a Port inside a Stack) is selected on the page but
 * has no shape — only roots do. Writing that selection into the editor
 * means `setSelectedShapes([])`, and tldraw flushes its store listeners on
 * the next frame, after the `applying` guard has been lowered. The echo
 * then read "editor says [], page says [port]" and cleared the page. The
 * probe that found it: select a member on the tldraw render, and the
 * inspector went blank on pointer-down. Comparing shape-backed ids makes
 * that echo a no-op while a real click on a shape still differs and wins.
 */
function shapeBackedSelection(editor: Editor, selectedIds: string[]): string {
  return selectedIds
    .filter((id) => editor.getShape(shapeIdFor(id)))
    .sort()
    .join("|");
}

// A press inside a member wrapper (any depth) or the inline-edit control
// itself — the two DOM markers a page-side click handler already owns.
const MEMBER_OR_CONTROL_SELECTOR = '[data-slot="member-instance"], [data-bbox-interactive]';

/**
 * WHY this replaced an ID-set heuristic (`impliedRootSelection`, verify
 * round 1, F3/F4): tldraw has no shape for a member — only a ROOT gets one
 * (`shapeIdFor` below) — so EVERY press anywhere inside a shape's rendered
 * content, member or not, resolves at tldraw's OWN geometry-based hit-test
 * to the SAME root shape. Once render-instance.tsx's member wrapper
 * stopped calling `stopPropagation()` (so a drag starting on a member can
 * still reach tldraw's canvas-level pointer handling), tldraw's OWN click
 * machinery started running for every member press too, reselecting that
 * root — which the listener below must recognize and ignore, since the
 * member's own `onPointerDown` (render-instance.tsx) is already the
 * authoritative source for what this press means.
 *
 * The previous fix compared `ancestry(...)[0]` of the page's selected ids
 * against tldraw's reported ids — but two members of the SAME block
 * (`[T1, T3]`) both imply that one root, so an un-deduplicated join
 * (`"block-8|block-8"`) never matched tldraw's own single-shape id
 * (`"block-8"`), and the guard fired for real: a shift-click extending the
 * selection to two members got silently collapsed back to their shared
 * root (F3). Deduplicating would have fixed that, but the SAME string
 * comparison is also blind to WHERE the press landed: clicking a Block's
 * bare padding while one of its members is selected produces the exact
 * same strings (`"block-8" === "block-8"`) as the member's own reflexive
 * echo, so it was ALSO swallowed — the Block could never be reselected by
 * clicking it again (F4). No amount of ID-set arithmetic can tell those
 * two cases apart; they differ only in which DOM element the pointerdown
 * actually hit.
 *
 * So this reads that directly: `lastPointerDownTarget` (below) is stamped
 * by an `onPointerDownCapture` on this component's own wrapper div, which
 * — because the capture phase always finishes walking every ancestor
 * before ANY bubble-phase listener anywhere in the subtree runs, tldraw's
 * native click handling on `.tl-container` included — is guaranteed to be
 * set before tldraw (or React's own bubble dispatch to the member's
 * `onPointerDown`) has processed the same physical event. A press that
 * landed on a member or the inline-edit control is always something a
 * page-side handler already decided; a press that landed on neither
 * (bare padding, the canvas background) has no other handler at all, and
 * tldraw's own selection change IS the whole story.
 */
function pressLandedOnMemberOrControl(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(MEMBER_OR_CONTROL_SELECTOR);
}
const shapeIdFor = (instanceId: string): TLShapeId => createShapeId(`bench-${instanceId}`);
const DEG = Math.PI / 180;

/** A "bbox-glyph" shape's props, built from an instance the same way
 *  `glyphDataFor` (reactflow-canvas.tsx) builds a node's data — one place
 *  this mapping is written so the create and the update path can't
 *  disagree about what a Glyph instance's shape should hold. */
function glyphShapePropsFor(inst: Instance): Pick<BBoxGlyphShapeProps, "content" | "sizePreset" | "size" | "padding"> {
  const props = inst.props;
  return {
    content: (props.content as string | undefined) ?? "",
    sizePreset: (props.sizePreset as GlyphSize | undefined) ?? "sm",
    size: props.size === undefined ? null : (props.size as number),
    padding: (props.padding as number | undefined) ?? 0,
  };
}

interface Props {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  onSelectInstance: (id: string, additive: boolean) => void;
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  transforms: Record<string, CanvasTransform>;
  onTransformsChange: (next: Record<string, CanvasTransform>) => void;
  onInstancePropsChange: (id: string, patch: Record<string, FieldValue | undefined>) => void;
  edit: EditBundle;
  /** dnd-kit owns every Port drag (Zach, 2026-09-12) — see port-dnd.tsx.
   *  tldraw is wired for it (this file); React Flow still is not. */
  onMovePort?: (blockId: string, portIds: string[], edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  highlightSlots: boolean;
}

/**
 * tldraw keeps its own store, so this tab is a two-way sync rather than a
 * controlled render: page → editor when instances/positions/selection change
 * from outside, editor → page when the user drags or selects. `applying`
 * guards the round trip so an update we wrote is not reported back as a
 * user change and echoed forever.
 *
 * A `Glyph` instance is a real `bbox-glyph` shape (`@bbox-ui/adapter-
 * tldraw`) rather than the generic `bbox-bench` every other component still
 * rides — same id scheme (`shapeIdFor`), so this file's position and
 * selection sync needs no per-type branching at all; only creation,
 * rotation and the glyph's own props (content/size) do.
 */
export function TldrawCanvas(p: Props) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<Editor | null>(null);
  const applying = useRef(false);
  const latest = useRef(p);
  latest.current = p;
  // Stamped by `onPointerDownCapture` below, read by the editor→page
  // listeners — see `pressLandedOnMemberOrControl`'s doc comment.
  const pressOnMemberOrControl = useRef(false);

  // The canvas' own zoom (Zach, 2026-09-12: HostZoomContext, subscribed so
  // a Port's drag overlay stays 1:1 with the pointer after a ctrl+wheel
  // zoom, not just at whatever level the shape mounted at).
  const [zoom, setZoom] = useState(1);

  const byId = useMemo(() => new Map(p.instances.map((i) => [i.id, i])), [p.instances]);
  const ctx = useMemo(
    () => ({
      entries: p.entries,
      instances: p.instances,
      byId,
      selectedIds: p.selectedIds,
      onSelectInstance: p.onSelectInstance,
      onSelectionChange: p.onSelectionChange,
      edit: p.edit,
      onMovePort: p.onMovePort,
      zoom,
      highlightSlots: p.highlightSlots,
    }),
    [p.entries, p.instances, byId, p.selectedIds, p.onSelectInstance, p.onSelectionChange, p.edit, p.onMovePort, zoom, p.highlightSlots],
  );

  /** Create-or-update the one shape `inst` owns, branching only on the two
   *  facts that differ between a glyph and a bench box: which shape type it
   *  is, and whether it carries rotation/content/size at all. Called from
   *  both the page→editor effect and `onMount`'s own initial fill so the
   *  two can't drift into creating shapes a different way. */
  function syncShape(editor: Editor, inst: Instance, pos: CanvasPosition, transforms: Record<string, CanvasTransform>) {
    const id = shapeIdFor(inst.id);
    const cur = editor.getShape(id);
    if (inst.type === "Glyph") {
      const rotationDeg = transforms[inst.id]?.rotation ?? 0;
      // Wrapped into tldraw's own [0, 2π) domain BEFORE use, not just at
      // comparison time: a raw negative-degree rotation (e.g. -46°) turns
      // into a negative radian that can never equal the always-positive
      // value tldraw normalises `shape.rotation` to, so `rotated` below
      // would read true forever — one page-driven write chasing another.
      const rotation = (((rotationDeg * DEG) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const glyphProps = glyphShapePropsFor(inst);
      const size = glyphFootprint({ sizePreset: glyphProps.sizePreset, size: glyphProps.size ?? undefined, padding: glyphProps.padding }).w;
      const origin = tldrawOriginFor(pos, rotation, size);
      if (!cur) {
        editor.createShape<BBoxGlyphShape>({ id, type: "bbox-glyph", x: origin.x, y: origin.y, rotation, props: glyphProps });
        return;
      }
      if (cur.type !== "bbox-glyph") return; // an instance never changes type at runtime
      const shape = cur as BBoxGlyphShape;
      const moved = Math.abs(shape.x - origin.x) > 0.5 || Math.abs(shape.y - origin.y) > 0.5;
      const rotated = Math.abs(shape.rotation - rotation) > 0.001;
      const propsChanged =
        shape.props.content !== glyphProps.content ||
        shape.props.sizePreset !== glyphProps.sizePreset ||
        shape.props.size !== glyphProps.size ||
        shape.props.padding !== glyphProps.padding;
      if (moved || rotated || propsChanged) {
        editor.updateShape<BBoxGlyphShape>({
          id,
          type: "bbox-glyph",
          ...(moved ? { x: origin.x, y: origin.y } : {}),
          ...(rotated ? { rotation } : {}),
          ...(propsChanged ? { props: glyphProps } : {}),
        });
      }
      return;
    }
    if (!cur) {
      editor.createShape({ id, type: "bbox-bench", x: pos.x, y: pos.y, props: { instanceId: inst.id, w: 180, h: 80 } });
    } else if (Math.abs(cur.x - pos.x) > 0.5 || Math.abs(cur.y - pos.y) > 0.5) {
      editor.updateShape({ id, type: "bbox-bench", x: pos.x, y: pos.y });
    }
  }

  // page → editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    applying.current = true;
    try {
      const wanted = new Set(p.roots.map((i) => shapeIdFor(i.id)));
      const existing = editor.getCurrentPageShapes().filter((s) => s.type === "bbox-bench" || s.type === "bbox-glyph");
      const stale = existing.filter((s) => !wanted.has(s.id)).map((s) => s.id);
      if (stale.length) editor.deleteShapes(stale);
      for (const inst of p.roots) {
        const pos = p.positions[inst.id] ?? { x: 0, y: 0 };
        syncShape(editor, inst, pos, p.transforms);
      }
      const selWanted = p.selectedIds.map(shapeIdFor).filter((id) => editor.getShape(id));
      const selCur = editor.getSelectedShapeIds();
      // WHY skipped mid-gesture: a press on a member with NO shape (any
      // member — only roots get one) writes `selWanted = []` here the
      // instant `onSelect` fires, on the SAME press tldraw's own select
      // tool may already be tracking as the start of a drag
      // (`PointingShape`, entered on pointer-down). Calling
      // `setSelectedShapes([])` while `getIsPointing()` is true clears the
      // very selection that gesture is mid-way through translating, and
      // tldraw does not always re-derive it (`startTranslating` only
      // re-selects when its OWN `didSelectOnEnter` was false) — measured:
      // a drag starting on a non-editable member with nothing previously
      // selected moved the node 0px instead of the expected 80. Skipping
      // the write here only DEFERS it — the next run of this same effect,
      // once the pointer is up, applies whatever `p.selectedIds` says by
      // then, so nothing is lost, only delayed past the live gesture.
      if (!editor.inputs.getIsPointing() && [...selWanted].sort().join("|") !== [...selCur].sort().join("|")) {
        editor.setSelectedShapes(selWanted);
      }
    } finally {
      applying.current = false;
    }
  }, [p.roots, p.positions, p.transforms, p.selectedIds]);

  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ colorScheme: resolvedTheme === "dark" ? "dark" : "light" });
  }, [resolvedTheme]);

  return (
    <BenchContext.Provider value={ctx}>
      <div
        data-slot="tldraw-canvas"
        className="relative h-full min-h-0 w-full"
        // WHY capture, not bubble, and why on THIS ancestor: the capture
        // phase finishes walking every ancestor of the event target before
        // ANY bubble-phase listener anywhere in the subtree fires — this
        // div sits above `.tl-container`, so this always stamps the ref
        // before tldraw's own native click handling (and before React's
        // bubble dispatch to a member's `onPointerDown`) sees the same
        // physical press. See `pressLandedOnMemberOrControl`'s doc comment.
        onPointerDownCapture={(e) => {
          pressOnMemberOrControl.current = pressLandedOnMemberOrControl(e.target);
        }}
      >
        <Tldraw
          shapeUtils={shapeUtils}
          hideUi
          onMount={(editor) => {
            editorRef.current = editor;
            // Test hook only — same pattern as the playground's own
            // `window.playgroundEditor`. Lets a CDP journey compute real
            // screen coordinates for tldraw's canvas-drawn (non-DOM)
            // selection handles from the editor's own page-space geometry,
            // rather than a hand-guessed pixel offset.
            (window as unknown as { __bboxCreateTldrawEditor?: Editor }).__bboxCreateTldrawEditor = editor;
            editor.user.updateUserPreferences({ colorScheme: resolvedTheme === "dark" ? "dark" : "light" });
            editor.setCurrentTool("select");
            // First fill from the page, then listen for the user's changes.
            applying.current = true;
            for (const inst of latest.current.roots) {
              const pos = latest.current.positions[inst.id] ?? { x: 0, y: 0 };
              syncShape(editor, inst, pos, latest.current.transforms);
            }
            editor.setSelectedShapes(latest.current.selectedIds.map(shapeIdFor));
            applying.current = false;

            setZoom(editor.getZoomLevel());
            // Zoom lives on the current page's own `camera` record — a
            // session-scoped fact (ephemeral UI state, never synced or
            // undone), not a document edit, so it is listened for
            // separately from the position/selection listener below rather
            // than folded into it.
            const stopZoom = editor.store.listen(
              () => setZoom(editor.getZoomLevel()),
              { source: "user", scope: "session" },
            );

            // Test-only observability hook (Zach's ask, 2026-09-12): lets a
            // CDP script read which select-tool state tldraw is actually in
            // while a Port drag is in flight, to prove the press never
            // reaches `select.pointing_shape`/`select.translating`. Never
            // read by product code.
            window.__bboxEditorPath = () => editor.getPath();
            window.__bboxEditor = editor;

            // editor → page, user changes only. `shapeIdToInstanceId` maps
            // EITHER shape type back to its instance id through the ONE id
            // scheme both share (`shapeIdFor`).
            //
            // WHY that map replaced the previous `.filter(s => s.type ===
            // "bbox-bench").map(s => s.props.instanceId)`: that filter
            // silently DROPPED a `bbox-glyph` shape, so selecting a Glyph on
            // this canvas produced an empty id list and cleared the page's
            // selection on the very next tick — the inspector went blank the
            // instant you clicked the thing you wanted to inspect. Keying off
            // the shape id instead of the shape's own props is what makes
            // this work for every shape type without a lookup table.
            const onUserChange = () => {
              if (applying.current) return;
              const cur = latest.current;
              const shapeIdToInstanceId = new Map(cur.roots.map((i) => [shapeIdFor(i.id), i.id]));

              const nextPositions: Record<string, CanvasPosition> = { ...cur.positions };
              let moved = false;
              let nextTransforms: Record<string, CanvasTransform> | null = null;
              for (const inst of cur.roots) {
                const s = editor.getShape(shapeIdFor(inst.id));
                if (!s) continue;

                if (inst.type === "Glyph" && s.type === "bbox-glyph") {
                  const glyphShape = s as BBoxGlyphShape;
                  const size = glyphFootprint({
                    sizePreset: glyphShape.props.sizePreset,
                    size: glyphShape.props.size ?? undefined,
                    padding: glyphShape.props.padding,
                  }).w;
                  // tldraw's own  is an origin-pivot point, not
                  // the top-left the rest of the page (and the other two
                  // renders) mean by  — see 's
                  // own doc comment. Convert BEFORE the moved-diff so a
                  // pure rotate-handle drag (which tldraw already keeps
                  // visually centred by moving x,y as rotation changes)
                  // reads back as "same centre", not as a spurious move.
                  const centre = centrePivotFor({ x: glyphShape.x, y: glyphShape.y }, glyphShape.rotation, size);
                  const was = cur.positions[inst.id];
                  if (!was || Math.abs(was.x - centre.x) > 0.5 || Math.abs(was.y - centre.y) > 0.5) {
                    nextPositions[inst.id] = centre;
                    moved = true;
                  }

                  // Rotation: the stock rotate handle wrote 
                  // directly — read it back into degrees, rounded to 1dp and
                  // normalised into the (-180, 180] domain '
                  // rotation row declares ('s own doc comment —
                  // tldraw's [0, 2π) domain would otherwise clamp every angle
                  // past half a turn to the row's max on one scrub), and only
                  // when it actually disagrees with what the page already has,
                  // which is what stops a rounding-induced ping-pong.
                  const wantDeg = cur.transforms[inst.id]?.rotation ?? 0;
                  const haveDeg = normalizeDeg(Math.round((glyphShape.rotation / DEG) * 10) / 10);
                  if (Math.abs(wantDeg - haveDeg) > 0.05) {
                    nextTransforms ??= { ...cur.transforms };
                    nextTransforms[inst.id] = { rotation: haveDeg };
                  }

                  // Size (the resize handle) and content (the picker) are the
                  // only two glyph props a canvas itself ever writes.
                  const patch: Record<string, FieldValue | undefined> = {};
                  const wantSize = inst.props.size === undefined ? null : (inst.props.size as number);
                  if (glyphShape.props.size !== wantSize) patch.size = glyphShape.props.size ?? undefined;
                  const wantContent = (inst.props.content as string | undefined) ?? "";
                  if (glyphShape.props.content !== wantContent) patch.content = glyphShape.props.content;
                  if (Object.keys(patch).length) cur.onInstancePropsChange(inst.id, patch);
                } else {
                  const was = cur.positions[inst.id];
                  if (!was || Math.abs(was.x - s.x) > 0.5 || Math.abs(was.y - s.y) > 0.5) {
                    nextPositions[inst.id] = { x: s.x, y: s.y };
                    moved = true;
                  }
                }
              }
              if (moved) cur.onPositionsChange(nextPositions);
              if (nextTransforms) cur.onTransformsChange(nextTransforms);

              const ids = editor
                .getSelectedShapeIds()
                .map((id) => shapeIdToInstanceId.get(id))
                .filter((id): id is string => !!id)
                .sort();
              const idsKey = ids.join("|");
              // Two DIFFERENT reasons to treat this as a no-op, not one:
              //  catches an ECHO of a selection we
              // (the page → editor effect) just wrote; 
              // catches tldraw's OWN reflexive re-assertion of a root
              // whose member (or inline-edit control) a page-side handler
              // already acted on for this exact press — see
              // 's own long comment for the
              // regression this closes and the one it replaced.
              if (idsKey !== shapeBackedSelection(editor, cur.selectedIds) && !pressOnMemberOrControl.current) {
                cur.onSelectionChange(ids);
              }
            };
            const stop = editor.store.listen(onUserChange, { source: "user", scope: "document" });
            const stopSel = editor.store.listen(onUserChange, { source: "user", scope: "session" });
            return () => {
              stop();
              stopSel();
              stopZoom();
              delete window.__bboxEditorPath;
              delete window.__bboxEditor;
            };
          }}
        />
        <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">tldraw</span>
      </div>
    </BenchContext.Provider>
  );
}
