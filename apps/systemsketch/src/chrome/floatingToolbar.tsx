// src/chrome/floatingToolbar.tsx — the FigJam-style pill that follows the
// selection, and the placement LOOP the kit deliberately refuses to own.
//
// `@trunk/components/floatingToolbar` is paint only: it takes `x`, `y`,
// `side`, `visible` and draws them. Everything that makes those four values
// true — measuring the rendered pill, reading the selection and viewport in
// screen space, deciding when a drag means "get out of the way", and keeping
// an async placement from landing out of order — is the host's job, spelled
// out step by step in docs/menus/MENU-KIT-DESIGN.md §4 ("Floating toolbar:
// host runs the loop the kit refuses to own"). THIS FILE IS THAT HOST. The
// seven steps below are numbered against that list.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useEditor, useValue } from "tldraw";

import { Button } from "@trunk/components/button";
import { FloatingToolbar } from "@trunk/components/floatingToolbar";
import {
  SELECTION_OVERLAY_INSET,
  floatingToolbarMaxWidth,
  isSelectionOnScreen,
  placeFloatingToolbar,
  type SelectionMenuSide,
} from "@trunk/components/floatingToolbar.placement";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@trunk/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@trunk/components/toggle-group";
import { ToolbarButton, ToolbarSeparator } from "@trunk/components/toolbar";

import { ArrangeCluster, FocusButton, OpacityCluster, StyleCluster } from "./selectionClusters";
import type { CodeLanguage } from "../shapes/code";
import {
  BLOCK_VIEWS,
  CODE_LANGUAGES,
  type BlockView,
  deleteSelection,
  duplicateSelection,
  selectionSubjectOf,
  setBlockView,
  setCodeLanguage,
} from "./selectionActions";

/**
 * How much of the viewport's bottom edge belongs to the tool dock, in screen
 * px, handed to `placeFloatingToolbar` as its `bottomObstacleTop`.
 *
 * Measured against `src/chrome/dock.tsx`: the dock is one `h-9` row of tool
 * cells inside a rounded `ToolDock` shell, sitting on
 * `calc(var(--tl-space-3) + var(--tl-sab))` of bottom padding. 96px covers
 * that plus the pill's own 20px margin with room to spare — the value only
 * ever matters for a selection so low on the screen that the pill would
 * otherwise be drawn UNDER the dock, and erring high there costs nothing
 * while erring low costs an unreachable button.
 */
const DOCK_OBSTACLE_HEIGHT = 96;

/** The pill's own resolved placement. `null` = nothing has been placed for
 *  the current selection yet, which is NOT the same as "placed off-screen". */
interface Placement {
  x: number;
  y: number;
  side: SelectionMenuSide;
}

export function FloatingSelectionToolbar() {
  const editor = useEditor();
  const pill = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [placement, setPlacement] = useState<Placement | null>(null);
  /**
   * STEP 5 — the monotonic pass counter, ported in spirit from the donor's
   * `placementPass` (/home/bam/systemsketch/src/chrome/SelectionContextualMenu.tsx).
   * `placeFloatingToolbar` resolves in a microtask, so two passes started in
   * the same tick can settle in either order; without this guard the LOSER
   * writes last and the pill lands where the selection used to be.
   */
  const pass = useRef(0);

  const subject = useValue("ss selection subject", () => selectionSubjectOf(editor), [editor]);

  /**
   * STEP 2 — selection and viewport, in screen space, translated into the
   * coordinate space this pill is actually positioned in.
   *
   * `getSelectionRotatedScreenBounds()` is in DOCUMENT space: `pageToScreen`
   * adds `screenBounds.x/y`, the editor container's own offset in the page
   * (Editor.mjs `pageToScreen`). The pill is absolutely positioned inside
   * `.tl-canvas__in-front`, which is `inset: 0` of that same container — so
   * subtracting the container's offset is exactly the conversion, and it is
   * a no-op only in the full-bleed case.
   */
  const geometry = useValue(
    "ss selection screen geometry",
    () => {
      const bounds = editor.getSelectionRotatedScreenBounds();
      if (!bounds) return null;
      const viewport = editor.getViewportScreenBounds();
      return {
        x: bounds.x - viewport.x,
        y: bounds.y - viewport.y,
        w: bounds.w,
        h: bounds.h,
        vw: viewport.w,
        vh: viewport.h,
      };
    },
    [editor],
  );

  /**
   * STEP 4 — the manipulation gate. A pill that follows the shape you are
   * dragging is a pill that is always under your cursor; FigJam hides it for
   * the length of the gesture and brings it back where the shape landed.
   */
  const manipulating = useValue(
    "ss manipulating",
    () => editor.isIn("select.translating") || editor.isIn("select.resizing") || editor.isIn("select.brushing"),
    [editor],
  );

  /**
   * STEP 1 — measure the RENDERED pill. The kit's component takes a `ref` for
   * exactly this and measures nothing itself (its own "no self-measurement"
   * rule). The guard keeps an identical measurement from re-rendering.
   */
  useLayoutEffect(() => {
    const node = pill.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize((previous) =>
        previous.w === rect.width && previous.h === rect.height ? previous : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const selected = subject.ids.length > 0 && geometry !== null;

  /** STEP 3 + 6 — place, and re-place on every input that can change it:
   *  camera, selection, the pill's own size, the viewport's size. Each one of
   *  those is a dependency below, so React re-runs this for free rather than
   *  this file subscribing to four things by hand. */
  useEffect(() => {
    if (!selected || !geometry || manipulating || size.w === 0 || size.h === 0) {
      setPlacement((previous) => (previous === null ? previous : null));
      return;
    }
    const ticket = ++pass.current;
    void placeFloatingToolbar({
      selection: { x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h },
      menu: { w: size.w, h: size.h },
      viewport: { w: geometry.vw, h: geometry.vh },
      bottomObstacleTop: geometry.vh - DOCK_OBSTACLE_HEIGHT,
      // tldraw's own measured stand-off — its handles sit on the box corners,
      // 5px outside. The kit refuses to assume it (its own module header).
      overlayInset: SELECTION_OVERLAY_INSET,
    }).then((next) => {
      if (ticket !== pass.current) return;
      setPlacement((previous) =>
        previous && previous.x === next.x && previous.y === next.y && previous.side === next.side ? previous : next,
      );
    });
  }, [selected, geometry, manipulating, size.w, size.h]);

  const visible =
    selected
    && !manipulating
    && placement !== null
    && geometry !== null
    && isSelectionOnScreen(
      { x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h },
      { w: geometry.vw, h: geometry.vh },
    );

  const onView = useCallback(
    (view: BlockView) => {
      const id = subject.only?.id;
      if (id) setBlockView(editor, id, view);
    },
    [editor, subject.only?.id],
  );

  const onLanguage = useCallback(
    (language: CodeLanguage) => {
      const id = subject.only?.id;
      if (id) setCodeLanguage(editor, id, language);
    },
    [editor, subject.only?.id],
  );

  return (
    <FloatingToolbar
      ref={pill}
      x={placement?.x ?? 0}
      y={placement?.y ?? 0}
      side={placement?.side ?? "above"}
      visible={visible}
      maxWidth={geometry ? floatingToolbarMaxWidth({ w: geometry.vw, h: geometry.vh }) : undefined}
      aria-label="Selection actions"
      // WHY the pointer-events class is conditional rather than always on:
      // `.ss-chrome` is `pointer-events: none` so the canvas stays clickable
      // through the chrome layer, and each surface opts itself back in. The
      // kit already sets `pointer-events-none` on the hidden pill, and a
      // permanent `pointer-events-auto` here would win the cascade and leave
      // an invisible pill answering hit tests over the canvas — the exact
      // failure `floatingToolbar.tsx`'s own "opacity, never display:none"
      // comment describes from the other side.
      className={visible ? "pointer-events-auto" : undefined}
    >
      {subject.blockView !== null ? (
        <ToggleGroup
          // The block's three faces. `ss-selection-view` is the test id the
          // acceptance suite names; the kit stamps no id of its own here
          // because the segmented control is host-composed content.
          data-testid="ss-selection-view"
          value={[subject.blockView]}
          spacing={0}
          size="sm"
          onValueChange={(next) => {
            // Base UI allows deselecting to `[]` in single-select mode; a
            // view is never absent, so an empty next value is ignored — the
            // same rule `problemsPanel.tsx` applies to its filter row.
            if (next.length > 0) onView(String(next[0]) as BlockView);
          }}
          aria-label="Block view"
          className="bg-background/15"
        >
          {BLOCK_VIEWS.map((view) => (
            <ToggleGroupItem
              key={view.id}
              value={view.id}
              title={view.hint}
              // WHY the pressed colours are restated here: `toggleVariants`
              // paints a pressed item `bg-muted` with the page's normal
              // foreground text (toggle.tsx:17), which assumes a LIGHT
              // surface. This pill is `bg-foreground text-background` — a
              // dark bar — so the stock pressed state put near-white text on
              // a near-white chip and the active view became unreadable
              // (measured in the running app, capture 02). Inverting the
              // pair keeps the same "the pressed one is the solid one"
              // reading against a dark background.
              className="text-background aria-pressed:bg-background aria-pressed:text-foreground hover:bg-background/20 hover:text-background"
            >
              {view.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}

      {subject.codeLanguage !== null ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" className="text-background hover:text-foreground" />}
            data-testid="ss-selection-language"
            aria-label="Code language"
          >
            {CODE_LANGUAGES.find((language) => language.id === subject.codeLanguage)?.label ?? subject.codeLanguage}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Language</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={subject.codeLanguage}
                onValueChange={(next) => onLanguage(next as CodeLanguage)}
              >
                {CODE_LANGUAGES.map((language) => (
                  <DropdownMenuRadioItem key={language.id} value={language.id}>
                    {language.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* The tldraw style bar. It renders ONLY for a selection made entirely
          of tldraw's own shapes, so it can never appear beside the block-view
          toggle above — a selection is one or the other, never both. The two
          rows above and this one are therefore mutually exclusive by
          construction rather than by an `else`. */}
      <StyleCluster />

      {subject.blockView !== null || subject.codeLanguage !== null ? <ToolbarSeparator /> : null}

      {/* Arrange, opacity and Focus are TRUE OF EVERY SHAPE — a Block, a Code
          cell, a geo box, a mixed bag of all three — so unlike the rows above
          they carry no `subject` condition at all. Each one hides itself when
          the selection cannot use it (`arrangeGroupsFor(0)` is empty; opacity
          and Focus need something selected). */}
      <ArrangeCluster />
      <OpacityCluster />
      <FocusButton />

      <ToolbarSeparator />

      <ToolbarButton
        data-testid="ss-selection-duplicate"
        aria-label="Duplicate"
        title="Duplicate"
        className="text-background"
        onClick={() => duplicateSelection(editor)}
      >
        <Copy />
      </ToolbarButton>
      <ToolbarButton
        data-testid="ss-selection-delete"
        aria-label="Delete"
        title="Delete"
        className="text-background"
        onClick={() => deleteSelection(editor)}
      >
        <Trash2 />
      </ToolbarButton>
    </FloatingToolbar>
  );
}
