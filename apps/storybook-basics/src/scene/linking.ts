// src/scene/linking.ts — definition linking: "same name = same thing",
// ported from SystemSketch, read-only donor at /home/bam/systemsketch,
// revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/blocks/definitions/definitionLinking.ts:44-58` —
//     `normalizedDefinitionName`, `exportStem`, `definitionKeyFor`,
//     verbatim.
//   • `definitionLinking.ts:78-80` — `definitionBadge`, minus the
//     value-pill guard (below).
//   • `definitionLinking.ts:127-130` — `linkedBlockOccurrences` →
//     `definitionOccurrences`.
//   • `definitionLinking.ts:84-118` — `sharedDefinitionProps` /
//     `applySharedDefinitionProps` → the LINKED data facet
//     (`OccurrenceData` + `withSharedDefinitionData`). The donor's WHY
//     travels: an icon is visual chrome for one canvas occurrence, not
//     Definition content — linked calls may use different visual cues
//     while sharing one body.
//   • `definitionLinking.ts:379-391` — `isEmptyDefinition` /
//     `definitionContentSignature` → `definitionContentSignature`, minus
//     the child-shape `bodySignature` (see WHAT CHANGED #4).
//   • `definitionLinking.ts:414-436, 439-515` —
//     `moveOccurrenceToFreshDefinition` + `commitBlockDefinitionName` →
//     `commitDefinitionName`. The rename-detaches WHY travels verbatim
//     below.
//   • `definitionLinking.ts:518-586` — `reconcileExistingDefinitionNames`
//     (FIFO promote, ordinal repair) → the name sweep inside
//     `reconcileDefinitions`.
//   • `definitionLinking.ts:588-600` — `reconcileLinkedDefinitionCopies`
//     → the convergence sweep inside `reconcileDefinitions`.
//   • `definitionLinking.ts:602-649` — `numberedTitle`, `uniqueTitle`,
//     `unlinkBlockDefinition` → `unlinkOccurrence`.
//   • `definitionLinking.ts:652-671` — `duplicateBlockUnlinked` →
//     `duplicateNodeUnlinked`.
//
// WHAT CHANGED in the port, exhaustively:
//
//   1. `Editor` → `BlockScene`. Every donor function took a live tldraw
//      `Editor` and mutated shapes; every function here takes a scene and
//      returns a new one (same object when nothing changed — the
//      `reconcilePortLane` no-op contract). `installDefinitionLinking`
//      (donor 677-787) is DROPPED WHOLE: side-effect handlers, the
//      microtask coalescer and the `syncing` re-entrancy latch are the
//      donor's answer to tldraw's store transactions; a pure function has
//      no store to race. Its four jobs map to: ensure-identity + both
//      sweeps → `reconcileDefinitions`; prop broadcast →
//      `setDefinitionData`.
//   2. Value pills (`view === 'value'` guards, donor 37-42, 79, 123, 441,
//      624, 656-662) are DROPPED — the scene kit has no value-pill view;
//      a host with variable pills simply never routes them through these
//      functions. `blockDefinitionId`'s stale-legacy-identity laundering
//      goes with them.
//   3. `definitionKey` STORAGE and `availableDefinitionKey` (donor 60-76)
//      are DROPPED. The stored key is SystemSketch's code-export identity
//      with cross-name collision suffixes (`foo_2`); linking semantics
//      never read it. `definitionKeyFor` stays as the pure naming rule —
//      derive a key on demand from (name, ordinal).
//   4. The materialized-body machinery is DROPPED: `memberRef` stamping,
//      `cloneShape`, `syncOccurrenceBody`, `bodySignature`, the recursion
//      guard `definitionBodiesOverlap`, `internalBindings` (donor
//      160-338, 360-377). The donor clones a Definition's child shapes
//      into every occurrence because tldraw must hit-test real shapes; a
//      scene has no such need — the expanded view's linked appearance is
//      the `expanded` DATA facet, and child nodes (`parentId`) stay
//      occurrence-local. Consequence: `definitionContentSignature` covers
//      the `linked` + `expanded` facets, not a shape subtree.
//   5. Draft-state storage moves from `props.draftOrdinal` to
//      `data.draftOrdinal` — same always-incrementing ordinal, same FIFO
//      promote. The donor's present-`undefined` wrinkle (its
//      updateDefinitionGroup WHY, donor 398-404: tldraw's merge cannot
//      delete a key) is answered here by actually deleting cleared keys,
//      so a scene's JSON never carries `"draftOrdinal": undefined`.
//   6. Signatures use a KEY-SORTED stringify instead of the donor's raw
//      `JSON.stringify` (donor 97-99, 389-391). The donor's props always
//      come out of one constructor, so key order is stable there; a
//      scene is authored data where `{a,b}` and `{b,a}` must be the same
//      content.
//   7. DEVIATION — no-op commits are no-ops. The donor re-classifies at
//      every title blur, and re-committing an UNCHANGED name while a
//      draft of it exists re-drafts the group at the back of the queue
//      (donor 490-505 has no unchanged-name guard). That is a
//      gesture-layer artifact, and as an operation it makes "commit the
//      same name" astonishing, so `commitDefinitionName` returns the
//      scene unchanged when the normalized name did not change.
//   8. DEVIATION — on the empty-block adopt (donor 466-475), content
//      flows FROM the definition INTO the joiner. The donor's own code
//      syncs outward from the joiner after the join (donor 482-486
//      passes the JOINER to `syncLinkedProps`/`syncLinkedBody`, whose
//      copies run source→target), which for an empty joiner would
//      broadcast emptiness over the definition — contradicting the WHY
//      comment beside it ("It becomes another occurrence and the body
//      sync fills it in", Zach's 2026-09-09 exception). The comment
//      states the intent; this port implements the intent.
//   9. `duplicateNodeUnlinked` does not offset the copy's position
//      (donor 666 nudges +32,+32). scene.ts's established contract is
//      that the CALLER offsets a duplicate when it wants a visible ghost.
//  10. EXTENSION, not in the donor — port identity under linking. The
//      donor never namespaced port ids; here two occurrences share a port
//      VOCABULARY (`linked` data, so the same port ids) while every port
//      FACT is keyed by `portKey(nodeId, portId)` — so the occurrences'
//      port keys are disjoint by construction and an edge into one
//      occurrence's `in` never implicates its twin's. Nothing to enforce:
//      the namespacing IS `portKey`; this module only has to never
//      collapse it (and `findDanglingEdges` in scene.ts leans on it to
//      catch a dead port on a live node).
//  11. NEW — `deleteNode` with an explicit edge policy, and `parkedEnds`.
//      The donor delegates deletion to tldraw (bindings die with the
//      shape — the "drop" policy) and only reconciles afterwards (donor
//      732-737, 768-771). Zach, 2026-09-17: whether a deleted node's
//      edges are an error or an interaction "depends… let's just leave
//      this as a toggle for now so the people can decide" — so the policy
//      is a required parameter, not a default. See `deleteNode`.
//
// The rules themselves, in one breath (docs/SCENE-KIT.md holds the long
// form): same name = same thing; renaming ONE occurrence detaches it and
// never rewrites its former peers; same name over DIFFERENT content
// drafts automatically, ordinals always increment (1 + max in use, never
// refilling a freed number); when a name's canonical definition
// disappears, the lowest-ordinal draft — the oldest, FIFO — is promoted;
// the DATA is linked (name, `linked`, `expanded`, `draftOrdinal`),
// appearance is free per occurrence EXCEPT the expanded view's, because a
// function gets one definition and every call site points at it.
//
// Zero imports of a canvas engine, zero DOM, zero React: scenes in,
// scenes out.

import type { BlockScene, SceneData, SceneEdge, SceneNode } from "./scene";

// The scene's own vocabulary now has one declaration site, `./model` — see
// that file's header for the rule about what belongs there. Re-exported from
// here so every existing `from "./scene"` import keeps resolving, and so a
// reader who opens this file still meets the record before the functions
// over it.
import type { OccurrenceData } from "./model";
export type { OccurrenceData };


/* ------------------------------------------------------------------ */
/* The linked / free split — explicit in the types                     */
/* ------------------------------------------------------------------ */

/** The facet keys `setDefinitionData` may write and the sweeps converge.
 *  `name`/`draftOrdinal` are deliberately NOT patchable here — a name
 *  change must go through `commitDefinitionName` (else a data write
 *  could rename a group past the join/draft rules), and ordinals are
 *  allocated, never assigned. */
export type DefinitionDataPatch = {
  linked?: SceneData;
  expanded?: SceneData;
};

/* ------------------------------------------------------------------ */
/* Naming — donor 44-58, verbatim                                      */
/* ------------------------------------------------------------------ */

export function normalizedDefinitionName(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function exportStem(title: string): string {
  const withoutCall = normalizedDefinitionName(title).replace(/\(\)$/, "");
  const stem = withoutCall.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return stem || "block";
}

/** `run()` → `run`; `run()` as Draft 2 → `run_draft_2`; empty → ``. */
export function definitionKeyFor(title: string, draftOrdinal?: number): string {
  if (!normalizedDefinitionName(title)) return "";
  const stem = exportStem(title);
  return draftOrdinal === undefined ? stem : `${stem}_draft_${draftOrdinal}`;
}

/** Draft state as quiet metadata beside an UNCHANGED title — the badge
 *  exists because draft titles deliberately collide. Donor 78-80. */
export function definitionBadge(data: OccurrenceData): string | null {
  return data.draftOrdinal === undefined ? null : `Draft ${data.draftOrdinal}`;
}

function nameOf(data: OccurrenceData): string {
  return normalizedDefinitionName(typeof data.name === "string" ? data.name : "");
}

/* ------------------------------------------------------------------ */
/* Content signature — donor 379-391, facets instead of a subtree      */
/* ------------------------------------------------------------------ */

/** Deterministic JSON: keys sorted, `undefined` entries pruned (WHAT
 *  CHANGED #5/#6 — present-`undefined` and absent are the same fact). */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

/** An absent facet and an empty `{}` facet are the same nothing. */
function facetSignature(facet: SceneData | undefined): string | undefined {
  if (facet === undefined) return undefined;
  const json = stableJson(facet);
  return json === "{}" ? undefined : json;
}

/** What "same content" means: the linked facets, nothing else — not the
 *  name (drafts collide on it by design), not appearance, not placement.
 *  Two datas with this signature equal are the same definition content. */
export function definitionContentSignature(data: OccurrenceData): string {
  return stableJson({ expanded: facetSignature(data.expanded), linked: facetSignature(data.linked) });
}

/** Donor 379-387's "nothing a Draft could preserve", mapped to facets:
 *  no ports, no description, no notes, no body ⇒ no linked content. */
const EMPTY_CONTENT_SIGNATURE = "{}";

function isEmptyDefinitionData(data: OccurrenceData): boolean {
  return definitionContentSignature(data) === EMPTY_CONTENT_SIGNATURE;
}

/* ------------------------------------------------------------------ */
/* Occurrences — donor 127-130                                         */
/* ------------------------------------------------------------------ */

/**
 * Every occurrence of the definition this node belongs to, itself
 * included, in scene order. `definitionId` is the GROUP id every
 * occurrence shares (see scene.ts); a node without one is a group of
 * one. Total: an unknown id has no occurrences.
 */
export function definitionOccurrences<N extends OccurrenceData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeId: string,
): SceneNode<N>[] {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return [];
  if (!node.definitionId) return [node];
  return scene.nodes.filter((candidate) => candidate.definitionId === node.definitionId);
}

/* ------------------------------------------------------------------ */
/* Facet plumbing — donor 84-118                                       */
/* ------------------------------------------------------------------ */

function cloneFacet(facet: SceneData | undefined): SceneData | undefined {
  return facet === undefined ? undefined : (structuredClone(facet) as SceneData);
}

/** Set a key, or DELETE it when the value is undefined — the port's
 *  answer to the donor's present-`undefined` trap (WHAT CHANGED #5). */
function setOrClear(data: OccurrenceData, key: "linked" | "expanded" | "draftOrdinal", value: unknown): void {
  // Written through the index signature: assigning through the keyed
  // union would demand the intersection of the three facet types.
  if (value === undefined) delete (data as Record<string, unknown>)[key];
  else (data as Record<string, unknown>)[key] = value;
}

/** Donor `applySharedDefinitionProps`: the target keeps every free key
 *  (appearance, host extras) and takes the source's linked facets. Each
 *  occurrence gets its own clone so no two records share a mutable
 *  object. `name` deliberately not copied — see `OccurrenceData`. */
function withSharedDefinitionData<N extends OccurrenceData>(target: N, source: OccurrenceData): N {
  const data: OccurrenceData = { ...target };
  setOrClear(data, "linked", cloneFacet(source.linked));
  setOrClear(data, "expanded", cloneFacet(source.expanded));
  setOrClear(data, "draftOrdinal", source.draftOrdinal);
  return data as N;
}

function sameSharedData(a: OccurrenceData, b: OccurrenceData): boolean {
  return definitionContentSignature(a) === definitionContentSignature(b) && a.draftOrdinal === b.draftOrdinal;
}

function replaceNodes<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  replacements: ReadonlyMap<string, SceneNode<N>>,
): BlockScene<N, E> {
  if (replacements.size === 0) return scene;
  return { ...scene, nodes: scene.nodes.map((node) => replacements.get(node.id) ?? node) };
}

/* ------------------------------------------------------------------ */
/* The rename gesture — donor 439-515                                  */
/* ------------------------------------------------------------------ */

/**
 * Finalize a title gesture: join matching content, or quietly allocate
 * Draft N. THE rule this module exists for, in order:
 *
 *   1. Unchanged normalized name → no-op (deviation #7).
 *   2. The node had linked peers and the name changed → it DETACHES to a
 *      fresh definition; the peers are never rewritten. Donor's WHY
 *      travels verbatim: "the title is the escape seam between two
 *      occurrences. Broadcasting it first made a rename incapable of
 *      expressing 'this one is different'" (donor 448-450). This is the
 *      common bug Zach names — rename one, and its links must not follow.
 *   3. Empty names bind nothing (donor 453-461; pyblocks learned this
 *      when ten fresh blocks all joined one group).
 *   4. Another definition already owns the name:
 *        same content → JOIN it (adopt its group id and ordinal);
 *        empty joiner → JOIN the canonical and take its content
 *                       (deviation #8 — intent, not the outward sync);
 *        different content → DRAFT: keep an own unused ordinal, else
 *                       1 + max(in use) — always incrementing, never
 *                       refilling a freed number (donor 490-505).
 *   5. Nobody owns the name → this group is its canonical.
 *
 * Ends with `reconcileDefinitions` (donor reconciles at every exit,
 * 459/487/506/514) — which is what promotes the oldest draft when this
 * very rename walked the canonical away from its name.
 */
export function commitDefinitionName<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  title: string,
  mintId: () => string,
): BlockScene<N, E> {
  const source = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!source) return scene;
  const name = normalizedDefinitionName(title);

  if (name === nameOf(source.data)) {
    // Deviation #7 — but the raw spelling is still the author's: store
    // the typed title verbatim when only whitespace changed.
    if (source.data.name === title) return scene;
    const respelled = { ...source, data: { ...source.data, name: title } as N };
    return replaceNodes(scene, new Map([[source.id, respelled]]));
  }

  const peers = source.definitionId
    ? scene.nodes.filter((candidate) => candidate.id !== source.id && candidate.definitionId === source.definitionId)
    : [];
  const detached = peers.length > 0;
  const definitionId = detached || !source.definitionId ? mintId() : source.definitionId;
  // Detaching clears draft state (donor 414-436); a solo rename keeps its
  // ordinal as a candidate for "keep own unused ordinal" below (donor 494).
  const carriedOrdinal = detached ? undefined : source.data.draftOrdinal;

  const renamedData: OccurrenceData = { ...source.data, name: title };
  // An empty name binds nothing, and a nothing has no drafts (donor
  // 453-461; pyblocks learned it when ten fresh blocks joined one group).
  setOrClear(renamedData, "draftOrdinal", name ? carriedOrdinal : undefined);
  let renamed: SceneNode<N> = { ...source, definitionId, data: renamedData as N };
  const replacements = new Map<string, SceneNode<N>>([[renamed.id, renamed]]);

  if (name) {
    const candidates = scene.nodes.filter(
      (candidate) =>
        candidate.id !== source.id && candidate.definitionId !== definitionId && nameOf(candidate.data) === name,
    );
    const sourceSignature = definitionContentSignature(source.data);
    const contentMatch = candidates.find((candidate) => definitionContentSignature(candidate.data) === sourceSignature);
    // WHY an empty Block adopts rather than drafts: a blank member that is
    // merely NAMED after an existing definition has no content of its own
    // to diverge with, so "Draft 2" would be noise. It becomes another
    // occurrence and takes the definition's content. Prefer the canonical
    // (non-draft) definition when several share the title. (Donor 466-475,
    // Zach's 2026-09-09 exception; flow direction is deviation #8.)
    const adopted =
      contentMatch ??
      (isEmptyDefinitionData(source.data)
        ? (candidates.find((candidate) => candidate.data.draftOrdinal === undefined) ?? candidates[0])
        : undefined);

    if (adopted) {
      const adoptedGroupId = adopted.definitionId ?? mintId();
      if (!adopted.definitionId) {
        replacements.set(adopted.id, { ...adopted, definitionId: adoptedGroupId });
      }
      renamed = { ...renamed, definitionId: adoptedGroupId, data: withSharedDefinitionData(renamed.data as N, adopted.data) };
      replacements.set(renamed.id, renamed);
    } else if (candidates.length > 0) {
      const used = new Set(
        candidates.flatMap((candidate) => (candidate.data.draftOrdinal === undefined ? [] : [candidate.data.draftOrdinal])),
      );
      const ordinal =
        carriedOrdinal !== undefined && !used.has(carriedOrdinal) ? carriedOrdinal : 1 + Math.max(0, ...used);
      const drafted: OccurrenceData = { ...(renamed.data as OccurrenceData) };
      setOrClear(drafted, "draftOrdinal", ordinal);
      renamed = { ...renamed, data: drafted as N };
      replacements.set(renamed.id, renamed);
    } else {
      const canonical: OccurrenceData = { ...(renamed.data as OccurrenceData) };
      setOrClear(canonical, "draftOrdinal", undefined);
      renamed = { ...renamed, data: canonical as N };
      replacements.set(renamed.id, renamed);
    }
  }

  // No mintId here on purpose: the sweep must promote/merge among nodes
  // that already carry ids, but a commit gesture has no business stamping
  // UNRELATED id-less nodes — that write belongs to an explicit
  // `reconcileDefinitions(scene, mintId)` call.
  return reconcileDefinitions(replaceNodes(scene, replacements));
}

/* ------------------------------------------------------------------ */
/* Editing the definition through any occurrence — donor 340-352       */
/* ------------------------------------------------------------------ */

/**
 * Write the linked facets of a definition, addressed through ANY of its
 * occurrences; every occurrence takes the new facets (its own clone),
 * every free key survives untouched. A key present in the patch replaces
 * that facet whole (explicitly `undefined` clears it); a key absent from
 * the patch is left alone. Total: an unknown node is a no-op.
 */
export function setDefinitionData<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  patch: DefinitionDataPatch,
): BlockScene<N, E> {
  const occurrences = definitionOccurrences(scene, nodeId);
  if (occurrences.length === 0) return scene;
  const replacements = new Map<string, SceneNode<N>>();
  for (const occurrence of occurrences) {
    const data: OccurrenceData = { ...occurrence.data };
    if ("linked" in patch) setOrClear(data, "linked", cloneFacet(patch.linked));
    if ("expanded" in patch) setOrClear(data, "expanded", cloneFacet(patch.expanded));
    replacements.set(occurrence.id, { ...occurrence, data: data as N });
  }
  return replaceNodes(scene, replacements);
}

/* ------------------------------------------------------------------ */
/* Unlink — donor 602-649                                              */
/* ------------------------------------------------------------------ */

function numberedTitle(title: string, ordinal: number): string {
  const trimmed = title.trim();
  return trimmed.endsWith("()") ? `${trimmed.slice(0, -2)}_${ordinal}()` : `${trimmed}_${ordinal}`;
}

function uniqueTitle(scene: { nodes: readonly SceneNode<OccurrenceData>[] }, title: string): string {
  const occupied = new Set(scene.nodes.map((node) => nameOf(node.data)));
  for (let ordinal = 1; ; ordinal += 1) {
    const candidate = numberedTitle(title || "block", ordinal);
    if (!occupied.has(candidate)) return candidate;
  }
}

/**
 * Break one occurrence away from its Definition and give it a
 * collision-free visible name (`mix` → `mix_1`, `run()` → `run_1()`,
 * first free number counting up). A different name is the WHOLE move —
 * "if you just want to completely style it uniquely yourself, no point
 * in even calling it the same thing" — so unlink never leaves the old
 * name behind to silently re-link on the next reconcile.
 */
export function unlinkOccurrence<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  mintId: () => string,
): BlockScene<N, E> {
  const source = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!source) return scene;
  const data: OccurrenceData = { ...source.data, name: uniqueTitle(scene, typeof source.data.name === "string" ? source.data.name : "") };
  setOrClear(data, "draftOrdinal", undefined);
  return replaceNodes(scene, new Map([[source.id, { ...source, definitionId: mintId(), data: data as N }]]));
}

/**
 * Duplicate as an INDEPENDENT block: a verbatim copy that immediately
 * unlinks, numbered name and all (donor 652-671). The default gesture is
 * the other one — a plain `linkedCopy`/`duplicateNode` (scene.ts) yields
 * another occurrence, because "the whole point of linking is to avoid
 * duplicate work". Position copies verbatim; the caller offsets its
 * ghost (deviation #9).
 */
export function duplicateNodeUnlinked<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  mintId: () => string,
): BlockScene<N, E> {
  const source = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!source) return scene;
  const copyId = mintId();
  const copied: BlockScene<N, E> = { ...scene, nodes: [...scene.nodes, { ...source, id: copyId }] };
  return unlinkOccurrence(copied, copyId, mintId);
}

/* ------------------------------------------------------------------ */
/* Deletion — new here; donor delegates to tldraw + reconciles         */
/* ------------------------------------------------------------------ */

/**
 * What happens to the edges of a deleted node. Zach, 2026-09-17: "it
 * depends if it's like a document error or a human interaction thing…
 * let's just leave this as a toggle for now so the people can decide" —
 * so the policy is a REQUIRED parameter. No default: a default that
 * silently drops a user's edges is discovered at the worst moment, and a
 * default that silently keeps ghosts corrupts the document instead.
 *
 *   "drop"    the attached edges are deleted too — both engines' own
 *             gesture (React Flow's `deleteElements` removes connected
 *             edges; tldraw's bindings die with the shape, which is what
 *             the donor relied on).
 *   "dangle"  the edges survive untouched, ends now unresolvable. Safe
 *             ONLY because `findDanglingEdges` (scene.ts) makes the
 *             state detectable — permit it and still know. On load, a
 *             dangling un-parked end means the file is wrong.
 *   "park"    the edges survive and every dead end is stamped
 *             (`data.parked`) — dangling ON PURPOSE, so a host's
 *             delete-then-undo restores wiring by re-adding the node,
 *             and the load-time lint can tell a deliberate park from a
 *             document error. An edge both of whose ends die is parked
 *             at both ends — undo wants it back too.
 */
export type DeletedNodeEdgePolicy = "drop" | "dangle" | "park";

const EDGE_ENDS = ["source", "target"] as const;

/** The ends of this edge that were parked by a `"park"` deletion —
 *  `data.parked`, validated. Empty for a never-parked edge. */
export function parkedEnds(edge: { data?: SceneData }): ("source" | "target")[] {
  const raw = edge.data?.["parked"];
  if (!Array.isArray(raw)) return [];
  return EDGE_ENDS.filter((end) => raw.includes(end));
}

function withParkedEnds<E extends SceneData>(edge: SceneEdge<E>, doomed: ReadonlySet<string>): SceneEdge<E> {
  const dead = EDGE_ENDS.filter((end) => doomed.has(edge[end]));
  if (dead.length === 0) return edge;
  const parked = EDGE_ENDS.filter((end) => dead.includes(end) || parkedEnds(edge).includes(end));
  // The stamp writes this module's convention key into host edge data;
  // `E` may narrow `SceneData` arbitrarily, so the widening is explicit.
  return { ...edge, data: { ...(edge.data ?? {}), parked } as SceneData as E };
}

/**
 * Delete one node — and, tldraw-style, its `parentId` descendants:
 * containment is ownership, a deleted expanded block takes its members.
 * Edges follow the caller's `DeletedNodeEdgePolicy`. Definition
 * consequences are the donor's (732-737, 768-771: delete, then sweep):
 * surviving occurrences are simply left alone — nothing about them
 * changed — and when the deleted node was the LAST occurrence, the
 * definition is gone with it (a definition lives only in its
 * occurrences, exactly like a function with no remaining call sites and
 * no body anywhere). The closing reconcile is what FIFO-promotes the
 * oldest draft when the canonical's last occurrence just died.
 */
export function deleteNode<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  policy: DeletedNodeEdgePolicy,
): BlockScene<N, E> {
  if (!scene.nodes.some((node) => node.id === nodeId)) return scene;
  const doomed = new Set<string>([nodeId]);
  for (;;) {
    const grown = scene.nodes.filter((node) => !doomed.has(node.id) && node.parentId !== undefined && doomed.has(node.parentId));
    if (grown.length === 0) break;
    for (const node of grown) doomed.add(node.id);
  }
  const nodes = scene.nodes.filter((node) => !doomed.has(node.id));
  const edges =
    policy === "drop"
      ? scene.edges.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target))
      : policy === "park"
        ? scene.edges.map((edge) => withParkedEnds(edge, doomed))
        : scene.edges;
  return reconcileDefinitions({ ...scene, nodes, edges });
}

/* ------------------------------------------------------------------ */
/* Reconcile — donor 518-600 (+ ensureBlockIdentity 132-147)           */
/* ------------------------------------------------------------------ */

/**
 * Repair an authored or just-mutated scene into the linking invariant,
 * without turning every data write into a command (the donor runs this
 * on load and after create/delete sweeps, never on keystrokes):
 *
 *   • nodes without a `definitionId` get one minted — each its OWN group
 *     (empty names bind nothing; same names converge in the next step).
 *     Skipped without `mintId`: this module never invents an id (the D9
 *     rule), so an id-less node is honestly left un-groupable.
 *   • per name: exactly one canonical. If none, the LOWEST ordinal —
 *     the oldest draft, since ordinals only count up — is promoted:
 *     the FIFO queue (donor 530-546).
 *   • a same-named definition whose content now equals the canonical's
 *     is merged into it (donor 558-566).
 *   • a draft with a missing or colliding ordinal is renumbered from the
 *     lowest free number (donor 568-584 — repair fills gaps; only FRESH
 *     allocation in `commitDefinitionName` refuses to, donor 496).
 *   • within one group, every occurrence converges to the FIRST
 *     occurrence's linked facets (donor 588-600) — first in scene order
 *     wins, which is also what makes authored drift deterministic.
 *
 * Total and referentially honest: a scene already holding the invariant
 * comes back as the same object.
 */
export function reconcileDefinitions<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  mintId?: () => string,
): BlockScene<N, E> {
  const replacements = new Map<string, SceneNode<N>>();
  const current = (id: string): SceneNode<N> | undefined =>
    replacements.get(id) ?? scene.nodes.find((node) => node.id === id);
  const patchGroup = (definitionId: string, patch: { definitionId?: string; draftOrdinal?: number | undefined }): void => {
    for (const node of scene.nodes) {
      const live = current(node.id)!;
      if (live.definitionId !== definitionId) continue;
      const data: OccurrenceData = { ...live.data };
      if ("draftOrdinal" in patch) setOrClear(data, "draftOrdinal", patch.draftOrdinal);
      replacements.set(live.id, { ...live, definitionId: patch.definitionId ?? live.definitionId, data: data as N });
    }
  };

  if (mintId) {
    for (const node of scene.nodes) {
      if (!node.definitionId) replacements.set(node.id, { ...node, definitionId: mintId() });
    }
  }

  /* The name sweep — one canonical per name, drafts numbered. */
  const byName = new Map<string, SceneNode<N>[]>();
  for (const node of scene.nodes) {
    const live = current(node.id)!;
    if (!live.definitionId) continue;
    const name = nameOf(live.data);
    if (!name) continue;
    const bucket = byName.get(name) ?? [];
    if (!bucket.some((representative) => representative.definitionId === live.definitionId)) {
      bucket.push(live);
      byName.set(name, bucket);
    }
  }

  for (const bucket of byName.values()) {
    let canonical = bucket.find((representative) => current(representative.id)!.data.draftOrdinal === undefined);
    if (!canonical) {
      canonical = [...bucket].sort(
        (left, right) =>
          (current(left.id)!.data.draftOrdinal ?? Number.MAX_SAFE_INTEGER) -
          (current(right.id)!.data.draftOrdinal ?? Number.MAX_SAFE_INTEGER),
      )[0];
      patchGroup(canonical.definitionId!, { draftOrdinal: undefined });
    }
    if (bucket.length < 2) continue;

    const canonicalSignature = definitionContentSignature(current(canonical.id)!.data);
    // The collision test reads the bucket AS IT STOOD here — the donor
    // iterates a stale shape list (568-570), so a colliding pair {2,2}
    // renumbers BOTH (to the two lowest free numbers), not just one.
    // Ported exactly; exactness is the provenance.
    const snapshot = bucket.map((representative) => ({
      id: representative.id,
      definitionId: representative.definitionId!,
      ordinal: current(representative.id)!.data.draftOrdinal,
    }));
    const occupied = new Set(
      snapshot.flatMap((entry) => (entry.id === canonical!.id || entry.ordinal === undefined ? [] : [entry.ordinal])),
    );
    let nextDraft = 1;
    for (const entry of snapshot) {
      if (entry.id === canonical.id) continue;
      if (definitionContentSignature(current(entry.id)!.data) === canonicalSignature) {
        patchGroup(entry.definitionId, { definitionId: canonical.definitionId!, draftOrdinal: undefined });
        continue;
      }
      let ordinal = current(entry.id)!.data.draftOrdinal;
      if (
        ordinal === undefined ||
        (occupied.has(ordinal) && snapshot.some((other) => other.id !== entry.id && other.ordinal === ordinal))
      ) {
        while (occupied.has(nextDraft)) nextDraft += 1;
        ordinal = nextDraft;
      }
      occupied.add(ordinal);
      if (current(entry.id)!.data.draftOrdinal !== ordinal) {
        patchGroup(entry.definitionId, { draftOrdinal: ordinal });
      }
    }
  }

  /* The convergence sweep — every occurrence carries its group's facets. */
  const seenGroups = new Set<string>();
  for (const node of scene.nodes) {
    const representative = current(node.id)!;
    if (!representative.definitionId || seenGroups.has(representative.definitionId)) continue;
    seenGroups.add(representative.definitionId);
    for (const peer of scene.nodes) {
      const live = current(peer.id)!;
      if (live.id === representative.id || live.definitionId !== representative.definitionId) continue;
      if (sameSharedData(live.data, current(representative.id)!.data)) continue;
      replacements.set(live.id, { ...live, data: withSharedDefinitionData(live.data, current(representative.id)!.data) });
    }
  }

  /* Referential honesty: only report a change when one actually landed. */
  const changed = [...replacements.entries()].filter(([id, node]) => {
    const original = scene.nodes.find((candidate) => candidate.id === id);
    return original !== undefined && stableJson(node) !== stableJson(original);
  });
  return replaceNodes(scene, new Map(changed));
}
