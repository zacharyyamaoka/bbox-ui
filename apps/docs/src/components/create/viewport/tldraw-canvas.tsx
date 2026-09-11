"use client";

import "tldraw/tldraw.css";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
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

/**
 * Content rides a React context, not shape props: tldraw validates and
 * persists props as JSON, so a rendered component cannot live there. The
 * shape stores only WHICH instance it is; the component method looks the
 * live one up. Same mechanism as demos/story-hosts, for the same reason.
 */
const BenchContext = createContext<{ entries: ComponentEntry[]; instances: Instance[] }>({ entries: [], instances: [] });

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
    const { entries, instances } = useContext(BenchContext);
    const inst = instances.find((i) => i.id === shape.props.instanceId);
    const entry = inst && entries.find((e) => e.name === inst.type);
    return (
      <HTMLContainer
        data-slot="tl-instance"
        data-instance-id={shape.props.instanceId}
        style={{ width: shape.props.w, height: shape.props.h, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "all" }}
      >
        {entry && inst ? entry.render(inst.props) : null}
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
const shapeIdFor = (instanceId: string): TLShapeId => createShapeId(`bench-${instanceId}`);

interface Props {
  entries: ComponentEntry[];
  instances: Instance[];
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
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

  const ctx = useMemo(() => ({ entries: p.entries, instances: p.instances }), [p.entries, p.instances]);

  // page → editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    applying.current = true;
    try {
      const wanted = new Set(p.instances.map((i) => shapeIdFor(i.id)));
      const existing = editor.getCurrentPageShapes().filter((s) => s.type === "bbox-bench");
      const stale = existing.filter((s) => !wanted.has(s.id)).map((s) => s.id);
      if (stale.length) editor.deleteShapes(stale);
      for (const inst of p.instances) {
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
  }, [p.instances, p.positions, p.selectedIds]);

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
            for (const inst of latest.current.instances) {
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
                for (const inst of cur.instances) {
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
                if (ids.join("|") !== [...cur.selectedIds].sort().join("|")) cur.onSelectionChange(ids);
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
                if (ids.join("|") !== [...cur.selectedIds].sort().join("|")) cur.onSelectionChange(ids);
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
