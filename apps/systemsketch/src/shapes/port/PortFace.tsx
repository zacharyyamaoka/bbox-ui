// src/shapes/port/PortFace.tsx — what an `ss-port` looks like: the trunk's own
// `LabeledPort`, fed from persisted props.
//
// Nothing is drawn here, the same way nothing is drawn in BlockFace. The whole
// point of the rebuild (ASK item 2) is that SystemSketch IS bbox-ui + stock
// tldraw, so this file's entire job is to turn `shape.props` into the
// component's props, to stamp the two DOM attributes the dot sighting reads,
// and to route the label's keystrokes back into the store.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor, useValue, type Editor, type TLBinding } from "tldraw";

import { caretOffsetFromPoint } from "@trunk/components/caretGeometry";
import { CodeEditor } from "@trunk/components/codeEditor";
import { LabeledPort } from "@trunk/components/labeledPort";
import { parsePortDeclaration } from "@trunk/scene/portDeclaration";
import { PORT_LABEL_GAP, PORT_RING_OVERHANG_PX, PORT_TEXT_SIZES, type PortTextLayout } from "@trunk/components/port.layout";
import { POINTER_OWNED_CLASS } from "@trunk/hosts/nodeViews";

import { NodeShapeFrame } from "../shared/nodeShapeComponent";
import { FLOATING_PORT_ID, PORT_SHAPE_TYPE, WIRE_BINDING_TYPE } from "../types";
import { availabilityAt, wireAvailability } from "../wire/portAvailability";
import type { PortDirection, PortShape } from "./PortShapeUtil";

/** Room between the dot and the shape's own edge, so the selection outline
 *  never sits on the painted ring (`PORT_RING_OVERHANG_PX` is 5). */
const FACE_INSET_PX = 8;

/**
 * The clear space the trunk's own placement math leaves between the dot's box
 * and the label's near edge. `slotPlacementStyle` offsets the label slot by
 * `dot.w + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP` from the dot root's
 * opposite edge (port.layout.ts:285-291) and that root IS the dot's box, so
 * the clear space beside it is exactly these two constants. Derived from them
 * rather than written as `13`, so a change to either travels here instead of
 * silently sliding the spacer below out from under the real label.
 */
const LABEL_CLEARANCE_PX = PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;

/**
 * The face never measures shorter than this: the shape's own default `h`, and
 * also the smallest box that still covers the dot's PAINTED extent — a 12px
 * dot plus `PORT_RING_OVERHANG_PX` of box-shadow ring on each side is 22px —
 * with room left over to grab. A floor rather than a pin, for the same reason
 * the width is one; see the spacer's WHY in `PortFace`.
 */
const FACE_MIN_HEIGHT_PX = 32;

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
 * The label at rest: the declaration line, painted as two runs — the name, and
 * the `:` with everything after it, muted.
 *
 * THE TWO RUNS ARE TYPOGRAPHY, NOT A DATA SPLIT. They concatenate back to
 * `props.declaration` character for character, colon included, which is the
 * whole of Zach's truthful-property-rendering rule ("Names, literals, labels …
 * retain every authored character: no silent normalization, trimming,
 * substitution, or clipping… Typography may restyle text; it may not make
 * characters disappear"). `white-space: pre` on each run is what keeps that
 * true of whitespace: a line authored as `"gain_x  : float"` renders — and
 * reads back — with its two trailing spaces inside the name, which is what
 * `src/port.smoke.test.tsx` measures. The archive trimmed both halves and
 * substituted "port"/"Any" for an empty one (floatingPortLayout.ts:19-21).
 *
 * WHY the colon is PAINTED, where the two separate `name`/`type` props this
 * replaced were drawn with a 6px gap and no punctuation: there is one stored
 * string now, and it is the string the editor opens on. Dropping the colon at
 * rest and putting it back on double-click would make the label and its own
 * editor disagree about what the port says — exactly the drift
 * `LABEL_FONT_PX`'s note calls out on the size axis. The gap goes with it:
 * the spacing is now whatever the author typed after the colon.
 *
 * WHY the runs stay in reading order (name, then annotation) on BOTH
 * directions, rather than mirroring so the name always hugs the dot: the
 * archive's own export draws them in this order whichever side the label sits
 * on (FloatingPortShapeUtil.tsx:83-88 — `<tspan>{name}</tspan><tspan
 * dx=7>{type}</tspan>` under a single `textAnchor` flip). Mirroring was tried
 * here first and rendered an output port as "Image mask", which reads as a
 * type-first annotation language and made the two directions scan differently
 * — capture 03 in reports/media/lanes-2026-09-18/ss-L2. It is also no longer
 * expressible: mirroring one authored line would reorder its own characters.
 */
function RestingLabel({ declaration, onCaretHint }: { declaration: string; onCaretHint(offset: number): void }) {
  const { name, type, annotated } = parsePortDeclaration(declaration);
  return (
    <span
      data-slot="port-label"
      data-editing="false"
      // P-021, the reading half. The two runs below concatenate to
      // `declaration` character for character (see this function's own doc), so
      // an offset into this span's text IS an offset into the stored string —
      // no mapping table, nothing to drift.
      //
      // WHY pointerdown-CAPTURE on the resting label, and not a `dblclick`
      // handler or tldraw's own `onDoubleClick`: by the time anything knows a
      // double-click happened, this span is GONE — `editing` has flipped and
      // `LabelEditor` has replaced it — so there is no longer any text under
      // the pointer to ask about. The second press of the double-click is the
      // last moment the painted label still exists, and capture phase runs
      // before any host handler can consume the event. Recording on EVERY
      // press (the first one too, which merely selects) costs one
      // `caretRangeFromPoint` and means the hint is always the press the user
      // actually aimed with.
      onPointerDownCapture={(event) => onCaretHint(caretOffsetFromPoint(event.currentTarget, event.clientX, event.clientY))}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
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
      {annotated ? (
        <span data-slot="ss-port-type" style={{ whiteSpace: "pre", opacity: 0.55 }}>
          {`:${type}`}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The label while editing: the trunk's single-line `CodeEditor`, the same
 * field its own `DefaultPortLabel` swaps in (labeledPort.tsx:155-186).
 *
 * It edits the WHOLE declaration — `gain_x: float`, colon and annotation
 * included — because that is the only string the port stores (ruling 8, see
 * `shapes/shared/props.ts`). This is what gives a port's type an editing
 * surface at all: before the collapse this session wrote `props.name` and the
 * separately-stored `props.type` had no writer anywhere in the app, so a type
 * could be read and painted but never changed by the person looking at it.
 *
 * WHY a local `draft` rather than reading `shape.props.declaration` straight
 * back: the write is per keystroke, so the prop changes under the editor on
 * every character; feeding the store's value back in would re-dispatch the
 * document mid-keystroke. The store still holds the only committed copy —
 * `onWrite` fires first, every time.
 */
function LabelEditor({ shape, align, cursorAt }: { shape: PortShape; align: "left" | "right"; cursorAt?: number }) {
  const editor = useEditor();
  const [draft, setDraft] = useState(shape.props.declaration);
  // The value to put back on Escape — captured once, at the moment the session
  // opened, like the trunk's own `snapshotRef` (labeledPort.tsx:136).
  const snapshot = useRef(shape.props.declaration);

  const write = useCallback(
    (next: string) => {
      editor.updateShape({ id: shape.id, type: PORT_SHAPE_TYPE, props: { declaration: next } });
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
        // P-021, the writing half. `cursorAt` wins over `autoFocus="select"`
        // inside CodeEditor (codeEditor.tsx:406-415), so the select-all stays
        // as the fallback for a session opened with no press on the text —
        // a rename reached by keyboard, or a double-click on the dot rather
        // than the label. Those have no clicked character, and select-all is
        // the right OS rename idiom when the whole label is the target.
        autoFocus="select"
        cursorAt={cursorAt}
        // "Port declaration", not "Port name": the field holds `gain_x: float`,
        // and an assistive reader that announced it as a name would describe
        // the wrong thing to edit.
        ariaLabel="Port declaration"
        // Lazily, on the first keystroke that changes anything
        // (codeEditorGesture.ts's `begin`): one undo step per edit rather
        // than one per character.
        beginEdit={() => editor.markHistoryStoppingPoint("edit port")}
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
  const { w, h, declaration, direction } = shape.props;

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

  // P-005: how this dot should paint while a cable is in flight —
  // `undefined` whenever one is not, which is what keeps the at-rest grammar
  // above in charge. A floating port has exactly one dot, so unlike a block's
  // rails this is one lookup rather than one per item.
  const eligible = useValue(
    "ss-port availability",
    () => availabilityAt(wireAvailability(editor).get(), shape.id, FLOATING_PORT_ID),
    [editor, shape.id],
  );

  // tldraw's own editing session is the switch: `canEdit` lets the select tool
  // set it on a double-click, and this reads it back. No second "am I editing"
  // state to fall out of sync with the engine's.
  const editing = useValue("ss-port editing", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);

  /**
   * P-021: which character of the declaration the last press on the painted
   * label landed on, or `null` when the session was not opened by pressing the
   * text.
   *
   * A REF, not state: writing it must not re-render — the press that records
   * it is the same press tldraw is using to select or to open the rename, and
   * a render in the middle of that is a chance for the face to move under the
   * pointer. Nothing reads it except the `LabelEditor` mounted by the render
   * `editing` flips on, which happens after.
   */
  const caretHint = useRef<number | null>(null);

  // Forget the hint the moment the session ends, so the NEXT rename — which
  // may be opened from the keyboard, or by pressing the dot — starts from the
  // select-all fallback rather than inheriting a caret the user never aimed.
  useEffect(() => {
    if (!editing) caretHint.current = null;
  }, [editing]);

  const align = direction === "out" ? "right" : "left";

  const faceRef = useRef<HTMLDivElement | null>(null);
  const [labelWidth, setLabelWidth] = useState(0);

  /**
   * How wide is the label that is actually on screen right now?
   *
   * WHY the rendered element rather than a hidden twin of the same two runs:
   * the slot holds a `CodeEditor` while renaming, and a twin of THAT would be
   * a second CodeMirror instance fighting the first for focus — while a twin
   * of only the resting runs would size the box wrong for the whole rename.
   * One reading of whatever is really there covers both, and cannot drift
   * from the markup the way a copy of it would.
   *
   * WHY `offsetWidth` and not `getBoundingClientRect()`: unscaled layout px
   * IS shape-local px (`shared/measure.ts`'s rule 1), so this number is right
   * at any camera zoom, where the client rect would be multiplied by it.
   */
  const readLabelWidth = useCallback(() => {
    const label = faceRef.current?.querySelector<HTMLElement>('[data-slot="port-label"]');
    if (label) setLabelWidth(label.offsetWidth);
  }, []);

  // Every render, the pass `shared/measure.ts` runs for the shape's own box:
  // a keystroke into the name re-renders this face in the same commit that
  // relaid the label out, so the spacer below is never a character behind.
  useLayoutEffect(readLabelWidth);

  // ...and again once the font settles and (on the first render of a rename)
  // CodeMirror has laid out its first line, both of which land a frame later.
  // Re-attached when `editing` swaps one slot component for the other, since
  // the observed element is swapped with it.
  useEffect(() => {
    const label = faceRef.current?.querySelector<HTMLElement>('[data-slot="port-label"]');
    if (!label) return;
    const frame = requestAnimationFrame(readLabelWidth);
    const observer = new ResizeObserver(readLabelWidth);
    observer.observe(label);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [editing, readLabelWidth]);

  /**
   * The label's width, in flow, on the label's side — an empty box that
   * reserves exactly the room the real (absolutely positioned) label occupies.
   *
   * WHY it has to exist at all: `LabeledPort`'s root box is the DOT and
   * nothing else, with both slots positioned as absolute overlays off it
   * (its own B4 note, labeledPort.tsx:420-436) — that is what keeps a dot
   * centred on a rail whatever height its label has, and it is also why a
   * label costs its parent zero width.
   *
   * WHY the face is no longer pinned to `props.w` (what this file did first):
   * that made the measurement circular in exactly the way
   * `nodeShapeComponent.tsx:28-34` warns about — `w` could only ever confirm
   * the 120 it was born with, so every label wider than the leftover ~100px
   * hung OUTSIDE the `Rectangle2d` `getGeometry` returns. Measured, not
   * feared: of five real names on the capture board four overflowed, one of
   * them (`image_tensor Tensor`) by 91px; a press on the overflowing part
   * fell through to the canvas and moved nothing, and a double-click there
   * made tldraw draw a stray stock `text` shape and type the new name into
   * THAT instead of into `props.name`. With the spacer in flow the hug
   * `NodeShapeFrame` measures is the box the user can see, so the donor's
   * rule quoted in `PortShapeUtil.getGeometry` — one grab anywhere on the
   * face starts translating — is true of the whole face again: re-measured
   * on the same six ports, every one now reports 0px outside its box, and
   * `throttle_setpoint_value float` measures 279 wide instead of 120.
   *
   * WHY the spacer is the MEASURED label rather than a `visibility: hidden`
   * twin of the two resting runs (the cheaper fix, and the obvious one):
   * a twin is only right while the slot holds those runs. Measured here the
   * moment a rename opens, the CodeEditor that replaces them is WIDER than
   * the text it replaced — 306 against 279 for the same name, because it is
   * monospace — and it then grows per keystroke, reaching 525. A twin would
   * have handed the rename session back the very bug this fixes. A twin
   * would also have put a second `[data-slot="port-label"]` in the DOM, and
   * `src/port.smoke.test.tsx` (committed, off-limits) reaches for that
   * selector with `querySelector` and double-clicks whatever comes first.
   */
  const labelSpacer = (
    <span
      aria-hidden="true"
      data-slot="ss-port-label-space"
      style={{
        flex: "none",
        width: labelWidth,
        marginLeft: direction === "in" ? LABEL_CLEARANCE_PX : 0,
        marginRight: direction === "in" ? 0 : LABEL_CLEARANCE_PX,
      }}
    />
  );

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
        ref={faceRef}
        data-block-id={shape.id}
        data-slot="ss-port-face"
        style={{
          // No width and no height: the row IS dot + clearance + label, laid
          // out in the order the direction asks for, and `NodeShapeFrame`'s
          // `max-content` wrapper reads that hug back into `props.w`/`h`.
          // `minHeight` alone is a floor, never a pin — see its constant.
          minHeight: FACE_MIN_HEIGHT_PX,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          padding: `0 ${FACE_INSET_PX}px`,
        }}
      >
        {/* The dot sits on the side its direction faces, so the spacer that
            stands in for the label goes on the other one: before the dot for
            an `out` port (label to its left), after it for an `in` port. */}
        {direction === "in" ? null : labelSpacer}
        <span data-port-id={FLOATING_PORT_ID} style={{ display: "inline-flex", flex: "none" }}>
          <LabeledPort
            direction={TRUNK_DIRECTION[direction]}
            edge={direction === "in" ? "left" : "right"}
            textLayout={TEXT_LAYOUT_FOR[direction]}
            state={wired ? "wired" : "empty"}
            // P-005, the standalone-port half. `undefined` at rest, so the
            // at-rest grammar (`wired`/`empty`) is what paints; during a cable
            // drag it becomes the same verdict the DROP will give, computed
            // once at the press by `installWireGesture`.
            availability={eligible}
            // WHY the label slot rather than LabeledPort's built-in field: the
            // built-in takes ONE string (`children`) and owns its own
            // click-to-edit session, and this face needs two runs (name, then
            // the muted type) plus an editing session that is tldraw's
            // `editingShapeId`, not a component-local `useState`. The slot is
            // the seam the trunk built for exactly this (`labelSlot`'s own doc,
            // labeledPort.tsx:311-318): the placement math above it is
            // untouched.
            labelSlot={
              editing ? (
                <LabelEditor shape={shape} align={align} cursorAt={caretHint.current ?? undefined} />
              ) : (
                <RestingLabel
                  declaration={declaration}
                  onCaretHint={(offset) => {
                    caretHint.current = offset;
                  }}
                />
              )
            }
          />
        </span>
        {direction === "in" ? labelSpacer : null}
      </div>
    </NodeShapeFrame>
  );
}
