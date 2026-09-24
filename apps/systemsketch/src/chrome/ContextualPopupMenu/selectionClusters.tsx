// src/chrome/ContextualPopupMenu/selectionClusters.tsx — the CONTENT of the selection pill:
// Arrange, opacity, and the tldraw style bar. `floatingToolbar.tsx` owns
// where the pill goes (seven numbered placement steps against
// docs/menus/MENU-KIT-DESIGN.md §4); this file owns what is inside it, so
// neither job has to be read to change the other.
//
// Zach, 2026-09-20, with a screenshot of the current pill labelled "Current :
// BAD" showing exactly two buttons (duplicate, delete) and the archived
// SystemSketch's pill labelled "Desired": "1. floating tool bars that provide
// useful fucntions on the components / 2. FLoating toolbar over the tldraw
// primatives for styling".
//
// ONE FAMILY, ONE TRIGGER. Arrange collapses ten actions behind a single
// face, and each style row collapses its option list behind one. That is the
// donor pill's own rule and it is Zach's, stated 2026-09-08: "instead of
// being visible on the floating toolbar I want them hidden behind a icon".
// The pill is a bar over the user's drawing — every control spent here is
// canvas taken away.
import { useCallback, useState } from "react";
import { AlignStartVertical, Eye, EyeOff, Focus, Group, Ungroup, Waypoints } from "lucide-react";
import { useEditor, useValue, type TLShapeId } from "tldraw";

import { Button } from "@trunk/components/button";
import { PILL_POPOVER } from "@trunk/editor/floatingToolbar";
import { Input } from "@trunk/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@trunk/components/popover";
import { Slider } from "@trunk/components/slider";
import { ControlStrip } from "@trunk/editor/controlStrip";
import { ToolbarButton } from "@trunk/editor/toolbar";

import { traceGeometry } from "@trunk/components/trace";

import { groupSelection, groupableSelection, selectedRegionId, ungroupSelection } from "../../document/grouping";
import { appearanceGlyphs } from "./appearanceGlyphs";
import { buildAppearance } from "./appearanceModel";
import {
  boardTunnelLayers,
  canonicalBoardLayer,
  focusedTunnelLayer,
  setFocusedTunnelLayer,
} from "../../shapes/wire/wireTunnel";
import { WIRE_ROUTINGS, setWireLayer, setWireRouting, setWireTunnel, type WireRouting } from "./selectionActions";
import {
  activeStyleRows,
  arrangeGroupsFor,
  runArrange,
  selectionOpacityPercent,
  setSelectionOpacityPercent,
  setStyle,
  swatchColorFor,
  faceLabelFor,
  type ActiveStyleRow,
} from "./arrangeActions";

/* ------------------------------------------------- THE FIGJAM CELL FAMILIES
 *
 * Measured, not chosen. `/home/bam/systemsketch/docs/assets/figjam-chrome-
 * traced.json` is a live `getComputedStyle`/`getBoundingClientRect` dump of
 * FigJam's own selection pill, and EVERY cell in it is 40px tall with a 5px
 * radius — 15 buttons across two pills, not one exception. The bar is 40 with
 * `padding: 0 4px`, so a cell fills the bar's full height; it does not float
 * inside it.
 *
 * WHY that matters and is not a 2px nicety: a 28px or 32px cell inside a 40px
 * bar is exactly the tldraw-stock silhouette Zach rejected on 2026-09-20
 * ("It feels like you are making this look like the tldraw stock floating
 * toolbar which I don't like"), and it is what this file shipped — `size="sm"`
 * everywhere, so `h-7` (28px) on the style triggers and Arrange, `h-8` (32px)
 * on Focus/Duplicate/Delete.
 *
 * WHAT WE DELIBERATELY DID NOT COPY: the donor ALSO has a 33x32 / radius-7 /
 * 18px-stroked family (`systemsketch-chrome.css:944-977`, `:1036-1048`) and it
 * is tempting because it is the one that looks most like a toolbar button.
 * It has no FigJam counterpart — it is SystemSketch's own pre-FigJam chrome,
 * first committed in c5502b6d before the trace landed, and copying it
 * reproduces the complaint instead of fixing it. Height and glyph size are
 * coupled: a 40px cell around a 16px lucide glyph is WORSE than today.
 */

/**
 * Ink and feedback for anything sitting on the fixed dark pill.
 *
 * WHY every one of these restates a colour the component already had: the
 * kit's variants are PAGE-relative, and the pill is now a FIXED dark surface
 * that does not move with the page. Each line below is one page token that was
 * measured painting the wrong thing on this bar:
 *
 *   hover        `hover:text-foreground` (toolbar.tsx:89) — near-black in
 *                light mode, so hovering an icon turned it the pill's own
 *                colour and the glyph vanished under the cursor.
 *   open trigger `aria-expanded:bg-muted` (button.tsx:24) — measured with the
 *                Arrange popover open: `oklch(0.97 0 0)` in light, a near-WHITE
 *                chip cut out of the dark pill; `oklab(0.269 0 0 / 0.5)` in
 *                dark. FigJam holds an open trigger at the same #383838 as
 *                hover, so the bar reads as one surface with one cell lit.
 *   focus ring   `focus-visible:ring-ring/50` — a light-theme grey halo. The
 *                ring stays (it is the bar's only keyboard affordance) but is
 *                derived from the pill's ink.
 *
 * `#383838` is FigJam's traced hover and divider colour.
 */
const ON_PILL =
  "text-white hover:bg-[#383838] hover:text-white dark:hover:bg-[#383838]"
  + " aria-expanded:bg-[#383838] aria-expanded:text-white focus-visible:ring-white/40";

/** F2 — plain icon button. Traced 32 x 40, radius 5, padding 0 4px, one
 *  24x24 glyph. Duplicate, Delete, Focus, Arrange. */
export const CELL_ICON =
  `${ON_PILL} h-10 w-8 shrink-0 rounded-[5px] border-0 p-0 [&_svg:not([class*='size-'])]:size-6`;

/** F1 — trigger carrying a value. Traced 56 x 40 (54 for the colour variant),
 *  radius 5, 8px clear each side, a 24x24 glyph butted with ZERO gap against
 *  a 16x16 chevron. The width is left to the content so the colour variant
 *  lands on its own 54 rather than being padded to a number it never had. */
export const CELL_TRIGGER =
  `${ON_PILL} h-10 shrink-0 gap-0 rounded-[5px] border-0 px-2 text-[11px] font-normal [&_svg:not([class*='size-'])]:size-6`;

/** F3 — a cell inside a popover. Traced 24 x 24 on a 32px pitch. Ink and
 *  hover come from the pill because the panel now shares the pill's surface. */
export const CELL_OPTION =
  `${ON_PILL} size-6 shrink-0 rounded-[5px] border-0 p-0 [&_svg:not([class*='size-'])]:size-4`;

/** The pill's own separator: 1px on the bar's FULL 40px height, `rgb(56,56,56)`
 *  traced, 4px clear each side. A half-height rule reads as a generic toolbar;
 *  FigJam's runs edge to edge. */
export const PILL_SEPARATOR = "h-10 self-center bg-[#383838]";

/**
 * ONE chevron, 16x16, filled, on every trigger that has a value — the donor
 * ships a single shared path (`CHEVRON_PATH`/`CHEVRON_VIEWBOX`,
 * `figjamTokens.ts:81-84`) for the same reason: a per-control chevron is how
 * a bar stops reading as one family.
 */
export function TriggerChevron() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0" fill="currentColor">
      <path d="M4.2 6.3a.7.7 0 0 1 1 0L8 9.1l2.8-2.8a.7.7 0 1 1 1 1L8.5 10.6a.7.7 0 0 1-1 0L4.2 7.3a.7.7 0 0 1 0-1Z" />
    </svg>
  );
}

/* ----------------------------------------------------------------- arrange */

export function ArrangeCluster() {
  const editor = useEditor();
  const count = useValue("ss arrange selection count", () => editor.getSelectedShapeIds().length, [editor]);
  const groups = arrangeGroupsFor(count);
  if (groups.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        // F2, not a shrunken trigger: Arrange carries no VALUE to show, so it
        // is a plain icon cell. The donor's own Arrange trigger (family C,
        // `chrome.css:1098-1109`, 46x32 with a chevron) is part of the
        // invented family with no FigJam measurement behind it.
        render={<Button variant="ghost" size="sm" className={CELL_ICON} />}
        data-testid="ss-selection-arrange"
        aria-label="Arrange"
        title="Arrange"
      >
        {/* Align-left is the face every tool that COLLAPSES this control uses
            for it; the donor picked it for the same reason and wrote down
            that no upstream "arrange" glyph exists to vendor. */}
        <AlignStartVertical />
      </PopoverTrigger>
      <PopoverContent align="start" className={`w-auto p-2 ${PILL_POPOVER}`} data-testid="ss-arrange-panel">
        {groups.map((group, index) => (
          <div key={group.id}>
            {/* A rule between families, never above the first. The four groups
                stack inside the panel rather than spreading across the pill's
                row — the donor moved them here and noted "they read better
                than they ever did crammed into the pill's row". */}
            {/* Panel chrome is pill-relative now, not page-relative: the
                panel shares the bar's #1e1e1e surface, so `bg-border` and
                `text-muted-foreground` would be a light page's hairline and
                grey on a dark card. */}
            {index > 0 ? <div className="my-2 h-px bg-[#383838]" /> : null}
            {group.heading ? (
              <div className="px-1 pt-1 pb-1 text-[11px] font-normal text-white/60">{group.heading}</div>
            ) : null}
            <div className="flex gap-2" role="group" aria-label={group.heading ?? "Order"}>
              {group.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    variant="ghost"
                    size="sm"
                    className={CELL_OPTION}
                    data-testid={`ss-arrange-${action.id}`}
                    aria-label={action.label}
                    title={action.label}
                    onClick={() => runArrange(editor, action.id)}
                  >
                    <Icon />
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------- appearance (2026-09-24) */

/**
 * Four triggers — shape · inside · edge · text — replacing the six style rows
 * and the inline opacity slider that stood here before.
 *
 * Zach, 2026-09-24: "Generally I like a very compact tool bar, 1 for dealing
 * with the inside, 1 for dealling with the stroke, etc..", then "I would
 * still keep the shape selection its self as a seperate tab though ... shape
 * selector, inside, edge, text", and "no need to put the text (inside and
 * edge) on the drop down menu btw, we can learn to just know it by the icon".
 *
 * WHAT WAS DELETED HERE, and why neither is a loss:
 *
 *  - `StyleRowControl` / `StyleFace` / `StyleOption` / `StyleCluster` — a
 *    second, simpler implementation of a renderer the trunk already had. That
 *    duplication is exactly why this pill's line-style menu printed the WORD
 *    "dashed" while `@trunk/editor/controlGlyphs` sat two directories away
 *    with a drawn dashed line in it. The vocabulary now lives in
 *    `appearanceModel.ts` and the drawing in `appearanceGlyphs.tsx`; the
 *    renderer is the trunk's.
 *  - `OpacityCluster` — the inline slider and its `100%` readout. Its own WHY
 *    argued opacity belongs in the bar's row because you need to see its
 *    current state while dragging. That is still true, and the readout beside
 *    the slider inside the panel is what answers it; what the argument never
 *    justified was spending a permanent slot on the bar for an attribute OF a
 *    paint. It now renders inside both paint panels, as `ControlPanel`'s
 *    `ContinuousRow`.
 *
 * The applicability rule is UNCHANGED and still `getSharedStyles()`: nothing
 * here switches on a shape type, so the P-035 property still holds — a new
 * `StyleProp` on an `ss-*` shape surfaces without touching this file.
 */
export function AppearanceCluster() {
  const editor = useEditor();
  // `buildAppearance` reads `getSharedStyles()` and the selection's own
  // metadata, both reactive, so this re-runs on any change to either.
  const bundle = useValue("ss appearance", () => buildAppearance(editor), [editor]);
  if (!bundle) return null;

  return (
    // `h-10` for the same reason every other cluster carries it: a wrapper
    // shorter than 40 puts its whole row on a second baseline no matter how
    // tall the cells inside it are.
    <div className="flex h-10 shrink-0 items-center" data-testid="ss-selection-appearance">
      <ControlStrip
        aria-label="Appearance"
        composition={bundle.composition}
        glyphs={appearanceGlyphs(editor, bundle.faces)}
        testIdPrefix="ss"
        // The panels portal out of this subtree, so the pill's ink cannot
        // reach them through the DOM. `PILL_POPOVER` is the trunk's own
        // export for exactly this seam.
        panelClassName={PILL_POPOVER}
      />
    </div>
  );
}

/* -------------------------------------------------------------- edge type */

/**
 * The 28 x 16 box every routing glyph is drawn in, and the two terminals every
 * one of them is routed between.
 *
 * The pair is chosen so all four routings are TELLABLE APART at this size: a
 * vertical drop between the ends (10 of 16px) is what separates `straight`
 * from `slanted`, and opposing wall normals are what make `curved` bow and
 * `elbow` turn. Terminals a few px inside the box leave room for the 1.6px
 * stroke's round caps.
 */
const GLYPH_BOX = { w: 28, h: 16 } as const;
const GLYPH_FROM = { x: 3, y: 13, dir: "right" } as const;
const GLYPH_TO = { x: 25, y: 3, dir: "left" } as const;

/**
 * What a routing looks like — drawn by the REAL router, not by hand.
 *
 * WHY this calls `traceGeometry` instead of carrying four hand-authored `d`
 * strings, which is what a menu icon normally is: a hand-drawn icon is a claim
 * about what the router does, and a claim drifts. This one cannot — it is the
 * same pure function `WireFace` and `WireShapeUtil.getGeometry` both ask, so
 * the picture in the menu IS the route the board will draw. It also means a
 * change to the elbow router shows up here for free, which is the point of the
 * router being pure.
 *
 * `gap: 0` because there are no terminal glyphs to clear at this size — the
 * board's own 8px pull-back (`WIRE_TERMINAL_GAP`) would eat most of a 22px
 * span.
 */
export function RoutingGlyph({ routing }: { routing: WireRouting }) {
  const path = traceGeometry({ from: GLYPH_FROM, to: GLYPH_TO, routing, gap: 0 }).path;
  return (
    <svg
      viewBox={`0 0 ${GLYPH_BOX.w} ${GLYPH_BOX.h}`}
      width={GLYPH_BOX.w}
      height={GLYPH_BOX.h}
      aria-hidden="true"
      className="shrink-0"
      data-testid={`ss-edge-routing-glyph-${routing}`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * P-008: the edge type selector.
 *
 * Until this existed, `ss-wire.routing` was a real prop with four legal values,
 * a default of `elbow`, and NO way to change it inside the app — the backlog's
 * own proof was that `grep -rn "routing" apps/systemsketch/src/chrome/` found
 * two comment lines and nothing that writes. A board could only be re-routed by
 * hand-editing the saved file.
 *
 * ONE FAMILY, ONE TRIGGER — this file's own law, and Zach's ("instead of being
 * visible on the floating toolbar I want them hidden behind a icon"). Four
 * routings collapse behind one cell, exactly like the style rows above. The
 * "S-curve button" the ask names is the `curved` entry: in this repo the
 * default bezier IS the S (see `WIRE_ROUTINGS`' own parity note).
 *
 * WHY it appears for ANY selection containing a cable rather than only for a
 * lone cable: a routing is a property, not a face, and re-routing a bundle in
 * one press is most of the value. The write is scoped to the cable ids —
 * a mixed selection of blocks and cables re-routes the cables and leaves the
 * blocks alone.
 */
export function EdgeTypeCluster({ wires, routing }: { wires: readonly TLShapeId[]; routing: WireRouting | null }) {
  const editor = useEditor();
  if (wires.length === 0) return null;
  const current = WIRE_ROUTINGS.find((entry) => entry.id === routing) ?? null;

  return (
    <div className="flex h-10 shrink-0 items-center" data-testid="ss-selection-edge-type">
      <Popover>
        <PopoverTrigger
          render={<Button variant="ghost" size="sm" className={CELL_TRIGGER} />}
          data-testid="ss-edge-routing"
          aria-label={`Edge type: ${current ? current.label : "mixed"}`}
          title="Edge type"
        >
          {/* A mixed selection has no route to draw, so it says so in the
              trigger's own text cell rather than picking one cable's answer
              to stand for all of them. */}
          {current ? (
            <RoutingGlyph routing={current.id} />
          ) : (
            <span className="px-1 text-[11px] leading-none font-normal whitespace-nowrap">Mixed</span>
          )}
          <TriggerChevron />
        </PopoverTrigger>
        <PopoverContent align="start" className={`w-auto p-2 ${PILL_POPOVER}`} data-testid="ss-edge-routing-panel">
          <div className="flex flex-col gap-1" role="group" aria-label="Edge type">
            {WIRE_ROUTINGS.map((entry) => (
              <Button
                key={entry.id}
                variant="ghost"
                size="sm"
                aria-pressed={entry.id === routing}
                data-testid={`ss-edge-routing-${entry.id}`}
                aria-label={entry.label}
                title={entry.hint}
                className={`${ON_PILL} h-8 w-full justify-start gap-2 rounded-[5px] border-0 px-2 text-[11px] font-normal ${entry.id === routing ? "bg-[#8a38f5] hover:bg-[#8a38f5]" : ""}`}
                onClick={() => setWireRouting(editor, wires, entry.id)}
              >
                <RoutingGlyph routing={entry.id} />
                <span className="text-[11px]">{entry.label}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


/**
 * P-023: tunnelling, and the layer a cable travels on.
 *
 * WHAT WAS ALREADY BUILT, so this file is small: the four-state machine
 * (`@trunk/components/tunnel`), the drawn mouths and vias (`Trace`), the layer
 * derivation (`@trunk/scene/layers`) and the host glue
 * (`shapes/wire/wireTunnel.ts`). The backlog's proof of the gap was that the
 * app imported the first three ZERO times. This cluster is the PRESS that
 * reaches them, and it writes exactly two props.
 *
 * ONE FAMILY, ONE TRIGGER — this file's law. Tunnelling, layer membership and
 * layer focus are one family (they are the same feature seen from the cable,
 * from the set and from the view) so they collapse behind a single cell.
 *
 * WHY THE FOCUS CONTROL LIVES HERE, beside two writes, despite being the one
 * thing in the popover that does NOT touch the document: because focusing a
 * layer is how you find out what is on it, and a person filing a cable onto
 * `Diagnostics` is exactly the person who wants to see `Diagnostics`. Putting
 * the eye on a different surface would mean a round trip for every assignment.
 * The rows are marked as the view control they are — `aria-pressed` on an eye,
 * never a checkbox that reads like data.
 *
 * WHY IT APPEARS FOR ANY SELECTION CONTAINING A CABLE, like the routing row
 * above rather than like the block-view toggle: tunnelling is a property, not
 * a face, and "select these forty diagnostics cables and tunnel all of them"
 * is the whole point of the feature.
 */
export function TunnelCluster({
  wires,
  tunnel,
  layer,
}: {
  wires: readonly TLShapeId[];
  tunnel: boolean | null;
  layer: string | null;
}) {
  const editor = useEditor();
  // Derived from the board's own cables, so a layer appears in this list the
  // moment a cable is filed onto it and disappears when the last one leaves —
  // `@trunk/scene/layers`' whole contract decision, and the reason there is no
  // registry to keep in step.
  const layers = useValue("ss tunnel layers", () => boardTunnelLayers(editor), [editor]);
  const focused = useValue("ss tunnel focus", () => focusedTunnelLayer(editor).get(), [editor]);
  // WHY the field is LOCAL and not bound straight to `layer`: a layer name is
  // typed a character at a time, and writing the record on each keystroke
  // would file the selection onto `D`, then `Di`, then `Dia` — three junk
  // layers in the derived list and three undo entries. `null` means "not
  // typing"; the field shows the selection's own layer until then.
  const [draft, setDraft] = useState<string | null>(null);

  if (wires.length === 0) return null;

  const commitLayer = (raw: string) => {
    // Resolve against the board's existing spelling FIRST, so `diagnostics`
    // joins `Diagnostics` rather than forking it — `canonicalSceneLayer`'s
    // reason for existing.
    setWireLayer(editor, wires, canonicalBoardLayer(editor, raw));
    setDraft(null);
  };

  const mixedLayer = layer === null;
  const fieldValue = draft ?? (mixedLayer ? "" : layer);

  return (
    <div className="flex h-10 shrink-0 items-center" data-testid="ss-selection-tunnel">
      <Popover>
        <PopoverTrigger
          render={<Button variant="ghost" size="sm" className={CELL_ICON} />}
          data-testid="ss-wire-tunnel"
          aria-pressed={tunnel === true}
          aria-label={tunnel === null ? "Tunnel: mixed" : tunnel ? "Tunnel: on" : "Tunnel: off"}
          title="Tunnel and layer"
        >
          <Waypoints />
        </PopoverTrigger>
        <PopoverContent align="start" className={`w-56 p-2 ${PILL_POPOVER}`} data-testid="ss-wire-tunnel-panel">
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              data-testid="ss-wire-tunnel-toggle"
              aria-pressed={tunnel === true}
              aria-label="Tunnel when idle"
              title="Hide the long run, leaving a stub and a via at each port"
              className={`${ON_PILL} h-8 w-full justify-start gap-2 rounded-[5px] border-0 px-2 text-[11px] font-normal ${tunnel === true ? "bg-[#8a38f5] hover:bg-[#8a38f5]" : ""}`}
              // A MIXED selection turns ON. The alternative — toggling off
              // whatever each cable happens to be — makes one press produce two
              // different outcomes on two cables, which is not a toggle.
              onClick={() => setWireTunnel(editor, wires, tunnel !== true)}
            >
              <Waypoints />
              <span className="text-[11px]">Tunnel when idle</span>
            </Button>

            <div className="mt-1 px-1 text-[11px] text-white/60">Layer</div>
            <Input
              data-testid="ss-wire-layer-input"
              aria-label="Layer"
              placeholder={mixedLayer ? "Mixed" : "None"}
              value={fieldValue}
              // The pill is a FIXED dark surface in both colour schemes, and the stock
              // Input carries a `dark:bg-input/30` of its own — a PAGE token, which
              // is what painted the field two-tone here. Both variants are pinned to
              // the same literal so there is no theme left for it to be wrong in,
              // the same reasoning `ToggleGroupItem` above already records.
              className="h-8 w-full rounded-[5px] border-[#383838] bg-[#2a2a2a] text-[11px] text-white placeholder:text-white/40 dark:bg-[#2a2a2a]"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitLayer(event.currentTarget.value);
                // Escape abandons the draft rather than writing it — the same
                // commit/cancel pair `EditableText` uses everywhere else here.
                if (event.key === "Escape") setDraft(null);
              }}
              onBlur={(event) => {
                if (draft !== null) commitLayer(event.currentTarget.value);
              }}
            />

            {layers.map((name) => (
              <div key={name} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`ss-wire-layer-${name}`}
                  aria-pressed={layer === name}
                  aria-label={`Put on layer ${name}`}
                  className={`${ON_PILL} h-8 min-w-0 flex-1 justify-start gap-2 rounded-[5px] border-0 px-2 text-[11px] font-normal ${layer === name ? "bg-[#8a38f5] hover:bg-[#8a38f5]" : ""}`}
                  onClick={() => setWireLayer(editor, wires, name)}
                >
                  <span className="truncate text-[11px]">{name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`ss-wire-layer-focus-${name}`}
                  aria-pressed={focused === name}
                  aria-label={`Focus layer ${name}`}
                  title="Show only this layer; tunnel every other cable"
                  className={`${ON_PILL} h-8 w-8 shrink-0 rounded-[5px] border-0 p-0 ${focused === name ? "bg-[#8a38f5] hover:bg-[#8a38f5]" : ""}`}
                  // Toggling: pressing the focused layer clears focus, which is
                  // `setFocusedTunnelLayer`'s own rule and what makes this read
                  // as a filter rather than a mode.
                  onClick={() => setFocusedTunnelLayer(editor, name)}
                >
                  {focused === name ? <Eye /> : <EyeOff />}
                </Button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* -------------------------------------------------------------------- misc */

/** Zoom the camera onto the selection alone — the donor pill's "Focus". */
/* --------------------------------------------------------------- grouping */

/**
 * Group and Ungroup — P-048's surface, and the only place in the app a person
 * reaches `@trunk/scene/collapse`.
 *
 * ONE CELL AT A TIME, never both: over a lone region the box is already
 * closed, so the honest offer is to open it; over anything else there is
 * something to fold. A pair of cells where one is always dead spends canvas
 * on a control that cannot be pressed — this pill's own rule.
 *
 * WHY the work is not done here: `src/document/grouping.ts` owns the algebra
 * AND the store write, because the same pair has to be callable from a
 * keyboard binding and from a test without a pill on screen.
 */
export function GroupCluster() {
  const editor = useEditor();
  const regionId = useValue("ss group selected region", () => selectedRegionId(editor), [editor]);
  const groupable = useValue("ss group member count", () => groupableSelection(editor).length, [editor]);

  if (regionId) {
    return (
      <ToolbarButton
        data-testid="ss-selection-ungroup"
        aria-label="Ungroup"
        title="Ungroup — the cables stay wired, straight to what they reached before"
        className={CELL_ICON}
        onClick={() => ungroupSelection(editor)}
      >
        <Ungroup />
      </ToolbarButton>
    );
  }
  if (groupable === 0) return null;
  return (
    <ToolbarButton
      data-testid="ss-selection-group"
      aria-label="Group"
      title="Group into a region — every crossing cable becomes a port"
      className={CELL_ICON}
      onClick={() => groupSelection(editor)}
    >
      <Group />
    </ToolbarButton>
  );
}

export function FocusButton() {
  const editor = useEditor();
  const hasSelection = useValue("ss focus has selection", () => editor.getSelectedShapeIds().length > 0, [editor]);
  if (!hasSelection) return null;
  return (
    <ToolbarButton
      data-testid="ss-selection-focus"
      aria-label="Focus"
      title="Zoom to this selection"
      className={CELL_ICON}
      onClick={() => editor.zoomToSelection({ animation: { duration: 220 } })}
    >
      <Focus />
    </ToolbarButton>
  );
}
