// src/scene/codeCell.ts — Rung A of the source-code view: collapse a
// selection into ONE region wearing a code face, and expand it back exactly.
// docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §4 (Rung A). Types FROZEN by the
// plan commit; bodies filled by lane `scv-rung-a-scene`. Tests:
// ./codeCell.test.ts (off-limits to builders).
//
// THIS IS NOT A NEW SCENE ALGORITHM. A code cell IS a region (`region.ts`:
// "100% its a node. its just a unique type of node") — `type` stays
// `REGION_NODE_TYPE`, children hang off `parentId`, ports are promoted from
// the crossing edges by `collapse.ts` — with ONE extra fact on its `data`:
// `codeCell`, the face. That is what keeps every region query
// (`regionOf`, `dissolveRegion`, `classifyBoundary`) working on a cell
// unchanged, and it is why `collapseToCode` is a thin wrapper over
// `collapseToRegion` and `expandCode` over `dissolveRegion` — reuse, not a
// second grouping algebra (docs/peps/0003 governs both).
//
// EVERYTHING IS A BLOCK / NEVER MIX DATA AND CONTROL (Zach's two load-bearing
// ideas, how this file honours them): the cell is a node with ports like any
// other block — its ports ARE the data cables that crossed the selection,
// nothing else; no control line is minted here, and the cell's text is
// annotation, not a wire.
//
// THE ONE HONEST SUBTLETY — what fills the text at Rung A (plan Q1 default):
// with no parser, `source` cannot be derived code. The collapsed subgraph
// STAYS IN THE SCENE (re-parented under the cell) and is the single truth
// for expand; the text is a deterministic generated header the user may
// edit as pseudo-code. Expand replays the children and DISCARDS the text —
// returning what it discarded, and whether the user had changed it, so a
// host can warn first. Editing the text never changes the blocks.
//
// Pure: no React, no DOM, no canvas engine.

import type { CollapseOptions, CollapseResult, DissolveOptions, DissolveResult } from "./collapse";
import type { CodeOrigin } from "./codeOrigin";
import type { BlockScene, SceneData, SceneNode } from "./scene";

/** The face. `origin` null = the board owns the bytes (a pseudo cell). */
export interface CodeCellPayload {
  /** `"plaintext"` for a Rung-A cell; `"python"` for a definition cell. A
   *  language is a LANGUAGE fact, a binding is a BINDING fact — orthogonal
   *  (answers report A3). */
  language: string;
  source: string;
  origin: CodeOrigin | null;
}

/** A region node's `data` once it wears a code face. Other host fields
 *  (`name`, `w`, `h`, …) sit beside it untouched. */
export type CodeCellData = SceneData & { codeCell: CodeCellPayload };

export const CODE_CELL_LANGUAGE_PLAINTEXT = "plaintext";

/** A region carrying a `codeCell` payload. Total: a non-region, or a region
 *  without the payload, is simply not a cell. */
export function isCodeCell(node: SceneNode<SceneData>): node is SceneNode<CodeCellData> {
  void node;
  throw new Error("scv: not implemented — lane scv-rung-a-scene fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}

/**
 * The deterministic Rung-A header — the text a fresh cell shows. EXACT
 * format, so a story and a test can both compare against it:
 *
 *   `# code cell — 3 blocks: A, B, C\n# annotation only until a backend is connected; expand restores the blocks\n`
 *
 * `N blocks` uses the singular `1 block` for one; names joined by `, ` in the
 * order given; zero names renders `# code cell — 0 blocks\n` + the second line.
 */
export function codeCellHeader(memberNames: readonly string[]): string {
  void memberNames;
  throw new Error("scv: not implemented — lane scv-rung-a-scene fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}

export interface CollapseToCodeOptions<N extends SceneData = SceneData, E extends SceneData = SceneData>
  extends CollapseOptions<N, E> {
  /** Default `CODE_CELL_LANGUAGE_PLAINTEXT`. */
  language?: string;
  /** How a member is named in the header. Default: `String(node.data.name)`
   *  when `data.name` is a string, else `node.id`. Only the selection ROOTS
   *  (`selectionRoots`) are named, in scene order — nested members ride
   *  along by containment and are not listed. */
  nameOf?: (node: SceneNode<N>) => string;
}

/**
 * `collapseToRegion` with the region's `data` = `{ ...regionData, codeCell:
 * { language, source: codeCellHeader(rootNames), origin: null } }`. Every
 * other output — `ports`, `conflicts`, `hidden`, refusals, id minting order
 * — is `collapseToRegion`'s, byte for byte: same `mintId` sequence, same
 * ports for the same selection (the test asserts deep equality against a
 * parallel `collapseToRegion` call). A refusal passes through untouched.
 */
export function collapseToCode<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeIds: readonly string[],
  options: CollapseToCodeOptions<N, E>,
): CollapseResult<N, E> {
  void scene;
  void nodeIds;
  void options;
  throw new Error("scv: not implemented — lane scv-rung-a-scene fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}

export interface ExpandCodeResult<N extends SceneData, E extends SceneData> extends DissolveResult<N, E> {
  /** The cell's `codeCell.source` at the moment of expansion — what the
   *  expand threw away. `null` when `cellId` was not a code cell. */
  discardedText: string | null;
  /** `true` when `discardedText` differs from `codeCellHeader(<current
   *  root-child names>)` — i.e. someone typed in the cell. A host warns on
   *  `true`; on `false` the text was the generated header and nothing is
   *  lost. `false` when `discardedText` is null. */
  textWasEdited: boolean;
}

/**
 * `dissolveRegion` plus the discarded-text report. Unknown `cellId` → the
 * SAME scene object, `discardedText: null`, `textWasEdited: false` (the
 * referentially-honest no-op `dissolveRegion` already promises). A region
 * WITHOUT a code face still dissolves (total), with `discardedText: null`.
 */
export function expandCode<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  cellId: string,
  options: DissolveOptions = {},
): ExpandCodeResult<N, E> {
  void scene;
  void cellId;
  void options;
  throw new Error("scv: not implemented — lane scv-rung-a-scene fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}
