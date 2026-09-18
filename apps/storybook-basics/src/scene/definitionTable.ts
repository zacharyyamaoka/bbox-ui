// src/scene/definitionTable.ts — card 13: definitions as a FLAT TABLE keyed
// by id, instances holding a reference. Zach, ruling on the prior-art
// report: "yeah that's fine we can do a flat table reference. It's a nice
// little algorithmic thing."
//
// This module does not replace `linking.ts` — it is a REPRESENTATION of the
// invariant `linking.ts`'s `reconcileDefinitions` already maintains, not a
// second opinion about it. `linking.ts` stores a definition's content
// redundantly, once per occurrence's `data.linked`/`data.expanded`, and
// converges the copies on every reconcile; that convergence is exactly a
// litegraph subgraph's failure mode one level up — see
// `docs/provenance/definitions.md` for why our convergent copies are not
// litegraph's inlined, diverging ones. This module folds those converged
// copies into one flat record per `definitionId` (`projectDefinitions`),
// and can write a record's facets back onto every occurrence that names it
// (`applyDefinitions`) — the query and the write PEP 0003 already asks any
// mutate/project pair in this kit to declare (`docs/peps/0003-collapse-
// mutates-the-document.md`): `projectDefinitions` derives and mutates
// nothing; `applyDefinitions` is the one that rewrites the document.
//
// PORTABILITY: the facet split below is `linking.ts`'s own documented
// SYNCED/FREE table (`linking.ts:132-164`, the `OccurrenceData` doc comment
// immediately above its declaration at `linking.ts:165-171`) — `name`,
// `draftOrdinal`, `linked`, `expanded` are the synced facets a
// `DefinitionRecord` carries; `appearance`, `position`, `parentId` and
// edges are occurrence-local and never appear here. Nothing here is
// re-derived: the split is cited, not reinvented.
//
// Zero imports of a canvas engine, zero DOM, zero React — same discipline
// as `linking.ts` and `scene.ts`.

import type { BlockScene, ScenePosition, SceneData, SceneNode } from "./scene";
import { definitionContentSignature, type OccurrenceData } from "./linking";

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

/**
 * One definition's content, flat — everything `linking.ts` calls a SYNCED
 * facet (`linking.ts:132-159`), nothing FREE. `id` is the `definitionId`
 * every occurrence shares (`scene.ts`'s `SceneNode.definitionId`); it is
 * carried on the record too so a `DefinitionRecord` is self-describing
 * once pulled out of the table it lives in.
 */
export interface DefinitionRecord {
  id: string;
  name?: string;
  draftOrdinal?: number;
  linked?: SceneData;
  expanded?: SceneData;
}

/** Flat, keyed by `definitionId` — no nesting, no subgraph bodies. This is
 *  the shape card 13 asks for and the litegraph counter-example does not
 *  have: an instance never carries its definition's content, only a key
 *  into this table (`docs/provenance/definitions.md`). */
export interface DefinitionTable {
  definitions: Record<string, DefinitionRecord>;
}

/**
 * One `definitionId` group whose occurrences do NOT all agree on
 * `definitionContentSignature` — the exact convergence `linking.ts`'s
 * `reconcileDefinitions` performs silently every time it runs. Reporting
 * this rather than resolving it is the point: a scene should never lose a
 * fork silently the way a table row could.
 */
export interface DefinitionConflict {
  definitionId: string;
  /** Every occurrence in the group, in scene order — not just the
   *  disagreeing ones, so a caller can inspect the whole group without a
   *  second pass over the scene. */
  nodeIds: string[];
}

/* ------------------------------------------------------------------ */
/* Shared facet plumbing — the same three-facet set `linking.ts` reads,   */
/* reimplemented locally: `linking.ts`'s own `setOrClear`/`cloneFacet` are */
/* not exported, and this module may not edit that file to export them.  */
/* ------------------------------------------------------------------ */

type SyncedKey = "name" | "draftOrdinal" | "linked" | "expanded";

/** Set a key, or DELETE it when the value is undefined — present-`undefined`
 *  and absent are the same fact (`linking.ts:280-287`'s own rule, applied
 *  to one more facet: `name`). */
function writeOrClear(data: OccurrenceData, key: SyncedKey, value: unknown): void {
  if (value === undefined) delete (data as Record<string, unknown>)[key];
  else (data as Record<string, unknown>)[key] = value;
}

function cloneFacet(facet: SceneData | undefined): SceneData | undefined {
  return facet === undefined ? undefined : (structuredClone(facet) as SceneData);
}

function nameOf(data: OccurrenceData): string | undefined {
  return typeof data.name === "string" ? data.name : undefined;
}

/* ------------------------------------------------------------------ */
/* projectDefinitions — the query: derives and mutates nothing (PEP 0003)  */
/* ------------------------------------------------------------------ */

/**
 * Fold every `definitionId` group's occurrences into one flat record,
 * mirroring exactly what `reconcileDefinitions`'s convergence sweep
 * (`linking.ts:707-719`) already treats as truth: the FIRST occurrence in
 * scene order. A node without a `definitionId` contributes no record — it
 * is `definitionOccurrences`'s "group of one" (`linking.ts:262-270`), which
 * has nothing to share and so nothing to table.
 *
 * Where a group's occurrences do NOT all carry the same
 * `definitionContentSignature` (`linking.ts:240-242` — the `linked` +
 * `expanded` facets only, never `name`/`draftOrdinal`), that disagreement
 * is reported in `conflicts` rather than quietly resolved by picking a
 * winner. The record itself still needs a value for that group: it takes
 * the first occurrence's, the same representative `reconcileDefinitions`
 * converges everyone else onto — so a caller reading `table` alone (never
 * `conflicts`) gets exactly what a reconcile would have produced, and a
 * caller who checks `conflicts` learns that convergence would have thrown
 * some occurrence's content away.
 */
export function projectDefinitions<N extends OccurrenceData>(scene: {
  nodes: readonly SceneNode<N>[];
}): { table: DefinitionTable; conflicts: DefinitionConflict[] } {
  const groups = new Map<string, SceneNode<N>[]>();
  for (const node of scene.nodes) {
    if (!node.definitionId) continue;
    const bucket = groups.get(node.definitionId);
    if (bucket) bucket.push(node);
    else groups.set(node.definitionId, [node]);
  }

  const definitions: Record<string, DefinitionRecord> = {};
  const conflicts: DefinitionConflict[] = [];

  for (const [definitionId, occurrences] of groups) {
    const representative = occurrences[0];
    const baseline = definitionContentSignature(representative.data);
    const disagrees = occurrences.some((occurrence) => definitionContentSignature(occurrence.data) !== baseline);
    if (disagrees) {
      conflicts.push({ definitionId, nodeIds: occurrences.map((occurrence) => occurrence.id) });
    }

    const record: DefinitionRecord = { id: definitionId };
    const name = nameOf(representative.data);
    if (name !== undefined) record.name = name;
    if (representative.data.draftOrdinal !== undefined) record.draftOrdinal = representative.data.draftOrdinal;
    const linked = cloneFacet(representative.data.linked);
    if (linked !== undefined) record.linked = linked;
    const expanded = cloneFacet(representative.data.expanded);
    if (expanded !== undefined) record.expanded = expanded;
    definitions[definitionId] = record;
  }

  return { table: { definitions }, conflicts };
}

/* ------------------------------------------------------------------ */
/* applyDefinitions — the operation: rewrites the document (PEP 0003)      */
/* ------------------------------------------------------------------ */

/**
 * The inverse of `projectDefinitions`: rewrite every occurrence's synced
 * facets (`name`, `draftOrdinal`, `linked`, `expanded`) from its group's
 * record. A key present in the record replaces that facet whole; a key
 * absent from the record clears it — the record IS the group's full
 * synced state, not a patch (contrast `linking.ts`'s `setDefinitionData`,
 * which patches only the keys named in its `DefinitionDataPatch`).
 *
 * "Unknown means no judgement": an occurrence whose `definitionId` is
 * absent from `table.definitions` — including every node with no
 * `definitionId` at all — is left byte-for-byte untouched. Total: an
 * empty table is a no-op over any scene.
 */
export function applyDefinitions<N extends OccurrenceData, E extends SceneData>(
  scene: BlockScene<N, E>,
  table: DefinitionTable,
): BlockScene<N, E> {
  const replacements = new Map<string, SceneNode<N>>();
  for (const node of scene.nodes) {
    if (!node.definitionId) continue;
    const record = table.definitions[node.definitionId];
    if (!record) continue;
    const data: OccurrenceData = { ...node.data };
    writeOrClear(data, "name", record.name);
    writeOrClear(data, "draftOrdinal", record.draftOrdinal);
    writeOrClear(data, "linked", cloneFacet(record.linked));
    writeOrClear(data, "expanded", cloneFacet(record.expanded));
    replacements.set(node.id, { ...node, data: data as N });
  }
  if (replacements.size === 0) return scene;
  return { ...scene, nodes: scene.nodes.map((node) => replacements.get(node.id) ?? node) };
}

/* ------------------------------------------------------------------ */
/* instantiate — a new occurrence holding only a reference               */
/* ------------------------------------------------------------------ */

export interface InstantiateAt {
  /** Minted by the CALLER — the D9 rule `scene.ts`'s `duplicateNode` and
   *  `portLane.ts`'s `mintItem` already established repo-wide: this module
   *  never invents an id. Required, not optional, so an omitted `id` is a
   *  compile-time error rather than a silently-empty node id. */
  id: string;
  position: ScenePosition;
  parentId?: string;
}

/**
 * A new occurrence of `definitionId`, holding only the reference plus its
 * own free fields (`id`, `position`, `parentId`) — never the definition's
 * content inline. When `definitionId` is not (yet) a key in `table`, the
 * occurrence is still minted, empty of synced facets: "unknown means no
 * judgement" applies here too, and a fresh definition legitimately starts
 * with no table entry until something is written into it.
 */
export function instantiate<N extends OccurrenceData>(
  table: DefinitionTable,
  definitionId: string,
  at: InstantiateAt,
): SceneNode<N> {
  const record = table.definitions[definitionId];
  const data: OccurrenceData = {};
  if (record?.name !== undefined) data.name = record.name;
  if (record?.draftOrdinal !== undefined) data.draftOrdinal = record.draftOrdinal;
  const linked = cloneFacet(record?.linked);
  if (linked !== undefined) data.linked = linked;
  const expanded = cloneFacet(record?.expanded);
  if (expanded !== undefined) data.expanded = expanded;

  const node: SceneNode<N> = {
    id: at.id,
    position: at.position,
    data: data as N,
    definitionId,
  };
  if (at.parentId !== undefined) node.parentId = at.parentId;
  return node;
}
