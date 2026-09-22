// src/chrome/DevMenu/variantSwitch.tsx — the TEMPORARY bottom-right pill that flips
// the two open design proposals live: the port style (the `ports` lane's
// five, `@trunk/skin/portVariants`) and the region drawing (the `regions`
// lane's five, `@trunk/skin/regionVariants`).
//
// WHY a pill in the app and not a URL flag: Zach's standing rule
// ("prototype switch in app", rated Bad 2026-09-09 when `?portLanes=1` was
// the only way in) — a prototype under review gets a drop-down in the
// bottom-right corner that switches LIVE and REMEMBERS the choice. It is
// temporary by design: once he picks a port style and a region drawing, the
// winners become the tables' `v1` and this file and its one mount line in
// `./overlay.tsx` come out.
//
// WHAT IT WRITES, and nothing else (the contract in
// docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md, "Contracts"): the two
// `<html>` attributes every mounted port and region already observes, and
// two per-viewer `localStorage` keys. No React context, no prop threaded
// through a shape — the trunk's components re-resolve on the attribute by
// themselves, which is why the same switch is three lines in Storybook
// (`.storybook/preview.tsx`'s two toolbar globals stamp the same attributes).
//
// THE ONE THING THE ATTRIBUTE CANNOT DO ALONE: a region's arm header height
// is a NUMBER the app's own geometry needs (tldraw hit-tests the header
// bands, and `props.h` is the rows' hug — `cornerBlock.ts`'s
// `regionLayoutOf`), and 26-32px by drawing. `cornerBlock.ts` now reads the
// drawing in force when it lays a region out; this file re-settles every
// armed region's stored height when the drawing changes (`resettleRegions`),
// or the frame keeps the previous drawing's height and shows the difference
// as a dead band under its last arm.
import { useLayoutEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useEditor, type Editor, type TLShapePartial } from "tldraw";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@trunk/components/dropdown-menu";
import {
  DEFAULT_PORT_VARIANT_ID,
  PORT_VARIANT_IDS,
  PORT_VARIANTS,
  isPortVariantId,
  type PortVariantId,
} from "@trunk/skin/portVariants";
import {
  REGION_VARIANT_IDS,
  REGION_VARIANTS,
  isRegionVariantId,
  setRegionVariant,
  type RegionVariantId,
} from "@trunk/skin/regionVariants";

import { runRepair } from "../../document/derivedWrites";
import { reconcileRegionProps, type RegionShape } from "../../shapes/region";
import { REGION_SHAPE_TYPE } from "../../shapes/types";

/** The two per-viewer keys, spelled by the lane brief. */
export const PORT_VARIANT_STORAGE_KEY = "bbox.portVariant";
export const REGION_VARIANT_STORAGE_KEY = "bbox.regionVariant";

/**
 * What a viewer with NOTHING stored opens on. A stored pick still wins
 * (`readStored`) — only the fallback moved.
 *
 * WHY v2 and v9: Zach, 2026-09-22 — "Please also lets do ports v2 as the
 * default ones … and for regions make v9 the default one". WHY an app
 * constant rather than the tables' own `DEFAULT_*`: the tables' default is
 * the ABSENT attribute, and each variant's CSS is keyed on the attribute
 * with `v1`'s values as every token's fallback — so an absent attribute
 * always paints v1, whatever the TS default says. Stamping v2/v9 like any
 * other pick keeps paint and numbers (the region header height
 * `cornerBlock.ts` lays out with) on the same drawing. Storybook's toolbar
 * opens on the same pair (`.storybook/preview.tsx`, `initialGlobals`).
 */
export const APP_DEFAULT_PORT_VARIANT: PortVariantId = "v2";
export const APP_DEFAULT_REGION_VARIANT: RegionVariantId = "v9";

/* ------------------------------------------------------------------ */
/* Storage — per viewer, never a reason to block the board             */
/* ------------------------------------------------------------------ */

/** `localStorage`, or nothing. The same wrapped accessor
 *  `src/source/backendSwitch.tsx` and `./preferences.ts` use, for the same
 *  reason: a private window or blocked site data must cost the remembered
 *  choice, never the app. */
function viewerStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A stored id, or the default. An unknown value (a sixth variant that no
 *  longer exists, a hand-edited key) reads as the default rather than
 *  blanking every port on the board — the tables' own rule. */
function readStored<T extends string>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const raw = viewerStorage()?.getItem(key);
    return isValid(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    viewerStorage()?.setItem(key, value);
  } catch {
    // Ignored on purpose — see `viewerStorage`.
  }
}

/* ------------------------------------------------------------------ */
/* The two attributes                                                  */
/* ------------------------------------------------------------------ */

/**
 * `setRegionVariant`'s twin for ports. The `ports` lane exports a reader
 * (`readPortVariantId`) and no setter, so the app writes the attribute
 * itself — with the regions lane's convention, so the two attributes never
 * disagree about what "default" looks like: `v1` is the ABSENT attribute,
 * which is what both readers resolve a missing value to. `null` clears it.
 */
function setPortVariant(id: PortVariantId | null): void {
  if (typeof document === "undefined") return;
  const dataset = document.documentElement.dataset;
  if (id === null || id === DEFAULT_PORT_VARIANT_ID) delete dataset.bboxPortVariant;
  else dataset.bboxPortVariant = id;
}

/**
 * Re-settle every armed region's stored height under the drawing now in
 * force.
 *
 * WHY THROUGH `reconcileRegionProps(editor, region, region)` — `installRegionKit`'s
 * own `reconcileFrame` idiom — and not a height computed here: passing the
 * region as its own `previous` says exactly what happened ("the rows moved,
 * nobody dragged a handle"), which is the one branch of the reconcile that
 * re-derives `h` from the rows and leaves every arm's authored body height
 * alone. A bare `h` write would instead read as a resize and spread the
 * header difference into the arm BODIES — shrinking what the author drew to
 * pay for a drawing change. `onBeforeUpdate` then re-runs the same rule on
 * this write and finds nothing left to change.
 *
 * WHY every page's regions and not the current page's: a region on another
 * page would otherwise open with the previous drawing's height the next time
 * someone navigates there. WHY `history: "ignore"`: switching a PROPOSAL is
 * not an edit to the document — it must not become the first Ctrl-Z of the
 * session (`shared/measure.ts`'s reason). WHY `ignoreShapeLock`: a locked
 * region is locked against its author, not against a repair of its own
 * geometry.
 */
export function resettleRegions(editor: Editor): void {
  const updates: TLShapePartial[] = [];
  for (const record of editor.store.allRecords()) {
    if (record.typeName !== "shape" || record.type !== REGION_SHAPE_TYPE) continue;
    const region = record as unknown as RegionShape;
    const settled = reconcileRegionProps(editor, region, region);
    if (!settled) continue;
    const { w, h, arms } = settled.props;
    updates.push({ id: region.id, type: REGION_SHAPE_TYPE, props: { w, h, arms } } as TLShapePartial);
  }
  // `runRepair`: the viewer's drawing choice is not an edit to the file, so
  // re-settling under it never autosaves on its own (`document/derivedWrites.ts`).
  if (updates.length > 0) runRepair(editor, () => editor.updateShapes(updates), { ignoreShapeLock: true });
}

/* ------------------------------------------------------------------ */
/* The pill                                                            */
/* ------------------------------------------------------------------ */

interface VariantMenuProps<T extends string> {
  which: "port" | "region";
  label: string;
  /** The menu's own heading — singular, where the trigger's label is not. */
  heading: string;
  ids: readonly T[];
  titleOf(id: T): string;
  value: T;
  isValid(value: unknown): value is T;
  onPick(id: T): void;
}

/**
 * One of the two drop-downs: the stock shadcn `DropdownMenu` with a radio
 * group — the same kit the floating toolbar and the backend menu use.
 *
 * WHY a menu and not a native `<select>`, though "two selects" is what the
 * brief sketched: a native select's open list is drawn by the OS outside the
 * page, so it cannot be themed with the board's tokens, it cannot be
 * captured in a screenshot for review, and it is the one control on this
 * canvas that would look like nothing else here. A radio group keeps the
 * select SEMANTICS (`menuitemradio`, one checked) with the app's own paint.
 */
function VariantMenu<T extends string>({ which, label, heading, ids, titleOf, value, isValid, onPick }: VariantMenuProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid={`ss-variant-${which}`}
        data-value={value}
        aria-label={`${heading}: ${value} · ${titleOf(value)}`}
        title={`${heading} — ${value} · ${titleOf(value)}`}
        className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent"
      >
        {/* The WORD ("Ports" / "Regions") follows the same 1600px rule as the
            title below, and for the same reason — extended here 2026-09-20
            because the status strip grew (grid and help joined it for Zach's
            bottom-right screenshot) and pushed the measured row to 486px.
            `placeCornerCluster` then had only 417px between the dock's right
            edge and the licence watermark, so it correctly fell through to
            `above-licence` — reproducing the exact complaint that placement
            exists to fix ("please move the right corner menu to be truly in
            the right corner right now its above this text 'get a license for
            production'", 2026-09-19). Dropping the two words returns ~82px,
            which puts the row back on the corner's own bottom row.

            The pill stays fully identified without them: `aria-label` and
            `title` above both carry "Ports"/"Regions" in full, and so does
            the open menu's own heading. This is the temporary review control
            yielding to the product's chrome, which is the right way round. */}
        <span className="hidden text-muted-foreground min-[1600px]:inline">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
        {/* WHY the title is capped tighter than it reads: this pill shares the
            bottom row with the zoom cluster, and `placeCornerCluster`
            (./overlay.tsx) can only seat that row beside tldraw's licence
            watermark — which is where Zach asked for it, 2026-09-19 — while
            the whole row stays narrow. The full title is on the trigger's
            tooltip and in the open list. */}
        <span className="hidden max-w-24 truncate text-muted-foreground min-[1600px]:inline">{titleOf(value)}</span>
        <ChevronUp className="size-3 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      {/* Opens UPWARD and right-aligned: the pill sits on the bottom edge,
          so the list grows into the board, never off the screen. A pick
          does NOT close it (Base UI's own `closeOnClick` default for a radio
          item) — WHY kept: the job is comparing five proposals, and a list
          that stays open lets him walk v1 → v5 (click, or arrow + Enter)
          with the board repainting behind it; Escape or a click away puts
          it down. */}
      <DropdownMenuContent side="top" align="end" sideOffset={6} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{heading} — a proposal, not yet chosen</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next: unknown) => {
              if (isValid(next)) onPick(next);
            }}
          >
            {ids.map((id) => (
              <DropdownMenuRadioItem key={id} value={id} data-testid={`ss-variant-${which}-${id}`}>
                <span className="w-5 font-medium tabular-nums">{id}</span>
                <span>{titleOf(id)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The pill: Port style and Region style, side by side, beside the zoom
 * cluster (`./overlay.tsx` mounts it in the status strip's own row).
 *
 * State is initialised FROM storage, and the effects below push it onto
 * `<html>` — so a reload restores the choice on the first commit, before the
 * browser paints, and a pick is one `setState` plus one storage write.
 *
 * WHY the effects clear their attribute on cleanup: this component owns the
 * two attributes for exactly as long as it is mounted. An app torn down
 * (a test, an embedding host) must not leave every other port on the page
 * restyled by a switch that no longer exists; a reload re-applies the
 * stored choice anyway.
 */
export function VariantSwitch() {
  const editor = useEditor();
  const [port, setPort] = useState<PortVariantId>(() => readStored(PORT_VARIANT_STORAGE_KEY, isPortVariantId, APP_DEFAULT_PORT_VARIANT));
  const [region, setRegion] = useState<RegionVariantId>(() => readStored(REGION_VARIANT_STORAGE_KEY, isRegionVariantId, APP_DEFAULT_REGION_VARIANT));

  useLayoutEffect(() => {
    setPortVariant(port);
    return () => setPortVariant(null);
  }, [port]);

  useLayoutEffect(() => {
    setRegionVariant(region);
    // After the attribute, so `cornerBlock.ts` lays each region out under
    // the drawing that is now in force.
    resettleRegions(editor);
    return () => setRegionVariant(null);
  }, [editor, region]);

  return (
    <div
      data-testid="ss-variant-switch"
      role="group"
      aria-label="Prototype variants"
      // WHY it disappears under 900px: this temporary switch shares the
      // bottom-right row with the zoom cluster, and on a narrow window that
      // row grows wide enough to reach the dock — which forces the whole row
      // to float above BOTH the dock and tldraw's licence watermark, the
      // exact "not in the corner" Zach objected to (2026-09-19). A prototype
      // control yields to the app's own chrome; `?` and the board are
      // unchanged, and the variant still follows localStorage.
      className="pointer-events-auto hidden items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 text-xs text-card-foreground shadow-sm min-[900px]:flex"
    >
      <VariantMenu
        which="port"
        label="Ports"
        heading="Port style"
        ids={PORT_VARIANT_IDS}
        titleOf={(id) => PORT_VARIANTS[id].title}
        value={port}
        isValid={isPortVariantId}
        onPick={(id) => {
          writeStored(PORT_VARIANT_STORAGE_KEY, id);
          setPort(id);
        }}
      />
      <span className="h-4 w-px bg-border" aria-hidden="true" />
      <VariantMenu
        which="region"
        label="Regions"
        heading="Region style"
        ids={REGION_VARIANT_IDS}
        titleOf={(id) => REGION_VARIANTS[id].title}
        value={region}
        isValid={isRegionVariantId}
        onPick={(id) => {
          writeStored(REGION_VARIANT_STORAGE_KEY, id);
          setRegion(id);
        }}
      />
    </div>
  );
}
