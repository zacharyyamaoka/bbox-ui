// src/shapes/code/CodeShapeUtil.tsx — `ss-code`: a block-shaped node whose
// face is a live code document.
//
// "Everything is really a block" (Zach, docs/ASK-2026-09-18…md) applies here
// too: Code is not a second family of thing, it is a node in the same
// measured wrapper every other kind renders inside (shared/nodeShapeComponent
// .tsx), placed by the same stock `BaseBoxShapeTool`, listed in the same ONE
// system dock slot. What differs is only what its face draws.
//
// The schema below was written by L0 (the placeholder this lane replaces) so
// that a `.tldr` written after this lane landed could still be OPENED by an
// app where it had not — a record only enters a tldraw store if a registered
// util validates it. It is reproduced here VERBATIM; if the two ever
// disagree, src/document/documentModel.test.ts's "ss-code (L1)" describe is
// the arbiter.
import {
  Rectangle2d,
  ShapeUtil,
  T,
  createShapePropsMigrationSequence,
  resizeBox,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";

import { CODE_SHAPE_TYPE } from "../types";
import { CodeFace } from "./CodeFace";

export type CodeLanguage = "python" | "javascript" | "json" | "plaintext";

/**
 * Where this code came from in a real file.
 *
 * WHY the slot exists in a lane that never reads it: reserved VERBATIM from
 * docs/SOURCE-CODE-VIEW-PLAN.md:103-115 so stream 4 (the source-code view)
 * needs NO migration when it starts writing one. The semantics — what a
 * stale `contentHash` means, what re-anchoring does, which of the four origin
 * states a badge shows — are entirely stream 4's. This lane only guarantees
 * three things: the field validates, it defaults to `null`, and a shape
 * created with one keeps it byte-for-byte.
 */
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
  /** Schema v2 (B-SCHEMA, P-127): CodeFace passes `lineNumbers` unconditionally
   *  today, so `true` is today's face. */
  lineNumbers: boolean;
  /** Schema v2 (B-SCHEMA, P-127): CodeEditor's own `fontSizePx` default, 13. */
  fontSizePx: number;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-code": CodeShapeProps;
  }
}

export type CodeShape = TLBaseShape<"ss-code", CodeShapeProps>;

/** The indicator's corner radius — the same 6px `.bbox-code-editor` rounds
 *  its own border to (components/codeEditor.css), so the selection ring
 *  traces the face rather than boxing it. */
const INDICATOR_RADIUS_PX = 6;

export class CodeShapeUtil extends ShapeUtil<CodeShape> {
  static override type = CODE_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    code: T.string,
    language: T.literalEnum("python", "javascript", "json", "plaintext"),
    origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string })),
    lineNumbers: T.boolean,
    fontSizePx: T.number,
  };

  // Version 0 was declared empty for the reason BlockShapeUtil records: the
  // sequence is what gives these props a version number in a saved file, and
  // it cannot be retrofitted once boards exist in the wild. Schema v2 is its
  // first step.
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: `com.tldraw.shape.${CODE_SHAPE_TYPE}/1`,
        // SCHEMA V2 (B-SCHEMA, P-127): line numbers and font size.
        //
        // WHY — the P-028 empty-migration incident: P-028 added `props.pins`
        // to `ss-wire` with an EMPTY sequence, every board saved before it
        // REFUSED TO OPEN, and the committed fixture `two-blocks.tldr` went
        // down with it. `T.boolean`/`T.number` reject `undefined`, so without
        // this step every code cell saved before v2 would do the same.
        //
        // FILLS, NEVER RESETS (`??=`), with LITERALS that paint today's face
        // (never `getDefaultProps` — a shipped migration is frozen). `origin`
        // is not touched: stream 4's slot stays byte-identical
        // (`src/source/originResolution.test.ts`).
        up: (props: Record<string, unknown>) => {
          props.lineNumbers ??= true;
          props.fontSizePx ??= 13;
        },
      },
    ],
  });

  override getDefaultProps(): CodeShapeProps {
    return { w: 320, h: 120, code: "", language: "python", origin: null, lineNumbers: true, fontSizePx: 13 };
  }

  // WHY editable at all, when the face is always live: tldraw gates its own
  // keyboard shortcuts on `getEditingShapeId()`, and `setEditingShape` REFUSES
  // a shape whose util says it cannot be edited (Editor.setEditingShape ->
  // canEditShape). So this `true` is what lets CodeFace mirror CodeMirror's
  // focus into the engine's notion of editing — without it, typing `v` in the
  // code would arm the select tool.
  override canEdit(): boolean {
    return true;
  }

  /**
   * A code shape is NEVER a wire endpoint.
   *
   * WHY, and why it is a refusal rather than an omission: a wire in this
   * language is a DATA line, and data lines run between declared ports. A
   * code shape speaks no ports at all — the honest empty
   * (`@trunk/hosts/hostScene.ts:181`, "an honest empty, not unknown") — so
   * there is nothing for a terminal to name. The tempting alternative is to
   * let a wire land on the shape's box and mean "this code runs next", which
   * is exactly the mixing of data and control lines this document model
   * forbids: control flow is containment, arms and marks, never a cable.
   * src/document/documentModel.test.ts asserts this `false` beside the
   * region's.
   */
  override canBind(): boolean {
    return false;
  }

  override canResize(): boolean {
    return true;
  }

  override onResize(shape: CodeShape, info: TLResizeInfo<CodeShape>) {
    return resizeBox(shape, info);
  }

  // Same call as the block's: no diagram in this language reads sideways, and
  // a rotated CodeMirror caret is worse than no rotation.
  override hideRotateHandle(): boolean {
    return true;
  }

  override getGeometry(shape: CodeShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override getIndicatorPath(shape: CodeShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, INDICATOR_RADIUS_PX);
    return path;
  }

  override component(shape: CodeShape) {
    return <CodeFace shape={shape} />;
  }
}
