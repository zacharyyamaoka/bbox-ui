// src/shapes/port/PortFace.tsx — what an `ss-port` looks like: the trunk's own
// `LabeledPort`, fed from persisted props.
//
// Nothing is drawn here, the same way nothing is drawn in BlockFace. The whole
// point of the rebuild (ASK item 2) is that SystemSketch IS bbox-ui + stock
// tldraw, so this file's entire job is to turn `shape.props` into the
// component's props, to stamp the two DOM attributes the dot sighting reads,
// and to route the label's keystrokes back into the store.
import { useCallback, useRef, useState } from "react";
import { useEditor, useValue, type Editor, type TLBinding } from "tldraw";

import { CodeEditor } from "@trunk/components/codeEditor";
import { LabeledPort } from "@trunk/components/labeledPort";
import { PORT_TEXT_SIZES, type PortTextLayout } from "@trunk/components/port.layout";
import { POINTER_OWNED_CLASS } from "@trunk/hosts/nodeViews";

import { NodeShapeFrame } from "../shared/nodeShapeComponent";
import { FLOATING_PORT_ID, PORT_SHAPE_TYPE, WIRE_BINDING_TYPE } from "../types";
import type { PortDirection, PortShape } from "./PortShapeUtil";

/** Room between the dot and the shape's own edge, so the selection outline
 *  never sits on the painted ring (`PORT_RING_OVERHANG_PX` is 5). */
const FACE_INSET_PX = 8;

/** The trunk's own default port type size (`PortTextSize` "sm"). Read from the
 *  same constant the editing branch reads, so the resting label and the
 *  CodeEditor that replaces it cannot drift a size apart — the construction
 *  `labeledPort.tsx:144-149` records as the fix for exactly that bug. */
const LABEL_FONT_PX = PORT_TEXT_SIZES.sm;

/** Below this the editor grows no narrower — the trunk's own floor
 *  (`labeledPort.tsx:86`), so a one-character name still reads as a field. */
const MIN_LABEL_COLUMNS = 3;

/**
 * WHICH SIDE THE DOT SITS ON.
 *
 * `in` puts the dot LEFT of its label, `out` puts it RIGHT: the dot faces the
 * direction the data travels, so a free input hangs its dot toward whatever
 * feeds it and a free output hangs its dot toward whatever it feeds. The label
 * then flows back INTO the diagram, which is the same "inward" instinct
 * `inwardTextLayout` encodes for a port mounted on a block wall.
 *
 * NOTE this is the OPPOSITE of the archive's floating port, which put an
 * input's label to the LEFT of its dot
 * (/home/bam/systemsketch/src/floatingPort/floatingPortLayout.ts:28-30). The
 * rebuild's own acceptance (`src/port.smoke.test.tsx`, committed with the plan)
 * measures the new convention, and a committed assertion is the spec — so the
 * flip is deliberate and recorded here rather than silently inherited.
 */
const TEXT_LAYOUT_FOR: Record<PortDirection, PortTextLayout> = { in: "right", out: "left" };

/** `PortDirection` in the document's spelling → the trunk component's. */
const TRUNK_DIRECTION = { in: "input", out: "output" } as const;

/**
 * Leave the rename session.
 *
 * WHY `complete()` and not `setEditingShape(null)` alone (which is all
 * tldraw's own frame label does, FrameLabelInput.mjs:26-32): clearing the id
 * leaves the select tool parked in its `editing_shape` child state, and that
 * state's own pointer handler reads `getEditingShape()` back and throws
 * "Expected an editing shape!" when it is null
 * (SelectTool/childStates/EditingShape.mjs:100-103) — one press on any shape
 * afterwards. `complete()` is the stock exit the text shapes use
 * (`useEditablePlainText.mjs:46`): it transitions the tool to `idle`, whose
 * `onExit` clears the editing id anyway.
 */
function stopEditing(editor: Editor): void {
  editor.setEditingShape(null);
  editor.complete();
}

/**
 * The label at rest: the name, then the type, both LITERAL.
 *
 * `white-space: pre` on each run is the whole point — Zach's truthful-property
 * -rendering rule ("Names, literals, labels … retain every authored character:
 * no silent normalization, trimming, substitution, or clipping"). The archive
 * trimmed both and substituted "port"/"Any" for an empty one
 * (floatingPortLayout.ts:19-21); this does not, so a name authored as
 * `"gain_x  "` renders — and reads back — with its two trailing spaces, which
 * is what `src/port.smoke.test.tsx` measures.
 *
 * WHY the two runs stay in reading order (name, then type) on BOTH directions,
 * rather than mirroring so the name always hugs the dot: the archive's own
 * export draws them in this order whichever side the label sits on
 * (FloatingPortShapeUtil.tsx:83-88 — `<tspan>{name}</tspan><tspan
 * dx=7>{type}</tspan>` under a single `textAnchor` flip). Mirroring was tried
 * here first and rendered an output port as "Image mask", which reads as a
 * type-first annotation language and made the two directions scan differently
 * — capture 03 in reports/media/lanes-2026-09-18/ss-L2.
 */
function RestingLabel({ name, type }: { name: string; type: string }) {
  return (
    <span
      data-slot="port-label"
      data-editing="false"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        fontSize: LABEL_FONT_PX,
        // The skin seam, exactly as the trunk's own resting label sets it
        // (labeledPort.tsx:240) — inline so it beats inheritance, falling back
        // to `inherit` for a consumer with no skin stylesheet.
        fontFamily: "var(--bbox-skin-font-sans, inherit)",
        lineHeight: 1.2,
      }}
    >
      <span data-slot="ss-port-name" style={{ whiteSpace: "pre" }}>
        {name}
      </span>
      {type === "" ? null : (
        <span data-slot="ss-port-type" style={{ whiteSpace: "pre", opacity: 0.55 }}>
          {type}
        </span>
      )}
    </span>
  );
}

/**
 * The label while renaming: the trunk's single-line `CodeEditor`, the same
 * field its own `DefaultPortLabel` swaps in (labeledPort.tsx:155-186).
 *
 * WHY a local `draft` rather than reading `shape.props.name` straight back:
 * the write is per keystroke, so the prop changes under the editor on every
 * character; feeding the store's value back in would re-dispatch the document
 * mid-keystroke. The store still holds the only committed copy — `onWrite`
 * fires first, every time.
 */
function LabelEditor({ shape, align }: { shape: PortShape; align: "left" | "right" }) {
  const editor = useEditor();
  const [draft, setDraft] = useState(shape.props.name);
  // The value to put back on Escape — captured once, at the moment the session
  // opened, like the trunk's own `snapshotRef` (labeledPort.tsx:136).
  const snapshot = useRef(shape.props.name);

  const write = useCallback(
    (next: string) => {
      editor.updateShape({ id: shape.id, type: PORT_SHAPE_TYPE, props: { name: next } });
    },
    [editor, shape.id],
  );

  return (
    // POINTER_OWNED_CLASS ("nodrag"): while editing, the caret drag belongs to
    // the field, not to the canvas — `shared/pointerOwnership.ts` hides a press
    // inside this class from tldraw. At REST the class is absent on purpose, so
    // the whole face is a drag surface (the archive's rule, quoted in
    // PortShapeUtil.getGeometry).
    <span data-slot="port-label" data-editing="true" className={POINTER_OWNED_CLASS} style={{ display: "inline-flex", alignItems: "center" }}>
      <CodeEditor
        value={draft}
        multiline={false}
        overflow="clip"
        columns={Math.max(MIN_LABEL_COLUMNS, draft.length)}
        fontSizePx={LABEL_FONT_PX}
        align={align}
        autoFocus="select"
        ariaLabel="Port name"
        // Lazily, on the first keystroke that changes anything
        // (codeEditorGesture.ts's `begin`): one undo step per rename rather
        // than one per character.
        beginEdit={() => editor.markHistoryStoppingPoint("rename port")}
        onWrite={(next) => {
          setDraft(next);
          write(next);
        }}
        onEnter={() => stopEditing(editor)}
        onEscape={() => {
          write(snapshot.current);
          stopEditing(editor);
        }}
        // WHY `onEditEnd` is deliberately NOT wired, though the trunk's own
        // built-in label uses it as its blur exit (labeledPort.tsx:166):
        // `CodeEditor` ends its gesture from its UNMOUNT effect as well as
        // from a real blur (codeEditorGesture.ts's own header: "no `blur`
        // fires for a focused element removed from the DOM"), and React's
        // StrictMode mounts every component twice in dev. So an
        // `onEditEnd → stopEditing` wire closes the rename session on the
        // simulated unmount, ~0ms after the double-click opens it. MEASURED
        // here, not reasoned: the smoke harness renders <App/> bare and the
        // acceptance passed, while the real app — src/main.tsx wraps it in
        // <StrictMode> — logged `IDLE.onDoubleClick target=shape` followed
        // immediately by TWO `complete` events and `editing: null`.
        // Nothing is lost by dropping it: `onWrite` has already written
        // every keystroke into the store, and tldraw owns this session —
        // a press elsewhere on the canvas leaves `editing_shape`, whose
        // `onExit` clears the id (EditingShape.mjs:37-39).
      />
    </span>
  );
}

export function PortFace({ shape }: { shape: PortShape }) {
  const editor = useEditor();
  const { w, h, name, type, direction } = shape.props;

  // WHY the wired state is read from BINDINGS rather than passed in (the same
  // reading BlockFace.tsx:66-75 documents): L3 lands wires without touching
  // this file. `getBindingsToShape` is stock, and `useValue` repaints the dot
  // the instant a wire attaches or is deleted. The cast comes out with L3, and
  // until then the call is right at runtime — a store query answers `[]` for a
  // binding type no util has registered.
  const wired = useValue(
    "ss-port wired",
    () => editor.getBindingsToShape(shape.id, WIRE_BINDING_TYPE as TLBinding["type"]).length > 0,
    [editor, shape.id],
  );

  // tldraw's own editing session is the switch: `canEdit` lets the select tool
  // set it on a double-click, and this reads it back. No second "am I editing"
  // state to fall out of sync with the engine's.
  const editing = useValue("ss-port editing", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);

  const align = direction === "out" ? "right" : "left";

  return (
    <NodeShapeFrame<PortShape> shapeId={shape.id} shapeType={PORT_SHAPE_TYPE} w={w} h={h}>
      {/* WHY this exact nesting — `data-block-id` OUTSIDE `data-port-id`, with
          the trunk's LabeledPort (and so `[data-slot="port-dot"]`) inside: it
          is the DOM contract `sightPortDots` reads
          (@trunk/hosts/portDotSightings:127-149 — every `[data-port-id]` whose
          nearest `[data-block-id]` ancestor is this node, then the
          `[data-slot="port-dot"]` inside it). `shared/measure.ts` projects
          each sighting through the editor's own camera math and writes it into
          `props.anchors`, so ONE dot here means exactly one anchor, carrying
          `FLOATING_PORT_ID` and `side: null` (no rail, so no wall to name —
          honest rather than guessed). Break the nesting and the port still
          paints, measures nothing, and can never be wired. */}
      <div
        data-block-id={shape.id}
        data-slot="ss-port-face"
        style={{
          width: w,
          height: h,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          // The dot sits on the side its direction faces; the label is
          // absolutely positioned off the dot by LabeledPort itself, so it
          // costs the box no width and the measurement stays the authored one.
          justifyContent: direction === "in" ? "flex-start" : "flex-end",
          padding: `0 ${FACE_INSET_PX}px`,
        }}
      >
        <span data-port-id={FLOATING_PORT_ID} style={{ display: "inline-flex" }}>
          <LabeledPort
            direction={TRUNK_DIRECTION[direction]}
            edge={direction === "in" ? "left" : "right"}
            textLayout={TEXT_LAYOUT_FOR[direction]}
            state={wired ? "wired" : "empty"}
            // WHY the label slot rather than LabeledPort's built-in field: the
            // built-in takes ONE string (`children`) and owns its own
            // click-to-edit session, and this face needs two runs (name, then
            // the muted type) plus an editing session that is tldraw's
            // `editingShapeId`, not a component-local `useState`. The slot is
            // the seam the trunk built for exactly this (`labelSlot`'s own doc,
            // labeledPort.tsx:311-318): the placement math above it is
            // untouched.
            labelSlot={editing ? <LabelEditor shape={shape} align={align} /> : <RestingLabel name={name} type={type} />}
          />
        </span>
      </div>
    </NodeShapeFrame>
  );
}
