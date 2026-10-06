// src/scene/region.branch.ts — the BRANCH preset: `if`/`elif`/`else` and
// `match`/`case` as DATA over the generic Region (docs/CONTROL-FLOW-PLAN.md
// lane C). Pure: no React, no DOM, no canvas engine — scene records in, scene
// records out.
//
// There is no `BranchRegion` component here and there will not be one.
// `components/blockRegion.tsx` already draws a frame, a real Block in its corner
// and a stack of arm rows; a branch is those three carrying particular DATA.
// That is the same relationship `components/block.value.tsx` has to `Block`/`BlockPort`
// (Zach, 2026-09-17: "it is just a preset though of the block"), and it is
// what keeps a second host — stream 2's SystemSketch, a tldraw shape, an SVG
// export — reading ONE region renderer instead of a branch-shaped fork.
//
// ── Q1/V1: THE CORNER BLOCK HAS NO OUTPUT WALL ─────────────────────────
// A branch's corner block carries its input(s), if it has any, and nothing
// else. The research recommended V2 (yield ports on the region border,
// 90/100); Zach picked V1 (78) on 2026-09-02 anyway, in his own words:
// yields "get messy — then you don't know which of those ports are
// firing", whereas wires always read as straight dataflow. So the arms'
// results fan in at the CONSUMER's ordinary port — two sibling-arm cables
// landing on one dot ARE the join (`C - Branch Region Asymmetry (Scopes
// See In, Only Yields Come Out)`: the φ is real, the input crossing is
// not). No factory below ever writes a `right` wall on the region; a
// future yield-dot variant is a change to one of THESE factories, not to
// `components/blockRegion.tsx`. (Which wall, if any, the corner block's
// LEFT carries now differs by factory — see "the split" below: `matchNode`
// puts the one shared subject there, `branchNode` puts nothing there at
// all, because an `if`/`elif` ladder has no shared subject to put.)
//
// ── Q2: THE TITLE IS `Branch` ──────────────────────────────────────────
// The header is the region's NAME, not its condition — the conditions are
// ports, and the arms carry the source headers (`if fast:`). Zach's own
// sketches label ad-hoc corner blocks `Selector` and `Switch`; `name` is
// ordinary data and a fixture may say either, but the default is `Branch`.
//
// ── SPLIT, 2026-09-22: `match` IS NOT `if`/`elif`/`else` ────────────────
// Everything above described ONE shape; it was already false the day the
// grammar shipped (`reports/media/truthful-branching-2026-09-22.html`,
// picked apart from the committed fixtures the same afternoon). The rule
// that resolves it: **a dot is a value the structure consumes, and its
// POSITION says who consumes it.**
//   - `match` — ONE subject, tested once, on the HEAD card. Arms carry
//     static PATTERNS — text, because a pattern is MATCHED, never
//     EVALUATED — so an arm owns no operand of its own. This is a LabVIEW
//     Case Structure, and it is the one fixture (`MATCH_CASE`) the old
//     single-factory code already drew correctly by accident.
//   - `if`/`elif`/`else` — NO head operand: there is no subject shared
//     between arms, only N independent booleans evaluated in order. Each
//     arm owns ITS test, so each arm owns ITS OWN dot, on the arm's own
//     header. `else` tests nothing and so carries none.
// Conflating the two was the bug (`matchCaseArms`/`ifElifElseArms` used to
// differ only in the strings they wrote — this file's own prior comment
// said so). `branchNode` and `matchNode` are now two factories because they
// are two shapes; sharing one would still be sharing a lie between them.
//
// The evaluated-vs-matched line is mechanical, not a vibe: anything with a
// side effect (a call, an attribute read, a comparison) is EVALUATED, so it
// is a VALUE and owes a dot — never legitimately a case pattern. A pattern
// that also BINDS (`case Point(x=0, y=y)`) is the header producing a value
// INTO the arm, which is `captures`, not `test` — the header supplies one,
// the arm supplies the other, and an arm never does both (mutual exclusion
// is enforced at construction below; the flat `BranchArmSpec` interface
// does not encode it in its own shape, so `assertArmShape` is the checkable
// form the acceptance suite exercises).

import type { BlockSide } from "../components/port.layout";
import type { HostNodeData } from "../hosts/hostScene";
import type { RegionView } from "../hosts/regionScene";
import { ARM_NODE_TYPE } from "./controlFlow";
import { REGION_NODE_TYPE } from "./region";
import type { SceneNode, ScenePosition } from "./scene";

/**
 * One arm's own operand: the test it is selected by.
 *
 * `id` is the port id carried on the ARM's own header — never on the
 * region's corner card, because an `if`/`elif` arm's test belongs to that
 * arm alone, not to a subject the whole branch shares (there is none).
 * `ifElifElseArms` below reuses the arm's own id as `id`: it is already
 * unique per arm and stable across a re-render, and a second, independently
 * chosen name would just be a second way to say the same thing.
 */
export interface ArmTest {
  /** The port id carried on the ARM's own header. */
  id: string;
  /**
   * The expression shown inline when nothing is wired — the port is then in
   * `PortState "valueSet"` ("owns a default"). Absent = no inline default.
   */
  default?: string;
}

/** One arm, as an author writes it. `title` is the arm's LABEL only —
 *  `if`, `elif`, `else`, `case "go":` — never the expression: an evaluated
 *  expression is a value and owes a dot, so it lives in `test`, not here. */
export interface BranchArmSpec {
  id: string;
  title: string;
  /** if/elif only: this arm's own boolean operand. `else` has none.
   *  Mutually exclusive with `captures` (see this file's header). */
  test?: ArmTest;
  /** match only: the names this arm's PATTERN binds INTO its body
   *  (`case Point(x=0, y=y)` binds `y`). Mutually exclusive with `test`. */
  captures?: readonly string[];
  /** Default `true`. */
  open?: boolean;
  /** Body height while open, px. Default `REGION_ARM_DEFAULT_BODY_PX`. */
  h?: number;
}

/** Throws if an arm carries both its own operand and a pattern capture —
 *  the header supplies one or the other, never both — or if it carries the
 *  field its OWN region kind forbids (`branchNode` forbids `captures`,
 *  `matchNode` forbids `test`). The type alone does not stop this
 *  (`BranchArmSpec` is a flat interface, not a discriminated union, per the
 *  decided shape above), so this is the checkable form. */
function assertArmShape(arm: BranchArmSpec, forbidden: "test" | "captures"): void {
  if (arm.test !== undefined && arm.captures !== undefined) {
    throw new Error(`arm "${arm.id}" carries both test and captures — an arm supplies one or the other, never both`);
  }
  if (forbidden === "captures" && arm.captures !== undefined) {
    throw new Error(`arm "${arm.id}" carries captures, but if/elif/else arms bind nothing of their own — captures are match's, from the pattern`);
  }
  if (forbidden === "test" && arm.test !== undefined) {
    throw new Error(`arm "${arm.id}" carries a test, but match arms test nothing of their own — the subject is on the head card`);
  }
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
  arms: readonly BranchArmSpec[];
  view?: RegionView;
  /** At most one. Absent = every arm is active (donor branchModel.ts:11-12). */
  activeArm?: string;
  /** Nesting: an arm id when this branch lives inside another branch's arm. */
  parentId?: string;
}

export interface MatchNodeOptions {
  id: string;
  /** Default `"Branch"` (Q2). */
  name?: string;
  position: ScenePosition;
  /** The FRAME's width; the corner block hugs at `REGION_CORNER_WIDTH_PX`. */
  w?: number;
  /** Omitted = the frame hugs its arms (`regionLayout`). */
  h?: number;
  /** The ONE subject, tested once, on the corner block's LEFT wall. */
  subject: string;
  arms: readonly BranchArmSpec[];
  view?: RegionView;
  /** At most one. Absent = every arm is active (donor branchModel.ts:11-12). */
  activeArm?: string;
  /** Nesting: an arm id when this branch lives inside another branch's arm. */
  parentId?: string;
}

/**
 * The `if`/`elif`/`else` factory → the region node FOLLOWED by one arm node
 * per arm, in the order they were authored. The caller spreads the array
 * into its scene and parents each member block at the ARM it belongs to.
 *
 * Returning an array rather than a nested record is the scene kit's own
 * shape: `parentId` IS the nesting (scene.ts), so a branch is simply N+1
 * ordinary nodes and every existing query — `childrenOf`, `descendantsOf`,
 * `armsOf`, `ancestorsOf` — works on it with no branch-specific code.
 *
 * NO head ports (this file's header, "the split"): there is no subject
 * shared between arms, so the corner card carries only its `name`. An arm
 * that tries to bind a pattern (`captures`) is rejected — captures come
 * from a matched pattern, and an `if`/`elif` arm has none.
 */
export function branchNode({
  id,
  name = "Branch",
  position,
  w = 520,
  h,
  arms,
  view = "expanded",
  activeArm,
  parentId,
}: BranchNodeOptions): SceneNode<HostNodeData>[] {
  for (const arm of arms) assertArmShape(arm, "captures");
  const region: SceneNode<HostNodeData> = {
    id,
    type: REGION_NODE_TYPE,
    position,
    ...(parentId === undefined ? null : { parentId }),
    data: {
      name,
      region: { kind: "branch", view, ...(activeArm === undefined ? null : { activeArm }) },
      // WHY no `ports` at all, on ANY wall (Q1/V1, and now the split too):
      // the region's interface is what it DECIDES ON, and an `if`/`elif`
      // ladder decides on nothing AS A WHOLE — each arm decides on its own
      // boolean, which is why that operand moved onto the ARM's own header
      // below (`armNode`) instead of living here. A `right` wall would
      // still be the yield dot Zach rejected (V1); a `left` wall here would
      // now ALSO be the wrong-shape "shared subject" `match` alone owns.
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
 * The `match`/`case` factory — a LabVIEW Case Structure, not an `if` ladder
 * wearing different titles (this file's header, "the split"). ONE subject,
 * tested once, on the corner card's LEFT wall; arms carry PATTERNS, which
 * are text because a pattern is matched, never evaluated, so no arm owns an
 * operand of its own. An arm that carries `test` is rejected — that
 * operand belongs to an `if`/`elif` arm, and a match arm has none.
 *
 * Shares `armNode`/the return shape with `branchNode` on purpose: both are
 * still "the region node followed by one arm node per arm" (plan §2.C) —
 * only the HEAD's interface and what an arm may carry differ.
 */
export function matchNode({
  id,
  name = "Branch",
  position,
  w = 520,
  h,
  subject,
  arms,
  view = "expanded",
  activeArm,
  parentId,
}: MatchNodeOptions): SceneNode<HostNodeData>[] {
  for (const arm of arms) assertArmShape(arm, "test");
  const region: SceneNode<HostNodeData> = {
    id,
    type: REGION_NODE_TYPE,
    position,
    ...(parentId === undefined ? null : { parentId }),
    data: {
      name,
      // `kind` stays `"branch"`, not a new `"match"`: `RegionKind` is
      // `hosts/regionScene.ts`'s vocabulary, frozen to this lane, and a
      // third kind is a change to that file's own contract, not to this
      // one's. `match` and `if`/`elif`/`else` are told apart by their
      // SHAPE — one head port and no arm tests, vs. none and one each — the
      // same way this file already tells a `branch` from a `loop` region
      // apart by what rides its ports, not by a field this factory owns.
      region: { kind: "branch", view, ...(activeArm === undefined ? null : { activeArm }) },
      // The ONE subject, on the LEFT wall — never `right` (Q1/V1: a region
      // still yields nothing; the arms' results still fan in at the
      // consumer, exactly as an `if` ladder's do).
      ports: { left: [subject] },
      w,
      ...(h === undefined ? null : { h }),
    },
    // NEVER a `definitionId` — see `branchNode`'s identical note.
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
 *
 * WHY `test`/`captures` land in `data.ports`, the SAME generic bag every
 * other node kind already uses, rather than a new field on `ArmData`
 * (`hosts/regionScene.ts`, frozen to this lane): an arm IS a block
 * ("everything is a block"), and its operand and its bindings ARE its
 * ports — a boolean coming IN sits on the LEFT wall exactly where an
 * ordinary block's input would, and a pattern capture going OUT to the
 * arm's own body sits on the RIGHT wall exactly where an ordinary block's
 * output would (the report: "a value the header produces INTO the arm — a
 * square dot, facing right"). No new vocabulary, and nothing here decides
 * what `blockRegion.tsx` does with it — the tab rendering `test.default`
 * as an inline literal (`BlockValue`'s own precedent) is the separate,
 * later change the report's own punch list names (item 3); this factory
 * only has to stop lying about where the value lives.
 */
export function armNode(arm: BranchArmSpec, regionId: string): SceneNode<HostNodeData> {
  const ports: Partial<Record<BlockSide, string[]>> = {};
  if (arm.test !== undefined) ports.left = [arm.test.id];
  if (arm.captures !== undefined && arm.captures.length > 0) ports.right = [...arm.captures];
  return {
    id: arm.id,
    type: ARM_NODE_TYPE,
    parentId: regionId,
    position: { x: 0, y: 0 },
    data: {
      name: arm.title,
      arm: {
        open: arm.open ?? true,
        ...(arm.h === undefined ? null : { h: arm.h }),
        // WHY the test and the captures are written TWICE — here and on the
        // walls above: `ports` carries only the port ID, which is all a wire
        // needs, and dropping `default` here left the inline expression with
        // nowhere to live. A scene round-tripped through this factory then
        // drew a bare dot with the condition gone — "hiding things inside
        // the header" reintroduced one layer down, which is the exact
        // failure this split exists to end. `hosts/nodeViews.tsx` reads
        // these two back into `RegionArm.test`/`.captures`.
        ...(arm.test === undefined ? null : { test: arm.test }),
        ...(arm.captures === undefined || arm.captures.length === 0 ? null : { captures: [...arm.captures] }),
      },
      ...(Object.keys(ports).length === 0 ? null : { ports }),
    },
  };
}

/**
 * `["fast", 'mode == "safe"']` → `if:` / `elif:` / `elif:` / `else:`, with
 * ids `if`, `elif`, `elif-2`… and `else` — each non-`else` arm carrying its
 * OWN `test`, id `= arm.id` (already unique per arm, already stable across
 * a re-render — a second, independently chosen name would just be a second
 * way to say the same thing) and `default` the condition string verbatim.
 *
 * The expression no longer rides the TITLE (the split, this file's
 * header): a title is a LABEL, and an evaluated expression is a value that
 * owes a dot. `mode == "safe"` keeps its spaces and its quotes in
 * `test.default` (truthful property rendering) — only WHERE it is written
 * moved, not its characters. No condition at all is a lone `else:`, which
 * is what an empty guard chain honestly is.
 */
export function ifElifElseArms(tests: readonly string[]): BranchArmSpec[] {
  return [
    ...tests.map((test, index) => {
      const id = index === 0 ? "if" : index === 1 ? "elif" : `elif-${index}`;
      return { id, title: index === 0 ? "if:" : "elif:", test: { id, default: test } };
    }),
    { id: "else", title: "else:" },
  ];
}

/**
 * `['"go"', '"stop"']` → `case "go":` / `case "stop":` / `case _:`, ids
 * `case-1`, `case-2`… and `case-_`. No arm carries a `test` — the subject
 * lives once, on `matchNode`'s own head card, and a pattern is text because
 * it is MATCHED, never evaluated (this file's header, "the split").
 *
 * SUPERSEDED CLAIM, kept as a marker so the mistake stays visible: this
 * function's own prior comment said `match`/`case` "is the same region, the
 * same corner block carrying the subject as a condition port, and the same
 * arm rows — only the titles differ" as `ifElifElseArms`. That was the
 * conflation `region.branch.ts:171-187` pointed at
 * (`reports/media/truthful-branching-2026-09-22.html`, §"Your four TBDs,
 * answered · D") — `match` has ONE shared subject and static patterns;
 * `if`/`elif` has NO shared subject and N independent per-arm operands.
 * Splitting `branchNode`/`matchNode` is what makes that difference real
 * rather than a difference of taste in title strings.
 *
 * Case VIEW (one arm behind a `◀ ▶` selector) is deliberately not built:
 * the donor's own definition of it is "the Expanded layout with at most one
 * arm open per region" (branchModel.ts:12-13), which is per-arm fold —
 * already shipped by lane A.
 */
export function matchCaseArms(patterns: readonly string[]): BranchArmSpec[] {
  return [
    ...patterns.map((pattern, index) => ({ id: `case-${index + 1}`, title: `case ${pattern}:` })),
    { id: "case-_", title: "case _:" },
  ];
}
