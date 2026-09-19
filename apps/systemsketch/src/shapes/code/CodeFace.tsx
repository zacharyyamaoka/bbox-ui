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
import { OriginBadge } from "@trunk/components/originBadge";
import { POINTER_OWNED_CLASS } from "@trunk/hosts/nodeViews";
import { ORIGIN_BADGE, codeOriginState } from "@trunk/scene/codeOrigin";

import { useCodeOriginResolution } from "../../source/originResolution";
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

/**
 * The origin-badge strip's height, in px — FIXED, and that is the whole
 * point.
 *
 * WHY a constant instead of letting the strip hug its badge: this face and
 * `shared/measure.ts` are a feedback loop. The measurement writes the
 * wrapper's `offsetHeight` into `props.h`, and the wrapper's height is
 * `h - 2 * GRAB_RING_PX` (the editor) plus whatever else is in flow. Add a
 * hugging strip and the fixed point breaks: each pass measures
 * `strip + (h - 20) + 20` and writes it back as the new `h`, so the shape
 * grows by the strip's height every frame — measured here the moment the
 * badge first rendered, as React's own "Maximum update depth exceeded"
 * thrown from `NodeShapeFrame`, which took every `ss-code` shape on the
 * board down behind tldraw's error boundary (src/code.smoke.test.tsx went
 * 4/4 → 1/4). Subtracting a KNOWN height below restores the fixed point:
 * `HEADER + (h - 20 - HEADER) + 20 === h`, for every h, whether or not a
 * badge is in the strip that frame.
 *
 * 20px comfortably clears a `size="sm"` Badge (`text-[0.65rem]`, `py-0`,
 * 1px border ≈ 14px). The strip does NOT clip — `overflow` stays visible —
 * so a badge that ever grew past this would hang over the editor rather
 * than lose characters, which is the direction Zach's truthful-rendering
 * rule demands.
 */
const ORIGIN_HEADER_PX = 20;

/**
 * The header strip: WHO OWNS THIS CELL'S BYTES, as one badge.
 *
 * WHY it lives in the shape's header and not in the trunk's `CodeEditor`
 * (plan rule 12, restated because it is the tempting shortcut): the editor
 * is a value-semantics component — text in, text out — and an ownership
 * badge is a fact about the cell's BINDING, not about its text. Putting it
 * inside `CodeEditor` would make every consumer of that component inherit a
 * concept it has no way to populate.
 *
 * The three cases, and why the middle one renders nothing:
 *   origin === null                → "Pseudo". An unbound cell is visibly
 *                                    unbound; the board owns the bytes.
 *   origin set, resolution pending → NOTHING. A bound cell whose lookup is
 *                                    in flight has no honest state to show,
 *                                    and flashing red for one frame and then
 *                                    correcting itself teaches the reader to
 *                                    distrust the badge.
 *   origin set, resolution settled → whatever `codeOriginState` judges,
 *                                    including `orphaned` for a settled
 *                                    `undefined` (no backend — see
 *                                    ../../source/originResolution.ts).
 *
 * The badge is deliberately OUTSIDE `POINTER_OWNED_CLASS`, so pressing it
 * drags the shape like the rest of the grab ring rather than doing nothing.
 */
function OriginHeader({ origin }: { origin: CodeShape["props"]["origin"] }) {
  const status = useCodeOriginResolution(origin);
  // The strip stays even with no badge in it — see ORIGIN_HEADER_PX: a
  // strip that came and went would move the editor under the caret, and
  // would put the measurement loop back.
  const pending = origin !== null && status.status === "pending";
  const state = codeOriginState(origin, status.status === "settled" ? status.resolution : undefined);
  return (
    <div
      data-slot="code-header"
      style={{ height: ORIGIN_HEADER_PX, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
    >
      {pending ? null : <OriginBadge state={state} spec={ORIGIN_BADGE[state]} size="sm" />}
    </div>
  );
}

export function CodeFace({ shape }: { shape: CodeShape }) {
  const editor = useEditor();
  const { code, language, origin, w, h } = shape.props;

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
        <OriginHeader origin={origin} />
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
            // Minus the origin strip as well — see ORIGIN_HEADER_PX for why
            // this subtraction is what keeps the measurement pass at a fixed
            // point rather than growing the shape one strip per frame.
            minHeight: Math.max(0, h - 2 * GRAB_RING_PX - ORIGIN_HEADER_PX),
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
