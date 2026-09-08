/**
 * Scene → tldraw. `createShapeId` is the one runtime import; everything
 * else is data.
 */
import { createShapeId, type TLShapeId, type TLShapePartial } from "tldraw";
import type { BBoxBlockShape, BBoxPortShape } from "@bbox-ui/adapter-tldraw";

import { SCENE, explicitBlockSize, type Scene } from "./scene";

export interface TldrawScene {
  shapes: TLShapePartial<BBoxBlockShape | BBoxPortShape>[];
  /**
   * Ports the scene lights up as "received" — handed back separately
   * because the shape record must never carry that state (the adapter's
   * props validator rejects it). Flag them through `setPortReceived` after
   * the shapes are created.
   */
  receivedPorts: { shapeId: TLShapeId; portId: string }[];
}

export function sceneToTldrawShapes(scene: Scene = SCENE): TldrawScene {
  const shapes: TLShapePartial<BBoxBlockShape | BBoxPortShape>[] =
    scene.blocks.map((block) => ({
      id: createShapeId(block.id),
      type: "bbox-block" as const,
      x: block.x,
      y: block.y,
      props: {
        // Explicit size only when the scene carries one (a derived scene may
        // have resized blocks); otherwise the shape's defaults apply. The
        // contract is stated once, on explicitBlockSize.
        ...(explicitBlockSize(block) ?? {}),
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
  for (const port of scene.standalonePorts ?? []) {
    shapes.push({
      id: createShapeId(port.id),
      type: "bbox-port" as const,
      x: port.x,
      y: port.y,
      props: {
        w: port.w,
        h: port.h,
        state: port.state,
        size: port.size,
        label: port.label,
        textLayout: port.textLayout,
      },
    });
  }
  const receivedPorts = scene.blocks.flatMap((block) =>
    block.ports
      .filter((port) => port.receivedAtRuntime)
      .map((port) => ({ shapeId: createShapeId(block.id), portId: port.id })),
  );
  return { shapes, receivedPorts };
}
