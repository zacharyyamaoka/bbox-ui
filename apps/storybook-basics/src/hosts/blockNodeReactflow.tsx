"use client";

/**
 * src/hosts/blockNodeReactflow.tsx — `BlockNodeReactflow`: a React
 * Flow custom node that renders the trunk's `BlockPort` (a real bbox-ui
 * `Block` wearing real `PortEdge` rails) with a real `@xyflow/react`
 * `<Handle>` at every port, positioned at the MEASURED dot centre rather
 * than a guessed offset.
 *
 * WHY measured, not computed a second time (the same call as
 * `blockPort.tsx`'s own D-A5): `BlockPort` measures its OWN Block's
 * rendered regions because there is no closed form for where the body band
 * starts once a header wraps or a member list folds — see that file's
 * `useBlockBands`. A Handle's position inherits that same "no closed form"
 * problem one layer further out: it has to land wherever the CHILD ends up
 * putting its dot, so the only correct source of truth is the rendered dot
 * itself, read back off the same `[data-slot="port-dot"]` elements
 * `railDotCentres` selects — never recomputed by calling
 * `railBoxFor`/`railPlanFor` a second time, which would be exactly the trap
 * `blockPort.tsx`'s own module doc warns against for its layer: two
 * independent computations of one fact, guaranteed to drift the first time
 * either one changes without the other. Pairing those dots, in order, with
 * the SAME `items` order this file itself handed `BlockPort`
 * (`groupPortsByEdge`'s own doc) is a zip, never a guess — see
 * `measureHandlePlacements`'s own doc for why the CENTRE of each dot is
 * measured with `localCentreWithin` rather than `railDotCentres` itself.
 *
 * WHY the Handle is a separate, invisible element layered over the real
 * dot, not the dot itself: this repo's own rule (`CLAUDE.md`, "The core
 * imports no canvas engine") is that a component owns its own painting and
 * the host owns interaction geometry. `BlockPort`'s dot stays the trunk's
 * own paint (ring, halo, state colour) regardless of host. React Flow only
 * ever binds an edge to a real `<Handle>` DOM element, though, so one is
 * still required — sized and centred exactly on the real dot, fully
 * transparent, so clicking "the dot" the user sees is clicking the Handle
 * sitting on top of it.
 *
 * WHAT THIS FILE MAY IMPORT, per the brief: the trunk's own components
 * (`../components/block`, `../components/blockPort`, `../components/port`,
 * `../components/port.layout`, `../components/portEdge`) and
 * `@xyflow/react`. Nothing else — no tldraw, no other adapter, no
 * `@bbox-ui/core`.
 *
 * WHAT IS DELIBERATELY NOT HERE: `BlockPort`'s `functionPort` (the header's
 * reserved "pin 1", `blockPort.tsx`'s `BlockFunctionPort`). It is a
 * different concept from a graph port — it never appears in `edges`, is
 * capped at one per block, and cannot be wired to an id list the way this
 * file's `ports` are. Wiring it into React Flow is a real, separate design
 * question (what handle id does a single reserved pin get?) that no
 * consumer has asked for yet; left for whoever needs it.
 *
 * PROVENANCE + WHY `hosts/` (lane L-REG, 2026-10-06): ported from donor
 * `claude/beautiful-bt-registry` 611d985:
 * apps/storybook-basics/src/components/blockNodeReactflow.tsx, re-checked
 * against BASE 61e26e6's `BlockPort` API (`BlockEdgeSpec`, `BlockPortLayout`,
 * `BlockView` still export from `components/blockPort.tsx`). The donor put it
 * under `components/`, but it imports `@xyflow/react`, and
 * `src/engineFree.test.ts` walls every engine out of `components/` — only
 * `hosts/` may import an engine. So it lives here, and its trunk imports go
 * up-and-over (`../components/…`); the registry item `block-node-reactflow`
 * lands it at `components/bbox/hosts/` beside `block-port`'s mirrored
 * `components/bbox/components/`, so those specifiers still resolve.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { Block, type BlockProps } from "../components/block";
import { BlockPort, type BlockEdgeSpec, type BlockPortLayout, type BlockView } from "../components/blockPort";
import {
  BLOCK_SIDE_TO_HANDLE_POSITION,
  groupPortsByEdge,
  handleLayoutKey,
  reactFlowHandleType,
  toPortEdgeItems,
  type BlockNodePort,
} from "./blockNodeReactflow.layout";
import { BLOCK_SIDES, PORT_HIT_PX, type BlockSide, type PortSize } from "../components/port.layout";

export type { BlockNodePort } from "./blockNodeReactflow.layout";

export interface BlockNodeReactflowData {
  header?: BlockProps["header"];
  body?: BlockProps["body"];
  footer?: BlockProps["footer"];
  width?: number;
  height?: number;
  view?: BlockView;
  portLayout?: BlockPortLayout;
  collapsePorts?: boolean;
  diameter?: PortSize;
  ports: BlockNodePort[];
  [key: string]: unknown;
}

export type BlockNodeReactflowType = Node<BlockNodeReactflowData, "bboxBlock">;

interface HandlePlacement {
  id: string;
  type: "target" | "source";
  position: Position;
  left: number;
  top: number;
}

/**
 * Reads every rail's rendered dots out of `wrapper` and zips them onto
 * `portsByEdge` positionally (module doc above). Collapsed rails
 * (`data-collapsed="true"` on `[data-slot="block-port-rail"]`, per
 * `blockPort.tsx`'s `railPlanFor`/`collapsedState`) paint exactly ONE dot
 * standing for every member on that wall, so every id on a collapsed wall
 * correctly maps to that same single measured centre — the dots really do
 * coincide there, so this is not a fallback, it is the reading that
 * matches what is on screen.
 *
 * A rail that has not rendered yet (`BlockPort`'s own bands are still
 * `null` on the very first paint — see that file's `useBlockBands`) or a
 * genuine items/dots count mismatch both fail closed: the affected ports
 * are simply omitted from this pass rather than mis-placed, and the
 * observer below re-measures on the next DOM/size change once the rail
 * exists.
 *
 * WHY NOT `railDotCentres`'s raw result (the brief's own suggestion) used
 * DIRECTLY as a style value, even though it is exactly the right tool
 * inside a plain story (it is `blockPort.tsx`'s own
 * `getBoundingClientRect`-based helper, and this file's own test still uses
 * it that way to CONFIRM the result): a `<Handle>` is positioned here by an
 * inline `style.left`/`top`, which CSS resolves in `wrapper`'s LOCAL,
 * untransformed coordinate space. `getBoundingClientRect` reports the
 * SCREEN box instead — already multiplied by every ancestor's CSS transform
 * — and React Flow's viewport pane carries exactly such a `scale(zoom)`
 * transform, which `fitView` sets away from 1 the moment a node doesn't
 * already fill the canvas. A screen-space delta used unscaled as a local
 * style value gets scaled a SECOND time on paint: measured live at
 * zoom≈1.59, a first attempt put the nearest dot ~11px off and one three
 * slots further ~90px off, an error that GREW with distance from the
 * wrapper's own origin — the signature of exactly this mistake.
 * `localCentreWithin` below still reads the dot's SCREEN box (so it stays
 * exact, sub-pixel — a first attempt using the `offsetLeft`/`offsetTop` /
 * `offsetParent` chain instead rounds to whole CSS pixels at every one of
 * several hops, and measured live left a ~5px residual), then divides by
 * `wrapper`'s OWN screen-vs-local size ratio to undo the ancestor scale —
 * recovered empirically rather than read from React Flow's store, so this
 * holds under panning too, and needs no cooperation from this file's own
 * caller.
 */
function localCentreWithin(el: HTMLElement, wrapper: HTMLElement): { x: number; y: number } | null {
  if (wrapper.offsetWidth === 0 || wrapper.offsetHeight === 0) return null;
  const wrapperRect = wrapper.getBoundingClientRect();
  const scaleX = wrapperRect.width / wrapper.offsetWidth;
  const scaleY = wrapperRect.height / wrapper.offsetHeight;
  if (scaleX === 0 || scaleY === 0) return null;
  const elRect = el.getBoundingClientRect();
  return {
    x: (elRect.left + elRect.width / 2 - wrapperRect.left) / scaleX,
    y: (elRect.top + elRect.height / 2 - wrapperRect.top) / scaleY,
  };
}

function measureHandlePlacements(
  wrapper: HTMLElement,
  portsByEdge: Partial<Record<BlockSide, BlockNodePort[]>>,
): HandlePlacement[] {
  const placements: HandlePlacement[] = [];
  for (const edge of BLOCK_SIDES) {
    const members = portsByEdge[edge];
    if (!members || members.length === 0) continue;
    // A plain descendant query, not `:scope >`: the rail is a grandchild of
    // THIS wrapper (`BlockPort` renders its own `[data-slot="block-port"]`
    // div one level in between), unlike `blockPort.tsx`'s own
    // `useBlockBands`, which queries from directly inside that inner div
    // where header/footer/rails really are direct children.
    const rail = wrapper.querySelector<HTMLElement>(`[data-slot="block-port-rail"][data-edge="${edge}"]`);
    if (!rail) continue;
    const collapsed = rail.dataset.collapsed === "true";
    // The same dots `railDotCentres` would select, in the same DOM order —
    // reusing its selector/ordering contract (module doc above explains
    // why not its screen-space RESULT).
    const dots = Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-dot"]'));
    if (dots.length === 0) continue;
    members.forEach((port, index) => {
      const dot = collapsed ? dots[0] : dots[index];
      if (!dot) return;
      const centre = localCentreWithin(dot, wrapper);
      if (!centre) return;
      placements.push({
        id: port.id,
        type: reactFlowHandleType(port.direction),
        // The one call site the module doc names: `HandlePosition`'s
        // runtime values are `Position`'s runtime values by construction
        // (`BLOCK_SIDE_TO_HANDLE_POSITION`'s own doc), so this is a type
        // widening, not a value transformation.
        position: BLOCK_SIDE_TO_HANDLE_POSITION[edge] as Position,
        left: centre.x,
        top: centre.y,
      });
    });
  }
  return placements;
}

export function BlockNodeReactflow({ id, data }: NodeProps<BlockNodeReactflowType>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [handles, setHandles] = useState<HandlePlacement[]>([]);

  const ports = data.ports ?? [];
  const view: BlockView = data.view ?? "port";
  const portsByEdge = useMemo(() => groupPortsByEdge(ports), [ports]);
  const edges = useMemo(() => {
    const spec: Partial<Record<BlockSide, BlockEdgeSpec>> = {};
    for (const side of BLOCK_SIDES) {
      const members = portsByEdge[side];
      if (members) spec[side] = { items: toPortEdgeItems(members) };
    }
    return spec;
  }, [portsByEdge]);
  const layoutKey = handleLayoutKey(view, portsByEdge);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => setHandles(measureHandlePlacements(wrapper, portsByEdge));
    measure();

    // `ResizeObserver` alone is not enough: `BlockPort`'s bands settle one
    // extra commit after mount (its own `useLayoutEffect`, `bands` starting
    // `null`), which adds rail elements to the DOM without necessarily
    // changing THIS wrapper's own box size. The `MutationObserver` catches
    // that structural change; the `ResizeObserver` catches every later size
    // change (a label wrapping, a member added) that does not.
    //
    // WHY no `attributeFilter` (found empirically, 2026-09-18, chasing a
    // Handle that landed at a real-but-STALE position — same coordinates a
    // rail had occupied one settle-pass earlier): a rail's OWN band
    // settling can move it via a pure `style` attribute change (`railBoxFor`
    // recomputing `top`/`left` against a refined `BlockBands`, no element
    // added or removed) — a first cut here that only watched
    // `data-collapsed`/`data-rail-band` missed exactly that mutation and
    // left a Handle frozen at the rail's PREVIOUS position. Watching every
    // attribute is the correct fix, not a wider guess: this callback fires
    // on band settling, which is bursty (a handful of commits right after
    // mount), never on steady-state DOM.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(wrapper);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(wrapper, { childList: true, subtree: true, attributes: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layoutKey` is
    // the deliberately-narrowed dependency (module doc, `handleLayoutKey`):
    // `portsByEdge` is recreated every render, but only a `layoutKey` change
    // means the rendered rails actually moved.
  }, [layoutKey]);

  return (
    <div ref={wrapperRef} data-slot="block-node-reactflow" style={{ position: "relative", width: "max-content" }}>
      <BlockPort id={id} view={view} portLayout={data.portLayout} collapsePorts={data.collapsePorts} diameter={data.diameter} edges={edges}>
        <Block header={data.header} body={data.body} footer={data.footer} width={data.width} height={data.height} />
      </BlockPort>
      {handles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          data-slot="block-node-reactflow-handle"
          style={{
            position: "absolute",
            left: handle.left,
            top: handle.top,
            transform: "translate(-50%, -50%)",
            width: PORT_HIT_PX,
            height: PORT_HIT_PX,
            background: "transparent",
            border: "none",
            borderRadius: "50%",
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
