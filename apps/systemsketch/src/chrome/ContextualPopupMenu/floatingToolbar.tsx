// src/chrome/ContextualPopupMenu/floatingToolbar.tsx — the FigJam-style pill
// that follows the selection: this app's HOST half.
//
// Since B-SHELL-P1 the placement LOOP — measuring the rendered pill, reading
// the selection and viewport in screen space, hiding while a drag runs,
// keeping an async placement from landing out of order — and the two universal
// rows (Duplicate, Delete) are the shell's (`@trunk/shell/shellSelectionPill`,
// lifted from this file at 75991ce), driven by the port's
// `selection().screenBounds`, `viewport()` and `interaction()`. What stays here
// is this app's content: the block-view toggle, the code language, appearance,
// edge type, tunnel, arrange, focus and group clusters (L-PILL owns them
// next), plus the three tldraw-side numbers the loop is fed — the selection
// overlay inset, the dock's obstacle height and the interface scale.
import { useCallback } from "react";
import { useEditor, useValue } from "tldraw";

import { Button } from "@trunk/components/button";
import { PILL_POPOVER } from "@trunk/editor/floatingToolbar";
import { SELECTION_OVERLAY_INSET } from "@trunk/editor/floatingToolbar.placement";
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
import { ToolbarSeparator } from "@trunk/editor/toolbar";
import { ShellSelectionPill } from "@trunk/shell/shellSelectionPill";

import {
  ArrangeCluster,
  CELL_TRIGGER,
  EdgeTypeCluster,
  FocusButton,
  GroupCluster,
  AppearanceCluster,
  PILL_SEPARATOR,
  TriggerChevron,
  TunnelCluster,
} from "./selectionClusters";
import { useInterfaceScale } from "../ShareMenu";
import type { CodeLanguage } from "../../shapes/code";
import {
  BLOCK_VIEWS,
  CODE_LANGUAGES,
  type BlockView,
  selectionSubjectOf,
  setBlockView,
  setCodeLanguage,
} from "./selectionActions";
import { BLOCK_VIEW_HOTKEY } from "./viewHotkeys";

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

export function FloatingSelectionToolbar() {
  const editor = useEditor();
  const interfaceScale = useInterfaceScale();

  const subject = useValue("ss selection subject", () => selectionSubjectOf(editor), [editor]);

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
    <ShellSelectionPill
      scale={interfaceScale}
      // tldraw draws its selection outline this far outside the bounds; the
      // pill clears the outline, not just the shape.
      overlayInset={SELECTION_OVERLAY_INSET}
      bottomObstacleHeight={DOCK_OBSTACLE_HEIGHT}
      testIdPrefix="ss-selection"
      content={
        <>
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
              // Requirement #5's other half, at the pill's existing tooltip
              // seam: the same key `viewHotkeys.tsx` binds to write this
              // view, so a hover teaches the shortcut without a second
              // control. `view.hint` (a description, "Name only") gives way
              // here rather than growing a third tooltip segment.
              title={`${view.label} · ${BLOCK_VIEW_HOTKEY[view.id]}`}
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
      <AppearanceCluster />

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
      <FocusButton />
      {/* P-048. Beside Focus and not behind Arrange: folding a selection into
          a region is a STRUCTURAL edit, not an alignment, and it is the one
          gesture Zach called "the bread and butter of what we are doing here".
          `GroupCluster` renders one cell or none, so it costs the bar the same
          32px whichever way the selection reads. */}
      <GroupCluster />

        </>
      }
    />
  );
}
