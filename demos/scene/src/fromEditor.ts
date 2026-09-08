/**
 * Live board → Scene. The inverse of the converters beside it: walk a
 * tldraw editor's current page and project the bbox-ui primitives into the
 * host-neutral `Scene`, in world coordinates, so the compare harness can
 * render an authored board in both hosts.
 *
 * Honest counting is the contract here. Stock tldraw shapes (rectangles,
 * arrows, text, notes…) have no React Flow counterpart — that is fine, but
 * they are COUNTED, never silently dropped, so the readout can state its
 * denominator ("comparing 2 of 3 shapes") instead of printing a clean
 * number over a partial comparison.
 */
import type {
  BBoxBlockShapeProps,
  BBoxPortShapeProps,
} from "@bbox-ui/adapter-tldraw";

import type { Scene } from "./scene";

/**
 * The slice of a tldraw `Editor` the extraction reads. Structural on
 * purpose: a unit test hands in a plain object instead of booting an editor.
 */
export interface SceneSource {
  getCurrentPageShapes(): readonly {
    id: string;
    type: string;
    x: number;
    y: number;
    props: unknown;
  }[];
}

export interface SceneExtraction {
  scene: Scene;
  /** Blocks + standalone ports — what the comparison actually covers. */
  comparedShapeCount: number;
  blockCount: number;
  standalonePortCount: number;
  /** Shapes with no React Flow counterpart, by tldraw type — counted, not dropped. */
  stockShapeTypes: Record<string, number>;
  stockShapeCount: number;
  totalShapeCount: number;
}

/** "" is tldraw's stored none; the React Flow adapter's none is undefined —
 * passing "" through would render an empty slot element there and shift the
 * hug-contents geometry off the tldraw host's. */
const orUndefined = (value: string) => (value === "" ? undefined : value);

/** Scene ids are the shape ids minus tldraw's `shape:` prefix, so the
 * compare pane's `createShapeId(id)` round-trips to a valid tldraw id. */
const sceneId = (shapeId: string) => shapeId.replace(/^shape:/, "");

export function sceneFromEditor(editor: SceneSource): SceneExtraction {
  const scene: Scene = { blocks: [], edges: [], standalonePorts: [] };
  const stockShapeTypes: Record<string, number> = {};
  const pageShapes = editor.getCurrentPageShapes();

  for (const shape of pageShapes) {
    if (shape.type === "bbox-block") {
      const props = shape.props as BBoxBlockShapeProps;
      scene.blocks.push({
        id: sceneId(shape.id),
        x: shape.x,
        y: shape.y,
        w: props.w,
        h: props.h,
        title: props.title,
        titleSize: props.titleSize,
        blockType: orUndefined(props.blockType),
        description: orUndefined(props.description),
        icon: orUndefined(props.icon),
        tag: orUndefined(props.tag),
        orientation: props.orientation,
        ports: props.ports.map((port) => ({ ...port })),
      });
    } else if (shape.type === "bbox-port") {
      const props = shape.props as BBoxPortShapeProps;
      scene.standalonePorts!.push({
        id: sceneId(shape.id),
        x: shape.x,
        y: shape.y,
        w: props.w,
        h: props.h,
        state: props.state,
        size: props.size,
        label: props.label,
        textLayout: props.textLayout,
      });
    } else {
      stockShapeTypes[shape.type] = (stockShapeTypes[shape.type] ?? 0) + 1;
    }
  }

  const blockCount = scene.blocks.length;
  const standalonePortCount = scene.standalonePorts!.length;
  const stockShapeCount = Object.values(stockShapeTypes).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    scene,
    blockCount,
    standalonePortCount,
    comparedShapeCount: blockCount + standalonePortCount,
    stockShapeTypes,
    stockShapeCount,
    totalShapeCount: pageShapes.length,
  };
}

/** The counts alone — what the compare view needs to state its denominator. */
export type ExtractionCounts = Omit<SceneExtraction, "scene" | "blockCount">;

export interface ExtractionSummary {
  /** Zero bbox-ui shapes: the comparison MUST show this, never a clean 0.00px. */
  empty: boolean;
  headline: string;
  /** Disclosures (the standalone-port wrapper); empty when nothing to disclose. */
  notes: string[];
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * The denominator, spelled out. WHY a pure function: the single most likely
 * way this feature ends up lying is an empty or mostly-stock board rendering
 * "max |Δ| = 0.00 px" — a unit test can hold this line without a browser.
 */
export function extractionSummary(counts: ExtractionCounts): ExtractionSummary {
  const stockDetail =
    counts.stockShapeCount > 0
      ? `${plural(counts.stockShapeCount, "stock tldraw shape")} (${Object.entries(
          counts.stockShapeTypes,
        )
          .map(([type, n]) => `${type} ×${n}`)
          .join(", ")}) ${counts.stockShapeCount === 1 ? "has" : "have"} no React Flow counterpart`
      : null;

  if (counts.comparedShapeCount === 0) {
    return {
      empty: true,
      headline:
        "Nothing to compare — this board has no bbox-ui shapes." +
        (stockDetail ? ` ${stockDetail[0].toUpperCase()}${stockDetail.slice(1)}.` : ""),
      notes: [],
    };
  }

  const notes: string[] = [];
  if (counts.standalonePortCount > 0) {
    notes.push(
      `${plural(counts.standalonePortCount, "standalone port")} compared via a chrome-less React Flow wrapper node`,
    );
  }
  return {
    empty: false,
    headline:
      `comparing ${counts.comparedShapeCount} of ${plural(counts.totalShapeCount, "shape")}` +
      (stockDetail ? ` — ${stockDetail}` : ""),
    notes,
  };
}
