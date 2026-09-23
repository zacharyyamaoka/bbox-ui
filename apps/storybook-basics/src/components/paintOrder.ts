// src/components/paintOrder.ts — the paint-order ladder (Card 04, the
// z-order lane of docs/provenance/z-order.md's wave).
//
// THE RULING THIS FILE IMPLEMENTS (full text: the z-order lane brief) —
// "the line is the box, not the node." The mechanical test: can the
// answer be computed from ONE component's own props, knowing nothing
// about what else is on the canvas and nothing about what the pointer is
// doing?
//   - Yes → paint order. Deterministic from the component's own tree,
//     identical on every host, required for the render to be correct AT
//     ALL. That is layout, it is portable, and it lives HERE, named.
//   - Needs the selection, the pointer, or a sibling node's identity →
//     canvas z-order. Host-owned. Never travels, never lives here.
//
// THIS IS A REFACTOR, NOT A FEATURE, for five of these nine tiers: the
// kit already emitted raw numeric `zIndex` literals before this file
// existed, ad hoc, coordinated only by prose comments across three
// files. Replacing them with named tokens below is defined to be a
// NO-OP — every one of the five reproduces its pre-existing literal
// exactly, verified by a captured getComputedStyle before/after on the
// same mounted stories (src/components/PaintOrder.stories.tsx,
// "TokensReproduceTodaysNumbers"; the raw numbers are recorded in
// docs/provenance/z-order.md). Only `headerChrome` is new — the nesting
// tier Zach actually asked for (a Block's header/footer must paint above
// its own `BlockMembers` region, however deeply that region nests other
// Blocks inside it).
//
// THE ISOLATION INVARIANT is what makes a closed, per-tier integer scale
// safe to reuse across files that never coordinate with each other:
// every component root that emits a tier below sets `isolation: isolate`
// (see block.tsx's root, blockPort.tsx's `[data-slot="block-port"]`
// root, portEdge.tsx's `[data-slot="port-edge"]` root). A CSS stacking
// context is a hard wall — a descendant's z-index cannot outrank
// anything outside its isolated root no matter what integer it carries.
// That is what lets `portDot` and `flagBadge` share the raw value `1`
// without ever actually competing: they live in different isolated
// roots and are never compared in the same stacking context. It is also
// what makes `headerChrome` beat an arbitrarily deep nested Block's own
// highest tier: the nested Block, however many levels deep, is trapped
// inside its OWN isolated root, so it contributes only its own
// (z-index:auto, i.e. stack level 0) box to its parent's stacking order
// — never its interior maximum. Remove the invariant from one nested
// root and this reasoning breaks; `PaintOrder.stories.tsx`'s
// `NestedChildStaysBehindHeader` story is the measured proof, and a
// mutation test (temporarily deleting one `isolation: isolate`) is
// recorded as having actually turned it red in docs/provenance/z-order.md.
//
// The kit NEVER emits a z-index on a node ROOT (a Block's own outer box,
// a BlockPort wrapper's own outer box) — only on things INSIDE one. A
// host's canvas z-order (raise-on-select, drag-to-front, Vyuh
// Flow's `child.z = parent.z + 1`) stays exactly that: host-owned,
// never emitted here.

/**
 * The closed, ordered ladder — ascending: earlier names paint further
 * back, later names paint on top, WITHIN one isolated component root.
 * "Ordered" is a design narrative connecting the tiers to what they
 * paint, not a claim that every numeric value is globally monotonic —
 * the isolation invariant above is what actually keeps unrelated tiers
 * (e.g. `portDot` and `flagBadge`, both `1`, in different files) from
 * ever needing to out-rank each other; see `PAINT_TIER_VALUE`'s own
 * per-entry comments for exactly which existing call site each number
 * reproduces.
 */
export const PAINT_TIER_ORDER = [
  "underlay",
  "surface",
  "memberContent",
  "memberOverflow",
  "wire",
  "headerChrome",
  "portDot",
  "flagBadge",
  "laneOverlay",
  "dragActive",
  "diagnosticHalo",
] as const;

export type PaintTierName = (typeof PAINT_TIER_ORDER)[number];

/**
 * One frozen value per tier. Every entry that reproduces a pre-existing
 * raw literal says so and names its call site; the two new entries
 * (`headerChrome`, and the currently-unwired placeholders) say that too.
 */
const PAINT_TIER_VALUE: Readonly<Record<PaintTierName, number>> = Object.freeze({
  // NEW (2026-09-22, lane side-effect-ports) — the one NEGATIVE tier, and
  // the only one that paints BELOW a box's own content. A negative z-index
  // inside an isolated root paints right after that root's own background
  // and border and before every in-flow child, so a line drawn here sits on
  // the card surface and UNDER the body, the header text and — in an
  // expanded Block — every member card. Its one caller is the mutation line
  // (blockPort.tsx's `MutationLines`), which must not paint over member
  // content; `wire` (above `memberContent`) says the opposite.
  underlay: -1,
  // Placeholder — not wired to any raw zIndex today. Lowest in the
  // ladder: a surface/inset background paints under its own box's
  // content.
  surface: 0,
  // portEdge.tsx:846 (`FreeSlotCard`) — the RESTING (non-dragging) value
  // of `zIndex: isDragging ? 10 : 1`. A free-mode draggable card is
  // exactly "content within the box".
  memberContent: 1,
  // Placeholder — not wired today. Content that bleeds past its own
  // slot but stays inside the parent box (e.g. a future overflowing
  // member preview).
  memberOverflow: 1,
  // Placeholder — not wired today. A connector line drawn within one
  // component's own box (distinct from `Trace`/cross-canvas wires,
  // which are host-composed and out of scope for a single box's ladder).
  wire: 1,
  // NEW — block.tsx's `block-header` / `block-footer`. Not a
  // pre-existing literal: today those two slots are non-positioned and
  // structurally lose to ANY positioned sibling (including a
  // `position: relative` `BlockMembers` region with z-index:auto),
  // which is exactly backwards for nesting. `headerChrome` is what a
  // Block's own chrome needs to beat its own members region — see this
  // file's header comment and `PaintOrder.stories.tsx`'s
  // `NestedChildStaysBehindHeader`.
  headerChrome: 2,
  // blockPort.tsx:412 (`BlockFunctionPort`) and blockPort.tsx:538
  // (`BlockPortRail`'s wrapper) — both were `zIndex: 1`. A port's own
  // dot, whether the header's reserved function port or a rail item,
  // needs to sit above the Block it decorates (BlockPort.stories.tsx's
  // own `StackingAboveBlock`) — including above the Block's OWN
  // `headerChrome`, since the function port is literally the header's
  // pin. That relationship holds without portDot needing to outrank
  // headerChrome numerically: the whole `<Block>` is a SIBLING of the
  // rail/function-port divs inside `BlockPort`'s own isolated
  // `[data-slot="block-port"]` root, not a descendant of them, so the
  // comparison that actually matters is portDot's explicit positive
  // z-index vs. the whole (isolation-capped) Block's stack level 0 —
  // see this file's header comment.
  portDot: 1,
  // block.tsx:334 (`block-diagnostic-flag`) — was `zIndex: 1`. The
  // corner diagnostic badge.
  flagBadge: 1,
  // portEdge.tsx:1003 (`PortLaneOverlay`) — was `zIndex: 5`. The
  // floating multi-line lane editor.
  laneOverlay: 5,
  // portEdge.tsx:846 (`FreeSlotCard`) — the DRAGGING value of
  // `zIndex: isDragging ? 10 : 1`. Explicitly named, per the brief's own
  // instruction, so the one place a gesture leaks into paint order is
  // visible and reviewable rather than inline.
  dragActive: 10,
  // Placeholder — not wired today. Block's own halo highlighter
  // (`highlighterKind="halo"`) is a `boxShadow`, which needs no z-index
  // at all; this tier exists so a future halo-as-overlay implementation
  // has a named slot at the top of the ladder without inventing a
  // number.
  diagnosticHalo: 1,
});

/** Look up one tier's frozen z-index value. The only way any component
 *  in `src/components` may produce a `zIndex` — see
 *  `paintOrder.test.ts`'s grep guard, which fails on any raw numeric
 *  `zIndex` literal surviving in this directory. */
export function paintTier(name: PaintTierName): number {
  return PAINT_TIER_VALUE[name];
}

/**
 * The one structural half of the ruling: every component root that
 * emits any tier above must set this. Spread onto that root's `style`.
 * Kept as a named export (rather than callers writing the literal
 * object) so `PaintOrder.stories.tsx` can assert every emitting root
 * used exactly this, not a hand-rolled equivalent.
 */
export const ISOLATED_ROOT_STYLE = { isolation: "isolate" } as const;
