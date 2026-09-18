// src/scene/containment.ts — judgeContainment: the CONTAINMENT twin of
// edgeValidation.ts's validateConnection. f(scene, a candidate re-parent
// not yet committed) → verdict. Pure, no React, no DOM, no canvas engine —
// the same rule the whole scene kit follows (CLAUDE.md: "the core imports
// no canvas engine"; scene.ts/edgeValidation.ts's own headers).
//
// WHY THIS FILE EXISTS RATHER THAN GROWING edgeValidation.ts: wiring and
// containment are two different gestures over two different relations
// (`SceneEdge` vs `SceneNode.parentId`) that happen to want the identical
// SHAPE of answer — "would this land be legal, and if not, why" — so the
// vocabulary is reused (`ConnectionMessage`, the same discriminated-union
// trick, the same injected-resolver style) without merging the two
// engines into one file that would have to know about both relations.
// Zach, 2026-09-17, on the sibling relationship directly: "we have the
// wiring validation but not the contained validation... 100% agree we
// should implement that."
//
// THE FOUR CARDS THIS FILE ANSWERS (2026-09-18 ratified plan, "your lane:
// containment"):
//   03 — the cycle guard, on the WRITE (not the drag). See `judgeContainment`
//        and `findContainmentCycles`.
//   07 — the empty-container lifecycle, default KEEP. See `emptyContainers`
//        and `pruneEmptyContainers`.
//   08 — containment as THREE INDEPENDENT policies, not one flag. See
//        `ContainmentPolicy`.
//   09 — containment validation, `judgeContainment` itself.
//
// WHAT THIS FILE DOES NOT DO: it does not move anything, resize anything,
// or touch a DOM rect. `ContainmentPolicy`'s three flags are RESOLVED and
// handed back in the verdict; APPLYING them (growing a parent's box,
// clamping a child's position) is host geometry, exactly the way
// `ConnectionOrientation.ends` is the edge to commit but committing it is
// the caller's write, not this function's.

import type { ConnectionMessage } from "./edgeValidation";
import { deleteNode, type DeletedNodeEdgePolicy, type OccurrenceData } from "./linking";
import { descendantsOf } from "./region";
import { childrenOf, findCycles, type BlockScene, type SceneData, type SceneEdgeEnds, type SceneNode } from "./scene";

/* ------------------------------------------------------------------ */
/* The verdict — the SAME two-case discriminant ConnectionVerdict is    */
/* (card 09, acceptance #4): `allowed: false` always carries `refusal`, */
/* `allowed: true` always carries `effect`. Constructing either case     */
/* without its payload fails to typecheck, for the identical reason      */
/* edgeValidation.ts's header gives — the silent case is unrepresentable */
/* rather than merely unused.                                            */
/* ------------------------------------------------------------------ */

/**
 * `refusal` is `ConnectionMessage`, IMPORTED from `edgeValidation.ts` —
 * never re-declared. One refusal vocabulary for the whole kit: a host that
 * renders a wiring refusal already knows how to render a containment one,
 * with zero new fields to learn. Severities are the pre-existing
 * `DiagnosticSeverity` ("error" | "warning" | "info") — this file mints no
 * new severity word anywhere (card 09, acceptance #4).
 */
export type ContainmentVerdict =
  | { readonly allowed: true; readonly effect: ContainmentEffect }
  | { readonly allowed: false; readonly refusal: ConnectionMessage };

/**
 * What committing this move would mean, beyond "yes". Carries the
 * RESOLVED policy so a caller cannot read "allowed" out of this function
 * without also being handed which of the three containment policies
 * apply — the identical discipline `ConnectionOrientation` uses to stop a
 * caller writing a backwards edge by forgetting a step
 * (`docs/peps/0002-the-judge-owns-edge-orientation.md`). There is no
 * shared `ALLOWED` singleton for the same reason edgeValidation.ts has
 * none: an allowed verdict is per-candidate data, because the resolved
 * policy can differ per parent.
 */
export interface ContainmentEffect {
  readonly policy: ContainmentPolicy;
}

/** The one move a caller judges: put `childId` under `parentId`, or —
 *  `parentId: undefined` — move it to top level. Top level is a LEGAL
 *  move to judge, not a missing argument: it still runs the permission
 *  gate (`permits(childKind, undefined)`) and still resolves a policy
 *  (the top-level default, since there is no parent to call `policyOf`
 *  on). */
export interface ContainmentMove {
  readonly childId: string;
  readonly parentId?: string;
}

function refuseContainment(code: string, message: string): ContainmentVerdict {
  return { allowed: false, refusal: { severity: "error", message, code } };
}

/** The cycle refusal's code (card 03). No `lint.ts` twin exists yet for
 *  this rule — `lint.ts`'s registry lints the WIRING relation only, and a
 *  `parentId` cycle is a different relation with no annotation-side rule
 *  written for it. Exported the same way `edgeValidation.ts` exports
 *  `CROSS_SCOPE`: a string constant so callers can match on it without
 *  restating the literal. */
export const CONTAINMENT_CYCLE: string = "containment-cycle";

/** The domain-permission refusal's code (card 09) — the `permits`
 *  callback said no. Also no `lint.ts` twin: whether a BT node may sit in
 *  an async region is a fact about a vocabulary (`kindOf`) this kit does
 *  not itself define, exactly like `edgeValidation.ts`'s `type-mismatch`
 *  contributing nothing until a caller supplies `typeOf`. */
export const CONTAINMENT_NOT_PERMITTED: string = "containment-not-permitted";

/* ------------------------------------------------------------------ */
/* Card 08 — containment as three INDEPENDENT policies                 */
/* ------------------------------------------------------------------ */

/**
 * Three per-container-kind booleans, resolved independently — never one
 * flag, never one global. Provenance (`docs/provenance/containment.md`):
 * maxGraph decomposes containment identically, as three separate
 * predicates a cell answers for itself (`isExtendParent`,
 * `isConstrainChild`, `isAllowOverlapParent` — `CellsMixin.ts:672-681`
 * composes them on add, `:1077-1081` on resize; `AbstractGraph.ts:1159-
 * 1175` feeds `allowOverlapParent` into `getOverlap`) — the field names
 * below are chosen to match that vocabulary directly rather than invent a
 * parallel one.
 *
 *   extendParent       the parent grows to keep the child inside it,
 *                       instead of the child being refused or clamped.
 *   constrainChild      the child is kept clamped inside the parent's own
 *                       box — the parent's geometry wins.
 *   allowOverlapParent  the child may straddle the parent's edge at all
 *                       (a permission `constrainChild` would otherwise
 *                       override; independent so a host can allow
 *                       overlap without also disabling the clamp, or
 *                       vice versa — maxGraph's own swimlane clamps
 *                       children while a group grows, per the SAME
 *                       fixture cited above).
 *
 * A caller table-drives every 2×2×2 combination and gets eight distinct
 * resolved policies (card 08, acceptance #3) — fusing any two of these
 * into one flag would collapse that table, which is exactly the mistake
 * this decomposition exists to prevent.
 */
export interface ContainmentPolicy {
  readonly extendParent: boolean;
  readonly constrainChild: boolean;
  readonly allowOverlapParent: boolean;
}

/**
 * Today's stance, field by field — permissive, matching
 * `DEFAULT_CONNECTION_POLICY`'s own bias (edgeValidation.ts) and Zach's
 * stated default-permissive taste ("by default I think everything should
 * connect"): nothing here grows a parent or clamps a child unless a host
 * opts in via `policyOf`, and nothing here forbids a child from
 * straddling a parent's edge unless a host opts OUT.
 */
export const DEFAULT_CONTAINMENT_POLICY: ContainmentPolicy = Object.freeze({
  extendParent: false,
  constrainChild: false,
  allowOverlapParent: true,
});

/* ------------------------------------------------------------------ */
/* judgeContainment — cards 03, 08, 09                                  */
/* ------------------------------------------------------------------ */

export interface JudgeContainmentOptions {
  /** A node's DOMAIN kind — "bt-node", "async-region", whatever the host's
   *  vocabulary is. Deliberately NOT `SceneNode.type` (React Flow's
   *  `nodeTypes` key, a RENDER concern, `scene.ts`'s own doc on the
   *  field) — a host may render two domain kinds with one component, or
   *  one domain kind with several, so asking rather than reading keeps
   *  this file out of that mapping. `undefined` means "unknown kind, no
   *  judgement" — the same convention `lint.ts`'s `PortsOf`/`PortTypeOf`
   *  already use. */
  kindOf?: (nodeId: string) => string | undefined;
  /** May a `childKind` sit inside a `parentKind`? `parentKind` is
   *  `undefined` for a move to TOP LEVEL. Omitted, every move is
   *  permitted — the identical "no vocabulary supplied, no opinion"
   *  contract `type-mismatch` uses without a `typeOf`. Zach's own
   *  acceptance case: a BT-kind node refused into an async-region parent
   *  is THIS callback saying no, never a table this file hardcodes. */
  permits?: (childKind: string | undefined, parentKind: string | undefined) => boolean;
  /** The containment policy for a given PARENT id, merged over
   *  `DEFAULT_CONTAINMENT_POLICY`. Never called for a move to top level —
   *  there is no parent to ask, so the top-level move resolves to the
   *  bare default. Mirrors `ValidateConnectionOptions.policy`'s per-call
   *  shape, but per-PARENT rather than per-call, because which policy
   *  applies is a property of the container, not of the move. */
  policyOf?: (parentId: string) => Partial<ContainmentPolicy>;
}

/**
 * Would moving `move.childId` under `move.parentId` (or to top level, if
 * `parentId` is `undefined`) be legal? Total: every branch returns a
 * verdict, none throws. Order: cycle guard first (a malformed move is
 * checked before anything bothers to have a domain opinion about it),
 * then the domain permission, then the policy resolution that backs an
 * "allowed" verdict.
 */
export function judgeContainment<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  move: ContainmentMove,
  options: JudgeContainmentOptions = {},
): ContainmentVerdict {
  const { childId, parentId } = move;

  // card 03 — the cycle guard, ON THE WRITE. Two shapes: parenting a node
  // to itself, and parenting it to one of its own descendants (which
  // includes the self case already, but the direct check reads better in
  // a refusal message and costs nothing extra). `descendantsOf` is
  // `region.ts`'s existing cycle-safe fixpoint — reused, not reimplemented
  // — so a 200-deep parent chain still returns in bounded time: the walk
  // is O(depth) rounds over the node list, never recursion, and a node
  // already in the accumulated set is never re-added.
  if (parentId !== undefined) {
    if (parentId === childId) {
      return refuseContainment(CONTAINMENT_CYCLE, `Node "${childId}" cannot be its own parent`);
    }
    if (descendantsOf(scene, [childId]).has(parentId)) {
      return refuseContainment(
        CONTAINMENT_CYCLE,
        `Node "${childId}" cannot move into "${parentId}" — "${parentId}" is already nested inside "${childId}"`,
      );
    }
  }

  // card 09 — the domain permission. Omitted `permits`, every move is
  // permitted; supplied, it is asked with resolved KINDS, never raw node
  // ids, so the callback stays a pure "may a `childKind` sit inside a
  // `parentKind`" predicate with no scene access of its own.
  if (options.permits) {
    const childKind = options.kindOf?.(childId);
    const parentKind = parentId === undefined ? undefined : options.kindOf?.(parentId);
    if (!options.permits(childKind, parentKind)) {
      const parentLabel = parentId === undefined ? "the top level" : `"${parentId}"${parentKind ? ` (${parentKind})` : ""}`;
      return refuseContainment(
        CONTAINMENT_NOT_PERMITTED,
        `"${childId}"${childKind ? ` (${childKind})` : ""} may not be placed inside ${parentLabel}`,
      );
    }
  }

  // card 08 — resolve the policy. Never asked for a top-level move: there
  // is no parent to have an opinion, so the bare default stands.
  const policy: ContainmentPolicy = {
    ...DEFAULT_CONTAINMENT_POLICY,
    ...(parentId === undefined ? undefined : options.policyOf?.(parentId)),
  };
  return { allowed: true, effect: { policy } };
}

/* ------------------------------------------------------------------ */
/* findContainmentCycles — the at-rest twin, for already-malformed        */
/* documents (card 03). Reuses `findCycles` (Tarjan, scene.ts:288) by      */
/* PROJECTING the containment relation into its `SceneEdgeEnds` shape —   */
/* one synthetic child→parent edge per node that has a parent — rather    */
/* than writing a second SCC algorithm. A `parentId` self-loop and a       */
/* longer `parentId` cycle both fall out of the SAME projection: the       */
/* former is `findCycles`'s own `selfLoop` case (source === target), the   */
/* latter an ordinary multi-member component.                             */
/* ------------------------------------------------------------------ */

export function findContainmentCycles<N extends SceneData>(scene: { nodes: readonly SceneNode<N>[] }): string[][] {
  const edges: SceneEdgeEnds[] = [];
  for (const node of scene.nodes) {
    if (node.parentId !== undefined) edges.push({ source: node.id, target: node.parentId });
  }
  return findCycles({ nodes: scene.nodes, edges });
}

/* ------------------------------------------------------------------ */
/* Card 07 — the empty-container lifecycle, default KEEP                */
/* ------------------------------------------------------------------ */

/** Which nodes count as containers at all — this file mints no opinion
 *  (not every node kind is a container the same way not every node is a
 *  region: `region.ts`'s `isRegion` is one legitimate choice, "any node
 *  that currently has members" via `data.expanded` is another, and this
 *  file has no authority to pick between them). Default: every node is
 *  eligible, matching the kit-wide "no vocabulary supplied, no
 *  narrowing" convention — a container with children is never touched
 *  regardless, so an over-wide default costs nothing until a caller also
 *  opts a kind into `removeWhenEmptyOf`. */
export type IsContainer<N extends SceneData> = (node: SceneNode<N>) => boolean;

/** Every id `isContainer` accepts that currently has zero `childrenOf` —
 *  the raw query, no lifecycle decision attached. */
export function emptyContainers<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  isContainer: IsContainer<N> = () => true,
): string[] {
  return scene.nodes.filter((node) => isContainer(node) && childrenOf(scene, node.id).length === 0).map((node) => node.id);
}

export interface PruneEmptyContainersOptions<N extends OccurrenceData> {
  isContainer?: IsContainer<N>;
  /** Per-node opt-IN to auto-removal when empty. Zach, 2026-09-17: "you
   *  can support this as a toggle, but most things I want to keep around
   *  even if their children are all gone." Omitted, or returning `false`
   *  for a given node, that node is KEPT — the default for every kind,
   *  never inverted by this file. Donor shape (`docs/provenance/
   *  containment.md`): Vyuh's own per-container-kind constructor boolean,
   *  `shouldRemoveWhenEmpty = explicit && !preserveWhenEmpty`
   *  (`group_node.dart:330-334`, `groupable_mixin.dart:150-166`) — one
   *  decision per container kind, never a universal rule. */
  removeWhenEmptyOf?: (node: SceneNode<N>) => boolean;
  /** Passed straight through to `linking.ts`'s `deleteNode` for every
   *  container this call actually removes. Defaults to `"dangle"` — the
   *  least destructive option, and inert whenever `removeWhenEmptyOf` is
   *  left at its own default of "keep everything" (nothing is ever
   *  deleted, so the policy is never consulted). A caller that DOES opt a
   *  kind into removal should pass this deliberately: an emptied
   *  container may still carry promoted port edges (the split-edge stubs
   *  `docs/peps/0003-collapse-mutates-the-document.md` describes), and
   *  which of "drop"/"dangle"/"park" is right for those is the same
   *  document-vs-gesture judgement call `deleteNode`'s own header already
   *  refuses to default. */
  edgePolicy?: DeletedNodeEdgePolicy;
}

/**
 * Remove every container `isContainer` accepts, `removeWhenEmptyOf`
 * opts into, and that is CURRENTLY empty — re-checked to a fixpoint so a
 * removal that empties its own parent is picked up in the same call,
 * rather than requiring a caller to loop. Terminates because each round
 * either removes a node (strictly shrinking `next.nodes`) or finds none
 * and returns. Delegates every actual removal to `linking.ts`'s
 * `deleteNode` — this file does not reimplement edge rewiring, only
 * decides WHICH ids are doomed and in what edge policy.
 *
 * With every default left in place this is the identity: nothing is ever
 * "doomed" because `removeWhenEmptyOf` defaults to keeping every kind
 * (card 07, acceptance #2).
 */
export function pruneEmptyContainers<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  options: PruneEmptyContainersOptions<N> = {},
): BlockScene<N, E> {
  const isContainer = options.isContainer ?? (() => true);
  const removeWhenEmptyOf = options.removeWhenEmptyOf ?? (() => false);
  const edgePolicy: DeletedNodeEdgePolicy = options.edgePolicy ?? "dangle";

  let next: BlockScene<N, E> = scene;
  for (;;) {
    const doomed = next.nodes.find(
      (node) => isContainer(node) && childrenOf(next, node.id).length === 0 && removeWhenEmptyOf(node),
    );
    if (!doomed) return next;
    next = deleteNode(next, doomed.id, edgePolicy);
  }
}
