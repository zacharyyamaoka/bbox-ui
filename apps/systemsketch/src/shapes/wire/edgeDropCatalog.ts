// src/shapes/wire/edgeDropCatalog.ts — what bbox studio is willing to create
// when a cable lands on nothing (backlog W1-24, and Zach's ruling 6 on it:
// "but reduce the presets to only the 5 most common").
//
// The trunk deliberately ships no catalog (`@trunk/editor/nodeCatalog.ts`'s
// own header: the kit "ships no catalog of its own"), so this table is the
// HOST's, and this file is the pure half of it — no React, no tldraw, so the
// five entries and the port specs they mint are unit-testable in node
// (`edgeDropCatalog.test.ts`). `dropMenu.tsx` is the React half and imports
// from here. Same split `chrome/ContextualPopupMenu/arrangeActions.ts` uses.
//
// ── WHY FIVE, AND WHY THESE FIVE ────────────────────────────────────────
//
// The donor's picker (`/home/bam/systemsketch/src/blocks/connections/
// blockPicker.ts:37-54`, read-only) offers fourteen: Call · Transform ·
// Branch · Store · Sink · Source · Value · Bundle · Unbundle · Copy · Set
// attributes · Select · Clock/Trigger · Expanded group. Zach cut that to
// five. The five below are picked from what this repo's own corpus actually
// builds, not from taste — every number here was counted on disk 2026-09-21
// and the command that counts it is in the report.
//
// The cut is made on ONE axis, because it is the only axis this app's
// document can tell apart: a preset is a distinct (inputs, outputs, view)
// SHAPE. Nine of the donor's fourteen — Call, Transform, Store, Copy, Value,
// Bundle, Unbundle, Set attributes, Select — differ from each other only in
// `blockPicker.ts`'s `blockType` and `stockPreset` fields, and `ss-block` has
// NEITHER (`BlockShapeUtil.tsx:94-108`: w, h, name, view, ports, anchors, and
// nothing else). Shipping them here would mint five menu rows that create
// five identical blocks wearing five different names — the picker promising
// what the document cannot keep. So they collapse into the one row this app
// can honestly express, and that row's honest name is Block ("everything is
// really a block" — Zach, the 2026-09-18 ASK; the donor's own header says the
// same from the other side: "SystemSketch has one Block type rather than the
// kits' node zoo, so the offer is a small set of shaped presets plus a plain
// Block").
//
// What the corpus builds, by role, counting `name:` literals across
// `apps/storybook-basics/src` + `apps/systemsketch/src`:
//
//   Block      1 in / 1 out, port     74  filter 23, amp 17, proc 6, gain 6,
//                                         mix 4, enc 4, stage 3, smooth 3,
//                                         prog 3, Amp 3, trim 2
//   Source     0 in / 1 out, port     14  src 11, Source 3
//   Sink       1 in / 0 out, port     13  sink 10, Sink 3
//   Branch     1 in / 2 out, port     11  kind:"branch" 9 + name:"Branch" 2,
//                                         plus the only BUILT node preset in
//                                         the trunk with fixtures AND a test
//                                         (`scene/region.branch.ts/`), and five
//                                         ControlFlow*.stories.tsx files
//   Group      1 in / 1 out, expanded 18  kind:"expanded-block" 10 +
//                                         view:"expanded" 8 in this app
//
// And what lost, so it is not relitigated:
//   - Store 1, Copy 2, Select (as a block) 0, Bundle 0, Unbundle 0, Set
//     attributes 0, Clock/Trigger 0 literal hits — and each needs one of the
//     donor's `stockBlocks.ts` factories, which this repo has no counterpart
//     for. An entry that cannot build what it promises is worse than an
//     absent one.
//   - Value is the near miss: `components/block.value.tsx` is real and eight
//     files import it. It loses on THIS app, not on merit — the capsule is
//     `view: "value"` in the donor and `ss-block`'s view enum is
//     `"simple" | "port" | "expanded"` (BlockShapeUtil.tsx:98). It is the
//     first entry to add the day that enum grows.
//   - Loop outscores several keepers (`kind: "loop"` 12, "For Loop" 15) and
//     is deliberately NOT here: `scene/region.loop.ts:1-12` mints a
//     `type: "region"` node — a container, not a leaf a loose cable can
//     answer.
//
// NO "more" affordance, deliberately: `EdgeDropMenu` renders one flat list
// with no overflow row (`@trunk/editor/edgeDropMenu.tsx` — the donor's own
// "Quick insert" / "Other Blocks" grouping was explicitly NOT ported), and
// the lane brief says do not build one that is not already there. The other
// nine reach the board through the Block tool and the inspector, as they do
// today.

import type { NodeCatalogEntry } from "@trunk/editor/nodeCatalog";
import type { PortDirection } from "@trunk/scene/lint";
import { formatPortDeclaration } from "@trunk/scene/portDeclaration";

import type { BlockPortSpec, BlockView } from "../block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE, type PortSide } from "../types";

/**
 * One row of the catalogue: a `NodeCatalogEntry` (what the trunk's menu and
 * `catalogFor` read) plus the `ss-block` facts `onPick` needs to build it.
 *
 * WHY the port IDS rather than just counts: `NodeCatalogEntry` carries
 * `inputs`/`outputs` as numbers, and the judge and the creator both need the
 * actual strings — the judge to name ports on its hypothetical node, the
 * creator to mint them and to bind the cable to one. Deriving the counts from
 * the id arrays (below) is what stops "advertised 2 outputs, created 1" from
 * ever being expressible.
 */
export interface EdgeDropPreset extends NodeCatalogEntry {
  readonly view: BlockView;
  readonly w: number;
  readonly h: number;
  /** Left-rail (sink) port ids, in rail order. */
  readonly inPortIds: readonly string[];
  /** Right-rail (source) port ids, in rail order. */
  readonly outPortIds: readonly string[];
}

/** The default `ss-block` box, read from `BlockShapeUtil.getDefaultProps()`
 *  rather than invented, so a dropped Block matches a drawn one. */
const BLOCK_W = 160;
const BLOCK_H = 100;

/** A Branch carries two dots on one rail, so it gets the taller box rather
 *  than squeezing them into the 100px default. */
const BRANCH_H = 140;

/** The expanded box this app already uses everywhere it makes one by hand
 *  (menus.smoke 300×200, blockHitTest.smoke 320×240, wiring.smoke 300×220) —
 *  a container needs room for what goes in it. */
const GROUP_W = 320;
const GROUP_H = 240;

function preset(
  spec: Omit<EdgeDropPreset, "inputs" | "outputs">,
): EdgeDropPreset {
  // The counts are DERIVED, never authored — see the interface's own WHY.
  return { ...spec, inputs: spec.inPortIds.length, outputs: spec.outPortIds.length };
}

/**
 * The five. Order is the order the menu renders (`catalogFor` is
 * order-preserving), most-used first.
 *
 * No `icon` on any row: this app mounts no `GlyphResolverProvider`, so a
 * `lucide:` name would render an empty slot marked `data-unresolved`
 * (`glyph.tsx`'s own contract). An absent icon renders the same empty slot
 * honestly.
 */
export const EDGE_DROP_CATALOG: readonly EdgeDropPreset[] = [
  preset({ id: "block", label: "Block", kind: BLOCK_SHAPE_TYPE, view: "port", w: BLOCK_W, h: BLOCK_H, inPortIds: ["in"], outPortIds: ["out"] }),
  preset({ id: "source", label: "Source", kind: BLOCK_SHAPE_TYPE, view: "port", w: BLOCK_W, h: BLOCK_H, inPortIds: [], outPortIds: ["out"] }),
  preset({ id: "sink", label: "Sink", kind: BLOCK_SHAPE_TYPE, view: "port", w: BLOCK_W, h: BLOCK_H, inPortIds: ["in"], outPortIds: [] }),
  preset({ id: "branch", label: "Branch", kind: BLOCK_SHAPE_TYPE, view: "port", w: BLOCK_W, h: BRANCH_H, inPortIds: ["in"], outPortIds: ["then", "else"] }),
  preset({ id: "group", label: "Group", kind: BLOCK_SHAPE_TYPE, view: "expanded", w: GROUP_W, h: GROUP_H, inPortIds: ["in"], outPortIds: ["out"] }),
];

/**
 * The port the loose cable binds to once `preset` is created: the FIRST dot
 * on the rail the cable needs.
 *
 * WHY first rather than "nearest" or "best": a Branch advertises `then` and
 * `else`, and nothing at drop time distinguishes them — the user picked a
 * shape, not an outcome. Rail order is the one deterministic answer, it is
 * the order the rail paints, and re-aiming the cable afterwards is a drag.
 * `undefined` when the preset has no such rail, which `catalogFor`'s own
 * polarity filter already makes unreachable from the menu — it is the caller's
 * belt-and-braces, not a second opinion.
 */
export function landingPortId(preset: EdgeDropPreset, want: PortDirection): string | undefined {
  return want === "sink" ? preset.inPortIds[0] : preset.outPortIds[0];
}

/**
 * The `ss-block` `props.ports` for `preset`, every port annotated `type`.
 *
 * WHY every port inherits the anchored end's type rather than only the one
 * the cable lands on: the cable the user just asked for is type-agreeing by
 * construction, and a Branch's two outlets carry what came in. An empty
 * `type` produces a bare name and never a trailing colon —
 * `formatPortDeclaration` owns that reading, this file does not restate it.
 *
 * WHY a `declaration` line rather than the `{name, type}` pair this minted
 * until 2026-09-21: ruling 8, landed by its own lane in `shared/props.ts`'s
 * `PortSpecV`. Zach: "we don't have this cnocept of Type as a seperate
 * thing.. You can parse it from the CodeEditor though for what follows the :
 * it just python". A port this menu creates is therefore editable in place
 * the moment it lands, which a separately-stored type never was.
 */
export function presetPorts(preset: EdgeDropPreset, type: string): Record<PortSide, BlockPortSpec[]> {
  const spec = (ids: readonly string[]): BlockPortSpec[] =>
    ids.map((id) => ({ id, declaration: formatPortDeclaration(id, type) }));
  return { top: [], right: spec(preset.outPortIds), bottom: [], left: spec(preset.inPortIds) };
}

/** The same table as `presetPorts`, in the id-only spelling `DocNodeData`
 *  speaks (`sceneFromStore.ts:47-49` — the scene "only ever names ports; it
 *  never places them"). Shared so the scene the judge examines cannot drift
 *  from the shape `onPick` creates. */
export function presetDocPorts(preset: EdgeDropPreset): Partial<Record<PortSide, string[]>> {
  return { left: [...preset.inPortIds], right: [...preset.outPortIds], top: [], bottom: [] };
}
