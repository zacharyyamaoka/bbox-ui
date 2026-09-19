"use client";

// src/components/framesPanel.tsx — the Frames panel body
// (docs/menus/screenshots/06: "BOARD NAVIGATION · Frames · 46 items", a
// density toggle, a "Save current camera view" form, then reorderable rows
// — grip, thumbnail, kind icon, title).
//
// Ported from /home/bam/systemsketch/src/chrome/BoardOverview.tsx (the
// donor's `BoardOverview` component) and
// /home/bam/systemsketch/src/chrome/framesPanelModel.ts (the pure geometry,
// already carried into this app's own `framesOrder.ts` by a sibling lane —
// see that file's own provenance header for the `moveItemKey`/`ordered`/
// `intersects`/`clip` byline). What's ported HERE is the presentation shell
// around that geometry: the header/intro/save-form/list layout, the
// `PanelPreview` SVG thumbnail (BoardOverview.tsx:41-55, verbatim geometry —
// 168×92 viewBox, 154×69 fit box, 7px inset, 2px minimum shape size, the
// circle+cross empty mark), and the row shape (grip · preview · name ·
// menu).
//
// Deliberately NOT ported: `itemName`/`focusItem`/`renameItem` and the raw
// HTML5 `draggable`/`onDragStart`/`onDragOverCapture`/`onDropCapture` wiring
// (BoardOverview.tsx:66-83, :95-102) — every one of those reaches into a
// tldraw `Editor`/`FramesPanelItem` union directly, which is exactly the
// canvas-engine coupling CLAUDE.md's "the core imports no canvas engine"
// rules out. This file takes plain `FramesItem` data and callbacks instead.
//
// WHY dnd-kit lives INSIDE this component rather than being a `dragHandleProps`
// seam the host wires up itself: dnd-kit is a headless DOM drag toolkit, not
// a canvas engine (tldraw/@xyflow are the two things that rule stays about —
// see CLAUDE.md), and it is already this trunk's own house style for a
// reorderable list — `blockMembers.tsx`'s `MemberDndBoundary` (PointerSensor
// at a 4px activation distance, `closestCenter`, mounted only when a change
// callback is actually supplied) is copied here by the same pattern rather
// than re-invented. The public surface stays a single `onReorder(nextKeys)`
// callback — the host never sees `active`/`over` ids or has to reimplement
// index math, it just receives the next order and decides whether/how to
// persist it (a page's `meta`, `localStorage`, nothing).
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LayoutGrid, MoreHorizontal, Rows3 } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { moveItemKey } from "./framesOrder";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { InlineRename } from "./inlineRename";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface PanelPreviewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FramesPanelPreview {
  /** The local target bounds, or the page area visible through a saved camera. */
  viewport: PanelPreviewBox;
  /** Page shapes intersecting that local view, in the same coordinate space. */
  shapes: readonly PanelPreviewBox[];
}

export interface FramesItem {
  key: string;
  /** Host vocabulary — "frame", "branch", "expanded-block", anything. Looked
   *  up in `kinds` for its icon and display caption. */
  kind: string;
  label: string;
  preview?: FramesPanelPreview;
  /**
   * Fallback caption drawn in the thumbnail when `kind` has no entry in
   * `kinds` — an unrecognized kind still renders something instead of a
   * blank corner, the same "never silently drop authored text" instinct as
   * the rest of this kit's truthful-rendering rule. When `kinds[kind]`
   * exists its `caption` wins instead (see `resolveCaption` below) — that
   * override table is precisely what fixes the donor's raw
   * `"EXPANDED-BLOCK"` (`item.target.kind.toUpperCase()`) into real words.
   */
  caption: string;
}

export interface FramesKindMeta {
  icon: ReactNode;
  caption: string;
}

export type FramesPanelMode = "cards" | "list";

export interface FramesPanelSaveView {
  suggestedName: string;
  onSave(name: string): { ok: boolean; reason?: string };
}

export interface FramesPanelReorder {
  /** Fires once with the complete, duplicate-free next key order. The host
   *  decides whether/how to persist it — this component never does. */
  onReorder(nextKeys: string[]): void;
}

export interface FramesPanelProps {
  items: readonly FramesItem[];
  /** Keyed by `FramesItem.kind`. `// fixes "EXPANDED-BLOCK"` — see `FramesItem.caption`. */
  kinds: Readonly<Record<string, FramesKindMeta>>;
  mode: FramesPanelMode;
  onModeChange(mode: FramesPanelMode): void;
  /** Disables the save-view form and every row mutation (rename/delete/reorder). */
  readOnly?: boolean;
  /** Disables JUST reordering — e.g. the host's order metadata is in an
   *  unrecognized shape and refuses to be rewritten (`framesOrder.ts`'s
   *  `"protected"` state). Independent of `readOnly`: a document can be
   *  fully writable while its stored order stays untouchable. */
  reorderLocked?: boolean;
  /**
   * WHY this gates only the save-view FORM, not a per-item lock (the design
   * doc's own sketch has no per-item lock field, and `kind` is host
   * vocabulary this component has no reason to special-case): the one
   * landmark-specific affordance the panel itself owns is creating a new
   * saved view. Protecting an EXISTING saved-view item's rename/delete is
   * exactly what `onRename`'s `{ok, reason}` return already carries —
   * the host's callback can refuse a specific item without this component
   * ever needing to know which items are landmarks.
   */
  landmarksLocked?: boolean;
  /** Status lines rendered above the list — read-only doc, protected order,
   *  protected landmark metadata, whatever the host has to say right now. */
  notices?: readonly string[];
  onFocus(key: string): void;
  onRename(
    key: string,
    next: string,
  ): Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string };
  onDelete?(key: string): void;
  saveView?: FramesPanelSaveView;
  reorder?: FramesPanelReorder;
}

/* ------------------------------------------------------------------ */
/* PanelPreview — the SVG thumbnail, its own export                    */
/* ------------------------------------------------------------------ */

function clipToViewport(box: PanelPreviewBox, viewport: PanelPreviewBox): PanelPreviewBox | null {
  const left = Math.max(box.x, viewport.x);
  const top = Math.max(box.y, viewport.y);
  const right = Math.min(box.x + box.w, viewport.x + viewport.w);
  const bottom = Math.min(box.y + box.h, viewport.y + viewport.h);
  return right > left && bottom > top ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

export interface PanelPreviewProps {
  /** This item's display name — the empty-state announcement and the SVG's `aria-label`. */
  label: string;
  /** Uppercase text drawn bottom-left inside the thumbnail (already resolved via `kinds`). */
  caption: string;
  preview?: FramesPanelPreview;
}

/**
 * Ported verbatim geometry from `BoardOverview.tsx:41-55`'s `PanelPreview`:
 * a 168×92 viewBox, the content fit into a 154×69 box (min of width/height
 * scale) inset 7px, a minimum 2px per drawn shape so nothing vanishes at
 * scale, and the circle+cross empty mark when a card has no shapes at all.
 *
 * Design decision #8 (docs/menus/MENU-KIT-DESIGN.md §8): the donor computed
 * a landmark's preview viewport from the CURRENT WINDOW size
 * (`getFramesPanelPreviews`'s `screen.w / camera.z`), which means the same
 * saved view can crop differently depending on how wide the window happens
 * to be when it's drawn — "probably a latent bug." Taking `preview` as
 * plain data here (rather than this component measuring anything itself)
 * leaves that question entirely host-side, which is the deliberate point:
 * a host adapter can fix the window-size coupling or preserve it, and this
 * component can't tell the difference either way.
 */
export function PanelPreview({ label, caption, preview }: PanelPreviewProps) {
  const viewport = preview?.viewport ?? { x: 0, y: 0, w: 1, h: 1 };
  const scale = Math.min(154 / Math.max(1, viewport.w), 69 / Math.max(1, viewport.h));
  const width = viewport.w * scale;
  const height = viewport.h * scale;
  const offsetX = 7 + (154 - width) / 2;
  const offsetY = 7 + (69 - height) / 2;
  return (
    <svg
      className="h-[46px] w-[84px] shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
      viewBox="0 0 168 92"
      role="img"
      aria-label={`${label} preview`}
    >
      <path
        d="M0 23H168M0 46H168M0 69H168M42 0V92M84 0V92M126 0V92"
        className="stroke-border"
        strokeWidth="1"
        fill="none"
      />
      <rect
        x={offsetX}
        y={offsetY}
        width={width}
        height={height}
        rx="3"
        className="fill-primary/15 stroke-primary"
        strokeWidth="1.5"
      />
      {preview?.shapes.length ? (
        preview.shapes.map((shape, index) => {
          const visible = clipToViewport(shape, viewport);
          if (!visible) return null;
          return (
            <rect
              key={`${shape.x}-${shape.y}-${index}`}
              x={offsetX + (visible.x - viewport.x) * scale}
              y={offsetY + (visible.y - viewport.y) * scale}
              width={Math.max(2, visible.w * scale)}
              height={Math.max(2, visible.h * scale)}
              rx="2"
              className="fill-primary/60"
            />
          );
        })
      ) : (
        <>
          <circle cx="84" cy="40" r="13" className="stroke-muted-foreground/50" strokeWidth="1.5" fill="none" />
          <path d="M84 23v34M67 40h34" className="stroke-muted-foreground/50" strokeWidth="1.5" />
        </>
      )}
      <text x="8" y="85" className="fill-muted-foreground text-[7px] font-semibold tracking-wide uppercase">
        {caption}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                  */
/* ------------------------------------------------------------------ */

function resolveCaption(item: FramesItem, kinds: FramesPanelProps["kinds"]): string {
  return kinds[item.kind]?.caption ?? item.caption;
}

interface RowContentProps {
  item: FramesItem;
  mode: FramesPanelMode;
  kinds: FramesPanelProps["kinds"];
  mutationLocked: boolean;
  onFocus(key: string): void;
  onRename: FramesPanelProps["onRename"];
  onDelete?(key: string): void;
}

function RowContent({ item, mode, kinds, mutationLocked, onFocus, onRename, onDelete }: RowContentProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kindMeta = kinds[item.kind];

  async function commitRename(next: string) {
    const result = await onRename(item.key, next);
    if (result.ok) {
      setError(null);
      setEditing(false);
    } else {
      setError(result.reason ?? null);
    }
  }

  return (
    <>
      {mode === "cards" ? (
        <button
          type="button"
          data-slot="frames-panel-preview-button"
          onClick={() => onFocus(item.key)}
          className="shrink-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PanelPreview label={item.label} caption={resolveCaption(item, kinds)} preview={item.preview} />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {kindMeta ? (
          <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-primary [&>svg]:size-4">
            {kindMeta.icon}
          </span>
        ) : null}
        {editing ? (
          <InlineRename
            value={item.label}
            onCommit={commitRename}
            onCancel={() => {
              setError(null);
              setEditing(false);
            }}
            error={error}
            size="row"
            aria-label={`Rename ${item.label}`}
            className="min-w-0 flex-1"
          />
        ) : (
          <button
            type="button"
            data-slot="frames-panel-item-name"
            title={`Focus ${item.label}`}
            onClick={() => onFocus(item.key)}
            className="min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {item.label}
          </button>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${item.label}`}
              title={`Actions for ${item.label}`}
              className="shrink-0"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onFocus(item.key)}>Focus</DropdownMenuItem>
          <DropdownMenuItem disabled={mutationLocked} onClick={() => setEditing(true)}>
            Rename
          </DropdownMenuItem>
          {onDelete ? (
            <DropdownMenuItem
              variant="destructive"
              disabled={mutationLocked}
              onClick={() => onDelete(item.key)}
            >
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

interface FrameRowProps extends RowContentProps {
  sortable: boolean;
}

/** Static row — no drag machinery mounted at all (readOnly / reorderLocked / a single-item list). */
function StaticFrameRow(props: FrameRowProps) {
  return (
    <li
      data-slot="frames-panel-item"
      data-kind={props.item.kind}
      className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0"
    >
      {/* Same six-dot glyph as the sortable row's grip, just inert — a
          reorder-disabled list (readOnly/reorderLocked/a single item) still
          shows the grip's shape so cards/list rows line up identically,
          it simply isn't `cursor-grab` or wired to a sensor. */}
      <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center text-muted-foreground/30">
        <GripVertical className="size-3.5" />
      </span>
      <RowContent {...props} />
    </li>
  );
}

/** Sortable row — dnd-kit's `useSortable`, mirroring `blockMembers.tsx`'s `SortableMemberSlot`. */
function SortableFrameRow(props: FrameRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.key,
  });
  return (
    <li
      ref={setNodeRef}
      data-slot="frames-panel-item"
      data-kind={props.item.kind}
      data-dragging={isDragging || undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex items-center gap-2.5 border-b border-border bg-popover px-3 py-2.5 last:border-b-0"
    >
      <span
        aria-hidden="true"
        title="Drag to reorder"
        className="grid size-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </span>
      <RowContent {...props} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Save-current-view form                                              */
/* ------------------------------------------------------------------ */

function SaveViewForm({ saveView, disabled }: { saveView: FramesPanelSaveView; disabled: boolean }) {
  const [name, setName] = useState(saveView.suggestedName);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  // Mirrors the donor's `if (!name) setName(suggested)`: once the person
  // has typed anything, a fresh `suggestedName` (the host's "View 2", "View
  // 3", … counter advancing after a save) never clobbers their draft.
  useEffect(() => {
    if (!touched) setName(saveView.suggestedName);
  }, [saveView.suggestedName, touched]);

  return (
    <form
      className="flex flex-col gap-1.5 border-b border-border px-3.5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const result = saveView.onSave(name);
        if (result.ok) {
          setTouched(false);
          setError(null);
        } else {
          setError(result.reason ?? null);
        }
      }}
    >
      <label htmlFor={inputId} className="text-xs font-medium text-foreground">
        Save current camera view
      </label>
      <div className="flex gap-1.5">
        <input
          id={inputId}
          value={name}
          disabled={disabled}
          maxLength={80}
          onChange={(event) => {
            setTouched(true);
            setName(event.currentTarget.value);
            setError(null);
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <Button type="submit" size="sm" disabled={disabled}>
          Save
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                               */
/* ------------------------------------------------------------------ */

function ModeToggle({ mode, onModeChange }: { mode: FramesPanelMode; onModeChange(mode: FramesPanelMode): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Frames panel view options"
          />
        }
      >
        <LayoutGrid className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => onModeChange(value as FramesPanelMode)}>
          <DropdownMenuRadioItem value="cards">Thumbnail cards</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">Compact list</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* FramesPanel                                                         */
/* ------------------------------------------------------------------ */

export function FramesPanel({
  items,
  kinds,
  mode,
  onModeChange,
  readOnly,
  reorderLocked,
  landmarksLocked,
  notices,
  onFocus,
  onRename,
  onDelete,
  saveView,
  reorder,
}: FramesPanelProps) {
  const sortable = Boolean(reorder) && !readOnly && !reorderLocked && items.length > 1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!reorder || !over || over.id === active.id) return;
    const keys = items.map((item) => item.key);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    // `moveItemKey` (framesOrder.ts, ported from framesPanelModel.ts:86-102)
    // wants an explicit before/after — dnd-kit's `over` only tells us WHICH
    // slot the pointer is over, so the sign of the index delta stands in
    // for the donor's pointer-Y-vs-midpoint check (`placementFor` in
    // BoardOverview.tsx:95): dragging downward inserts after the target,
    // dragging upward inserts before it.
    const position = from < to ? "after" : "before";
    const next = moveItemKey(keys, String(active.id), String(over.id), position);
    if (next) reorder.onReorder(next);
  }

  const rowProps = (item: FramesItem): FrameRowProps => ({
    item,
    mode,
    kinds,
    mutationLocked: Boolean(readOnly),
    onFocus,
    onRename,
    onDelete,
    sortable,
  });

  const list =
    items.length === 0 ? (
      <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center" data-testid="frames-panel-empty">
        <Rows3 className="size-6 text-muted-foreground/50" aria-hidden="true" />
        <strong className="text-sm text-foreground">No frames or saved views yet</strong>
        <p className="text-xs text-muted-foreground">Add a Frame or save the current camera view.</p>
      </div>
    ) : (
      <ul data-slot="frames-panel-items" data-mode={mode}>
        {items.map((item) =>
          sortable ? (
            <SortableFrameRow key={item.key} {...rowProps(item)} />
          ) : (
            <StaticFrameRow key={item.key} {...rowProps(item)} />
          ),
        )}
      </ul>
    );

  return (
    <div data-slot="frames-panel" className="flex flex-col">
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3.5">
        <div className="min-w-0">
          <span className="block text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Board navigation
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <h3 className="text-base font-semibold text-foreground">Frames</h3>
            <span className="text-xs text-muted-foreground">{items.length} items</span>
          </div>
        </div>
        <ModeToggle mode={mode} onModeChange={onModeChange} />
      </div>
      <p className="px-3.5 pt-1.5 pb-3 text-sm text-muted-foreground">
        Frames, regions, and saved camera views in one navigable order.
      </p>
      {saveView ? <SaveViewForm saveView={saveView} disabled={Boolean(readOnly) || Boolean(landmarksLocked)} /> : null}
      {notices?.length
        ? notices.map((notice, index) => (
            <p key={index} role="status" className="border-b border-border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
              {notice}
            </p>
          ))
        : null}
      {sortable ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        list
      )}
    </div>
  );
}
