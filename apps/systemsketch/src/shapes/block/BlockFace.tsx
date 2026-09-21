// src/shapes/block/BlockFace.tsx — what an `ss-block` looks like: the trunk's
// own `BlockPort` wrapping the trunk's own `Block`, fed from persisted props.
//
// Nothing is drawn here. The whole point of the rebuild (ASK item 2) is that
// SystemSketch IS bbox-ui + stock tldraw, so this file's entire job is to turn
// `shape.props` into the two components' props and to route their callbacks
// back into the store.
import { useEffect, useRef } from "react";
import { useEditor, useValue, type TLBinding } from "tldraw";

import { Block } from "@trunk/components/block";
import {
  BLOCK_DESCRIPTION_FONT_PX,
  BlockDescription,
  blockDescriptionIsPainted,
} from "@trunk/components/blockDescription";
import { BlockPort, type BlockEdgeSpec } from "@trunk/components/blockPort";
import { caretOffsetFromPoint } from "@trunk/components/caretGeometry";
import { EditableText } from "@trunk/components/editableText";
import type { BlockSide } from "@trunk/components/port.layout";
import type { PortEdgeItem } from "@trunk/components/portEdge";
import { REGION_CORNER_BLOCK_STYLE } from "@trunk/components/region";
import { GlyphPicker } from "@trunk/editor/glyphPicker";
import { POINTER_OWNED_CLASS } from "@trunk/hosts/nodeViews";
import { parsePortDeclaration } from "@trunk/scene/portDeclaration";

import { usePortProducers } from "../../document/sceneFromStore";
import { availabilityAt, wireAvailability } from "../wire/portAvailability";
import { isRegionCornerBlock } from "../region/cornerBlock";
import { stopEditing } from "../shared/editingSession";
import { NodeShapeFrame } from "../shared/nodeShapeComponent";
import { BLOCK_SHAPE_TYPE, PORT_SIDES, WIRE_BINDING_TYPE } from "../types";
import type { BlockPortSpec, BlockShape } from "./BlockShapeUtil";
import { portsFromRailItems } from "./railLabel";

/**
 * The rail label is the NAME HALF of the port's declaration — everything
 * before the first `:`, parsed out of the one string the port stores.
 *
 * WHY not the whole declaration, which is what a face that stores one line
 * would obviously paint: the two rails of a block sit on the same row and flow
 * INWARD from opposite edges (`inwardTextLayout`, components/port.layout.ts),
 * so on the plan's own default 160px block two annotated labels run straight
 * through each other. Measured on the smoke fixture — `estimate()` with a left
 * `frame: Frame` and a right `Pose: Pose` — "frame Frame" spanned x139-248 and
 * "Pose Pose" x175-261: 73px of overlapping, unreadable text, visible in
 * reports/media/.../ss-L0/04-ports-render-as-dots.png. Nothing downstream can
 * rescue it: `width={props.w}` is the authored box (the brief), the default is
 * 160 (documentModel.test asserts it), and the measurement pass reads the
 * rendered size back rather than growing it, so the block can never widen to
 * fit its own labels.
 *
 * Zach's "render stored properties truthfully" rule is what settles which way
 * to cut. Two strings painted on top of each other make authored characters
 * disappear, which is the failure that rule exists to forbid; the name
 * rendered whole, with the annotation simply not on the rail, hides nothing
 * the board does not show elsewhere — the declaration is intact in
 * `props.ports[side][].declaration`, it is what a wire drop reads for its
 * datatype (`wire/wireGesture.ts`), and it is what `lintScene`'s
 * `type-mismatch` judges (`document/sceneFromStore.ts`).
 *
 * STILL OWED, and now sharper than before ruling 8 folded the two fields into
 * one: the rail shows a PREFIX of an authored string rather than a whole
 * separate field, so `feedback_truthful_property_rendering`'s abbreviation
 * clause applies to it — "show an explicit ellipsis and keep the complete raw
 * value immediately discoverable". The honest fix is the trunk's own secondary
 * slot (`LabeledPort` draws one for exactly this) fed a `secondary` on
 * `PortEdgeItem`, which carries one `label` and nothing else today. Widening
 * it is a change to the trunk, outside this lane's write set. Owed upstream:
 * a `secondary` on `PortEdgeItem`, and then this function hands it the
 * annotation instead of dropping it.
 */
function labelOf(port: BlockPortSpec): string {
  return parsePortDeclaration(port.declaration).name;
}

/**
 * P-043's canvas trigger: the block's own icon, and pressing it opens the ONE
 * picker (`@trunk/editor/glyphPicker`) — the same surface the right-hand
 * inspector's row opens (chrome/panels.tsx).
 *
 * Three things here are not obvious and are the whole reason this is a named
 * component rather than four lines inlined in the header:
 *
 * 1. `POINTER_OWNED_CLASS` ("nodrag"). `contentOwnsPress`
 *    (shapes/shared/pointerOwnership.ts) answers "does the CONTENT own this
 *    press, or does tldraw?" and for `ss-block` its rule is that a press on
 *    `[data-slot="block-header"]` belongs to tldraw — the header IS the drag
 *    handle. An icon living in that header is therefore a drag surface by
 *    default: press it and the block slides, the popover never opens. The
 *    `nodrag` class is the FIRST thing `contentOwnsPress` checks, so wearing
 *    it is what carves this one 18px square out of the drag handle. It costs
 *    exactly that square; the rest of the header still drags.
 *
 * 2. `portalContainer={editor.getContainer()}`. Base UI portals to
 *    `document.body` by default, and tldraw's canvas is its own stacking
 *    context — a popup in the body can land UNDER the board. The picker
 *    publishes `portalContainer` for precisely this ("tldraw's own container
 *    element, so the picker paints above the canvas rather than under it").
 *
 * 3. The write is a plain `editor.updateShape`, one history entry per pick.
 *    Same granularity as the rail reorder below and the inspector's
 *    description: choosing an icon is a real edit, not a measurement.
 *
 * WHY the empty slot paints at all, rather than appearing on hover the way
 * Notion's "Add icon" does: the trunk's `Glyph` already answers this — an
 * empty `content` renders "the dashed, 40%-opacity square Notion shows for
 * 'add icon'" (components/glyph.tsx). Reveal-on-hover would be the prettier
 * board, and it is deliberately not built: P-043's whole content is that a
 * glyph is a CLICKABLE thing, and an affordance that only exists once the
 * pointer is already on it cannot teach that. Revisit when the board is busy
 * enough for the squares to read as noise.
 */
function BlockGlyph({ shape }: { shape: BlockShape }) {
  const editor = useEditor();
  return (
    <GlyphPicker
      value={shape.props.glyph}
      onChange={(glyph) => editor.updateShape({ id: shape.id, type: BLOCK_SHAPE_TYPE, props: { glyph } })}
      sizePreset="sm"
      portalContainer={editor.getContainer()}
      className={POINTER_OWNED_CLASS}
    />
  );
}

/**
 * The block's title, in px — `text-sm`, read off `Block`'s own root class
 * (`components/block.tsx:277`, `"relative flex flex-col text-sm"`), which the
 * header inherits rather than restating.
 *
 * WHY the editing control has to be TOLD this rather than inheriting it the
 * way the resting span does: `EditableText` writes a `fontSize` onto its own
 * box from its size ladder (`editableText.layout.ts`), so it always overrides
 * inheritance — leave it at the default `md` and the title jumps from 14px to
 * 24px the instant you click it, which is the one thing that component's whole
 * in-flow-control design exists to prevent ("the text must not move").
 * `size="custom"` plus this number is the escape hatch it publishes for a host
 * whose typography it cannot see.
 *
 * It is a constant and not a measurement for the same reason
 * `BLOCK_HEADER_BAND_PX` in `BlockShapeUtil.tsx` is, and it has the same
 * safety net: `src/textEditing.smoke.test.tsx` measures the control's computed
 * font-size against the resting title's, so a change to `Block`'s own class
 * turns that test red rather than shipping a jump.
 */
const BLOCK_TITLE_FONT_PX = 14;

/**
 * Which of a block's two texts the open editing session belongs to.
 *
 * WHY a ref threaded through the face rather than a second piece of tldraw
 * state: the session itself is `editingShapeId`, which names a SHAPE, and a
 * block has two editable strings on it. Something has to say which one, and it
 * must not be a `useState` — it is written from a pointerdown CAPTURE handler
 * during the gesture that opens the session, and re-rendering mid-gesture is
 * exactly what `BlockTitle`'s caret hint already documents as the thing to
 * avoid. The read happens in the render that the session's own
 * `useValue` triggers, which is strictly after the press, so the ref is always
 * current by the time anyone looks at it.
 *
 * It is reset to `"title"` whenever a session ends (`BlockFace`), so a session
 * opened from the keyboard — or by a press that landed on neither text — gets
 * the title, which is the block's primary field and what double-clicking a
 * block meant before there was a second one.
 */
type BlockEditField = "title" | "description";
type BlockEditFieldRef = { current: BlockEditField };

/**
 * The title while editing: the trunk's own `EditableText`, controlled by the
 * store.
 *
 * WHY the value is `shape.props.name` straight from the record, with no local
 * draft (which is what `PortFace`'s `LabelEditor` keeps): that one exists
 * because CodeMirror owns a DOCUMENT and feeding the store's value back into
 * it mid-keystroke re-dispatches that document. `EditableText` is a plain
 * controlled `<input>` — the store IS its value, React reconciles the caret,
 * and a draft here would only create a second copy that nothing reconciles if
 * the write is ever rejected.
 *
 * WHY `POINTER_OWNED_CLASS` ("nodrag") is on the control and NOT on the
 * resting title: the header is the block's drag handle by
 * `contentOwnsPress`'s own rule (shapes/shared/pointerOwnership.ts), and
 * `src/blockBodyPress.smoke.test.tsx`'s P-044 case is a committed assertion
 * that a drag from the title still moves the block. That stays true — only the
 * mounted control claims the pointer, so a caret drag selects text instead of
 * sliding the card, and the instant the session ends the header is a drag
 * surface again.
 */
function BlockTitleEditor({ shape, caretAt }: { shape: BlockShape; caretAt?: number }) {
  const editor = useEditor();
  // The value to put back on Escape, captured once: this component mounts
  // fresh per session (the branch below swaps one element type for another),
  // so "once" is the session's opening value.
  const snapshot = useRef(shape.props.name);

  const write = (name: string) => {
    editor.updateShape({ id: shape.id, type: BLOCK_SHAPE_TYPE, props: { name } });
  };

  return (
    <EditableText
      data-slot="ss-block-title"
      className={`min-w-0 ${POINTER_OWNED_CLASS}`}
      size="custom"
      sizePx={BLOCK_TITLE_FONT_PX}
      lines="single"
      editing
      caretAt={caretAt}
      // Per keystroke, like every other real edit in this app. One undo step
      // per gesture rather than one per character.
      onChange={(next) => {
        editor.markHistoryStoppingPoint("rename block");
        write(next);
      }}
      // ENTER CLOSES THE SESSION; A BLUR DOES NOT — see `onCommit`'s own doc
      // in editableText.tsx for the measurement. Closing on every commit
      // closed this session ~0ms after the double-click opened it, because
      // opening it produces one spurious blur-commit of its own. A real blur
      // (pressing the canvas, another shape) is already handled by tldraw:
      // leaving `editing_shape` clears the id and this control unmounts. And
      // nothing is at risk in the gap — `onChange` above has already written
      // every keystroke into the store.
      onCommit={(_next, via) => {
        if (via === "enter") stopEditing(editor);
      }}
      onCancel={() => {
        write(snapshot.current);
        stopEditing(editor);
      }}
    >
      {shape.props.name}
    </EditableText>
  );
}

/**
 * P-039 / P-026: the title edits IN PLACE, on the card, where it is painted —
 * not in a panel field somewhere else.
 *
 * WHAT IT REPLACES, so the change is legible: before this, a block's name had
 * NO editing surface anywhere in the app, and double-clicking a block fell
 * through tldraw's own "this shape cannot edit" branch
 * (SelectTool/childStates/Idle.ts:465-472), which CREATES A STOCK TEXT SHAPE
 * on top of the block and types into that instead. `BlockShapeUtil.canEdit`
 * is the subscription that takes that branch away.
 *
 * The session is tldraw's `editingShapeId`, not a `useState` here, for the
 * reason `PortFace` records: the engine already has to know which shape is
 * being edited (it is what gates its own keyboard handling), so a second
 * "am I editing" flag would be one more thing to fall out of sync.
 */
function BlockTitle({ shape, editField }: { shape: BlockShape; editField: BlockEditFieldRef }) {
  const editor = useEditor();
  const editing = useValue("ss-block editing", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);

  // P-021 on this surface: which character of the title the press that opened
  // the session landed on. A ref for the reason `PortFace`'s twin is one —
  // recording it must not re-render mid-gesture — and cleared when the session
  // ends so a rename opened from the keyboard falls back to select-all.
  const caretHint = useRef<number | null>(null);
  useEffect(() => {
    if (!editing) caretHint.current = null;
  }, [editing]);

  // ONE session, TWO fields: `editingShapeId` names the shape, and the shared
  // ref names which of its two texts the press that opened the session landed
  // on. See `BlockEditFieldRef`.
  if (editing && editField.current === "title") return <BlockTitleEditor shape={shape} caretAt={caretHint.current ?? undefined} />;
  return (
    <span
      data-slot="ss-block-title"
      // The same `data-editing` marker `PortFace`'s resting label carries, and
      // the same reason: the editing control wears `data-slot="ss-block-title"`
      // too (it IS the title), so this attribute is the only thing that tells
      // a probe — or a person reading the DOM — which of the two is on screen.
      // `EditableText` already stamps `data-editing="true"` on its own root.
      data-editing="false"
      className="min-w-0 truncate"
      // The last moment the painted title exists — see `caretGeometry.ts` and
      // `PortFace`'s twin for why the press, not the double-click, is what can
      // be asked. Capture phase, and nothing is stopped: tldraw still gets the
      // press, which is what opens the session in the first place and what
      // keeps a drag from the title moving the block (P-044).
      onPointerDownCapture={(event) => {
        editField.current = "title";
        caretHint.current = caretOffsetFromPoint(event.currentTarget, event.clientX, event.clientY);
      }}
    >
      {shape.props.name}
    </span>
  );
}

/**
 * The description while editing — the trunk's own `EditableText`, controlled by
 * the store, inside the trunk's own `BlockDescription` box.
 *
 * WHY the control is WRAPPED in `BlockDescription` rather than replacing it:
 * that component owns the region's padding, its 12px type and its `pre-wrap`,
 * and `EditableText`'s whole in-flow-control design is "the text must not
 * move". Painting the control in a differently-padded box of this file's own
 * making would move it by exactly the amount those two paddings disagree, and
 * would be a second copy of trunk numbers to drift — the thing ARCHITECTURE.md
 * forbids. The box is the same box; only its contents swap.
 *
 * WHY `lines="multi"`: a description is a sentence, and the field it mirrors
 * in the inspector is a `<textarea>` (`editor/inspectorPanel.tsx`). That also
 * decides the commit key — plain Enter inserts a newline and Ctrl/Cmd+Enter
 * ends the session, which is `EditableText`'s own multi-line contract.
 *
 * The write policy is the title's, for the title's reasons: per keystroke,
 * straight into the record, no local draft. P-030's gate
 * (`src/textEditing.smoke.test.tsx`) is what holds that in place.
 */
function BlockDescriptionEditor({ shape, caretAt }: { shape: BlockShape; caretAt?: number }) {
  const editor = useEditor();
  // The value to put back on Escape, captured once — this component mounts
  // fresh per session, so "once" is the session's opening value.
  const snapshot = useRef(shape.props.description);

  const write = (description: string) => {
    editor.updateShape({ id: shape.id, type: BLOCK_SHAPE_TYPE, props: { description } });
  };

  return (
    // `data-editing="true"` on the SAME element the resting sentence marks, so
    // one selector pair tells a probe — or a person reading the DOM — which of
    // the two is on screen. The trunk's own `data-slot` is untouched (see the
    // resting branch for why).
    <BlockDescription data-editing="true" style={{ display: "flex" }}>
      <EditableText
        className={`min-w-0 flex-1 ${POINTER_OWNED_CLASS}`}
        size="custom"
        sizePx={BLOCK_DESCRIPTION_FONT_PX}
        lines="multi"
        justify="left"
        align="top"
        editing
        caretAt={caretAt}
        placeholder="What does this block do?"
        onChange={(next) => {
          editor.markHistoryStoppingPoint("edit description");
          write(next);
        }}
        // Ctrl/Cmd+Enter closes the session; a blur does not — the same split
        // `BlockTitleEditor` documents, and for the same measured reason.
        onCommit={(_next, via) => {
          if (via === "enter") stopEditing(editor);
        }}
        onCancel={() => {
          write(snapshot.current);
          stopEditing(editor);
        }}
      >
        {shape.props.description}
      </EditableText>
    </BlockDescription>
  );
}

/**
 * P-026's open half: the description edits IN PLACE, on the card, where it is
 * painted — the same move the title got in `954a482`.
 *
 * WHAT IT REPLACES: `BlockFace` passed `description` to `Block` as a plain
 * string, so the ONLY way to change it was the right-hand inspector's textarea
 * — a panel field somewhere else, which is precisely what P-039 objects to.
 * The inspector keeps working and is unchanged; it is now a second door onto
 * the same value rather than the only one, exactly as the glyph picker is.
 *
 * WHY the editing branch is tested BEFORE the paint gate, rather than after
 * it: `blockDescriptionIsPainted` is false for an empty string, so a person who
 * opens this editor and then selects all and deletes would have the control
 * yanked out from under their caret the instant the text hit empty — mid-edit,
 * with the session still open and the keyboard still aimed at it. Ordering the
 * two checks this way keeps the control mounted for as long as the session
 * owns it. The gate is untouched and still governs the RESTING state, so an
 * untouched block paints exactly as it did.
 *
 * WHAT THIS DOES NOT REACH, and it is deliberate: a block whose description is
 * empty paints no sentence, so there is nothing to press and the inspector
 * stays its only door. Painting an empty line at rest to give it one is the
 * tempting alternative, and it is the thing `blockDescriptionIsPainted` exists
 * to prevent — every untouched block on the board would reserve a blank row.
 */
function BlockDescriptionText({ shape, editField }: { shape: BlockShape; editField: BlockEditFieldRef }) {
  const editor = useEditor();
  const editing = useValue("ss-block editing", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);
  const { description, showDescription } = shape.props;

  // P-021 on this surface: which character of the sentence the press landed
  // on. A ref for `BlockTitle`'s reason — recording it must not re-render
  // mid-gesture — and cleared when the session ends so a session opened
  // without a press on the text falls back to the component's own default.
  const caretHint = useRef<number | null>(null);
  useEffect(() => {
    if (!editing) caretHint.current = null;
  }, [editing]);

  if (editing && editField.current === "description") {
    return <BlockDescriptionEditor shape={shape} caretAt={caretHint.current ?? undefined} />;
  }
  // The trunk's gate, unchanged and still the authority on the resting state.
  if (!blockDescriptionIsPainted(description, showDescription)) return null;
  return (
    <BlockDescription
      // WHY the state marker is an attribute beside the trunk's `data-slot`
      // rather than an `ss-`-prefixed slot of this app's own, which is what
      // the title does: `BlockDescription` stamps `data-slot="block-
      // description"` and spreads its caller's props AFTER it, so passing a
      // slot here would REPLACE the trunk's — and two other acceptance files
      // already find this sentence by it (`src/inspector.smoke.test.tsx:60`,
      // `src/blockBodyPress.smoke.test.tsx:286`). The title's resting span is
      // this app's own element, so it had no such slot to protect.
      data-editing="false"
      // The last moment the painted sentence exists. Capture phase, and
      // nothing is stopped — tldraw still gets the press, which is what opens
      // the session and what keeps a drag from the description moving the
      // block (P-044, asserted in src/blockBodyPress.smoke.test.tsx).
      onPointerDownCapture={(event) => {
        editField.current = "description";
        caretHint.current = caretOffsetFromPoint(event.currentTarget, event.clientX, event.clientY);
      }}
    >
      {description}
    </BlockDescription>
  );
}

export function BlockFace({ shape }: { shape: BlockShape }) {
  const editor = useEditor();
  const { view, ports, w, h } = shape.props;

  // Which of the block's two texts the open session belongs to. Shared by the
  // title and the description, and reset the moment a session ends so the next
  // one opened without a press on either lands on the title. See
  // `BlockEditFieldRef`.
  const editField = useRef<BlockEditField>("title");
  const editing = useValue("ss-block editing", () => editor.getEditingShapeId() === shape.id, [editor, shape.id]);
  useEffect(() => {
    if (!editing) editField.current = "title";
  }, [editing]);

  // WHY the wired set is read from BINDINGS rather than passed in: L3 lands
  // wires without touching this file. `getBindingsToShape` is stock, the
  // binding's `portId` prop is the contract (plan §3), and `useValue` makes
  // the dot repaint the instant a wire attaches or is deleted.
  //
  // WHY the two casts: `ss-wire-binding` enters the engine's binding union
  // when L3 augments `TLGlobalBindingPropsMap` (plan §3). Until then the call
  // is right at runtime — `getBindingsToShape` is a store query and answers
  // `[]` for a type no util has registered — and unprovable to the checker.
  // Both casts come out when L3 lands; neither hides a real disagreement.
  const wired = useValue(
    "ss-block wired ports",
    () =>
      new Set(
        editor
          .getBindingsToShape(shape.id, WIRE_BINDING_TYPE as TLBinding["type"])
          .map((binding) => String((binding.props as { portId?: string }).portId ?? "")),
      ),
    [editor, shape.id],
  );
  // How many cables meet each of this block's ports — off the derived scene,
  // the same `producerCounts` the trunk hosts call (see `usePortProducers`).
  const producers = usePortProducers(editor, shape.id);

  // P-005: while a cable is in flight, which of THIS block's dots could take
  // it. `null` at every other moment, which is what makes the rails paint
  // normally at rest — an eligible ring that outlived its gesture would be a
  // permanent decoration claiming to be a live answer.
  //
  // The map is computed once per gesture by `installWireGesture` and read
  // here through `useValue`, so a rail repaints when the gesture starts and
  // again when it ends, and not on a single pointermove in between.
  const eligible = useValue("ss-block port availability", () => wireAvailability(editor).get(), [editor]);

  // WHY: a region's corner card wears the trunk's own per-corner radii — the
  // two corners where its edges CONTINUE the frame's border go square, so the
  // border leaves the card straight instead of kinking twice on its way round
  // (Zach, 2026-09-19: "I don't like how the edges where it meets the region
  // are still curve. they shuld be straight!", annotating THIS app against the
  // DOM render he had approved). What it rejects is the stock all-round Block
  // this very component otherwise paints, which is what was shipping and what
  // a future refactor will reach for again, because every OTHER block on the
  // board wants exactly that.
  //
  // WHY it has to be said here and cannot live in `Region`: in this app the
  // corner card is a real `ss-block` CHILD SHAPE, which tldraw renders in its
  // own subtree — it is not a React descendant of the `Region` element in
  // `RegionFace`, so no rule the component could write would reach it. The
  // radii themselves stay the trunk's (`REGION_CORNER_BLOCK_STYLE`, measured
  // by `RegionVariants.stories.tsx`'s `CornerMeetsFrameSquare` across all five
  // drawings); this file only says WHICH card is a corner. Restating a radius
  // here would be the divergence Zach's 2026-09-19 trunk rule forbids.
  const isRegionCorner = useValue("ss-block is its region's corner card", () => isRegionCornerBlock(editor, shape.id), [editor, shape.id]);

  const edges: Partial<Record<BlockSide, BlockEdgeSpec>> = Object.fromEntries(
    PORT_SIDES.map((side) => [
      side,
      {
        items: ports[side].map(
          (port): PortEdgeItem => ({
            id: port.id,
            label: labelOf(port),
            state: wired.has(port.id) ? "wired" : undefined,
            // `undefined` is "no opinion", and `Port` reads it as "paint the
            // at-rest grammar" — see `availabilityAt` for why the dot the
            // cable is LEAVING is deliberately in that bucket rather than
            // marked available.
            availability: availabilityAt(eligible, shape.id, port.id),
            // The RAW count, 1 included. One cable needs no number — the
            // wired dot already says "one" — but that threshold is a paint
            // rule with one owner, `Port`'s own `producers >= 2`; repeating
            // it here would be a second copy of the rule to drift.
            ...(producers.has(port.id) ? { producers: producers.get(port.id) } : null),
          }),
        ),
        // A rail reorder is a real edit — one undo step, unlike the measured
        // writes in shared/measure.ts.
        //
        // P-037: this callback reports TWO kinds of change, not one. `PortEdge`
        // routes a label the user typed on the card back through the same
        // `items` array it uses for order (portEdge.tsx:1340), so reading only
        // the order — which is what this handler did until now — meant the
        // board opened a `CodeEditor` on a rail label and then silently threw
        // every keystroke away. `portsFromRailItems` reads both halves; its own
        // header carries the measurement and the splice rule.
        onItemsChange: (items: PortEdgeItem[]) => {
          // The same mark the title editor sets before ITS per-keystroke write
          // (`BlockTitleEditor`), and for the reason that one exists: without a
          // stopping point the rename merges into whatever entry was already
          // open, so the first Ctrl+Z after renaming a port undid the action
          // BEFORE it — measured 2026-09-21, one undo after renaming a port on
          // a freshly placed block deleted the block. Undo granularity inside
          // the rename is per keystroke, exactly as it is for the title; that
          // is this app's existing shape for text edits and this lane did not
          // change it.
          editor.markHistoryStoppingPoint("edit ports");
          editor.updateShape({
            id: shape.id,
            type: BLOCK_SHAPE_TYPE,
            props: { ports: { ...ports, [side]: portsFromRailItems(ports[side], items) } },
          });
        },
      } satisfies BlockEdgeSpec,
    ]),
  );

  return (
    <NodeShapeFrame<BlockShape> shapeId={shape.id} shapeType={BLOCK_SHAPE_TYPE} w={w} h={h} diff={shape.props.diff}>
      {/* `id` is the tldraw shape id, stamped as `data-block-id` — the anchor
          of both the dot sighting (shared/measure.ts) and the drag-ownership
          lookup (shared/pointerOwnership.ts). */}
      <BlockPort id={shape.id} view={view} edges={edges}>
        <Block
          // The header is the icon and the name on one line — Notion's order,
          // icon first. `min-w-0` + `truncate` on the name half and NOT on the
          // row: without it the flex row refuses to shrink below its text and
          // a long name pushes the icon out of the 160px card instead of
          // eliding itself.
          header={
            <span data-slot="ss-block-header-line" className="flex min-w-0 items-center gap-1.5">
              <BlockGlyph shape={shape} />
              <BlockTitle shape={shape} editField={editField} />
            </span>
          }
          // RULING 9, the paint half. Zach: "the eye visibility control for
          // this is in the right hand inspector menu" — so the SHAPE carries
          // the pair and paints it, and nothing here draws a control. The
          // control is `chrome/panels.tsx`'s `InspectorSurface`; putting an
          // eye on the block itself is the tempting alternative this
          // deliberately rejects, because an eye that rides the thing it
          // hides vanishes along with its own effect.
          // P-026: the host paints this region itself, because a `string`
          // prop cannot carry an editing control and the whole item is that
          // the control appears WHERE THE SENTENCE IS. `description` /
          // `showDescription` move into that component with it — the trunk's
          // own `blockDescriptionIsPainted` still decides the resting state.
          descriptionSlot={<BlockDescriptionText shape={shape} editField={editField} />}
          width={w}
          // WHY the SIMPLE view hugs and the other two do not: `Block`'s
          // height is optional precisely so a card can hug its rendered
          // regions, and a simple face is just that card — the measurement
          // pass reads the hug back into `props.h`. But `BlockPort`
          // distributes its rails between the header's bottom and the card's
          // bottom, so a hugging card with no body gives every dot the same
          // one-pixel band and the labels land on top of each other (measured
          // here: a hugged port-view block came out 39px tall with "frame" and
          // "Pose" overlapping). Every port-view specimen in the trunk's own
          // stories passes an explicit height for this reason
          // (BlockPort.stories.tsx:154-156, `BandedFace` at 240). So `props.h`
          // IS the authored box in port and expanded views, and the
          // measurement simply confirms it.
          height={view === "simple" ? undefined : h}
          // The trunk's radii, spread the way `hosts/nodeViews.tsx` spreads
          // them — `Block` applies its caller's `style` AFTER its own
          // `borderRadius` (block.tsx), which is the seam it publishes as
          // overridable. See the WHY above.
          style={isRegionCorner ? REGION_CORNER_BLOCK_STYLE : undefined}
        />
      </BlockPort>
    </NodeShapeFrame>
  );
}
