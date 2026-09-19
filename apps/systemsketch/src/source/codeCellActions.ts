// src/source/codeCellActions.ts — the PURE half of "Convert to code" and
// "Expand to blocks" for this app: a `DocumentScene` in, a `DocumentScene`
// out, no editor, no React, no tldraw.
//
// WHY the plan is separated from the click at all: the two gestures are the
// trunk's audited `collapseToCode`/`expandCode` running on the projection
// `src/document/sceneFromStore.ts` derives, written back through
// `src/document/applySceneDiff.ts`. Everything interesting is in the scene
// algebra, and everything the app adds on top is the three lines of
// translation below — so the interesting part is testable in plain node
// (./codeCellActions.test.ts) and the click is only wiring.
//
// EVERYTHING IS A BLOCK: no new grouping algebra is invented here. A code
// cell is `collapseToRegion`'s container wearing a code face — the trunk's
// own words (`codeCell.ts`: "THIS IS NOT A NEW SCENE ALGORITHM") — and this
// file only says which SHAPE TYPE the app renders that container as.
//
// NEVER MIX DATA AND CONTROL LINES: nothing here mints an edge. The one
// case where the trunk's collapse WOULD mint one (a cable crossing the
// selection becomes a promoted port plus a stub) is the refusal below,
// because this app's `ss-code` shape declares `canBind(): false`.
import { codeCellHeader, collapseToCode, expandCode, type CodeCellPayload } from "@trunk/scene/codeCell";
import { childrenOf } from "@trunk/scene/scene";
import type { WireStyleData } from "@trunk/scene/sceneWires";

import type { DocNodeData, DocumentScene } from "../document/sceneFromStore";

/** A node whose `data` came back from `collapseToCode` — the trunk writes
 *  `codeCell` onto it through a cast (`codeCell.ts`: `} as N`), so it is not
 *  visible on `DocNodeData` and is read back here, once, under one name. */
type CollapsedCellData = DocNodeData & { codeCell?: CodeCellPayload };

/** The refusal code for a selection a data cable crosses. */
export const CONVERT_CROSSING_CABLES = "convert-crossing-cables";

export interface ConvertToCodePlan {
  ok: true;
  scene: DocumentScene;
  cellId: string;
}

export type ConvertToCodeResult = ConvertToCodePlan | { ok: false; code: string; reason: string };

/**
 * Collapse a selection into ONE `code` node, the members kept underneath it.
 *
 * `mintId` is the caller's (the D9 rule the whole scene kit holds): the app
 * passes tldraw's `createShapeId`, a test passes a counter. Nothing in here
 * knows what a shape id looks like.
 */
export function planConvertToCode(
  scene: DocumentScene,
  nodeIds: readonly string[],
  mintId: () => string,
): ConvertToCodeResult {
  const result = collapseToCode<DocNodeData, WireStyleData>(scene, nodeIds, {
    mintId,
    // `kind` is what `applySceneDiff.ts`'s `SHAPE_TYPE_OF` reads to decide
    // the shape type, so this one word is what makes the container an
    // `ss-code` rather than an `ss-region`. `name` is `""` for the same
    // reason `sceneFromStore.ts` gives a code node one: a cell "has no name
    // of its own; what it is called is what it says".
    regionData: { kind: "code", name: "" } as DocNodeData,
  });
  if (!result.ok) {
    return { ok: false, code: result.refusal.code ?? "refused", reason: result.refusal.message ?? "The selection cannot be collapsed" };
  }

  // THE REFUSAL, and why it is a refusal rather than a best effort:
  // `collapseToRegion` promotes every cable crossing the selection into a
  // PORT on the container and re-points the outside end at it. An `ss-code`
  // shape answers `canBind(): false` — "a code shape speaks no ports at
  // all… there is nothing for a terminal to name" (CodeShapeUtil.tsx) — so
  // `applySceneDiff.ts` would hand those edges to `createWire`, which
  // answers `null` when it cannot find a terminal, and the cables would
  // simply be gone. Silently. The tempting alternative is to let the
  // collapse through and accept the loss because the BLOCKS still round
  // trip; that trades a gesture the person can retry for data they cannot
  // get back. Refusing names the reason while both ends still exist.
  if (result.ports.length > 0) {
    const cables = result.ports.length === 1 ? "1 cable" : `${result.ports.length} cables`;
    return {
      ok: false,
      code: CONVERT_CROSSING_CABLES,
      reason: `${cables} cross this selection. A code cell has no ports to hang them on — unwire them first, or select the blocks at both ends.`,
    };
  }

  // The header the trunk generated lives in `data.codeCell.source`, and the
  // app's write side reads `data.code` (`applySceneDiff.ts`'s
  // `propsFromData`). Copying it across here rather than re-deriving it with
  // a second `codeCellHeader(...)` call is what keeps ONE spelling of the
  // header: two call sites is exactly how `expandCode`'s `textWasEdited`
  // would start reporting an edit nobody made.
  const scene2: DocumentScene = {
    ...result.scene,
    nodes: result.scene.nodes.map((node) => {
      if (node.id !== result.regionId) return node;
      const data = node.data as CollapsedCellData;
      return { ...node, type: "code", data: { ...data, code: data.codeCell?.source ?? "", language: data.codeCell?.language ?? "plaintext" } };
    }),
  };

  return { ok: true, scene: scene2, cellId: result.regionId };
}

/** A node this app renders as a code cell: a `code` node in the projection.
 *
 *  WHY not the trunk's own `isCodeCell`: that one asks `isRegion(node)`,
 *  because in a trunk `BlockScene` a cell IS a region wearing a face. In
 *  THIS app a cell is its own shape type (`ss-code`), which the projection
 *  reports as `kind: "code"` — so the same question has a different, and
 *  equally total, spelling here. Same question, host's vocabulary. */
export function isAppCodeCell(scene: DocumentScene, nodeId: string): boolean {
  return scene.nodes.find((node) => node.id === nodeId)?.data.kind === "code";
}

export interface ExpandCodePlan {
  ok: true;
  scene: DocumentScene;
  /** The cell's text at the moment of expansion — what expand threw away. */
  discardedText: string | null;
  /** `true` when that text was more than the generated header, i.e. someone
   *  typed in the cell. A host confirms on `true` and only on `true`. */
  textWasEdited: boolean;
}

export type ExpandCodeResult = ExpandCodePlan | { ok: false; code: string; reason: string };

/** The refusal code for an id that is not a code cell. */
export const EXPAND_NOT_A_CELL = "expand-not-a-cell";

/**
 * Dissolve a cell, releasing its members back to where the cell stood.
 *
 * `textWasEdited` is computed HERE rather than taken from the trunk's
 * `expandCode`, and the reason is the same vocabulary gap `isAppCodeCell`
 * documents: the trunk reads the text off `data.codeCell.source` of a node
 * whose `type` is `"region"`, and this app's cell is a `"code"` node whose
 * text is `data.code`. Left to the trunk the answer would be a flat `null` /
 * `false` for every cell in this app — which reads as "nothing was lost" and
 * would silently skip the confirm on a cell somebody had written in.
 */
export function planExpandCode(scene: DocumentScene, cellId: string): ExpandCodeResult {
  const cell = scene.nodes.find((node) => node.id === cellId);
  if (!cell || cell.data.kind !== "code") {
    return { ok: false, code: EXPAND_NOT_A_CELL, reason: `Nothing to expand: ${cellId} is not a code cell` };
  }

  const discardedText = typeof cell.data.code === "string" ? cell.data.code : null;
  // EXACTLY the trunk's own `defaultNameOf` (`codeCell.ts`): `data.name`
  // when it is a string — including the empty string — else the id. A second
  // spelling here (say, treating `""` as "no name" and falling back to the
  // id) is precisely how `textWasEdited` starts reporting an edit nobody
  // made, which that file warns about in those words.
  const memberNames = childrenOf(scene, cellId).map((node) => (typeof node.data.name === "string" ? node.data.name : node.id));
  const expanded = expandCode<DocNodeData, WireStyleData>(scene, cellId);

  return {
    ok: true,
    scene: expanded.scene,
    discardedText,
    textWasEdited: discardedText !== null && discardedText !== codeCellHeader(memberNames),
  };
}
