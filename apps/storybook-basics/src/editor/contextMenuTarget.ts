// src/editor/contextMenuTarget.ts — "which component did this press land
// on?", answered the same way the hit-region harness answers "would a click
// here hit anything" (`components/hitRegions/harness.fixture.tsx`'s
// `hitTargetAt`): walk a priority-ordered list of real `data-slot`
// selectors with `Element.closest`, first match wins. A right-click on a
// port dot must resolve to the PORT menu even though that dot sits inside a
// block's rail, which sits inside the block, which may sit inside a
// region's corner card — so "most specific wins" is the whole contract, not
// a convenience.
//
// WHY this file takes a structural `{closest, getAttribute}` shape rather
// than the DOM's own `Element` type (same move as `commandModel.ts`'s
// `QuickSwitcherLayerRoot`): `vitest.config.ts`'s "unit" project runs under
// `environment: "node"`, no DOM at all, and this resolver's whole job is a
// sequence of `.closest()` calls with no rendering involved — structural
// typing lets `contextMenuTarget.test.ts` exercise every branch (including
// "nothing matched") with hand-built fakes, no jsdom, no browser. A real
// `Element` satisfies this shape for free, so `contextMenuChrome.tsx` hands
// it the genuine `event.target` with no adapter.
//
// WHY no file here stamps a NEW `data-*` id attribute onto a core component
// (`port.tsx`, `trace.tsx`, …): every component this resolver reads already
// forwards arbitrary DOM props (`{...props}` on its root — verified in
// `port.tsx`, `labeledPort.tsx`, `trace.tsx`'s `TraceProps extends
// ComponentProps<"g">`), so a story/host that wants a stable id passes its
// own `data-port-id` / `data-trace-id` straight through as a normal prop.
// That is the existing "components must not import hosts" boundary applied
// to identity, too — this resolver only ever READS attributes a caller
// chose to stamp, never invents a new one inside a presentational core file.

export interface ContextMenuHitElement {
  closest(selector: string): ContextMenuHitElement | null;
  getAttribute(name: string): string | null;
}

/** The seven things a right-click on this kit's canvas objects can mean.
 *  `"block"` covers all three of a Block's own regions (header/body/footer)
 *  — Zach's brief only distinguishes them as HIT REGIONS, not as different
 *  MENUS ("right-clicking the body gives the BLOCK menu"); the region a
 *  press landed in is not carried onward past this resolver. */
export type ContextMenuTargetKind =
  | "port"
  | "labeled-port"
  | "port-edge"
  | "trace"
  | "block"
  | "region-arm"
  | "region-frame";

export interface ContextMenuTarget {
  kind: ContextMenuTargetKind;
  /** The nearest ancestor-or-self id attribute for this kind (see
   *  `ID_ATTRS_BY_KIND` below) — `null` when the element carries none,
   *  which a caller is free to treat as "no menu" or "generic menu". */
  id: string | null;
  /** The element `closest` actually matched — a caller wanting a second,
   *  kind-specific probe (e.g. "is this the header or the footer?") starts
   *  here instead of re-walking from the original event target. */
  element: ContextMenuHitElement;
}

/**
 * Priority order, most-specific-first — a port dot is nested inside a
 * rail, which is nested inside a block, which may be nested inside a
 * region's corner card, so checking in DOM-nesting order (innermost kind
 * first) is what keeps a dot press from ever resolving as its own block.
 *
 * `"block"` is deliberately checked BEFORE `"region-arm"`/`"region-frame"`:
 * a Block living inside an arm's free body (`BlockMembers`) is still more
 * specific than the arm around it, and CLAUDE.md's control-flow rule ("the
 * corner card IS the region's interface... one id, one port vocabulary")
 * is exactly this ordering applied to the corner card — it carries
 * `data-slot="block"` (never `data-slot="region-frame"`), so it already
 * resolves as `"block"` with no special case here.
 */
const KIND_SELECTORS: ReadonlyArray<{ kind: ContextMenuTargetKind; selector: string }> = [
  { kind: "port", selector: '[data-slot="port-dot"]' },
  { kind: "labeled-port", selector: '[data-slot="port"], [data-slot="port-label"]' },
  {
    kind: "port-edge",
    selector:
      '[data-slot="block-port-rail"], [data-slot="port-edge"], [data-slot="port-edge-group"], [data-slot="port-edge-lane"]',
  },
  { kind: "trace", selector: '[data-slot="trace"]' },
  { kind: "block", selector: '[data-slot="block"]' },
  { kind: "region-arm", selector: '[data-slot="region-arm"]' },
  // Both slots: `region-frame` is the drawn card (`expanded`/`p2`…), but
  // `view="opaque"` renders NO frame at all — its root carries only
  // `data-slot="region"` (region.tsx's own `rootProps`) — and even in the
  // drawn views the outer `region` root is itself real hit area (its own
  // padding/gutter around the frame). Either one resolves this kind.
  { kind: "region-frame", selector: '[data-slot="region-frame"], [data-slot="region"]' },
];

/** Which attribute carries this kind's identity, and where to look for it —
 *  not necessarily on the SAME element `closest` matched for the kind (a
 *  rail's dot sits inside `[data-port-id]` on the `block-port-item`
 *  wrapper, one level up from the dot itself), so this is its own
 *  `closest` walk from the original hit element. */
const ID_ATTRS_BY_KIND: Record<ContextMenuTargetKind, string> = {
  port: "data-port-id",
  "labeled-port": "data-port-id",
  "port-edge": "data-edge",
  trace: "data-trace-id",
  block: "data-block-id",
  "region-arm": "data-arm-id",
  "region-frame": "data-region-id",
};

/**
 * Resolve what a right-click (or any other press) landed on, walking
 * `KIND_SELECTORS` in order and returning the first match. `null` means
 * the press hit none of this kit's canvas objects — a caller opens no menu.
 */
export function resolveContextMenuTarget(hit: ContextMenuHitElement): ContextMenuTarget | null {
  for (const { kind, selector } of KIND_SELECTORS) {
    const element = hit.closest(selector);
    if (!element) continue;
    const idAttr = ID_ATTRS_BY_KIND[kind];
    const id = element.closest(`[${idAttr}]`)?.getAttribute(idAttr) ?? null;
    return { kind, id, element };
  }
  return null;
}
