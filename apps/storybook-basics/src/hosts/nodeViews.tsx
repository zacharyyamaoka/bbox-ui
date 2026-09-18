// src/hosts/nodeViews.tsx — the shared scene→view-kit renderer both hosts
// mount. One node record in, one composed view-kit element out; the
// components themselves stay props-in DOM-out and never learn a host
// exists (the same adapter licence `sceneWires.ts` claims: this module may
// know both vocabularies; the kits it bridges never import each other).
//
// WHY one shared module instead of a renderer per host: the host-facing
// component names (glyph/code/block/value) and how each dresses a node are
// the CONTRACT the hosts have in common — H6's "renders in both hosts
// under its host-facing name" is only one claim if there is only one
// mapping. A third host imports this file and owns nothing but its
// viewport.

import type { ReactNode } from "react";

import { Block } from "../components/block";
import { BlockPort, type BlockEdgeSpec } from "../components/blockPort";
import { CodeEditor } from "../components/codeEditor";
import { Glyph } from "../components/glyph";
import type { PortEdgeItem } from "../components/portEdge";
import type { Distribution } from "../components/portEdge.layout";
import type { BlockSide } from "../components/port.layout";
import { ValueCapsule } from "../presets/value/value";
import { childrenOf, type SceneNode, wiredPorts } from "../scene/scene";
import { withWiredState } from "../scene/sceneWires";
import { type HostNodeData, type HostScene } from "./hostScene";

/**
 * The one cross-host pointer-ownership marker.
 *
 * SystemSketch was checked for the "general function that works for both
 * hosts" (Zach's hunch) and does not have one — each tldraw-side dnd
 * surface independently clones the pointerdown, hides the clone from the
 * canvas with `editor.markEventAsHandled(clone)`, and re-dispatches it at
 * its own DndContext (src/blocks/memberStackDnd.tsx:44-46,485;
 * src/blocks/ports/CommunicationPortDnd.tsx:193-196). What IS portable is
 * not a function but a MARKER on the DOM boundary: "this subtree owns its
 * pointer; the canvas must not start a gesture here."
 *
 * The spelling is React Flow's own default `noDragClassName` ("nodrag"),
 * so the React Flow host honors it with ZERO adapter code — its drag
 * filter already rejects any pointerdown whose target sits under this
 * class. The DOM host has no gestures, so the class is inert there. A
 * phase-2 tldraw host maps the same marker in its ShapeUtil's
 * onPointerDown: `if (target.closest(".nodrag")) editor.markEventAsHandled
 * (…)` — SystemSketch's mechanism, keyed off this one shared boundary.
 */
export const POINTER_OWNED_CLASS = "nodrag";

/** The donor bench's header-hugging distribution (Scene.stories.tsx's
 *  ANCHOR_START, same values). */
const ANCHOR_START: Distribution = { mode: "aligned", anchor: "start", gap: 24, edgePadding: 16 };

/**
 * How a host reorders one wall of one node, expressed as a scene write —
 * "the host measures/moves and writes the result back into the scene as
 * data" (ARCHITECTURE.md's measurement rule, applied to order). Pure;
 * unknown node or side returns the same scene object (the kit's own no-op
 * contract).
 */
export function reorderNodePorts(scene: HostScene, nodeId: string, side: BlockSide, order: string[]): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !node.data.ports?.[side]) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((candidate) =>
      candidate.id === nodeId ? { ...candidate, data: { ...candidate.data, ports: { ...candidate.data.ports, [side]: order } } } : candidate,
    ),
  };
}

/** A host writing one node's data back — e.g. the Code face's per-keystroke
 *  `onWrite`. Same total, referentially-honest shape as `reorderNodePorts`. */
export function writeNodeData(scene: HostScene, nodeId: string, patch: Partial<HostNodeData>): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((candidate) => (candidate.id === nodeId ? { ...candidate, data: { ...candidate.data, ...patch } } : candidate)),
  };
}

export interface SceneNodeViewProps {
  scene: HostScene;
  node: SceneNode<HostNodeData>;
  /** `wiredPorts(scene)` — computed once by the host per render, not per
   *  node. Optional so a single-component bench can omit it. */
  wired?: ReadonlySet<string>;
  /** The write-back seam. Omitted = a read-only specimen (reorders and
   *  keystrokes no-op, exactly like an uncontrolled gallery card). */
  onSceneChange?(next: HostScene): void;
}

function BlockNodeView({ scene, node, wired, onSceneChange }: SceneNodeViewProps) {
  const members = childrenOf(scene, node.id).map((kid) => ({
    id: kid.id,
    content: <SceneNodeView scene={scene} node={kid} wired={wired} onSceneChange={onSceneChange} />,
  }));
  const edges = Object.fromEntries(
    Object.entries(node.data.ports ?? {}).map(([side, portIds]) => [
      side,
      {
        items: withWiredState(portIds.map((id): PortEdgeItem => ({ id, label: id })), node.id, wired ?? new Set()),
        distribution: node.data.anchorStart?.includes(side as BlockSide) ? ANCHOR_START : undefined,
        onItemsChange: onSceneChange
          ? (items: PortEdgeItem[]) => onSceneChange(reorderNodePorts(scene, node.id, side as BlockSide, items.map((item) => item.id)))
          : undefined,
      } satisfies BlockEdgeSpec,
    ]),
  );
  return (
    <BlockPort id={node.id} view={node.data.view ?? "simple"} edges={edges}>
      <Block
        header={node.data.name}
        width={node.data.w}
        height={node.data.h}
        members={members.length > 0 ? members : undefined}
        membersLayout="stack"
        memberGutter={36}
      />
    </BlockPort>
  );
}

/**
 * One scene node → the view-kit face its `type` names. Unknown/absent type
 * falls back to `block` — the honest general face, same default React
 * Flow's own `nodeTypes` lookup applies.
 */
export function SceneNodeView(props: SceneNodeViewProps): ReactNode {
  const { scene, node, wired, onSceneChange } = props;
  switch (node.type) {
    case "glyph":
      return <Glyph content={node.data.content ?? ""} sizePreset="lg" />;
    case "code":
      return (
        <CodeEditor
          value={node.data.code ?? ""}
          onWrite={(next) => onSceneChange?.(writeNodeData(scene, node.id, { code: next }))}
          multiline
          columns={Math.max(8, ...(node.data.code ?? "").split("\n").map((line) => line.length))}
          ariaLabel={node.data.name ?? node.id}
          // The editor owns its pointer (caret, selection, in-editor drag);
          // the marker keeps a gesturing host out — see POINTER_OWNED_CLASS.
          className={POINTER_OWNED_CLASS}
        />
      );
    case "value":
      return (
        <ValueCapsule
          id={node.id}
          value={node.data.value ?? ""}
          width={node.data.w}
          height={node.data.h}
          onWrite={(next) => onSceneChange?.(writeNodeData(scene, node.id, { value: next }))}
          writers={withWiredState((node.data.writers ?? []).map((id): PortEdgeItem => ({ id, label: id })), node.id, wired ?? new Set())}
          readers={withWiredState((node.data.readers ?? []).map((id): PortEdgeItem => ({ id, label: id })), node.id, wired ?? new Set())}
          codeEditorProps={{ className: POINTER_OWNED_CLASS }}
        />
      );
    case "block":
    default:
      return <BlockNodeView {...props} />;
  }
}

/** Recompute-once helper hosts share; re-exported so a host story never
 *  reaches into the scene kit for the common read. */
export function wiredPortsOf(scene: HostScene): Set<string> {
  return wiredPorts(scene);
}
