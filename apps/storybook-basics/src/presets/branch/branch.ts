// src/presets/branch/branch.ts — the BRANCH preset: `if`/`elif`/`else` and
// `match`/`case` as DATA over the generic Region (docs/CONTROL-FLOW-PLAN.md
// lane C). Pure: no React, no DOM, no canvas engine — scene records in, scene
// records out.
//
// There is no `BranchRegion` component here and there will not be one.
// `components/region.tsx` already draws a frame, a real Block in its corner
// and a stack of arm rows; a branch is those three carrying particular DATA.
// That is the same relationship `presets/value` has to `Block`/`BlockPort`
// (Zach, 2026-09-17: "it is just a preset though of the block"), and it is
// what keeps a second host — stream 2's SystemSketch, a tldraw shape, an SVG
// export — reading ONE region renderer instead of a branch-shaped fork.
//
// ── Q1/V1: THE CORNER BLOCK HAS NO OUTPUT WALL ─────────────────────────
// A branch's corner block carries the CONDITION input(s) and nothing else.
// The research recommended V2 (yield ports on the region border, 90/100);
// Zach picked V1 (78) on 2026-09-02 anyway, in his own words: yields "get
// messy — then you don't know which of those ports are firing", whereas
// wires always read as straight dataflow. So the arms' results fan in at the
// CONSUMER's ordinary port — two sibling-arm cables landing on one dot ARE
// the join (`C - Branch Region Asymmetry (Scopes See In, Only Yields Come
// Out)`: the φ is real, the input crossing is not). `branchNode` therefore
// writes `ports: { left: conditions }` and never a `right` wall; a future
// yield-dot variant is a change to THIS factory, not to `region.tsx`.
//
// ── Q2: THE TITLE IS `Branch` ──────────────────────────────────────────
// The header is the region's NAME, not its condition — the conditions are
// ports, and the arms carry the source headers (`if fast:`). Zach's own
// sketches label ad-hoc corner blocks `Selector` and `Switch`; `name` is
// ordinary data and a fixture may say either, but the default is `Branch`.

import type { HostNodeData } from "../../hosts/hostScene";
import type { RegionView } from "../../hosts/regionScene";
import { ARM_NODE_TYPE } from "../../scene/controlFlow";
import { REGION_NODE_TYPE } from "../../scene/region";
import type { SceneNode, ScenePosition } from "../../scene/scene";

/** One arm, as an author writes it. `title` is free text, human readable —
 *  `if fast:`, `case "go":` — never code to be parsed back. */
export interface BranchArmSpec {
  id: string;
  title: string;
  /** Default `true`. */
  open?: boolean;
  /** Body height while open, px. Default `REGION_ARM_DEFAULT_BODY_PX`. */
  h?: number;
}

export interface BranchNodeOptions {
  id: string;
  /** Default `"Branch"` (Q2). */
  name?: string;
  position: ScenePosition;
  /** The FRAME's width; the corner block hugs at `REGION_CORNER_WIDTH_PX`. */
  w?: number;
  /** Omitted = the frame hugs its arms (`regionLayout`). */
  h?: number;
  /** The condition port(s) on the corner block's LEFT wall. */
  conditions?: readonly string[];
  arms: readonly BranchArmSpec[];
  view?: RegionView;
  /** At most one. Absent = every arm is active (donor branchModel.ts:11-12). */
  activeArm?: string;
  /** Nesting: an arm id when this branch lives inside another branch's arm. */
  parentId?: string;
}

/**
 * One branch → the region node FOLLOWED by one arm node per arm, in the
 * order they were authored. The caller spreads the array into its scene and
 * parents each member block at the ARM it belongs to.
 *
 * Returning an array rather than a nested record is the scene kit's own
 * shape: `parentId` IS the nesting (scene.ts), so a branch is simply N+1
 * ordinary nodes and every existing query — `childrenOf`, `descendantsOf`,
 * `armsOf`, `ancestorsOf` — works on it with no branch-specific code.
 */
export function branchNode({
  id,
  name = "Branch",
  position,
  w = 520,
  h,
  conditions = ["cond"],
  arms,
  view = "expanded",
  activeArm,
  parentId,
}: BranchNodeOptions): SceneNode<HostNodeData>[] {
  const region: SceneNode<HostNodeData> = {
    id,
    type: REGION_NODE_TYPE,
    position,
    ...(parentId === undefined ? null : { parentId }),
    data: {
      name,
      region: { kind: "branch", view, ...(activeArm === undefined ? null : { activeArm }) },
      // WHY left-only, with no `right` wall anywhere in this factory (Q1,
      // V1 — see this file's header): the region's interface is what it
      // DECIDES ON, and a branch yields nothing. An output port here would
      // be the yield dot Zach rejected, and it would quietly make the fan-in
      // at the consumer redundant — two ways to draw one join is exactly the
      // "then you don't know which of those ports are firing" failure.
      ports: { left: [...conditions] },
      w,
      ...(h === undefined ? null : { h }),
    },
    // NEVER a `definitionId`: a region is ISOLATED (scene/region.ts's own
    // header ruling). `definitionId` marks membership in a definition GROUP
    // — occurrences of one reusable thing — and a branch has no signature to
    // be an occurrence of. Two branches that look alike are two branches.
  };
  return [region, ...arms.map((arm) => armNode(arm, id))];
}

/**
 * One arm → one NODE whose parent is the region (plan §2.C).
 *
 * WHY an arm is a node and not a `data.arm: "if"` marker on each member:
 * `SceneNode.position` is documented as living "in the PARENT's coordinate
 * space when `parentId` is set" (scene.ts:60-72), so parenting a member at
 * its ARM is the only thing that makes its authored position survive a
 * SIBLING arm folding — with a marker, folding arm 1 would move arm 2's
 * origin and every member position below it would have to be rewritten. It
 * also means an arm gets containment, descendants and keep-outs for free,
 * because it is an ordinary node to every query in the scene kit.
 *
 * The arm's own `position` is `{0, 0}` and is never read: rows are STACKED
 * by `regionLayout` from the corner block's measured height, so a written
 * position would be a second, disagreeing source of truth for the same
 * number.
 *
 * pyblocks DIVERGES here and the divergence is deliberate (plan §12): its P1
 * projection puts an `If`'s children directly under `region:if` with the arm
 * structure implied by source line ranges. `to_systemsketch` mints one arm
 * node per arm and re-parents by line range; nothing is averaged.
 */
export function armNode(arm: BranchArmSpec, regionId: string): SceneNode<HostNodeData> {
  return {
    id: arm.id,
    type: ARM_NODE_TYPE,
    parentId: regionId,
    position: { x: 0, y: 0 },
    data: {
      name: arm.title,
      arm: { open: arm.open ?? true, ...(arm.h === undefined ? null : { h: arm.h }) },
    },
  };
}

/**
 * `["fast", 'mode == "safe"']` → `if fast:` / `elif mode == "safe":` /
 * `else:`, with ids `if`, `elif`, `elif-2`… and `else`.
 *
 * The condition strings are rendered VERBATIM into the titles — an arm's
 * header is the source header a reader recognises, so `mode == "safe"` keeps
 * its spaces and its quotes (truthful property rendering). No condition at
 * all is a lone `else:`, which is what a `match` fallback or an empty guard
 * chain honestly is.
 */
export function ifElifElseArms(conditions: readonly string[]): BranchArmSpec[] {
  return [
    ...conditions.map((condition, index) => ({
      id: index === 0 ? "if" : index === 1 ? "elif" : `elif-${index}`,
      title: index === 0 ? `if ${condition}:` : `elif ${condition}:`,
    })),
    { id: "else", title: "else:" },
  ];
}

/**
 * `['"go"', '"stop"']` → `case "go":` / `case "stop":` / `case _:`, ids
 * `case-1`, `case-2`… and `case-_`.
 *
 * WHY `match`/`case` needs no shape of its own: it is the same region, the
 * same corner block carrying the subject as a condition port, and the same
 * arm rows — only the titles differ. Case VIEW (one arm behind a `◀ ▶`
 * selector) is deliberately not built: the donor's own definition of it is
 * "the Expanded layout with at most one arm open per region"
 * (branchModel.ts:12-13), which is per-arm fold — already shipped by lane A.
 */
export function matchCaseArms(cases: readonly string[]): BranchArmSpec[] {
  return [
    ...cases.map((subject, index) => ({ id: `case-${index + 1}`, title: `case ${subject}:` })),
    { id: "case-_", title: "case _:" },
  ];
}
