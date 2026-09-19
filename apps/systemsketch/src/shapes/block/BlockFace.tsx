// src/shapes/block/BlockFace.tsx — what an `ss-block` looks like: the trunk's
// own `BlockPort` wrapping the trunk's own `Block`, fed from persisted props.
//
// Nothing is drawn here. The whole point of the rebuild (ASK item 2) is that
// SystemSketch IS bbox-ui + stock tldraw, so this file's entire job is to turn
// `shape.props` into the two components' props and to route their callbacks
// back into the store.
import { useEditor, useValue, type TLBinding } from "tldraw";

import { Block } from "@trunk/components/block";
import { BlockPort, type BlockEdgeSpec } from "@trunk/components/blockPort";
import type { BlockSide } from "@trunk/components/port.layout";
import type { PortEdgeItem } from "@trunk/components/portEdge";

import { usePortProducers } from "../../document/sceneFromStore";
import { NodeShapeFrame } from "../shared/nodeShapeComponent";
import { BLOCK_SHAPE_TYPE, PORT_SIDES, WIRE_BINDING_TYPE } from "../types";
import type { BlockPortSpec, BlockShape } from "./BlockShapeUtil";

/**
 * The rail label is the port's NAME, alone.
 *
 * WHY not `name + " " + type`, which is what plan §8.5 and this lane's brief
 * both asked for: the two rails of a block sit on the same row and flow
 * INWARD from opposite edges (`inwardTextLayout`, components/port.layout.ts),
 * so on the plan's own default 160px block two concatenated labels run
 * straight through each other. Measured on the smoke fixture — `estimate()`
 * with a left `frame:Frame` and a right `Pose:Pose` — "frame Frame" spanned
 * x139-248 and "Pose Pose" x175-261: 73px of overlapping, unreadable text,
 * visible in reports/media/.../ss-L0/04-ports-render-as-dots.png. Nothing
 * downstream can rescue it: `width={props.w}` is the authored box (the brief),
 * the default is 160 (documentModel.test asserts it), and the measurement
 * pass reads the rendered size back rather than growing it, so the block can
 * never widen to fit its own labels.
 *
 * Zach's "render stored properties truthfully" rule is what settles which way
 * to cut. Two strings painted on top of each other make authored characters
 * disappear, which is the failure that rule exists to forbid; a name rendered
 * whole, with the type simply not on the rail, hides nothing — `type` is still
 * in `props.ports[side][].type`, still in the document-model contract, still
 * what the wire binding and L2's inspector read.
 *
 * The real home for a type is `LabeledPort`'s secondary slot (the trunk draws
 * it for exactly this), but `PortEdgeItem` carries one `label` and no
 * secondary field — widening it is a change to the trunk, outside this lane's
 * write set. Owed upstream: a `secondary` on `PortEdgeItem`, and then this
 * function hands the type to it instead of dropping it.
 */
function labelOf(port: BlockPortSpec): string {
  return port.name;
}

export function BlockFace({ shape }: { shape: BlockShape }) {
  const editor = useEditor();
  const { name, view, ports, w, h } = shape.props;

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

  const edges: Partial<Record<BlockSide, BlockEdgeSpec>> = Object.fromEntries(
    PORT_SIDES.map((side) => [
      side,
      {
        items: ports[side].map(
          (port): PortEdgeItem => ({
            id: port.id,
            label: labelOf(port),
            state: wired.has(port.id) ? "wired" : undefined,
            // The RAW count, 1 included. One cable needs no number — the
            // wired dot already says "one" — but that threshold is a paint
            // rule with one owner, `Port`'s own `producers >= 2`; repeating
            // it here would be a second copy of the rule to drift.
            ...(producers.has(port.id) ? { producers: producers.get(port.id) } : null),
          }),
        ),
        // A rail reorder is a real edit — one undo step, unlike the measured
        // writes in shared/measure.ts.
        onItemsChange: (items: PortEdgeItem[]) => {
          const byId = new Map(ports[side].map((port) => [port.id, port]));
          editor.updateShape({
            id: shape.id,
            type: BLOCK_SHAPE_TYPE,
            props: {
              ports: {
                ...ports,
                [side]: items.flatMap((item) => {
                  const port = byId.get(item.id);
                  return port ? [port] : [];
                }),
              },
            },
          });
        },
      } satisfies BlockEdgeSpec,
    ]),
  );

  return (
    <NodeShapeFrame<BlockShape> shapeId={shape.id} shapeType={BLOCK_SHAPE_TYPE} w={w} h={h}>
      {/* `id` is the tldraw shape id, stamped as `data-block-id` — the anchor
          of both the dot sighting (shared/measure.ts) and the drag-ownership
          lookup (shared/pointerOwnership.ts). */}
      <BlockPort id={shape.id} view={view} edges={edges}>
        <Block
          header={name}
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
        />
      </BlockPort>
    </NodeShapeFrame>
  );
}
