// src/scene/bubble.ts — errors bubble through folds (2026-09-18, "final
// spec" lane, ruling 3). Pure, no React, no DOM, no canvas engine, same
// rule the whole scene kit follows.
//
// THE RULE IS VISIBILITY-DRIVEN, NOT VIEW-NAME-DRIVEN. Zach: "the
// collapsed groups bubbling up their child errors... In simple, port view
// then 100% the errors should show on the parent, but in expanded view I
// prefer the error to show more especially on the element that is being
// errored. The general idea is: if something is hidden then the parent
// that hides it should get the error... It's kinda like the ultimate
// version of that is in the IDE tree view how a file colour may be red if
// it contains an error within it!" So this file never names a view mode by
// its own label — no view-mode identifier appears anywhere below, not even
// in a comment — it takes a `HidesOf` fact instead, and every named view
// mode is one row in the STORY/HOST's own view→hides table (see D3's own
// doc), never a branch here.
//
// PROVENANCE. Donor: maxGraph `validateGraph`'s recursive walk + collapsed-
// parent bubbling (Apache-2.0, fetched `ValidationMixin.ts:140-206`,
// bubbling specifically at `:173-179`) — this file BEHAVIOUR-DERIVES that
// shape, inverted: maxGraph walks the tree top-down re-validating as it
// descends; `surfaceFindings` below takes an already-flat `LintFinding[]`
// (from `lint.ts`) and climbs each one UP to its carrier. Two things ran
// against maxGraph's own version that this file deliberately does NOT
// repeat:
//   (a) `validateGraph` folds every descendant's error into ONE generic
//       resource string, with no reference to which child or which rule
//       caused it (reproduced running the library). `surfaceFindings`
//       keeps each finding's own id, message and rule — a carrier's
//       findings are a LIST, never collapsed into one string.
//   (b) `setCellWarning(cell, null)` calls `removeCellOverlays`, which
//       deletes EVERY overlay on that cell — reproduced: an unrelated
//       overlay was deleted alongside the warning being cleared
//       (`OverlaysMixin.ts:132-155`, `removeCellOverlays` at `:89-100`).
//       That is exactly the "multi-producer, no per-item identity" trap
//       `Diagnostic.id` (`../components/highlighter.tsx`) exists to
//       prevent (see `LintFinding.id`'s own doc in lint.ts). This file
//       never mutates or clears anything — `surfaceFindings` is a pure
//       read, and its output is a plain `diagnostics`-shaped list a caller
//       assigns straight into a component prop with zero mapping (see
//       `SurfacedFinding` below).
//
// WHY a dedicated `SurfaceModel` rather than reading `LintScene` directly:
// resolving "which node owns this port" needs a REVERSE lookup `lint.ts`
// itself never needed (every existing consumer goes node/port -> key, not
// key -> node), and a port key cannot be safely split back into
// `nodeId`/`portId` by string surgery — `portKey`'s own doc allows a
// `nodeId` to contain `/`. `sceneSurfaceModel` builds that reverse map once
// from the scene's edges (the only place a port name is ever attached to a
// node in this kit — `lint.ts`'s own header: there is no port list on the
// scene record).

import type { LintFinding, LintSubject } from "./lint";
import { subjectKey } from "./lint";
import { portKey, type SceneEdgeEnds } from "./scene";

/* ------------------------------------------------------------------ */
/* The surface model — parent/port/edge lookups a fold needs           */
/* ------------------------------------------------------------------ */

export interface SurfaceModel {
  /** A node's immediate parent, or `undefined` at the root — `scene.ts`'s
   *  own `parentId` field, just addressable by id instead of by object. */
  parentOf(nodeId: string): string | undefined;
  /** The node a port key belongs to, or `undefined` if this model has
   *  never seen that port (see the file header — reverse of `portKey`). */
  nodeOfPort(portKey: string): string | undefined;
  /** An edge's own ends, or `undefined` if this model has never seen that
   *  edge id. */
  endsOf(edgeId: string): SceneEdgeEnds | undefined;
}

/**
 * Build a `SurfaceModel` from a scene. `scene.nodes` is intersected with
 * `{ id, parentId? }` rather than widened to `LintScene`'s bare `{ id }` —
 * `LintScene` itself only ever needed node EXISTENCE, but folding needs
 * the nesting fact too, and `SceneNode.parentId` (scene.ts:84) is where it
 * already lives.
 */
export function sceneSurfaceModel(scene: {
  nodes: readonly { id: string; parentId?: string }[];
  edges: readonly (SceneEdgeEnds & { id: string })[];
}): SurfaceModel {
  const parents = new Map<string, string>();
  for (const node of scene.nodes) {
    if (node.parentId !== undefined) parents.set(node.id, node.parentId);
  }

  const portNodes = new Map<string, string>();
  const edgesById = new Map<string, SceneEdgeEnds>();
  for (const edge of scene.edges) {
    edgesById.set(edge.id, edge);
    if (edge.sourceHandle != null) portNodes.set(portKey(edge.source, edge.sourceHandle), edge.source);
    if (edge.targetHandle != null) portNodes.set(portKey(edge.target, edge.targetHandle), edge.target);
  }

  return {
    parentOf: (nodeId) => parents.get(nodeId),
    nodeOfPort: (pk) => portNodes.get(pk),
    endsOf: (edgeId) => edgesById.get(edgeId),
  };
}

/* ------------------------------------------------------------------ */
/* Visibility — what a node's CURRENT presentation hides               */
/* ------------------------------------------------------------------ */

/**
 * What a node hides right now. The host derives this from whatever it
 * wants — a `BlockView`, a per-node collapse flag, anything — this file
 * never names a source. `members: true` hides the node's CHILDREN (so a
 * child's own finding cannot show in place and must climb); `ports: true`
 * hides the node's OWN ports (so a finding ON one of ITS ports must climb
 * one hop, to the node itself) — the two axes are independent (a node can
 * hide its ports while still showing its members, or vice versa).
 * `undefined` for a node this fact-source has no opinion on: nothing about
 * it is hidden, per `PortsOf`'s own "undefined = unknown" convention
 * (lint.ts).
 */
export type HidesOf = (nodeId: string) => { members: boolean; ports: boolean } | undefined;

/** Is this exact subject shown, in place, right now? */
export type VisibilityOf = (subject: LintSubject) => boolean;

/**
 * Turn a `HidesOf` fact into the three-kind `VisibilityOf` predicate
 * `surfaceFindings` climbs against.
 *
 *   - a NODE is visible iff NO proper ancestor hides its members (climbing
 *     from the node's PARENT upward — a node's own `hidesOf` entry never
 *     hides the node itself, only what is nested inside it).
 *   - a PORT is visible iff its node is visible AND that node does not
 *     hide its ports.
 *   - an EDGE is visible iff BOTH of its ends are visible, where an end
 *     with a handle is a PORT anchor and a handle-less end is a NODE
 *     anchor — the same distinction `SceneEdgeEnds` itself draws.
 */
export function visibilityFromHides(model: SurfaceModel, hidesOf: HidesOf): VisibilityOf {
  const nodeVisible = (nodeId: string): boolean => {
    let ancestor = model.parentOf(nodeId);
    while (ancestor !== undefined) {
      if (hidesOf(ancestor)?.members) return false;
      ancestor = model.parentOf(ancestor);
    }
    return true;
  };

  const portVisible = (nodeId: string): boolean => nodeVisible(nodeId) && !hidesOf(nodeId)?.ports;

  const anchorVisible = (nodeId: string, handle?: string | null): boolean => (handle == null ? nodeVisible(nodeId) : portVisible(nodeId));

  return (subject) => {
    if (subject.kind === "node") return nodeVisible(subject.id);
    if (subject.kind === "port") {
      const nodeId = model.nodeOfPort(subject.id);
      // A port this model has never seen carries no hiding fact — the
      // honest default is visible, not invisible (same convention as
      // `PortsOf`: absence of information is not evidence of hiding).
      if (nodeId === undefined) return true;
      return portVisible(nodeId);
    }
    const ends = model.endsOf(subject.id);
    if (!ends) return true;
    return anchorVisible(ends.source, ends.sourceHandle) && anchorVisible(ends.target, ends.targetHandle);
  };
}

/* ------------------------------------------------------------------ */
/* Surfacing — climb every hidden finding to where it actually shows   */
/* ------------------------------------------------------------------ */

/**
 * A finding, plus WHERE it actually surfaces (`carrier`) and how far it
 * had to climb (`hops`, 0 = marked in place). Extends `LintFinding`
 * exactly like `LintFinding` itself extends `Diagnostic` — a structural
 * superset, so a `SurfacedFinding[]` assigns straight into a `diagnostics`
 * prop with zero mapping (see the file header's point (b)).
 */
export interface SurfacedFinding extends LintFinding {
  carrier: LintSubject;
  hops: number;
}

interface Climb {
  subject: LintSubject;
  hops: number;
}

/**
 * `findings`, surfaced against `isVisible`/`model` — grouped by the
 * carrier each one lands on (`byCarrier`, keyed by `subjectKey(carrier)`,
 * so it drops straight into the same lookup shape `findingsBySubject`
 * already uses), plus `unanchored`: findings whose entire ancestor chain
 * offered nowhere visible to land. Nothing is ever silently dropped — an
 * unanchored finding is returned, not discarded, exactly like
 * `findDanglingEdges`' own "malformed input yields the honest smaller
 * answer" policy elsewhere in this kit.
 */
export function surfaceFindings(
  findings: readonly LintFinding[],
  options: { isVisible: VisibilityOf; model: SurfaceModel },
): { byCarrier: Map<string, SurfacedFinding[]>; unanchored: SurfacedFinding[] } {
  const { isVisible, model } = options;
  const byCarrier = new Map<string, SurfacedFinding[]>();
  const unanchored: SurfacedFinding[] = [];

  const climbNode = (nodeId: string, hops: number): Climb | undefined => {
    if (isVisible({ kind: "node", id: nodeId })) return { subject: { kind: "node", id: nodeId }, hops };
    const parent = model.parentOf(nodeId);
    if (parent === undefined) return undefined; // hit the top, still hidden — unanchored
    return climbNode(parent, hops + 1);
  };

  const climbPort = (pk: string): Climb | undefined => {
    if (isVisible({ kind: "port", id: pk })) return { subject: { kind: "port", id: pk }, hops: 0 };
    const nodeId = model.nodeOfPort(pk);
    if (nodeId === undefined) return undefined; // model has never seen this port
    const node = climbNode(nodeId, 0);
    if (!node) return undefined;
    return { subject: node.subject, hops: node.hops + 1 };
  };

  const pushTo = (carrier: LintSubject, hops: number, finding: LintFinding) => {
    const key = subjectKey(carrier);
    const surfaced: SurfacedFinding = { ...finding, carrier, hops };
    const bucket = byCarrier.get(key);
    if (bucket) bucket.push(surfaced);
    else byCarrier.set(key, [surfaced]);
  };

  for (const finding of findings) {
    const { subject } = finding;

    if (subject.kind === "node") {
      const result = climbNode(subject.id, 0);
      if (result) pushTo(result.subject, result.hops, finding);
      else unanchored.push({ ...finding, carrier: subject, hops: 0 });
      continue;
    }

    if (subject.kind === "port") {
      const result = climbPort(subject.id);
      if (result) pushTo(result.subject, result.hops, finding);
      else unanchored.push({ ...finding, carrier: subject, hops: 0 });
      continue;
    }

    // edge — visible in place iff BOTH ends are visible; otherwise it may
    // surface on up to two carriers (one per hidden end), deduped so an
    // edge whose both ends fold into the SAME ancestor reports there once.
    if (isVisible(subject)) {
      pushTo(subject, 0, finding);
      continue;
    }
    const ends = model.endsOf(subject.id);
    if (!ends) {
      unanchored.push({ ...finding, carrier: subject, hops: 0 });
      continue;
    }
    const endAnchors: { nodeId: string; handle?: string | null }[] = [
      { nodeId: ends.source, handle: ends.sourceHandle },
      { nodeId: ends.target, handle: ends.targetHandle },
    ];
    const carriers = new Map<string, Climb>();
    for (const end of endAnchors) {
      const anchor: LintSubject = end.handle != null ? { kind: "port", id: portKey(end.nodeId, end.handle) } : { kind: "node", id: end.nodeId };
      if (isVisible(anchor)) continue; // this end is fine as-is, nothing to climb for it
      const result = anchor.kind === "port" ? climbPort(anchor.id) : climbNode(anchor.id, 0);
      if (!result) continue;
      const key = subjectKey(result.subject);
      const existing = carriers.get(key);
      if (!existing || result.hops < existing.hops) carriers.set(key, result);
    }
    if (carriers.size > 0) {
      for (const climb of carriers.values()) pushTo(climb.subject, climb.hops, finding);
    } else {
      unanchored.push({ ...finding, carrier: subject, hops: 0 });
    }
  }

  return { byCarrier, unanchored };
}
