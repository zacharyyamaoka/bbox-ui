// src/chrome/ContextualPopupMenu/floatingToolbar.tsx — the FigJam-style pill that follows the
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
import { FloatingToolbar, PILL_POPOVER } from "@trunk/components/floatingToolbar";
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

import {
  ArrangeCluster,
  CELL_ICON,
  CELL_TRIGGER,
  EdgeTypeCluster,
  FocusButton,
  GroupCluster,
  OpacityCluster,
  PILL_SEPARATOR,
  StyleCluster,
  TriggerChevron,
  TunnelCluster,
} from "./selectionClusters";
import { useInterfaceScale } from "../ShareMenu";
import type { CodeLanguage } from "../../shapes/code";
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
 * Measured against `src/chrome/Toolbar/dock.tsx`: the dock is one `h-9` row of tool
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
  // The pill is placed by a MEASURED loop and writes its position as an
  // inline transform, so it cannot be scaled from a stylesheet — see
  // `FloatingToolbarProps.scale`. The factor rides in as a prop and is
  // composed into that same transform.
  const interfaceScale = useInterfaceScale();
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
      scale={interfaceScale}
      maxWidth={geometry ? floatingToolbarMaxWidth({ w: geometry.vw, h: geometry.vh }, interfaceScale) : undefined}
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
          className="h-10 shrink-0 bg-white/10"
        >
          {BLOCK_VIEWS.map((view) => (
            <ToggleGroupItem
              key={view.id}
              value={view.id}
              title={view.hint}
              // WHY the pressed colours are restated here: `toggleVariants`
              // paints a pressed item `bg-muted` with the page's normal
              // foreground text (toggle.tsx:17), which assumes a LIGHT
              // surface, and this pill is a FIXED #1e1e1e in both colour
              // schemes. The first version of this fix used
              // `text-background`/`bg-background`, which was right only while
              // the pill inverted the page — in dark mode `--background` is
              // near-black and the pressed chip went black-on-black. Literals
              // against the literal surface have no theme left to be wrong in.
              // `#9747ff` is FigJam's traced accent for a LABELLED chip
              // (figjamTokens.ts:17), as opposed to #8a38f5 for an icon cell.
              className="h-10 rounded-[5px] px-3 text-[11px] font-normal text-white aria-pressed:bg-[#9747ff] aria-pressed:text-white hover:bg-[#383838] hover:text-white"
            >
              {view.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}

      {subject.codeLanguage !== null ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" className={`${CELL_TRIGGER} pr-2 pl-3`} />}
            data-testid="ss-selection-language"
            aria-label="Code language"
          >
            {CODE_LANGUAGES.find((language) => language.id === subject.codeLanguage)?.label ?? subject.codeLanguage}
            <TriggerChevron />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className={`w-48 ${PILL_POPOVER} p-2`}
            // `DropdownMenuContent` writes its radius as an INLINE style
            // (`dropdown-menu.tsx:178`, the skin seam), and an inline style
            // beats any class — so `rounded-[13px]` inside PILL_POPOVER can
            // never reach it and the popover has to be told here.
            style={{ borderRadius: "13px" }}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px] text-white/60">Language</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={subject.codeLanguage}
                onValueChange={(next) => onLanguage(next as CodeLanguage)}
              >
                {CODE_LANGUAGES.map((language) => (
                  <DropdownMenuRadioItem
                    key={language.id}
                    value={language.id}
                    className="rounded-[5px] text-[11px] text-white data-highlighted:bg-[#383838] data-highlighted:text-white"
                  >
                    {language.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* The style bar. Which rows it shows is `getSharedStyles()`' answer and
          nothing else, so it needs no condition here.

          SUPERSEDED BY P-035, and worth stating because the old note read as a
          guarantee: this used to say the cluster "renders ONLY for a selection
          made entirely of tldraw's own shapes… mutually exclusive by
          construction". That was never construction — it was arithmetic that
          happened to hold while no `ss-*` shape declared a style. `ss:diff`
          (shapes/shared/diffMark.ts) is declared on `ss-block`, `ss-port` and
          `ss-wire`, so this cluster now renders ONE row, Diff, right beside
          the block-view toggle above. Deliberate: marking the block you are
          looking at is the same gesture as changing its view. The six tldraw
          rows still never appear here, because no `ss-*` shape carries them. */}
      <StyleCluster />

      {/* P-008. Unlike the two rows above, this one is NOT gated on a lone
          selection: routing is a property of a cable, not a face, so selecting
          a bundle and re-routing all of it in one press is most of the point.
          `EdgeTypeCluster` hides itself when no cable is selected, so it needs
          no condition here — the same contract Arrange and Focus follow. */}
      <EdgeTypeCluster wires={subject.wires} routing={subject.wireRouting} />

      {/* P-023. Beside the edge type and on the same contract: it hides itself
          when no cable is selected, and it writes only to the cables. */}
      <TunnelCluster wires={subject.wires} tunnel={subject.wireTunnel} layer={subject.wireLayer} />

      {subject.blockView !== null || subject.codeLanguage !== null || subject.wires.length > 0 ? (
        <ToolbarSeparator className={PILL_SEPARATOR} />
      ) : null}

      {/* Arrange, opacity and Focus are TRUE OF EVERY SHAPE — a Block, a Code
          cell, a geo box, a mixed bag of all three — so unlike the rows above
          they carry no `subject` condition at all. Each one hides itself when
          the selection cannot use it (`arrangeGroupsFor(0)` is empty; opacity
          and Focus need something selected). */}
      <ArrangeCluster />
      <OpacityCluster />
      <FocusButton />
      {/* P-048. Beside Focus and not behind Arrange: folding a selection into
          a region is a STRUCTURAL edit, not an alignment, and it is the one
          gesture Zach called "the bread and butter of what we are doing here".
          `GroupCluster` renders one cell or none, so it costs the bar the same
          32px whichever way the selection reads. */}
      <GroupCluster />

      {/* A rule on the bar's FULL height, `rgb(56,56,56)` — traced. The kit's
          own `ToolbarSeparator` defaults to `bg-border`, a page token, which
          on a fixed dark pill draws a light-theme hairline. */}
      <ToolbarSeparator className={PILL_SEPARATOR} />

      <ToolbarButton
        data-testid="ss-selection-duplicate"
        aria-label="Duplicate"
        title="Duplicate"
        className={CELL_ICON}
        onClick={() => duplicateSelection(editor)}
      >
        <Copy />
      </ToolbarButton>
      <ToolbarButton
        data-testid="ss-selection-delete"
        aria-label="Delete"
        title="Delete"
        className={CELL_ICON}
        onClick={() => deleteSelection(editor)}
      >
        <Trash2 />
      </ToolbarButton>
    </FloatingToolbar>
  );
}
