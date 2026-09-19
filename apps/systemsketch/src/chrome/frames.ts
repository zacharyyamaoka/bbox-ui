// src/chrome/frames.ts — the Frames panel's model: every place on this board
// that CONTAINS other places.
//
// EVERYTHING IS A BLOCK, so this list is not a list of a separate "frame"
// kind. It is the two shapes that are frame-like in this document: an
// `ss-region` (always) and an `ss-block` in its `expanded` view (which is
// exactly when `BlockShapeUtil` reports `isFrameLike`). A Block in `simple`
// or `port` view holds nothing, so it is not a place you can navigate INTO
// and has no row here.
//
// NEVER MIX DATA AND CONTROL LINES shows up here as what this file reads:
// containment, and only containment. A region's contents and an expanded
// Block's members are `parentId` children; nothing below looks at a wire.
import { useCallback, useMemo } from "react";
import { useValue, type Editor, type TLShape, type TLShapeId } from "tldraw";

import type { FramesItem, FramesPanelPreview, PanelPreviewBox } from "@trunk/components/framesPanel";

import type { BlockShape } from "../shapes/block";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE } from "../shapes/types";

/** The `FramesItem.kind` an expanded Block wears. Region rows use the
 *  region's own `kind` prop (`for`/`while`/`branch`/`plain`) instead, so the
 *  caption can say what KIND of region it is rather than just "region". */
export const EXPANDED_BLOCK_KIND = "expanded-block";

/** How far outside a frame's own box its preview looks. Purely cosmetic:
 *  a little context reads better than a box cropped exactly at its edge. */
const PREVIEW_PADDING = 24;

function boxOf(bounds: { x: number; y: number; w: number; h: number }): PanelPreviewBox {
  return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
}

/**
 * A frame's thumbnail: its own page bounds as the viewport, and the page
 * bounds of everything that intersects them as the content.
 *
 * WHY page bounds rather than the frame's children only: what the thumbnail
 * is FOR is recognising the place, and a person recognises it by what is
 * drawn there — including a neighbour overlapping its edge. `PanelPreview`
 * clips to the viewport itself (`clipToViewport`), so nothing outside the
 * frame can escape the thumbnail.
 *
 * WHY this does NOT use the current window size the way the donor did:
 * `framesPanel.tsx`'s own design decision #8 calls that "probably a latent
 * bug" — the same saved view cropping differently depending on how wide the
 * window happens to be. The frame's own bounds are a property of the
 * document, so this thumbnail is the same on every screen.
 */
function previewOf(editor: Editor, frame: TLShape): FramesPanelPreview | undefined {
  const bounds = editor.getShapePageBounds(frame.id);
  if (!bounds) return undefined;
  const viewport: PanelPreviewBox = {
    x: bounds.x - PREVIEW_PADDING,
    y: bounds.y - PREVIEW_PADDING,
    w: bounds.w + PREVIEW_PADDING * 2,
    h: bounds.h + PREVIEW_PADDING * 2,
  };
  const shapes: PanelPreviewBox[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.id === frame.id) continue;
    const box = editor.getShapePageBounds(shape.id);
    if (!box) continue;
    const intersects =
      box.x < viewport.x + viewport.w
      && box.y < viewport.y + viewport.h
      && box.x + box.w > viewport.x
      && box.y + box.h > viewport.y;
    if (intersects) shapes.push(boxOf(box));
  }
  return { viewport, shapes };
}

function isFrameLike(shape: TLShape): boolean {
  if (shape.type === REGION_SHAPE_TYPE) return true;
  return shape.type === BLOCK_SHAPE_TYPE && (shape as BlockShape).props.view === "expanded";
}

function kindOf(shape: TLShape): string {
  if (shape.type !== REGION_SHAPE_TYPE) return EXPANDED_BLOCK_KIND;
  const kind = (shape.props as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : "plain";
}

function labelOf(shape: TLShape): string {
  const name = (shape.props as { name?: unknown }).name;
  // Truthful rendering: whatever the document says, verbatim. Only a
  // genuinely EMPTY name falls back, and the fallback says so rather than
  // inventing a name that would then look authored.
  return typeof name === "string" && name.length > 0 ? name : "(unnamed)";
}

export interface BoardFrames {
  items: readonly FramesItem[];
  /** Fit the camera to one frame. */
  focus(key: string): void;
  rename(key: string, next: string): { ok: boolean; reason?: string };
  remove(key: string): void;
}

export function useFrames(editor: Editor): BoardFrames {
  // `useValue` over the store, exactly like `useDocumentScene`: this list
  // changes when the document changes and at no other time.
  const items = useValue<readonly FramesItem[]>(
    "ss frames",
    () =>
      editor
        .getCurrentPageShapes()
        .filter(isFrameLike)
        .map((shape) => ({
          key: shape.id,
          kind: kindOf(shape),
          label: labelOf(shape),
          preview: previewOf(editor, shape),
          // Only ever read when `kind` has no entry in the panel's `kinds`
          // table — see `FramesItem.caption`. An unrecognised kind still
          // draws something honest instead of a blank corner.
          caption: kindOf(shape).toUpperCase(),
        })),
    [editor],
  );

  const focus = useCallback(
    (key: string) => {
      const bounds = editor.getShapePageBounds(key as TLShapeId);
      if (!bounds) return;
      // WHY `duration: 0` rather than the default animation: the frames panel
      // is a NAVIGATION surface — the row you clicked is the answer, and an
      // eased fly-through between two places on a board this size reads as
      // lag, not as continuity. The harness pins `animationSpeed` to 0 for
      // the same reason on the test side.
      editor.zoomToBounds(bounds, { inset: 48, animation: { duration: 0 } });
    },
    [editor],
  );

  const rename = useCallback(
    (key: string, next: string) => {
      const shape = editor.getShape(key as TLShapeId);
      if (!shape) return { ok: false, reason: "That frame is no longer on the board." };
      const trimmed = next.trim();
      if (trimmed.length === 0) return { ok: false, reason: "A name cannot be empty." };
      editor.updateShape({ id: shape.id, type: shape.type, props: { name: trimmed } } as never);
      return { ok: true };
    },
    [editor],
  );

  const remove = useCallback(
    (key: string) => {
      editor.deleteShapes([key as TLShapeId]);
    },
    [editor],
  );

  return useMemo(() => ({ items, focus, rename, remove }), [items, focus, rename, remove]);
}
