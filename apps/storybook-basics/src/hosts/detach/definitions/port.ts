/**
 * src/hosts/detach/definitions/port.ts — a Port's appearance expressed as
 * editable stock tldraw primitives, measured off the live DOM.
 *
 * This is the bottom of the detach hierarchy in this app the same way it is
 * in the donor (packages/adapter-tldraw/src/detach/portPrimitives.ts): a
 * Block's ports are not a standalone scene-node kind here (`HostScene` never
 * emits a top-level `"port"` node — see `../../hosts/hostScene.ts`), so this
 * function is invoked PER PORT by `./block.ts`, never registered on its own
 * `DetachableKind`. That is still "every component has it defined" —
 * `emitPortPrimitives` is Port's own, real, reusable definition; it is only
 * reachable today as a sub-primitive, because that is the only place a Port
 * appears in this app's current scene model. Promoting it to a standalone
 * kind (a `"port"` node type in `HostScene`) is owed follow-up, not a gap in
 * this file.
 *
 * STATE COMES OFF THE PAINTED DOM, not off scene data: `PortState` is a
 * value COMPUTED by the host at render time (`../../hosts/nodeViews.tsx`'s
 * `withWiredState`, from `wiredPorts(scene)`) — the scene only ever names a
 * port, it never stores whether it is wired. Rather than re-deriving that
 * fact a second time here (a second implementation of the same rule that
 * could silently diverge), this reads the SAME fact `Port` already painted
 * into `data-state` (`../../components/port.tsx:359`) — the live DOM is the
 * one place the derived state and the rendered colour are guaranteed to
 * agree, because the paint IS the derivation's only consumer.
 */
import type { Editor } from "tldraw";
import type { TLDefaultColorStyle, TLShapeId, TLShapePartial } from "tldraw";

import { boxRelativeTo, geoAtBox, inflateBox, renderedLineMeasureFor, textAtDom, textBoxRelativeTo } from "../stockShapes";

/** Donor's own ring geometry constants (`../../components/port.layout.ts:53-54`
 *  — PORT_SURFACE_RING_PX / PORT_STATE_RING_PX), re-declared here rather
 *  than imported: importing `port.layout.ts` FOR its geometry constants is
 *  legitimate (this kit is allowed to read the core's pure numbers — see
 *  `../index.ts`'s header), but these two are re-exported nowhere from that
 *  module's public surface in a name this file would want to collide with,
 *  and the values are load-bearing enough (they size the stock ring) that a
 *  literal citation beats an import of a private-feeling pair. If
 *  `port.layout.ts` changes these, `PortRing.stories.tsx`'s own dot
 *  measurements go red before this file's output silently drifts.
 */
const PORT_SURFACE_RING_PX = 2;
const PORT_STATE_RING_PX = 3;
const PORT_RING_OVERHANG_PX = PORT_SURFACE_RING_PX + PORT_STATE_RING_PX;

/**
 * The dot's stock ring per `data-state`. Ported from the donor's own table
 * (`portPrimitives.ts:79-86`, `STATE_STOCK_RING`) for the three states it
 * shares; `received` is THIS app's own addition (`../../components/port.tsx`'s
 * `PortState` persists it, where the donor's did not — see that file's own
 * `DetachablePortState` doc) and has no donor precedent, so it is a fresh
 * judgement call, not a port: stock `"green"` is the closest named colour to
 * the live `--bbox-received` token's intent ("fully lit, data just flowed").
 */
const STATE_STOCK_RING: Record<string, { color: TLDefaultColorStyle; fill: "none" | "solid" | "fill" }> = {
  empty: { color: "black", fill: "none" },
  valueSet: { color: "grey", fill: "solid" },
  wired: { color: "orange", fill: "fill" },
  received: { color: "green", fill: "fill" },
};

export interface PortPrimitives {
  shapes: TLShapePartial[];
  ringId: TLShapeId;
}

/**
 * Build the stock shapes for one rendered port, given its dot element and
 * (optional) label element, both already resolved from the DOM. `origin` is
 * the element every returned shape's x/y is measured relative to — the
 * enclosing `bbox-node`'s own wrapper (`data-scene-node`), so the emitted
 * primitives land at the SAME local offsets `lowerToGroup` expects.
 */
export function emitPortPrimitives(
  editor: Editor,
  origin: Element,
  dotEl: Element,
  labelEl: Element | null,
): PortPrimitives {
  const state = dotEl.getAttribute("data-state") ?? "empty";
  const paint = STATE_STOCK_RING[state] ?? STATE_STOCK_RING.empty;

  const dotBox = boxRelativeTo(origin, dotEl, editor);
  const ringBox = inflateBox(dotBox, PORT_RING_OVERHANG_PX);
  const ring = geoAtBox(ringBox, { geo: "ellipse", ...paint });
  const shapes: TLShapePartial[] = [ring];

  if (labelEl && labelEl.textContent && labelEl.textContent.trim() !== "") {
    const measureRendered = renderedLineMeasureFor(editor);
    const textBox = textBoxRelativeTo(origin, labelEl, editor);
    // Port labels render at PORT_TEXT_SIZES.sm (18px) by default
    // (`../../components/port.layout.ts:158`, `../../components/labeledPort.tsx`'s
    // `textSize = "sm"` default) — read the live font-size instead of
    // assuming it, so a caller that sizes a label differently still
    // measures true. STALE COMMENT FIXED 2026-09-18: this previously said
    // 24px (PORT_TEXT_SIZES.md) — the code already read the computed style
    // so behaviour was unaffected, only the comment was wrong.
    const computed = window.getComputedStyle(labelEl);
    const fontPx = Math.round(parseFloat(computed.fontSize) || 18);
    shapes.push(
      textAtDom({
        text: labelEl.textContent.trim(),
        px: fontPx,
        box: textBox,
        color: "black",
        measureRendered,
      }),
    );
  }

  return { shapes, ringId: ring.id as TLShapeId };
}
