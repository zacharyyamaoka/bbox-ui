// src/hosts/nodeViews.tsx — the shared scene→view-kit renderer both hosts
// mount. One node record in, one composed view-kit element out; the
// components themselves stay props-in DOM-out and never learn a host
// exists (the same adapter licence `sceneWires.ts` claims: this module may
// know both vocabularies; the kits it bridges never import each other).
//
// WHY one shared module instead of a renderer per host: the host-facing
// component names (glyph/code/block/value) and how each dresses a node are
// the CONTRACT the hosts have in common — H6's "renders in both hosts
// under its host-facing name" is only one claim if there is only one
// mapping. A third host imports this file and owns nothing but its
// viewport.

import { useRef, type ReactNode } from "react";
import { CircleStop, RotateCw } from "lucide-react";

import { Badge } from "../components/badge";
import { Bar } from "../components/bar";
import { Block } from "../components/block";
import { BlockPort, type BlockEdgeSpec } from "../components/blockPort";
import type { BlockMember } from "../components/blockMembers";
import { CodeEditor } from "../components/codeEditor";
import { FoldingChevron } from "../components/foldingChevron";
import { Glyph } from "../components/glyph";
import type { Diagnostic } from "../components/highlighter";
import type { PortEdgeItem } from "../components/portEdge";
import type { Distribution } from "../components/portEdge.layout";
import type { BlockSide } from "../components/port.layout";
import { Region, REGION_CORNER_BLOCK_STYLE, type RegionArm } from "../components/region";
import { REGION_CARD_WIDTH_PX, REGION_CORNER_WIDTH_PX } from "../components/region.layout";
import { portViewSlotCount, railBandHeightForSlots, resolveBlockHeight } from "../scene/fitToContent";
import { ValueCapsule } from "../components/block.value";
import { armsOf, bodyChildrenOf, describeHidden, hiddenSummary } from "../scene/controlFlow";
import type { PromotedPort } from "../scene/boundary";
import type { OpaqueRegionView } from "../scene/regionView";
import { producerCounts } from "../scene/producers";
import { childrenOf, portKey, type SceneNode, wiredPorts } from "../scene/scene";
import { withWiredState } from "../scene/sceneWires";
import { useAutoFitHeight } from "./blockAutoFit";
import { type HostNodeData, type HostScene } from "./hostScene";
import { useFreeMemberDrag, type UseFreeMemberDragResult } from "./memberDrag";
import { regionViewOf, toggleRegionView } from "./regionScene";

/**
 * The story-lane decoration seam (2026-09-18, "final spec" lane, D7's
 * "Story lane... adds-only `decorate` seam"). One node in, an optional
 * decoration out — the SAME shape every host thread untouched, so a
 * story wires `connectionAvailability`/`surfaceFindings` (scene kit) to
 * paint (`Block.diagnostics`, `Port.availability`/`.diagnostics`) without
 * this file, or any host, ever importing the scene kit itself (the
 * layering.test.ts import wall this lane's sibling built covers
 * `src/components/**` only — `src/hosts/**` is story-adjacent glue, not
 * component-kit source, and is where the scene->paint translation is
 * meant to happen). `undefined` (the default, every existing story) is
 * zero paint change — nothing here alters a byte of prior output when no
 * `decorate` is passed.
 */
export interface SceneNodeDecoration {
  /** Forwarded to this node's own `Block.diagnostics` — ruling 3's "if
   *  something is hidden the parent that hides it should get the error"
   *  lands here once a story runs `surfaceFindings` and looks up this
   *  node's carrier bucket. */
  diagnostics?: Diagnostic[];
  /** Per-port availability, keyed by the port's OWN id (not portKey — a
   *  decoration is already scoped to one node by the call). Forwarded onto
   *  each port's `PortEdgeItem.availability`. */
  availability?: Readonly<Record<string, "available" | "unavailable">>;
  /** Per-port diagnostics, same per-node key shape as `availability`. */
  portDiagnostics?: Readonly<Record<string, Diagnostic[]>>;
}

/** `undefined` for a node this decorator has no opinion on — same
 *  "absence is not evidence" convention `PortsOf` (lint.ts) already uses. */
export type Decorate = (node: SceneNode<HostNodeData>) => SceneNodeDecoration | undefined;

/**
 * The one cross-host pointer-ownership marker.
 *
 * SystemSketch was checked for the "general function that works for both
 * hosts" (Zach's hunch) and does not have one — each tldraw-side dnd
 * surface independently clones the pointerdown, hides the clone from the
 * canvas with `editor.markEventAsHandled(clone)`, and re-dispatches it at
 * its own DndContext (src/blocks/memberStackDnd.tsx:44-46,485;
 * src/blocks/ports/CommunicationPortDnd.tsx:193-196). What IS portable is
 * not a function but a MARKER on the DOM boundary: "this subtree owns its
 * pointer; the canvas must not start a gesture here."
 *
 * The spelling is React Flow's own default `noDragClassName` ("nodrag"),
 * so the React Flow host honors it with ZERO adapter code — its drag
 * filter already rejects any pointerdown whose target sits under this
 * class. The DOM host has no gestures, so the class is inert there. A
 * phase-2 tldraw host maps the same marker in its ShapeUtil's
 * onPointerDown: `if (target.closest(".nodrag")) editor.markEventAsHandled
 * (…)` — SystemSketch's mechanism, keyed off this one shared boundary.
 */
export const POINTER_OWNED_CLASS = "nodrag";

/** The donor bench's header-hugging distribution (Scene.stories.tsx's
 *  ANCHOR_START, same values). */
const ANCHOR_START: Distribution = { mode: "aligned", anchor: "start", gap: 24, edgePadding: 16 };

/**
 * How a host reorders one wall of one node, expressed as a scene write —
 * "the host measures/moves and writes the result back into the scene as
 * data" (ARCHITECTURE.md's measurement rule, applied to order). Pure;
 * unknown node or side returns the same scene object (the kit's own no-op
 * contract).
 */
export function reorderNodePorts(scene: HostScene, nodeId: string, side: BlockSide, order: string[]): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !node.data.ports?.[side]) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((candidate) =>
      candidate.id === nodeId ? { ...candidate, data: { ...candidate.data, ports: { ...candidate.data.ports, [side]: order } } } : candidate,
    ),
  };
}

/** A host writing one node's data back — e.g. the Code face's per-keystroke
 *  `onWrite`. Same total, referentially-honest shape as `reorderNodePorts`. */
export function writeNodeData(scene: HostScene, nodeId: string, patch: Partial<HostNodeData>): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((candidate) => (candidate.id === nodeId ? { ...candidate, data: { ...candidate.data, ...patch } } : candidate)),
  };
}

/**
 * A free-layout member settling at rest, written into its OWN `position` —
 * `SceneNode.position`'s already-documented meaning for a `parentId` node
 * (scene.ts:60-72: "the node's authored at-rest placement, in the PARENT's
 * coordinate space... a host mid-drag owns the moving copy and writes back
 * here at rest"). `memberDrag.ts`'s `useFreeMemberDrag` is the "mid-drag"
 * half; this is the "writes back here at rest" half. No-op, same
 * referentially-honest shape as `writeNodeData`/`reorderNodePorts`, if the
 * position did not actually change (a click that never moved, or a drag
 * clamped straight back to where it started).
 */
export function moveMember(scene: HostScene, memberId: string, position: { x: number; y: number }): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === memberId);
  if (!node || (node.position.x === position.x && node.position.y === position.y)) return scene;
  return {
    ...scene,
    nodes: scene.nodes.map((candidate) => (candidate.id === memberId ? { ...candidate, position } : candidate)),
  };
}

export interface SceneNodeViewProps {
  scene: HostScene;
  node: SceneNode<HostNodeData>;
  /** `wiredPorts(scene)` — computed once by the host per render, not per
   *  node. Optional so a single-component bench can omit it. */
  wired?: ReadonlySet<string>;
  /**
   * `producerCounts(scene)` — how many cable ends meet each port, keyed by
   * `portKey`. Computed once per render by the host, from the SAME scene
   * `wired` came from (the painted projection), and handed to every port
   * item as `producers`. Omitted = no counts, byte-identical to before this
   * prop existed.
   */
  producers?: ReadonlyMap<string, number>;
  /** The write-back seam. Omitted = a read-only specimen (reorders and
   *  keystrokes no-op, exactly like an uncontrolled gallery card). */
  onSceneChange?(next: HostScene): void;
  /** The story lane's paint seam — see `Decorate`'s own doc. Omitted =
   *  byte-identical to before this prop existed. */
  decorate?: Decorate;
  /**
   * `projectHostScene(scene).regions`, keyed by region id — the CARD data
   * for every OUTERMOST opaque region: its promoted ports and what it
   * hides. The host computes the projection once per render (it also needs
   * it for `wired` and for the edges it paints) and hands the result down
   * rather than every region re-deriving its own, which would run
   * `classifyBoundary` once per region per render and, worse, let a card
   * disagree with the wires aimed at it.
   *
   * Omitted (every bench that predates lane E, and every all-expanded
   * scene) = the region renders from the scene alone: an all-expanded
   * projection is the identity, so there is nothing to hand down.
   */
  regionViews?: ReadonlyMap<string, OpaqueRegionView>;
}

/* ------------------------------------------------------------------ */
/* Shared between `BlockNodeView` and `RegionNodeView`                   */
/* ------------------------------------------------------------------ */

/**
 * One free-layout member: its live (dragging) position plus the bounded
 * drag surface `POINTER_OWNED_CLASS` keeps the canvas out of. Extracted
 * when the region renderer landed rather than copied — a second copy of
 * this wrapper is how the two would drift into dragging differently, and
 * the marker/stopPropagation pair is exactly the part that must not.
 */
function freeMemberOf(kid: SceneNode<HostNodeData>, drag: UseFreeMemberDragResult, content: ReactNode): BlockMember {
  const live = drag.liveFor(kid.id, kid.position);
  return {
    id: kid.id,
    x: live.x,
    y: live.y,
    content: (
      <div
        data-slot="block-member-drag-handle"
        data-dragging={drag.draggingId === kid.id || undefined}
        // POINTER_OWNED_CLASS: this drag is bounded to the member's own
        // box (ARCHITECTURE.md's "component-owned" gesture class), never
        // the canvas underneath — see memberDrag.ts's own header. The
        // SAME marker React Flow's `nodrag` filter and tldraw's
        // `contentOwnsPress` (this file, `POINTER_OWNED_CLASS`'s own doc)
        // already both honor, with zero per-host code added for it.
        className={POINTER_OWNED_CLASS}
        style={{ width: "max-content", cursor: drag.draggingId === kid.id ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={drag.beginDrag(kid.id, kid.position)}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
      >
        {content}
      </div>
    ),
  };
}

/**
 * `items`, each carrying `producers` — the number of cable ends meeting that
 * port (`producerCounts`, lane `producers-count`). Unwired ports are left
 * untouched (the item object is the same one that came in), so a scene with
 * no edges renders byte-identically to before counts existed.
 *
 * WHY the RAW count goes onto the item, 1 included, and the "only 2 or more
 * shows a number" rule is not applied here: a single cable needs no number —
 * the dot's wired look already says "one", and a "1" on every wired port
 * would be noise — but that is a PAINT decision, and it has one owner,
 * `Port`'s own `producers >= 2` (components/port.tsx). A second threshold
 * here would be a second place for the rule to drift; the host's job is to
 * say what the scene says.
 */
function withProducers(items: PortEdgeItem[], nodeId: string, producers: ReadonlyMap<string, number> | undefined): PortEdgeItem[] {
  if (!producers || producers.size === 0) return items;
  return items.map((item) => {
    const count = producers.get(portKey(nodeId, item.id));
    return count === undefined ? item : { ...item, producers: count };
  });
}

/** One node's walls as `BlockPort` edge specs — the port items, their wired
 *  state, any decoration, and the reorder write-back. Shared verbatim by a
 *  block's own card and a region's CORNER card, because a region's ports
 *  ARE a block's ports (plan §2.A) and a second builder here would be the
 *  first place that stopped being true. */
function edgeSpecsOf(
  scene: HostScene,
  node: SceneNode<HostNodeData>,
  wired: ReadonlySet<string> | undefined,
  producers: ReadonlyMap<string, number> | undefined,
  onSceneChange: ((next: HostScene) => void) | undefined,
  decoration: SceneNodeDecoration | undefined,
): Partial<Record<BlockSide, BlockEdgeSpec>> {
  return Object.fromEntries(
    Object.entries(node.data.ports ?? {}).map(([side, portIds]) => [
      side,
      {
        items: withProducers(
          withWiredState(
            portIds.map(
              (id): PortEdgeItem => ({
                id,
                // WHY the id is still the fallback: a port with no authored
                // name has nothing truer to show than what every edge and
                // every edit event already calls it (hostScene.ts's
                // `portLabels`).
                label: node.data.portLabels?.[id] ?? id,
                availability: decoration?.availability?.[id],
                diagnostics: decoration?.portDiagnostics?.[id],
              }),
            ),
            node.id,
            wired ?? new Set(),
          ),
          node.id,
          producers,
        ),
        distribution: node.data.anchorStart?.includes(side as BlockSide) ? ANCHOR_START : undefined,
        onItemsChange: onSceneChange
          ? (items: PortEdgeItem[]) => onSceneChange(reorderNodePorts(scene, node.id, side as BlockSide, items.map((item) => item.id)))
          : undefined,
      } satisfies BlockEdgeSpec,
    ]),
  );
}

/**
 * The opaque card's walls: the region's own `edgeSpecsOf` result with one
 * extra seat per promoted port, on the side `promoteBoundary` decided.
 *
 * WHY the item's `id` is the promoted port id (`portKey(inner)` by default)
 * while its `label` is the INNER port's own name: the id has to be what the
 * projected edge names, or no wire resolves — `WireLayer` walks
 * `[data-block-id="<region>"]` → `[data-port-id="<promoted id>"]`, and React
 * Flow/tldraw key their handle and anchor off the same string. The label is
 * what a reader needs, and a reader does not need `merge/pose`: the card
 * already says which region it is, so the useful half is the inner port's
 * own name, `pose`. Truthful rendering is preserved because the complete id
 * is still the dot's `data-port-id` — nothing is clipped or substituted, the
 * two strings simply carry different jobs.
 *
 * `onItemsChange` is dropped on any wall that gained a promoted seat: a rail
 * reorder writes `data.ports[side]` back to the scene (`reorderNodePorts`),
 * and a projected port is not in `data.ports` — persisting that order would
 * write a promoted id into the document, which is exactly the mutation the
 * projection exists to avoid.
 */
function withPromotedPorts(
  base: Partial<Record<BlockSide, BlockEdgeSpec>>,
  nodeId: string,
  ports: readonly PromotedPort[] | undefined,
  wired: ReadonlySet<string> | undefined,
  producers: ReadonlyMap<string, number> | undefined,
): Partial<Record<BlockSide, BlockEdgeSpec>> {
  if (!ports || ports.length === 0) return base;
  const merged: Partial<Record<BlockSide, BlockEdgeSpec>> = { ...base };
  for (const port of ports) {
    const spec = merged[port.side];
    // A promoted seat counts the cables the PROJECTION re-pointed at it —
    // the host computed `producers` from the painted scene, so three
    // crossing cables into one hidden port read "3" on the card, exactly
    // what is drawn landing there.
    const item = withProducers(withWiredState([{ id: port.id, label: port.inner.portId }], nodeId, wired ?? new Set()), nodeId, producers);
    merged[port.side] = { ...spec, items: [...(spec?.items ?? []), ...item], onItemsChange: undefined };
  }
  return merged;
}

/** A control-exit mark: DP - Break & Continue, B5 — "a mark beside the
 *  call, never a cable". Drawn as a `Badge`, and deliberately given NO port
 *  and NO edge: `expectControlMark` asserts no wire may originate at one,
 *  which only stays true because nothing here ever mints a handle for it. */
function ControlMark({ mark }: { mark: NonNullable<HostNodeData["marks"]>[number] }) {
  return (
    <Badge data-slot="control-mark" data-mark={mark} size="sm" variant="outline">
      {mark === "break" && <CircleStop aria-hidden />}
      {mark === "continue" && <RotateCw aria-hidden />}
      {mark}
    </Badge>
  );
}

/**
 * A node's header.
 *
 * WHY the plain string stays a plain string: every story that predates the
 * control-flow lane passes `header={node.data.name}` straight into `Block`,
 * and wrapping it in a `Bar` would change that markup for all of them. The
 * `Bar` form is reached ONLY when there is a chip to put on the right — a
 * `data.badge` ("iteration 3 of 7", the donor's `turn`) or a control mark —
 * so the DOM change is scoped to exactly the nodes that asked for one.
 */
function headerChipsOf(node: SceneNode<HostNodeData>): ReactNode | undefined {
  const marks = node.data.marks ?? [];
  if (node.data.badge === undefined && marks.length === 0) return undefined;
  return (
    <>
      {node.data.badge !== undefined && (
        <Badge size="sm" variant="secondary">
          {node.data.badge}
        </Badge>
      )}
      {marks.map((mark) => (
        <ControlMark key={mark} mark={mark} />
      ))}
    </>
  );
}

function headerOf(node: SceneNode<HostNodeData>): ReactNode {
  const chips = headerChipsOf(node);
  if (chips === undefined) return node.data.name;
  return <Bar size="md" left={node.data.name} right={chips} />;
}

/**
 * `fit-to-content-hosts` lane, 2026-09-18: `membersLayout: "free"` opts a
 * node into member-dragging + auto-fit height — see `HostNodeData`'s own
 * doc in `hostScene.ts`. Every hook below is called UNCONDITIONALLY (rules
 * of hooks forbid otherwise) but is INERT unless `isFree`/`autoFit`:
 * `useAutoFitHeight({enabled: false})` is a no-op returning `null`, and
 * `useFreeMemberDrag`'s state never moves unless `beginDrag` is actually
 * wired to a pointerdown, which only happens in the `isFree` branch below.
 * So a node with no `membersLayout` (every story that predates this lane)
 * renders through the EXACT same `members`/`membersLayout="stack"`/
 * `height={node.data.h}` path as before — verified by the full story
 * suite staying green with none of those stories' own code touched.
 */
function BlockNodeView({ scene, node, wired, producers, onSceneChange, decorate, regionViews }: SceneNodeViewProps) {
  const decoration = decorate?.(node);
  const isFree = node.data.membersLayout === "free";
  const autoFit = isFree && node.data.autoFit === true;
  const kids = childrenOf(scene, node.id);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const drag = useFreeMemberDrag({ onDragEnd: (id, next) => onSceneChange?.(moveMember(scene, id, next)) });
  // See `useAutoFitHeight`'s own doc for why this key — not just the
  // ResizeObserver it also runs — is what makes a live drag track
  // continuously rather than only catching up at release.
  const measureKey = isFree
    ? kids.map((kid) => {
        const p = drag.liveFor(kid.id, kid.position);
        return `${kid.id}:${p.x}:${p.y}`;
      }).join(",")
    : undefined;
  const fitHeightPx = useAutoFitHeight({ rootRef, enabled: autoFit, measureKey });

  const members: BlockMember[] = kids.map((kid) => {
    const content = (
      <SceneNodeView
        scene={scene}
        node={kid}
        wired={wired}
        producers={producers}
        onSceneChange={onSceneChange}
        decorate={decorate}
        regionViews={regionViews}
      />
    );
    if (!isFree) return { id: kid.id, content };
    return freeMemberOf(kid, drag, content);
  });
  const edges = edgeSpecsOf(scene, node, wired, producers, onSceneChange, decoration);
  const height = autoFit ? resolveBlockHeight({ autoFit: true, fitHeightPx, manualHeightPx: node.data.h }) : node.data.h;

  const block = (
    <BlockPort id={node.id} view={node.data.view ?? "simple"} edges={edges}>
      <Block
        header={headerOf(node)}
        width={node.data.w}
        height={height}
        members={members.length > 0 ? members : undefined}
        membersLayout={isFree ? "free" : "stack"}
        memberGutter={36}
        diagnostics={decoration?.diagnostics}
      />
    </BlockPort>
  );

  // `useAutoFitHeight` needs an ancestor to query `[data-slot="block"]`/
  // `[data-slot="block-members"]` inside of, and `BlockPort`'s own root
  // forwards no ref — so a `membersLayout: "free"` node gets ONE extra,
  // unstyled wrapper div. Every other node (unset, or `"stack"`) returns
  // `block` directly: zero DOM change from before this lane.
  return isFree ? <div ref={rootRef}>{block}</div> : block;
}

/* ------------------------------------------------------------------ */
/* The region                                                          */
/* ------------------------------------------------------------------ */

/**
 * One `type: "region"` scene node → the `Region` component.
 *
 * WHY there is no second node and no `data-block-id` on the frame (plan
 * §2.A): a region IS one node whose ports are its CORNER BLOCK's ports.
 * This function builds exactly one `BlockPort id={node.id}` — the same
 * builder a plain block gets (`edgeSpecsOf`) — and hands it to `Region` as
 * its `corner`. "Everything is a block" is therefore not a slogan here: a
 * loop's `Iterable` resolves through the identical `[data-block-id]` ->
 * `[data-port-id]` walk as any other port, so `WireLayer`, React Flow's
 * handles and tldraw's anchors all needed zero region-specific code.
 *
 * And no control cable exists anywhere in it: the arm STRUCTURE carries
 * the control flow (containment + rows), `break`/`continue` are marks
 * (`ControlMark`, B5), and the only wires are ordinary data edges into the
 * corner's ports or straight into a member.
 */
function RegionNodeView({ scene, node, wired, producers, onSceneChange, decorate, regionViews }: SceneNodeViewProps) {
  const decoration = decorate?.(node);
  const region = node.data.region ?? { kind: "group" as const };
  const view = regionViewOf(node);
  // Present only for an OUTERMOST opaque region — `projectOpaqueRegions`
  // gives a region nested inside another opaque one no card of its own,
  // because it is not on screen (regionView.ts's outermost-wins rule).
  const projected = regionViews?.get(node.id);

  // ONE drag instance for the whole region — the body's members and every
  // arm's. `useFreeMemberDrag` is keyed by member id (`liveFor(id, atRest)`
  // is a no-op for every id but the one in flight), and a hook per arm
  // would break the rules of hooks the moment an arm is added or removed.
  const drag = useFreeMemberDrag({ onDragEnd: (id, next) => onSceneChange?.(moveMember(scene, id, next)) });

  const memberViewOf = (kid: SceneNode<HostNodeData>) =>
    freeMemberOf(
      kid,
      drag,
      <SceneNodeView
        scene={scene}
        node={kid}
        wired={wired}
        producers={producers}
        onSceneChange={onSceneChange}
        decorate={decorate}
        regionViews={regionViews}
      />,
    );

  const opaque = view === "opaque";
  // WHY the corner card is given a BODY sized by the rail band, instead of
  // being left to hug its header: `BlockPort` places a port-view rail
  // against the Block's BODY band, and that band is measured as
  // "header bottom → block bottom" (blockPort.tsx's `useBlockBands`). A
  // header-only Block therefore has a zero-height band and its dots hang
  // BELOW the card, into the frame — which is the corner's own promise
  // ("height hugs the ports", REGION_CORNER_WIDTH_PX's doc) broken.
  // `railBandHeightForSlots` is the exact inverse of the rail's own pitch
  // clamp (fitToContent.ts's own derivation, round-trip-tested against the
  // REAL `railBoxFor`), so this is the stock number rather than a guess —
  // and an empty `slots` leaves `body` undefined, keeping a portless
  // region's card byte-identical to a plain hugging Block.
  // The card's walls: the region's OWN interface, plus — while opaque — one
  // seat per promoted port on the side `promoteBoundary` decided. "The
  // opaque card is the same block with more ports" (plan §5), literally:
  // the same `edgeSpecsOf` builder, the same rails, the same dot DOM, one
  // extra item per hidden endpoint.
  const cardEdges = withPromotedPorts(
    edgeSpecsOf(scene, node, wired, producers, onSceneChange, decoration),
    node.id,
    opaque ? projected?.ports : undefined,
    wired,
    producers,
  );
  const cornerSlots = portViewSlotCount({
    leftCount: cardEdges.left?.items.length ?? 0,
    rightCount: cardEdges.right?.items.length ?? 0,
    portLayout: "inline",
  });
  const corner = (
    <BlockPort id={node.id} view="port" edges={cardEdges}>
      <Block
        header={
          // WHY the chevron rides the corner card's own header in BOTH
          // views, in the SAME slot: the donor does exactly that
          // (pyblocks `viewer/nodes/RegionInterface.tsx:80` puts the fold
          // control in one slot expanded and collapsed), and it is what
          // makes the toggle discoverable from the card you are looking
          // at — an opaque card whose only affordance lived on the frame
          // could never be re-expanded, because the frame is what the
          // opaque view removes.
          <Bar
            size="md"
            left={
              <FoldingChevron
                open={!opaque}
                onClick={() => onSceneChange?.(toggleRegionView(scene, node.id))}
                aria-label={opaque ? "Expand region" : "Collapse region"}
                // POINTER_OWNED_CLASS: a canvas host must not start a node
                // drag on this press. React Flow's `nodeDragThreshold` would
                // otherwise swallow the click as the first 4px of a drag on
                // the header, which IS the region's drag handle
                // (`DRAG_HANDLE_FOR_TYPE`) — the toggle would work in the
                // DOM host and silently do nothing on a canvas.
                className={POINTER_OWNED_CLASS}
              />
            }
            center={node.data.name}
            right={headerChipsOf(node)}
          />
        }
        width={opaque ? REGION_CARD_WIDTH_PX : REGION_CORNER_WIDTH_PX}
        body={cornerSlots > 0 ? <div data-slot="region-corner-band" style={{ height: railBandHeightForSlots(cornerSlots) }} /> : undefined}
        // P5's "a card whose footer states what it hides", measured off the
        // scene by `hiddenSummary` — never a narrated sentence. The
        // projection's own count is preferred (it was computed against the
        // same scene the painted edges came from); `hiddenSummary` is the
        // fallback for a bench that renders an opaque region without
        // running the projection at all.
        footer={opaque ? <span data-slot="region-hidden">{describeHidden(projected?.hidden ?? hiddenSummary(scene, node.id))}</span> : undefined}
        // Expanded only: the corner's non-shared corners go square so the
        // card reads as PART of the frame (see REGION_CORNER_BLOCK_STYLE's
        // own WHY on the mechanism). An opaque card is a free-standing
        // card again and keeps its own radius.
        style={opaque ? undefined : REGION_CORNER_BLOCK_STYLE}
        diagnostics={decoration?.diagnostics}
      />
    </BlockPort>
  );

  const arms: RegionArm[] = armsOf(scene, node.id).map((arm) => ({
    id: arm.id,
    title: arm.data.name ?? arm.id,
    open: arm.data.arm?.open ?? true,
    onOpenChange: onSceneChange
      ? (open: boolean) => onSceneChange(writeNodeData(scene, arm.id, { arm: { ...arm.data.arm, open } }))
      : undefined,
    // No `activeArm` means every arm is active (donor branchModel.ts:11-12).
    active: region.activeArm === undefined || region.activeArm === arm.id,
    ...(arm.data.arm?.h === undefined ? null : { bodyHeight: arm.data.arm.h }),
    // A child of an ARM, not of the region: its `position` is in the ARM's
    // space (scene.ts:60-72), which is the whole reason arms are nodes —
    // folding a sibling arm moves rows, and an arm-relative child does not
    // have to be rewritten when it does (plan §2.C).
    members: childrenOf(scene, arm.id).map(memberViewOf),
  }));

  return (
    <Region
      id={node.id}
      kind={region.kind}
      view={view}
      corner={corner}
      {...(node.data.w === undefined ? null : { width: node.data.w })}
      {...(node.data.h === undefined ? null : { height: node.data.h })}
      members={bodyChildrenOf(scene, node.id).map(memberViewOf)}
      arms={arms}
    />
  );
}

/**
 * One scene node → the view-kit face its `type` names. Unknown/absent type
 * falls back to `block` — the honest general face, same default React
 * Flow's own `nodeTypes` lookup applies.
 */
export function SceneNodeView(props: SceneNodeViewProps): ReactNode {
  const { scene, node, wired, producers, onSceneChange } = props;
  switch (node.type) {
    case "glyph":
      return <Glyph content={node.data.content ?? ""} sizePreset="lg" />;
    case "code":
      return (
        <CodeEditor
          value={node.data.code ?? ""}
          onWrite={(next) => onSceneChange?.(writeNodeData(scene, node.id, { code: next }))}
          multiline
          columns={Math.max(8, ...(node.data.code ?? "").split("\n").map((line) => line.length))}
          ariaLabel={node.data.name ?? node.id}
          // The editor owns its pointer (caret, selection, in-editor drag);
          // the marker keeps a gesturing host out — see POINTER_OWNED_CLASS.
          className={POINTER_OWNED_CLASS}
        />
      );
    case "value":
      return (
        <ValueCapsule
          id={node.id}
          value={node.data.value ?? ""}
          width={node.data.w}
          height={node.data.h}
          onWrite={(next) => onSceneChange?.(writeNodeData(scene, node.id, { value: next }))}
          writers={withProducers(
            withWiredState((node.data.writers ?? []).map((id): PortEdgeItem => ({ id, label: id })), node.id, wired ?? new Set()),
            node.id,
            producers,
          )}
          readers={withProducers(
            withWiredState((node.data.readers ?? []).map((id): PortEdgeItem => ({ id, label: id })), node.id, wired ?? new Set()),
            node.id,
            producers,
          )}
          codeEditorProps={{ className: POINTER_OWNED_CLASS }}
        />
      );
    case "region":
      return <RegionNodeView {...props} />;
    case "block":
    default:
      return <BlockNodeView {...props} />;
  }
}

/** Recompute-once helper hosts share; re-exported so a host story never
 *  reaches into the scene kit for the common read. */
export function wiredPortsOf(scene: HostScene): Set<string> {
  return wiredPorts(scene);
}

/** The producer-count read, same recompute-once shape as `wiredPortsOf`:
 *  a host calls it on the scene it PAINTS and hands the map to
 *  `SceneNodeView` as `producers`. */
export function producerCountsOf(scene: HostScene): Map<string, number> {
  return producerCounts(scene);
}
