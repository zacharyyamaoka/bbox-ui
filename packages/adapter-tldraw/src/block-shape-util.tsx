import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  atom,
  resizeBox,
  type Atom,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";

import {
  Block,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  PORT_DIAMETERS,
  PORT_DOT_CENTER_TRANSFORM,
  PortDot,
  PortLabel,
  SIMPLE_BLOCK,
  portDotPlacement,
  portLabelPlacement,
  type BlockSide,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";

/**
 * A port stored on the shape record. Note the state validator below admits
 * only "empty" | "default" | "wired".
 * WHY: `received` is a RUNTIME prop, never persisted document state — a
 * .tldr file that recorded "data arrived here" would be lying after reload.
 * Runtime delivery goes through the per-editor received-ports table instead.
 */
export interface BBoxShapePort {
  id: string;
  direction: "input" | "output";
  state: "empty" | "default" | "wired";
  size: PortSize;
  label: string;
  textLayout: PortTextLayout;
  side: BlockSide;
  t: number;
}

export interface BBoxBlockShapeProps {
  w: number;
  h: number;
  title: string;
  titleSize: TextSize;
  blockType: string;
  description: string;
  icon: string;
  tag: string;
  orientation: "horizontal" | "vertical";
  ports: BBoxShapePort[];
}

// tldraw 5.x custom shapes register their props on the global map so the
// shape type participates in TLShape (the documented augmentation path).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-block": BBoxBlockShapeProps;
  }
}

export type BBoxBlockShape = TLBaseShape<"bbox-block", BBoxBlockShapeProps>;

/** Runtime `received` flags: shape id → port id → lit. */
export type ReceivedPortFlags = Record<string, Record<string, true>>;

/**
 * Runtime-only "data received" flags, one table PER EDITOR. A tldraw atom
 * so `component()` (which is reactive) repaints when a flag flips.
 *
 * WHY a side table and not a shape prop: shape props are the persisted
 * document; `received` must never survive a save/load. See BBoxShapePort.
 *
 * WHY per editor and not module-global: `editor.dispose()` drops a document
 * WITHOUT deleting its shapes, so no delete handler ever fires — a global
 * table outlived the editor, and a later editor opening a different
 * document that reuses a shape id (and port id) painted a port received
 * that never received anything. The WeakMap scopes each table to its
 * editor and lets a disposed editor's flags be collected with it.
 *
 * WHY nested keys and not `${shapeId}:${portId}`: both ids may contain
 * ":", so the flat key was ambiguous — `shape:a` + `b:c` and `shape:a:b` +
 * `c` collided on one flag, lighting and clearing each other.
 */
const receivedPortsByEditor = new WeakMap<Editor, Atom<ReceivedPortFlags>>();

export function receivedPortsAtom(editor: Editor): Atom<ReceivedPortFlags> {
  let flags = receivedPortsByEditor.get(editor);
  if (!flags) {
    flags = atom<ReceivedPortFlags>("bbox received ports", {});
    receivedPortsByEditor.set(editor, flags);
  }
  return flags;
}

export function setPortReceived(
  editor: Editor,
  shapeId: string,
  portId: string,
  received: boolean,
) {
  receivedPortsAtom(editor).update((current) => {
    const forShape = current[shapeId];
    // A false flag IS the absence of a flag — storing it would grow the map
    // by one dead entry per delivery, forever.
    if (!received) {
      if (!forShape || !(portId in forShape)) return current;
      const nextShape = { ...forShape };
      delete nextShape[portId];
      const next = { ...current };
      if (Object.keys(nextShape).length === 0) {
        delete next[shapeId];
      } else {
        next[shapeId] = nextShape;
      }
      return next;
    }
    if (forShape?.[portId]) return current;
    return { ...current, [shapeId]: { ...forShape, [portId]: true } };
  });
}

/** Drop every runtime `received` flag keyed under one shape id. */
export function clearReceivedPorts(editor: Editor, shapeId: string) {
  receivedPortsAtom(editor).update((current) => {
    if (!(shapeId in current)) return current;
    const next = { ...current };
    delete next[shapeId];
    return next;
  });
}

/**
 * Prune the runtime `received` flags of any shape the moment it leaves the
 * document, and drop the whole table when the editor is disposed. Returns
 * the unsubscribe function.
 *
 * WHY the delete handler: the table is keyed by shape id and nothing else
 * ever deletes — a received flow, a detach (which rekeys onto the carrier
 * group) and then a plain delete of that carrier left the carrier's flags
 * in the map forever, and repeated flows grew it without bound. The handler
 * covers every owner of a flag — live bbox shapes AND the stock carrier
 * groups detach mints — which is why it hangs off the editor, not off one
 * shape util. Detach and rebuild both hand flags to the replacement id
 * BEFORE deleting the old shape, so this pruning never races the rekey.
 *
 * WHY the disposable: `dispose()` tears the document down without deleting
 * its shapes, so the delete handler never fires for them; dropping the
 * table with the editor keeps a dead document's deliveries out of memory.
 */
export function registerReceivedPortCleanup(editor: Editor): () => void {
  const stop = editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
    clearReceivedPorts(editor, shape.id);
  });
  const dropTable = () => receivedPortsByEditor.delete(editor);
  editor.disposables.add(dropTable);
  return () => {
    stop();
    editor.disposables.delete(dropTable);
  };
}

/**
 * Move every runtime `received` flag keyed under one shape id to another.
 *
 * WHY: detach and rebuild both replace a shape with a freshly minted id, and
 * a flag keyed to the dead id would leave a port that is receiving right now
 * dark after the swap. The hand-off stays entirely in this runtime atom —
 * the flags never travel through `meta` or props, so nothing about
 * "received" ever reaches the persisted document.
 */
export function rekeyReceivedPorts(
  editor: Editor,
  fromShapeId: string,
  toShapeId: string,
) {
  receivedPortsAtom(editor).update((current) => {
    const moving = current[fromShapeId];
    if (!moving) return current;
    const next = { ...current };
    delete next[fromShapeId];
    next[toShapeId] = { ...next[toShapeId], ...moving };
    return next;
  });
}

const portValidator: T.Validator<BBoxShapePort> = T.object({
  id: T.string,
  direction: T.literalEnum("input", "output"),
  // Deliberately excludes "received" — see BBoxShapePort.
  state: T.literalEnum("empty", "default", "wired"),
  size: T.literalEnum("sm", "md", "lg"),
  label: T.string,
  textLayout: T.literalEnum(
    "top",
    "bot",
    "right",
    "left",
    "right-offset",
    "left-offset",
  ),
  side: T.literalEnum("left", "right", "top", "bottom"),
  t: T.number,
});

/**
 * tldraw host adapter. The same presentational core renders inside
 * `HTMLContainer`, but here `props.w`/`props.h` on the shape record are
 * authoritative and the body geometry comes from `getGeometry()` — port
 * anchors are geometry points computed by the shared layout module, not DOM
 * elements the engine could measure.
 */
export class BBoxBlockShapeUtil extends ShapeUtil<BBoxBlockShape> {
  static override type = "bbox-block" as const;

  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    titleSize: T.literalEnum("md", "lg", "xl"),
    blockType: T.string,
    description: T.string,
    icon: T.string,
    tag: T.string,
    orientation: T.literalEnum("horizontal", "vertical"),
    ports: T.arrayOf(portValidator),
  };

  override getDefaultProps(): BBoxBlockShape["props"] {
    return {
      w: SIMPLE_BLOCK.width,
      h: SIMPLE_BLOCK.height,
      title: "Title",
      titleSize: "xl",
      blockType: "",
      description: "",
      icon: "",
      tag: "",
      orientation: "horizontal",
      ports: [],
    };
  }

  override getGeometry(shape: BBoxBlockShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: BBoxBlockShape, info: TLResizeInfo<BBoxBlockShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: BBoxBlockShape) {
    const { props } = shape;
    const received = receivedPortsAtom(this.editor).get();
    return (
      <HTMLContainer style={{ overflow: "visible" }}>
        {/* data-block-id lets the compare harness pair this block with its
            React Flow twin by id (titles are user text and can repeat). */}
        <Block width={props.w} height={props.h} data-block-id={shape.id}>
          <BlockHeader orientation={props.orientation}>
            {props.icon !== "" && (
              <BlockGlyph size={props.titleSize}>{props.icon}</BlockGlyph>
            )}
            <BlockTitle size={props.titleSize}>{props.title}</BlockTitle>
            {props.tag !== "" && <BlockChip>{props.tag}</BlockChip>}
          </BlockHeader>
          {props.description !== "" && (
            <BlockDescription>{props.description}</BlockDescription>
          )}
          {props.blockType !== "" && <BlockType>{props.blockType}</BlockType>}
          {props.ports.map((port) => {
            const placement = portDotPlacement(
              port.side,
              port.t,
              props.w,
              props.h,
            );
            const state: PortState = received[shape.id]?.[port.id]
              ? "received"
              : port.state;
            const diameter = PORT_DIAMETERS[port.size];
            return (
              <div
                key={port.id}
                data-port-id={port.id}
                className="absolute"
                style={{ ...placement, transform: PORT_DOT_CENTER_TRANSFORM }}
              >
                <PortDot state={state} size={port.size} className="block" />
                {port.label !== "" && (
                  <PortLabel
                    className="absolute"
                    style={portLabelPlacement(port.textLayout, {
                      w: diameter,
                      h: diameter,
                    })}
                  >
                    {port.label}
                  </PortLabel>
                )}
              </div>
            );
          })}
        </Block>
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: BBoxBlockShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
