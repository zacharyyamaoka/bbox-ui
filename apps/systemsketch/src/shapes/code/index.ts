// PLACEHOLDER — lane L1 replaces this file whole — Code shape + click-to-edit
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5). What is here is SCHEMA ONLY: the
// persisted props of `ss-code` exactly as plan §3 spells them, and nothing
// else. No tool, no dock row, no CodeEditor face, no edit gesture — those are
// L1's, and L1 overwrites this file.
//
// WHY the schema lands in L0 and not with its own lane (the one place this
// file departs from the lane brief's `codeKit = EMPTY_KIT`): the document
// model is ONE contract, not five. A record only enters a tldraw store if a
// registered util validates it, so with an empty kit a board written after L1
// lands cannot be OPENED by an app where it has not — the `.tldr` is refused,
// not degraded. `src/document/documentModel.test.ts`'s `registry` describe is
// that rule made executable, and it is an L0 acceptance line: SHAPE_UTILS
// publishes all five types and BINDING_UTILS the one binding type from day 0.
// Vocabulary is shared and frozen early; BEHAVIOUR is what a lane owns.
//
// WHY this spells the empty kit's other fields out instead of spreading
// registry.ts's `EMPTY_KIT`: registry.ts imports THIS file, so a value import
// back would close a module cycle and the const would be read while still in
// its temporal dead zone — measured here as "Cannot read properties of
// undefined (reading 'shapeUtils')" the first time the registry was loaded. An
// `import type` is erased, so the cycle never exists at runtime.
import { createElement } from "react";
import { HTMLContainer, Rectangle2d, ShapeUtil, T, createShapePropsMigrationSequence, type TLBaseShape } from "tldraw";

import type { ShapeKit } from "../registry";
import { CODE_SHAPE_TYPE } from "../types";

// The face every un-landed kind wears. Duplicated per placeholder rather than
// hoisted into `shared/`: `shared/` is L0's permanent write set and a lane
// deletes its placeholder whole, so a shared constant would outlive every one
// of its callers.
const UNBUILT_FACE_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed currentColor",
  borderRadius: 4,
  opacity: 0.55,
  font: "12px ui-monospace, monospace",
  pointerEvents: "all",
} as const;

export type CodeLanguage = "python" | "javascript" | "json" | "plaintext";

/** Where this code came from in a real file. Reserved VERBATIM from
 *  docs/SOURCE-CODE-VIEW-PLAN.md:103-115 — the semantics are stream 4's, but
 *  the field has to exist in the schema before a board can carry one. */
export interface CodeOrigin {
  uri: string;
  anchor: string;
  contentHash: string;
}

export interface CodeShapeProps {
  w: number;
  h: number;
  code: string;
  language: CodeLanguage;
  origin: CodeOrigin | null;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-code": CodeShapeProps;
  }
}

export type CodeShape = TLBaseShape<"ss-code", CodeShapeProps>;

/** Schema only. L1 replaces this class with the real one. */
export class CodeShapeUtil extends ShapeUtil<CodeShape> {
  static override type = CODE_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    code: T.string,
    language: T.literalEnum("python", "javascript", "json", "plaintext"),
    origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string })),
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the sequence
  // is what gives these props a version number in a saved file, and it cannot
  // be retrofitted once boards exist.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): CodeShapeProps {
    return { w: 320, h: 120, code: "", language: "python", origin: null };
  }

  override getGeometry(shape: CodeShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override getIndicatorPath(shape: CodeShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  // WHY a visible "not built" face rather than `null`: a shape that validates,
  // occupies geometry and paints nothing is selectable emptiness — the worst
  // way to meet an un-landed lane. This says which lane owes it.
  override component(shape: CodeShape) {
    return createElement(
      HTMLContainer,
      { style: { ...UNBUILT_FACE_STYLE, width: shape.props.w, height: shape.props.h } },
      `${CODE_SHAPE_TYPE} — lane L1`,
    );
  }
}

export const codeKit: ShapeKit = {
  shapeUtils: [CodeShapeUtil],
  bindingUtils: [],
  tools: [],
  familyItems: [],
  toolUi: (_editor, tools) => tools,
};
