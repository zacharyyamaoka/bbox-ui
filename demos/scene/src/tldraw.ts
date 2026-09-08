/**
 * Scene → tldraw. `createShapeId` is the one runtime import; everything
 * else is data.
 */
import { createShapeId, type TLShapeId, type TLShapePartial } from "tldraw";
import type { BBoxBlockShape } from "@bbox-ui/adapter-tldraw";

import { SCENE } from "./scene";

export interface TldrawScene {
  shapes: TLShapePartial<BBoxBlockShape>[];
  /**
   * Ports the scene lights up as "received" — handed back separately
   * because the shape record must never carry that state (the adapter's
   * props validator rejects it). Flag them through `setPortReceived` after
   * the shapes are created.
   */
  receivedPorts: { shapeId: TLShapeId; portId: string }[];
}

export function sceneToTldrawShapes(): TldrawScene {
  const shapes: TLShapePartial<BBoxBlockShape>[] = SCENE.blocks.map((block) => ({
    id: createShapeId(block.id),
    type: "bbox-block" as const,
    x: block.x,
    y: block.y,
    props: {
      title: block.title,
      titleSize: block.titleSize ?? "xl",
      blockType: block.blockType ?? "",
      description: block.description ?? "",
      icon: block.icon ?? "",
      tag: block.tag ?? "",
      orientation: block.orientation ?? "horizontal",
      ports: block.ports.map((port) => ({
        id: port.id,
        direction: port.direction,
        state: port.state,
        size: port.size,
        label: port.label,
        textLayout: port.textLayout,
        side: port.side,
        t: port.t,
      })),
    },
  }));
  const receivedPorts = SCENE.blocks.flatMap((block) =>
    block.ports
      .filter((port) => port.receivedAtRuntime)
      .map((port) => ({ shapeId: createShapeId(block.id), portId: port.id })),
  );
  return { shapes, receivedPorts };
}
