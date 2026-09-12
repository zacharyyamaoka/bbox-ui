"use client";

import "tldraw/tldraw.css";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  Tldraw,
  createShapeId,
  type Editor,
  type TLBaseShape,
  type TLShapeId,
} from "tldraw";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { CanvasPosition } from "../contract";
import { renderInstance, type EditBundle } from "../render-instance";

// The same host-neutral marker `TextBoxControl` puts on its own control
// (packages/bbox-ui/src/textBox.tsx) — see the CSS rule added in
// app/global.css and the `markEventAsHandled` call below, both keyed off it.
const BBOX_INTERACTIVE_SELECTOR = "[data-bbox-interactive]";

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
 */
const BenchContext = createContext<{
  entries: ComponentEntry[];
  instances: Instance[];
  byId: Map<string, Instance>;
  selectedIds: string[];
  onSelectInstance: (id: string, additive: boolean) => void;
  edit: EditBundle;
}>({
  entries: [],
  instances: [],
  byId: new Map(),
  selectedIds: [],
  onSelectInstance: () => {},
  edit: { editingId: null, editSnapshot: null, onRequestEdit: () => {}, onEditEnd: () => {}, onInstancePropChange: () => {} },
});

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
  override canResize() {
    return false;
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
    const { entries, byId, selectedIds, onSelectInstance, edit } = useContext(BenchContext);
    const inst = byId.get(shape.props.instanceId);
    const editor = this.editor;
    const contentRef = useRef<HTMLDivElement>(null);

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
        // geometry to match its real content, not a person resizing it
        // (`canResize()` is false) — it must never show up as an undo step.
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
        <div ref={contentRef} style={{ display: "inline-flex" }}>
          {inst ? renderInstance(entries, byId, inst, selectedIds, onSelectInstance, edit) : null}
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

const shapeUtils = [BenchShapeUtil];

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

interface Props {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  onSelectInstance: (id: string, additive: boolean) => void;
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  edit: EditBundle;
}

/**
 * tldraw keeps its own store, so this tab is a two-way sync rather than a
 * controlled render: page → editor when instances/positions/selection change
 * from outside, editor → page when the user drags or selects. `applying`
 * guards the round trip so an update we wrote is not reported back as a
 * user change and echoed forever.
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

  const byId = useMemo(() => new Map(p.instances.map((i) => [i.id, i])), [p.instances]);
  const ctx = useMemo(
    () => ({ entries: p.entries, instances: p.instances, byId, selectedIds: p.selectedIds, onSelectInstance: p.onSelectInstance, edit: p.edit }),
    [p.entries, p.instances, byId, p.selectedIds, p.onSelectInstance, p.edit],
  );

  // page → editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    applying.current = true;
    try {
      const wanted = new Set(p.roots.map((i) => shapeIdFor(i.id)));
      const existing = editor.getCurrentPageShapes().filter((s) => s.type === "bbox-bench");
      const stale = existing.filter((s) => !wanted.has(s.id)).map((s) => s.id);
      if (stale.length) editor.deleteShapes(stale);
      for (const inst of p.roots) {
        const id = shapeIdFor(inst.id);
        const pos = p.positions[inst.id] ?? { x: 0, y: 0 };
        const cur = editor.getShape(id);
        if (!cur) {
          editor.createShape({ id, type: "bbox-bench", x: pos.x, y: pos.y, props: { instanceId: inst.id, w: 180, h: 80 } });
        } else if (Math.abs(cur.x - pos.x) > 0.5 || Math.abs(cur.y - pos.y) > 0.5) {
          editor.updateShape({ id, type: "bbox-bench", x: pos.x, y: pos.y });
        }
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
  }, [p.roots, p.positions, p.selectedIds]);

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
            editor.user.updateUserPreferences({ colorScheme: resolvedTheme === "dark" ? "dark" : "light" });
            editor.setCurrentTool("select");
            // First fill from the page, then listen for the user's changes.
            applying.current = true;
            for (const inst of latest.current.roots) {
              const pos = latest.current.positions[inst.id] ?? { x: 0, y: 0 };
              editor.createShape({ id: shapeIdFor(inst.id), type: "bbox-bench", x: pos.x, y: pos.y, props: { instanceId: inst.id, w: 180, h: 80 } });
            }
            editor.setSelectedShapes(latest.current.selectedIds.map(shapeIdFor));
            applying.current = false;

            // editor → page, user changes only.
            const stop = editor.store.listen(
              () => {
                if (applying.current) return;
                const cur = latest.current;
                const next: Record<string, CanvasPosition> = { ...cur.positions };
                let moved = false;
                for (const inst of cur.roots) {
                  const s = editor.getShape(shapeIdFor(inst.id));
                  if (!s) continue;
                  const was = cur.positions[inst.id];
                  if (!was || Math.abs(was.x - s.x) > 0.5 || Math.abs(was.y - s.y) > 0.5) {
                    next[inst.id] = { x: s.x, y: s.y };
                    moved = true;
                  }
                }
                if (moved) cur.onPositionsChange(next);
                const ids = editor
                  .getSelectedShapeIds()
                  .map((id) => editor.getShape(id))
                  .filter((s): s is BenchShape => !!s && s.type === "bbox-bench")
                  .map((s) => s.props.instanceId)
                  .sort();
                const idsKey = ids.join("|");
                // Two DIFFERENT reasons to treat this as a no-op, not one:
                // `shapeBackedSelection` catches an ECHO of a selection we
                // (the page → editor effect) just wrote; `pressOnMemberOrControl`
                // catches tldraw's OWN reflexive re-assertion of a root
                // whose member (or inline-edit control) a page-side handler
                // already acted on for this exact press — see
                // `pressLandedOnMemberOrControl`'s own long comment for the
                // regression this closes and the one it replaced.
                if (idsKey !== shapeBackedSelection(editor, cur.selectedIds) && !pressOnMemberOrControl.current) {
                  cur.onSelectionChange(ids);
                }
              },
              { source: "user", scope: "document" },
            );
            const stopSel = editor.store.listen(
              () => {
                if (applying.current) return;
                const cur = latest.current;
                const ids = editor
                  .getSelectedShapeIds()
                  .map((id) => editor.getShape(id))
                  .filter((s): s is BenchShape => !!s && s.type === "bbox-bench")
                  .map((s) => s.props.instanceId)
                  .sort();
                const idsKey = ids.join("|");
                // Two DIFFERENT reasons to treat this as a no-op, not one:
                // `shapeBackedSelection` catches an ECHO of a selection we
                // (the page → editor effect) just wrote; `pressOnMemberOrControl`
                // catches tldraw's OWN reflexive re-assertion of a root
                // whose member (or inline-edit control) a page-side handler
                // already acted on for this exact press — see
                // `pressLandedOnMemberOrControl`'s own long comment for the
                // regression this closes and the one it replaced.
                if (idsKey !== shapeBackedSelection(editor, cur.selectedIds) && !pressOnMemberOrControl.current) {
                  cur.onSelectionChange(ids);
                }
              },
              { source: "user", scope: "session" },
            );
            return () => {
              stop();
              stopSel();
            };
          }}
        />
        <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">tldraw</span>
      </div>
    </BenchContext.Provider>
  );
}
