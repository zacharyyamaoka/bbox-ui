// src/document/sceneFromStore.ts — STUB. Lane L3 builds it
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3.1).
//
// WHY the signatures exist before the bodies do: the committed acceptance
// tests (src/wiring.smoke.test.tsx, src/region.smoke.test.tsx) import
// `sceneFromRecords`, and `tsconfig.json` includes every file under `src`. A
// missing module would leave L0 unable to typecheck at all, and a lane whose
// gate cannot run is a lane that cannot report. Throwing — rather than
// returning an empty scene — is what stops a later lane from mistaking the
// placeholder for a working projection.
import type { Editor, TLRecord } from "tldraw";

import type { BlockScene } from "@trunk/scene/scene";
import type { WireStyleData } from "@trunk/scene/sceneWires";

/** Everything a consumer reads off a node, derived from the shape's props.
 *  The scene "only ever names ports; it never places them"
 *  (@trunk/hosts/hostScene.ts:32-34) — so `ports` carries ids, never
 *  geometry, and the measured anchors stay in the shape. */
export type DocNodeData = {
  kind: "block" | "code" | "port" | "region";
  name: string;
  view?: "simple" | "port" | "expanded";
  ports?: Partial<Record<"top" | "right" | "bottom" | "left", string[]>>;
  portTypes?: Record<string, string>;
  code?: string;
  language?: string;
  direction?: "in" | "out";
  type?: string;
  regionKind?: "for" | "while" | "branch" | "plain";
  cornerBlockId?: string;
};

export type DocumentScene = BlockScene<DocNodeData, WireStyleData>;

const NOT_BUILT = 'not built — see docs/SYSTEMSKETCH-REBUILD-PLAN.md L3/L4';

/** Pure: node id = shape id, `parentId` = `shape.parentId` when it is a shape,
 *  one edge per `ss-wire` carrying BOTH bindings. Containment is NEVER an
 *  edge — control flow is structure, not a cable (plan §2). */
export function sceneFromRecords(_records: Iterable<TLRecord>): DocumentScene {
  throw new Error(NOT_BUILT);
}

/** `useValue` over `editor.store`, so every consumer of the projection
 *  recomputes exactly when the document changes. */
export function useDocumentScene(_editor: Editor): DocumentScene {
  throw new Error(NOT_BUILT);
}
