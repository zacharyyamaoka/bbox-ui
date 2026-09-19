// src/shapes/wire/dropMenu.tsx — `wireKit.Overlay`: the offer a loose cable
// end makes when it lands on nothing.
//
// "A cable that landed on nothing is a question, not a mistake"
// (@trunk/editor/README.md, card 14). The chrome is the trunk's
// `EdgeDropMenu`; this file is the HOST ADAPTER the trunk's own
// `EdgeDropMenu.stories.tsx` establishes the pattern for — it owns the
// gesture (`./wireGesture.ts`), the catalog, and what picking one MEANS; the
// kit component owns none of that.
//
// CARD 23's rule, which this file exists to honour: the convenience gesture
// routes through the SAME judge as the raw press. `judge` below calls
// `validateConnection` with `connectionRules` — the identical options
// `wireGesture.commit` uses — over a scene with the candidate node
// hypothetically added. One gate, no second entry point; JointJS's `Connect`
// tool skipping `validateMagnet` where its raw press gates it is the exact
// failure that rule rules out.
import { useCallback, useMemo } from "react";
import { createShapeId, useEditor, useValue } from "tldraw";

import { EdgeDropMenu } from "@trunk/editor/edgeDropMenu";
import { catalogFor, type NodeCatalogEntry } from "@trunk/editor/nodeCatalog";
import { validateConnection } from "@trunk/scene/edgeValidation";

import { sceneFromRecords, type DocNodeData, type DocumentScene } from "../../document/sceneFromStore";
import type { BlockShape } from "../block";
import { InFlightWire } from "./WireFace";
import { BLOCK_SHAPE_TYPE } from "../types";
import { createWire } from "./createWire";
import { connectionRules, pendingEdgeDrop, type PendingEdgeDrop } from "./wireGesture";

/** The id the hypothetical node wears while the judge looks at it. Never
 *  persisted — the real shape id is minted in `onPick`, after a verdict. */
const CANDIDATE_NODE_ID = "ss-drop-candidate";
const CANDIDATE_EDGE_ID = "ss-drop-candidate-edge";

/** The two port ids every offered node is created with. Deliberately the same
 *  two strings the entry advertises (`inputs: 1, outputs: 1`), so what the
 *  judge examined and what `onPick` builds cannot drift. */
const OFFERED_IN = "in";
const OFFERED_OUT = "out";

/**
 * What this app is willing to create from a loose end.
 *
 * ONE entry, and that is the point: "everything is really a block" (Zach, the
 * 2026-09-18 ASK). A function call, a definition, a class and — once L5 lands
 * — a loop's header contract are all `ss-block`, so a catalog of node KINDS
 * would be a catalog of one thing wearing four names. What actually varies is
 * a block's ports and its name, and that is authoring, not picking.
 *
 * The catalog is host-authored on purpose (`nodeCatalog.ts`'s own header: the
 * kit "ships no catalog of its own"), which is what leaves room for L4 to
 * grow this list into real presets — a `for` region, a code cell — without
 * touching the trunk.
 *
 * No `icon`: this app mounts no `GlyphResolverProvider`, so a `lucide:` name
 * would render an empty slot marked `data-unresolved` (glyph.tsx's own
 * contract). An absent icon renders the same empty slot honestly.
 */
const CATALOG: readonly NodeCatalogEntry[] = [
  { id: "block", label: "Block", kind: BLOCK_SHAPE_TYPE, inputs: 1, outputs: 1 },
];

/** The default box `ss-block` is created with — read from the contract rather
 *  than restated, so the placement below cannot drift from the shape. */
const BLOCK_W = 160;
const BLOCK_H = 100;

/**
 * This kit's ONE `components.InFrontOfTheCanvas` contribution: the cable
 * being dragged, and the question it asks when it lands on nothing. Two
 * things rather than one because they are two halves of the same gesture and
 * the registry gives a kit a single `Overlay` slot (src/shapes/registry.ts).
 */
export function WireDropMenuOverlay() {
  return (
    <>
      <InFlightWire />
      <EdgeDropOffer />
    </>
  );
}

function EdgeDropOffer() {
  const editor = useEditor();
  const pending = useValue(pendingEdgeDrop(editor));

  // The live document, as the judge and the placement both see it. `useValue`
  // rather than a plain read so a peer edit while the menu is open (another
  // agent's board, a collaborator) cannot leave the offer judging a scene
  // that no longer exists.
  const scene = useValue("ss drop scene", () => sceneFromRecords(editor.store.allRecords()), [editor]);

  const want = pending?.want;
  const entries = useMemo(() => (want ? catalogFor(CATALOG, want) : []), [want]);

  /**
   * Would the cable this entry would create be legal? Asked over a
   * HYPOTHETICAL scene with the entry's node already in it — because the node
   * does not exist yet, and `dangling-edge` (the first gate, and rightly
   * structural) would otherwise refuse every entry for naming a node the
   * scene has never heard of.
   */
  const judge = useCallback(
    (entry: NodeCatalogEntry) => {
      if (!pending) return false;
      const data: DocNodeData = {
        kind: "block",
        name: entry.label,
        view: "port",
        ports: { left: [OFFERED_IN], right: [OFFERED_OUT], top: [], bottom: [] },
      };
      const hypothetical: DocumentScene = {
        nodes: [...scene.nodes, { id: CANDIDATE_NODE_ID, type: "block", position: pending.page, data }],
        edges: scene.edges,
      };
      return validateConnection(hypothetical, candidateEdge(pending, CANDIDATE_NODE_ID), connectionRules(hypothetical)).allowed;
    },
    [pending, scene],
  );

  const onPick = useCallback(
    (entry: NodeCatalogEntry) => {
      if (!pending) return;
      const nodeId = createShapeId();
      const wantsConsumer = pending.want.direction === "sink";
      // The new block is placed so that the dot the cable lands on sits near
      // where the cable was DROPPED, not so its corner does: a consumer's
      // `in` dot is on its left wall, a producer's `out` dot on its right, so
      // the two cases offset opposite ways. Vertically centred either way.
      const x = wantsConsumer ? pending.page.x : pending.page.x - BLOCK_W;
      const y = pending.page.y - BLOCK_H / 2;
      // ONE transaction: the node and its cable are one thing the user did,
      // so they are one undo step and — through `editEventsFromDiff` — one
      // batch of edit events.
      editor.markHistoryStoppingPoint("insert from edge drop");
      editor.run(() => {
        editor.createShape<BlockShape>({
          id: nodeId,
          type: BLOCK_SHAPE_TYPE,
          parentId: editor.getCurrentPageId(),
          x,
          y,
          props: {
            name: entry.label,
            view: "port",
            ports: {
              // The offered port inherits the anchored port's declared type,
              // so the cable the user just asked for is type-agreeing by
              // construction rather than by luck. `""` when the anchored end
              // declares none — the same "empty is unset" reading
              // `sceneFromRecords` applies.
              left: [{ id: OFFERED_IN, name: OFFERED_IN, type: pending.want.types?.[0] ?? "" }],
              right: [{ id: OFFERED_OUT, name: OFFERED_OUT, type: pending.want.types?.[0] ?? "" }],
              top: [],
              bottom: [],
            },
          },
        });
        const ends = candidateEdge(pending, nodeId);
        createWire(editor, {
          from: { nodeId: ends.source, portId: ends.sourceHandle },
          to: { nodeId: ends.target, portId: ends.targetHandle },
        });
      });
      pendingEdgeDrop(editor).set(null);
    },
    [editor, pending],
  );

  const onDismiss = useCallback(() => {
    pendingEdgeDrop(editor).set(null);
  }, [editor]);

  if (!pending) return null;

  return (
    // `.tl-canvas__in-front` is `position: absolute; inset: 0;
    // pointer-events: none` on the editor container (@tldraw/editor's
    // editor.css:325-330), so it is already the positioned frame
    // `EdgeDropMenu`'s own `absolute` needs and already the frame
    // `pending.anchor` was measured against. This layer adds nothing but a
    // name; the menu itself takes the pointer back with `pointer-events-auto`.
    <div data-slot="edge-drop-menu-layer" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <EdgeDropMenu
        className="pointer-events-auto"
        anchor={pending.anchor}
        viewport={viewportOf(editor)}
        entries={entries}
        judge={judge}
        onPick={onPick}
        onDismiss={onDismiss}
        // A cable needing a CONSUMER reaches to the right, so the menu opens
        // to the right of where it landed and never covers the run the user
        // just drew. `placeEdgeDropMenu` flips it when that does not fit.
        preferSide={pending.want.direction === "sink" ? "end" : "start"}
      />
    </div>
  );
}

/** The candidate edge for `nodeId` answering `pending`, oriented so the
 *  anchored end keeps the role it already has: a cable wanting a CONSUMER
 *  runs anchored → new, one wanting a PRODUCER runs new → anchored. Shared by
 *  the judge and `onPick` so the edge examined is the edge created. */
function candidateEdge(
  pending: PendingEdgeDrop,
  nodeId: string,
): { id: string; source: string; sourceHandle: string; target: string; targetHandle: string } {
  return pending.want.direction === "sink"
    ? { id: CANDIDATE_EDGE_ID, source: pending.from.nodeId, sourceHandle: pending.from.portId, target: nodeId, targetHandle: OFFERED_IN }
    : { id: CANDIDATE_EDGE_ID, source: nodeId, sourceHandle: OFFERED_OUT, target: pending.from.nodeId, targetHandle: pending.from.portId };
}

/** The box `EdgeDropMenu` clamps itself inside: the editor container's own
 *  size, which is the frame `.tl-canvas__in-front` fills and the frame
 *  `pending.anchor` is relative to. */
function viewportOf(editor: { getContainer(): HTMLElement }): { width: number; height: number } {
  const rect = editor.getContainer().getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
