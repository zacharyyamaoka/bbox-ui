// src/hosts/domCanvas.tsx — the DOM Canvas host, extracted from the bench
// `Scene.stories.tsx` has rendered since the scene kit landed: positioned
// divs + the view kit + `WireLayer`, nothing else.
//
// WHY this host is deliberately incapable — no viewport transform, no pan,
// no zoom, and none will be added: its value is NEGATIVE. It is the
// control that proves the scene contract needs no engine ("Deliberately
// has no viewport" — ARCHITECTURE.md's own host table). The moment this
// host grew a viewport, both benches would have one and the control would
// be gone — "one host cannot falsify a contract; two can" only works
// while one of the two stays bare. The tripwire: when a story here starts
// needing pan/zoom, the story MOVES to the React Flow bench; this file
// does not grow the feature. `DomCanvas.stories` asserts the incapability
// mechanically (no transform on the root, no zoom/pan/viewport export in
// this module), so the tripwire is a failing test, not a comment.

import { useRef, type ReactNode } from "react";

import { WireLayer } from "../components/wireLayer";
import { sceneWires } from "../scene/sceneWires";
import { topLevelNodes, type HostScene } from "./hostScene";
import { SceneNodeView, wiredPortsOf } from "./nodeViews";

export interface DomCanvasProps {
  scene: HostScene;
  /** The write-back seam (reorder, keystrokes). Omit for a read-only bench. */
  onSceneChange?(next: HostScene): void;
  width?: number;
  height?: number;
  /** Extra layer painted over the bench (a story's own probe/caption). */
  children?: ReactNode;
}

/**
 * Scene in, DOM out. Placement is `position: absolute` at the node's
 * authored `position` — the scene's own at-rest fact, no transform between
 * it and the screen. Members never appear at this level: nesting is the
 * view kit's job (`childrenOf` inside `SceneNodeView`), identically in
 * every host.
 */
export function DomCanvas({ scene, onSceneChange, width = 640, height = 300, children }: DomCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wired = wiredPortsOf(scene);
  return (
    <div data-host="dom-canvas" ref={containerRef} style={{ position: "relative", width, height }}>
      {topLevelNodes(scene).map((node) => (
        <div key={node.id} data-scene-node={node.id} style={{ position: "absolute", left: node.position.x, top: node.position.y }}>
          <SceneNodeView scene={scene} node={node} wired={wired} onSceneChange={onSceneChange} />
        </div>
      ))}
      <WireLayer
        wires={sceneWires(scene)}
        containerRef={containerRef}
        // Any scene change can move a dot (a reorder swaps rail slots
        // without resizing anything the container's ResizeObserver would
        // see), so the whole record is the re-measure signal.
        layoutKey={scene}
      />
      {children}
    </div>
  );
}
