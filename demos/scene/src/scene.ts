/**
 * The demo scene, host-neutral: Camera / Detect / Track / cm_clock, their
 * ports and edges, in world coordinates.
 *
 * WHY one module: if two hosts render "the same" scene from two hand-typed
 * copies, any comparison between them proves nothing — a pixel difference
 * could be content drift instead of adapter drift. Every demo and the
 * compare harness consume this scene through the converters beside it, so
 * the only thing left to diverge is the rendering.
 *
 * Icons are strings (emoji) rather than arbitrary React nodes because the
 * tldraw shape record persists its icon as a string — the neutral scene
 * keeps to the intersection both hosts can carry.
 */
import type {
  BlockSide,
  PortDirection,
  PortTextLayout,
  TextSize,
} from "@bbox-ui/core";

/** Persistable port state plus an explicitly runtime-only received flag. */
export interface ScenePort {
  id: string;
  direction: PortDirection;
  state: "empty" | "valueSet" | "wired";
  /**
   * Painted as "received" by a live host, never persisted — mirrors the
   * runtime-only rule both adapters enforce (see ARCHITECTURE.md).
   */
  receivedAtRuntime?: boolean;
  size: "sm" | "md" | "lg";
  label: string;
  textLayout: PortTextLayout;
  side: BlockSide;
  t: number;
}

export interface SceneBlock {
  id: string;
  x: number;
  y: number;
  /**
   * Explicit container size, for scenes derived from an authored board where
   * a block may have been resized. Absent (the fixed demo scene) both hosts
   * fall back to their defaults: tldraw to SIMPLE_BLOCK, React Flow to
   * hug-contents — which agree for an unresized block. Present, both hosts
   * honour it exactly: tldraw as props.w/h, React Flow as CSS on the node.
   * See explicitBlockSize below for the contract.
   */
  w?: number;
  h?: number;
  title: string;
  titleSize?: TextSize;
  blockType?: string;
  description?: string;
  icon?: string;
  tag?: string;
  orientation?: "horizontal" | "vertical";
  ports: ScenePort[];
}

/**
 * The one size contract, stated once so no adapter re-derives it (the
 * layout.ts rule: any mapping that appears in both adapters is a bug):
 * **explicit size when the scene carries one; hug contents when it does
 * not.** tldraw takes the pair as `props.w/h`; React Flow takes it as CSS
 * (`style: { width, height }` on the node — its `width`/`height` fields are
 * where React Flow *stores* what it measured, not an input) with the core
 * `Block` filling that box. Both dimensions or neither: a half-specified
 * size has no meaning in either host.
 */
export function explicitBlockSize(
  block: SceneBlock,
): { w: number; h: number } | null {
  return block.w != null && block.h != null ? { w: block.w, h: block.h } : null;
}

export interface SceneEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

/**
 * A Port placed on the canvas without a Block — the playground's standalone
 * `bbox-port` shape. React Flow has no host concept for it (handles belong
 * to nodes there), so the comparison wraps each one in a minimal chrome-less
 * node at the same world point; the wrapper is disclosed in the readout, not
 * hidden.
 */
export interface SceneStandalonePort {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  state: "empty" | "valueSet" | "wired";
  size: "sm" | "md" | "lg";
  label: string;
  textLayout: PortTextLayout;
}

export interface Scene {
  blocks: SceneBlock[];
  edges: SceneEdge[];
  /** Absent means none — the fixed demo scene predates standalone ports. */
  standalonePorts?: SceneStandalonePort[];
}

export const SCENE: Scene = {
  blocks: [
    {
      id: "camera",
      x: 0,
      y: 40,
      title: "Camera",
      blockType: "Source",
      description: "async computation",
      icon: "📷",
      ports: [
        {
          id: "frame",
          direction: "output",
          state: "wired",
          size: "md",
          label: "frame",
          textLayout: "left",
          side: "right",
          t: 0.72,
        },
      ],
    },
    {
      id: "detect",
      x: 560,
      y: 0,
      title: "Detect",
      blockType: "dataflow",
      description: "blackbox modelling",
      icon: "🔍",
      tag: "Draft 1",
      ports: [
        {
          id: "image",
          direction: "input",
          state: "wired",
          size: "md",
          label: "image",
          textLayout: "right",
          side: "left",
          t: 0.35,
        },
        {
          id: "threshold",
          direction: "input",
          state: "valueSet",
          size: "md",
          label: "threshold",
          textLayout: "right",
          side: "left",
          t: 0.7,
        },
        {
          id: "boxes",
          direction: "output",
          state: "wired",
          size: "md",
          label: "boxes",
          textLayout: "left",
          side: "right",
          t: 0.62,
        },
      ],
    },
    {
      id: "track",
      x: 1120,
      y: 40,
      title: "Track",
      ports: [
        {
          id: "detections",
          direction: "input",
          state: "wired",
          receivedAtRuntime: true,
          size: "md",
          label: "detections",
          textLayout: "right",
          side: "left",
          t: 0.35,
        },
        {
          id: "config",
          direction: "input",
          state: "empty",
          size: "md",
          label: "config",
          textLayout: "right",
          side: "left",
          t: 0.7,
        },
        {
          id: "tracks",
          direction: "output",
          state: "empty",
          size: "md",
          label: "",
          textLayout: "left",
          side: "right",
          t: 0.5,
        },
      ],
    },
    {
      // WHY this block exists: its title is deliberately wider than the
      // chip-constrained header, so the truncation path (visible ellipsis,
      // full string on the title attribute) shows in both hosts' demos and
      // screenshots rather than only in unit tests.
      id: "detect-frame",
      x: 1120,
      y: 420,
      title: "Detect Objects In Frame",
      blockType: "dataflow",
      icon: "🎯",
      tag: "Draft 2",
      ports: [
        {
          id: "image",
          direction: "input",
          state: "empty",
          size: "md",
          label: "image",
          textLayout: "right",
          side: "left",
          // Below the header band — at 0.5 the inward label would sit on
          // the (truncated) title itself.
          t: 0.75,
        },
      ],
    },
    {
      id: "clock",
      x: 560,
      y: 420,
      title: "cm_clock",
      titleSize: "lg",
      blockType: "Clock",
      icon: "⏱",
      orientation: "vertical",
      ports: [
        {
          id: "tick",
          direction: "output",
          state: "empty",
          size: "md",
          label: "tick",
          textLayout: "left",
          side: "right",
          t: 0.5,
        },
      ],
    },
  ],
  edges: [
    {
      id: "camera-detect",
      source: "camera",
      sourcePort: "frame",
      target: "detect",
      targetPort: "image",
    },
    {
      id: "detect-track",
      source: "detect",
      sourcePort: "boxes",
      target: "track",
      targetPort: "detections",
    },
  ],
  standalonePorts: [
    {
      // WHY this port exists: the R2 escaped defect was a RESIZED (100×25)
      // standalone port whose top label floated 75px off its dot — and the
      // fixed scene had no standalone port at all, so the compare harness
      // measured straight through it. This is that reproducer, kept in the
      // regression net: non-square dot, label on the short axis.
      id: "sensor-bus",
      x: 40,
      y: 620,
      w: 100,
      h: 25,
      state: "wired",
      size: "md",
      label: "sensor bus",
      textLayout: "top",
    },
  ],
};
