// src/scene/scene.reactflow.test.ts — the falsifiable half of "we borrowed
// React Flow's semantics, not the package". Every function below is a
// TYPE-LEVEL proof: it compiles only if a `SceneNode`/`SceneEdge` assigns
// to `@xyflow/react`'s real published `Node`/`Edge` types with NO cast —
// there is not a single `as` in this file, and `pnpm exec tsc --noEmit`
// (which typechecks tests; vitest alone does not) is the gate that fails
// if the shapes ever drift apart.
//
// `@xyflow/react` is imported HERE, types only, and nowhere else in this
// app — `scene.ts` imports nothing, that is its whole design. The package
// rides in as a devDependency of this app purely so these imports resolve
// (same version the repo's own `packages/adapter-reactflow` already pins).
//
// Known deliberate divergences, each ARGUED at the seam in scene.ts:
//   - `SceneNode.definitionId` is an EXTRA field React Flow's `Node` does
//     not have. Extra fields are structurally invisible to assignability
//     (and React Flow stores node objects verbatim), so the proof still
//     holds — a SceneNode IS a valid Node that happens to know more.
//   - `SceneEdge.sourceHandle?: string` is STRICTER than React Flow's
//     `string | null | undefined` — narrower assigns into wider for free;
//     the reverse direction (RF edges into scene functions) is handled by
//     the pure functions' own `SceneEdgeEnds` slice admitting null.
import type { Edge, Node } from "@xyflow/react";
import { expect, test } from "vitest";

import type { BlockScene, SceneEdge, SceneNode } from "./scene";

/* ------------------------------------------------------------------ */
/* The proofs — each a plain function so the claim is universally      */
/* quantified over EVERY value of the type, never one lucky literal.   */
/* ------------------------------------------------------------------ */

const sceneNodeIsAReactFlowNode = (node: SceneNode): Node => node;
const sceneEdgeIsAReactFlowEdge = (edge: SceneEdge): Edge => edge;

// The arrays travel whole: a BlockScene's nodes/edges hand straight into
// anything typed against React Flow's own collections (`useNodesState`,
// `<ReactFlow nodes={…} edges={…}>`).
const sceneNodesAreReactFlowNodes = (scene: BlockScene): Node[] => scene.nodes;
const sceneEdgesAreReactFlowEdges = (scene: BlockScene): Edge[] => scene.edges;

// The generics survive too: a host authoring TYPED data keeps that typing
// across the boundary. (`type` aliases, not interfaces — object-literal
// aliases carry the implicit index signature `Record<string, unknown>`
// constraints need.)
type DemoNodeData = { name?: string; volts?: number };
type DemoEdgeData = { color?: string };
const typedSceneNodeIsATypedNode = (node: SceneNode<DemoNodeData>): Node<DemoNodeData> => node;
const typedSceneEdgeIsATypedEdge = (edge: SceneEdge<DemoEdgeData>): Edge<DemoEdgeData> => edge;

/* ------------------------------------------------------------------ */
/* Runtime smoke — vitest needs a test to count; identity is the claim */
/* ------------------------------------------------------------------ */

test("a SceneNode passes through React Flow's Node type as itself", () => {
  const node: SceneNode = { id: "n1", position: { x: 0, y: 0 }, data: {}, parentId: "p1", definitionId: "d1" };
  expect(sceneNodeIsAReactFlowNode(node)).toBe(node);
  const typed: SceneNode<DemoNodeData> = { id: "n2", position: { x: 4, y: 8 }, data: { name: "amp", volts: 5 } };
  expect(typedSceneNodeIsATypedNode(typed)).toBe(typed);
});

test("a SceneEdge passes through React Flow's Edge type as itself", () => {
  const edge: SceneEdge = { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" };
  expect(sceneEdgeIsAReactFlowEdge(edge)).toBe(edge);
  const typed: SceneEdge<DemoEdgeData> = { id: "e2", source: "n2", target: "n1", data: { color: "red" } };
  expect(typedSceneEdgeIsATypedEdge(typed)).toBe(typed);
});

test("a BlockScene's collections hand straight to React Flow", () => {
  const scene: BlockScene = {
    nodes: [{ id: "n1", position: { x: 0, y: 0 }, data: {} }],
    edges: [{ id: "e1", source: "n1", target: "n1" }],
  };
  expect(sceneNodesAreReactFlowNodes(scene)).toBe(scene.nodes);
  expect(sceneEdgesAreReactFlowEdges(scene)).toBe(scene.edges);
});
