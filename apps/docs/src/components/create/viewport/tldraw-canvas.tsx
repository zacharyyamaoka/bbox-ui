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
import type { FieldValue } from "@bbox-ui/schema";
import { glyphFootprint, type GlyphSize } from "@bbox-ui/core";
import { BBoxGlyphShapeUtil, type BBoxGlyphShape, type BBoxGlyphShapeProps } from "@bbox-ui/adapter-tldraw";
import type { CanvasPosition, CanvasTransform } from "../contract";
import { centrePivotFor, normalizeDeg, tldrawOriginFor } from "../glyph-geometry";
import { renderInstance } from "../render-instance";

/**
 * Content rides a React context, not shape props: tldraw validates and
 * persists props as JSON, so a rendered component cannot live there. The
 * shape stores only WHICH instance it is; the component method looks the
 * live one up. Same mechanism as demos/story-hosts, for the same reason.
 */
const BenchContext = createContext<{
  entries: ComponentEntry[];
  instances: Instance[];
  byId: Map<string, Instance>;
  selectedIds: string[];
  onSelectInstance: (id: string, additive: boolean) => void;
}>({ entries: [], instances: [], byId: new Map(), selectedIds: [], onSelectInstance: () => {} });

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
    const { entries, byId, selectedIds, onSelectInstance } = useContext(BenchContext);
    const inst = byId.get(shape.props.instanceId);
    return (
      <HTMLContainer
        data-slot="tl-instance"
        data-instance-id={shape.props.instanceId}
        style={{ width: shape.props.w, height: shape.props.h, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "all" }}
      >
        {inst ? renderInstance(entries, byId, inst, selectedIds, onSelectInstance) : null}
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
 * the next frame. The echo then read "editor says [], page says [port]" and
 * cleared the page. The probe that found it: select a member on the tldraw
 * render, and the inspector went blank on pointer-down. Comparing
 * shape-backed ids makes that echo a no-op while a real click on a shape
 * still differs and wins.
 */
function shapeBackedSelection(editor: Editor, selectedIds: string[]): string {
  return selectedIds
    .filter((id) => editor.getShape(shapeIdFor(id)))
    .sort()
    .join("|");
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
}

/**
 * tldraw keeps its own store, so this tab is a two-way sync rather than a
 * controlled render: page → editor when instances/positions/selection change
 * from outside, editor → page when the user drags or selects.
 *
 * WHY there is no "applying" flag guarding the round trip (an earlier draft
 * had one): `editor.store.listen(...)` only ever fires from the store's
 * OWN throttled history reactor (`throttleToNextFrame` in
 * `@tldraw/store`'s `Store.js`), never synchronously with the write that
 * caused it. A same-tick boolean set true then reset false in a `finally`
 * right after the page → editor writes is therefore ALREADY false by the
 * time `onUserChange` below runs — it can never see itself mid-flight, so
 * it guarded nothing. What actually stops an editor → page → editor echo
 * is `onUserChange` comparing the shape's live x/y/rotation/props against
 * what the page already believes (the `moved`/`rotated`/`propsChanged`-
 * shaped checks below) and only calling a setter when something really
 * changed — a page-driven write reads back as no-op, not as new user
 * intent.
 *
 * A `Glyph` instance is a real `bbox-glyph` shape (`@bbox-ui/adapter-
 * tldraw`) rather than the generic `bbox-bench` every other component still
 * rides — same id scheme (`shapeIdFor`), so the rest of this file's
 * position/selection sync needs no per-type branching at all; only
 * creation, rotation and the glyph's own props (content/size) do.
 */
export function TldrawCanvas(p: Props) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<Editor | null>(null);
  const latest = useRef(p);
  latest.current = p;

  const byId = useMemo(() => new Map(p.instances.map((i) => [i.id, i])), [p.instances]);
  const ctx = useMemo(
    () => ({ entries: p.entries, instances: p.instances, byId, selectedIds: p.selectedIds, onSelectInstance: p.onSelectInstance }),
    [p.entries, p.instances, byId, p.selectedIds, p.onSelectInstance],
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
    if ([...selWanted].sort().join("|") !== [...selCur].sort().join("|")) editor.setSelectedShapes(selWanted);
  }, [p.roots, p.positions, p.transforms, p.selectedIds]);

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
            // Test hook only — same pattern as the playground's own
            // `window.playgroundEditor` (demos/drive-playground-
            // inspector.mjs). Lets a CDP journey compute real screen
            // coordinates for tldraw's canvas-drawn (non-DOM) selection
            // handles from the editor's own page-space geometry, rather
            // than a hand-guessed pixel offset.
            (window as unknown as { __bboxCreateTldrawEditor?: Editor }).__bboxCreateTldrawEditor = editor;
            editor.user.updateUserPreferences({ colorScheme: resolvedTheme === "dark" ? "dark" : "light" });
            editor.setCurrentTool("select");
            // First fill from the page, then listen for the user's changes.
            for (const inst of latest.current.roots) {
              const pos = latest.current.positions[inst.id] ?? { x: 0, y: 0 };
              syncShape(editor, inst, pos, latest.current.transforms);
            }
            editor.setSelectedShapes(latest.current.selectedIds.map(shapeIdFor));

            // editor → page, user changes only. `shapeIdToInstanceId` maps
            // either shape type back to its instance id through the ONE id
            // scheme both share (`shapeIdFor`) — no per-type lookup table.
            // There is no re-entrancy flag to check here — see this file's
            // header comment for why one would guard nothing — the diff
            // checks below are what keep a page-driven write from reading
            // back as new user intent. Iterates `cur.roots`, not
            // `cur.instances`: a member never gets its own shape, so
            // looking one up would just fall through `if (!s) continue`
            // every time — walking roots only skips that dead lookup.
            const onUserChange = () => {
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
                  // tldraw's own `shape.x,y` is an origin-pivot point, not
                  // the top-left the rest of the page (and the other two
                  // renders) mean by `positions` — see `centrePivotFor`'s
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

                  // Rotation: the stock rotate handle wrote `shape.rotation`
                  // directly — read it back into degrees, rounded to 1dp
                  // (docs/GLYPH-PLAN.md's contract) and normalised into the
                  // (-180, 180] domain `HOST_FIELDS`' rotation row declares
                  // (`normalizeDeg`'s own doc comment — tldraw's own [0,2π)
                  // domain would otherwise clamp every angle past half a
                  // turn to the row's max on one scrub), and only when it
                  // actually disagrees with what the page already has —
                  // this diff check (not a re-entrancy flag, see the header
                  // comment) is what keeps a page-driven write, and a
                  // rounding-induced ping-pong, from firing a second update
                  // for the same angle.
                  const wantDeg = cur.transforms[inst.id]?.rotation ?? 0;
                  const haveDeg = normalizeDeg(Math.round((glyphShape.rotation / DEG) * 10) / 10);
                  if (Math.abs(wantDeg - haveDeg) > 0.05) {
                    nextTransforms ??= { ...cur.transforms };
                    nextTransforms[inst.id] = { rotation: haveDeg };
                  }

                  // Size (the resize handle) and content (the picker) are
                  // the only two glyph props a canvas itself ever writes —
                  // see `onInstancePropsChange`'s own doc comment for why
                  // this targets ONE instance rather than the whole
                  // selection.
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

              // WHY `shapeBackedSelection`, not the raw `cur.selectedIds`
              // compare HEAD originally had: a member (a Port inside a
              // Stack) is selected on the page but has no shape, so a shape
              // list derived from `getSelectedShapeIds()` can never contain
              // it — comparing straight against `cur.selectedIds` read that
              // as a permanent mismatch and kept firing `onSelectionChange`,
              // clearing the member selection on the very next tick. See
              // `shapeBackedSelection`'s own doc comment.
              const ids = editor
                .getSelectedShapeIds()
                .map((id) => shapeIdToInstanceId.get(id))
                .filter((id): id is string => !!id)
                .sort();
              if (ids.join("|") !== shapeBackedSelection(editor, cur.selectedIds)) cur.onSelectionChange(ids);
            };
            const stop = editor.store.listen(onUserChange, { source: "user", scope: "document" });
            const stopSel = editor.store.listen(onUserChange, { source: "user", scope: "session" });
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
