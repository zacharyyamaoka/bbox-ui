"use client";

import "tldraw/tldraw.css";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import type { PortEdgeId } from "@bbox-ui/core";
import type { CanvasPosition } from "../contract";
import { renderInstance } from "../render-instance";
import { HostZoomContext } from "../port-dnd";

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
 * `onMovePort`/`zoom` ride the same context (Zach, 2026-09-12: dnd-kit owns
 * every Port drag, tldraw included) — `onMovePort` is `renderInstance`'s
 * fifth argument, the same one `dom-preview.tsx` already threads, and `zoom`
 * is this Block's live `HostZoomContext` value so `PortDndProvider`'s
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
  onMovePort?: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  zoom: number;
}>({ entries: [], instances: [], byId: new Map(), selectedIds: [], onSelectInstance: () => {}, zoom: 1 });

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
  override component(shape: BenchShape) {
    const { entries, byId, selectedIds, onSelectInstance, onMovePort, zoom } = useContext(BenchContext);
    const inst = byId.get(shape.props.instanceId);
    return (
      <HTMLContainer
        data-slot="tl-instance"
        data-instance-id={shape.props.instanceId}
        style={{ width: shape.props.w, height: shape.props.h, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "all" }}
      >
        {/* One HostZoomContext per Block, read from this shape's own
            HTMLContainer — same value for every Block on the page (tldraw
            has one zoom, not one per shape), but provided here rather than
            wrapped once around <Tldraw> because `PortDndProvider` is
            mounted by `renderInstance`, INSIDE this returned tree. */}
        <HostZoomContext.Provider value={zoom}>
          {inst ? renderInstance(entries, byId, inst, selectedIds, onSelectInstance, onMovePort) : null}
        </HostZoomContext.Provider>
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
  /** dnd-kit owns every Port drag (Zach, 2026-09-12) — see port-dnd.tsx.
   *  tldraw is wired for it (this file); React Flow still is not. */
  onMovePort?: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void;
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
      onMovePort: p.onMovePort,
      zoom,
    }),
    [p.entries, p.instances, byId, p.selectedIds, p.onSelectInstance, p.onMovePort, zoom],
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
      if ([...selWanted].sort().join("|") !== [...selCur].sort().join("|")) editor.setSelectedShapes(selWanted);
    } finally {
      applying.current = false;
    }
  }, [p.roots, p.positions, p.selectedIds]);

  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ colorScheme: resolvedTheme === "dark" ? "dark" : "light" });
  }, [resolvedTheme]);

  return (
    <BenchContext.Provider value={ctx}>
      <div data-slot="tldraw-canvas" className="relative h-full min-h-0 w-full">
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
                if (ids.join("|") !== shapeBackedSelection(editor, cur.selectedIds)) cur.onSelectionChange(ids);
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
                if (ids.join("|") !== shapeBackedSelection(editor, cur.selectedIds)) cur.onSelectionChange(ids);
              },
              { source: "user", scope: "session" },
            );
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
