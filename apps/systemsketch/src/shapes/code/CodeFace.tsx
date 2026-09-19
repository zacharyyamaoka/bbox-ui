// src/shapes/code/CodeFace.tsx — what an `ss-code` looks like: the trunk's
// own `CodeEditor`, fed from persisted props, inside a host-owned grab ring.
//
// Nothing is drawn here. Like BlockFace, this file's entire job is to turn
// `shape.props` into one trunk component's props and route its callbacks back
// into the store. The only host chrome it adds is the ring, and the only host
// knowledge it holds is the focus ↔ editing mirror — both explained below.
import { useRef } from "react";
import { useEditor } from "tldraw";

import { CodeEditor } from "@trunk/components/codeEditor";
import { POINTER_OWNED_CLASS } from "@trunk/hosts/nodeViews";

import { NodeShapeFrame } from "../shared/nodeShapeComponent";
import { CODE_SHAPE_TYPE } from "../types";
import type { CodeShape } from "./CodeShapeUtil";
import { languageSupportFor } from "./languages";

/**
 * The host-owned grab ring, in px — lifted from
 * apps/storybook-basics/src/hosts/tldrawHost.tsx:331-335.
 *
 * WHY a shape needs one at all: the code face is wall-to-wall editor and the
 * editor owns its pointer (caret, selection, in-editor text drag), so
 * `shared/pointerOwnership.ts` hides every press inside it from tldraw. With
 * nothing else to press, the shape would be impossible to reposition without
 * a marquee. The ring is the strip of shape that is NOT editor. It is host
 * chrome, not component: `CodeEditor` knows nothing about it, and the
 * React Flow host draws the same 10px for the same reason
 * (hosts/reactFlowHost.tsx:307).
 */
const GRAB_RING_PX = 10;

/** The narrowest the editor is allowed to get, in characters — the trunk's
 *  own floor at its code mount (hosts/nodeViews.tsx:473). */
const MIN_COLUMNS = 8;

export function CodeFace({ shape }: { shape: CodeShape }) {
  const editor = useEditor();
  const { code, language, w, h } = shape.props;

  // `view.contentDOM`, captured once. Deliberately typed structurally rather
  // than as CodeMirror's `EditorView`: naming that type would need
  // `@codemirror/view` as a dependency of THIS app, which it is not (see
  // ./languages.ts). Inference off `onViewReady` gives the real type at the
  // callback; only the ref needs a name.
  const contentDom = useRef<HTMLElement | null>(null);

  // The content's natural width, in characters. `style.minWidth` below lets
  // an authored (resized) box win over it, so this is what makes the shape
  // GROW when a line outruns the box, never what shrinks it.
  const columns = Math.max(MIN_COLUMNS, ...code.split("\n").map((line) => line.length));

  return (
    <NodeShapeFrame<CodeShape> shapeId={shape.id} shapeType={CODE_SHAPE_TYPE} w={w} h={h}>
      {/*
        The ring IS this wrapper's padding — there is no second element and no
        border to draw. `boxSizing: border-box` with `minWidth/minHeight` from
        the shape's own props is what keeps the measurement pass
        (shared/measure.ts) and `resizeBox` from fighting: a drag sets w/h, the
        ring holds at least that, and the next measurement reads the same
        numbers back instead of snapping the box to the editor's hug. Content
        larger than the authored box still wins, which is the direction that
        must never clip.
      */}
      <div
        data-slot="code-grab-ring"
        style={{ padding: GRAB_RING_PX, boxSizing: "border-box", minWidth: w, minHeight: h }}
      >
        <CodeEditor
          value={code}
          // Per keystroke — the trunk's one write policy
          // (components/codeEditorGesture.ts). The document IS the store here,
          // so there is no separate commit: what you typed is what is saved.
          onWrite={(next) => {
            editor.updateShape<CodeShape>({ id: shape.id, type: CODE_SHAPE_TYPE, props: { code: next } });
          }}
          // One undo step per typing GESTURE, not per character.
          beginEdit={() => {
            editor.markHistoryStoppingPoint("code edit");
          }}
          language={languageSupportFor(language)}
          multiline
          lineNumbers
          columns={columns}
          ariaLabel={`${language} code`}
          // The editor owns its pointer; the marker is what
          // shared/pointerOwnership.ts reads to keep tldraw's drag out.
          className={POINTER_OWNED_CLASS}
          // Fill a box the user resized. `minWidth`/`minHeight` (not
          // `width`/`height`) so the `columns` width above, and the content's
          // own line count, still win when they are LARGER — the direction
          // that must never clip.
          //
          // WHY `display: grid` on a box whose only child is CodeMirror's
          // `.cm-editor`: that element is `height: auto` (codeEditor.css), so
          // in the default block flow it sits at text height and a taller
          // shape shows a dead strip under it — a code box you cannot click
          // into. One grid row stretches its item by default, which hands the
          // whole box back to the editor. Measured here on a two-line shape
          // resized to 560x240: the face went from 540x46 to 540x220, and a
          // click 20px above its bottom edge — ~150px below the last line —
          // focused CodeMirror and put the caret at the end of the document.
          style={{
            minWidth: Math.max(0, w - 2 * GRAB_RING_PX),
            minHeight: Math.max(0, h - 2 * GRAB_RING_PX),
            display: "grid",
          }}
          // Leaves editing; the value is never discarded — Ctrl+Z is the
          // retract (components/codeEditor.tsx's own contract). The blur
          // handler below is what actually ends the editing session, so
          // Escape and a click elsewhere take the identical path.
          onEscape={() => contentDom.current?.blur()}
          onViewReady={(view) => {
            contentDom.current = view.contentDOM;
            /*
             * THE MIRROR: tldraw's "editing shape" IS CodeMirror's focus.
             *
             * WHY there is no separate edit mode to enter: the face is ALWAYS
             * live — click once and type, the same rhythm as every other code
             * surface Zach uses, nothing to relearn. But tldraw still has to
             * KNOW, because "is a shape being edited" is what gates its own
             * keyboard handling; without this, typing `v` in a Python line
             * would arm the select tool and `Delete` would delete the shape
             * out from under the caret.
             *
             * The archive reached the same place from the other side
             * (/home/bam/systemsketch/src/code/codeClickToEdit.ts:23-29, "the
             * second click is an editing transaction, not a fresh text
             * insertion") — an editor-event hook that called
             * `setEditingShape` on the second click. Mirroring focus is that
             * rule without the click-counting: whatever focuses the document
             * — pointer, Tab, a programmatic `.focus()` — says the same
             * thing.
             *
             * Listeners are attached to `contentDOM` and never removed on
             * purpose: `onViewReady` fires once per `EditorView`, and the view
             * destroys that DOM node when the shape unmounts, so there is
             * nothing left to leak.
             */
            view.contentDOM.addEventListener("focus", () => {
              editor.setEditingShape(shape.id);
            });
            view.contentDOM.addEventListener("blur", () => {
              // Guarded so a blur that lost the race to another shape's focus
              // cannot cancel ITS editing session.
              if (editor.getEditingShapeId() === shape.id) editor.setEditingShape(null);
            });
          }}
        />
      </div>
    </NodeShapeFrame>
  );
}
