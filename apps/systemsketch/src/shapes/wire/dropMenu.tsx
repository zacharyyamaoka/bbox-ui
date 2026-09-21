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
// The five rows it offers, and why they are those five, live next door in
// `./edgeDropCatalog.ts` — the pure half, so the table and the port specs it
// mints are unit-testable without a browser. This file is the React half.
//
// CARD 23's rule, which this file exists to honour: the convenience gesture
// routes through the SAME judge as the raw press. `judge` below calls
// `validateConnectionAtLevel` with `connectionVocabulary` — the identical
// options `wireGesture.commit` uses, at the identical level — over a scene
// with the candidate node hypothetically added. One gate, no second entry
// point; JointJS's `Connect` tool skipping `validateMagnet` where its raw
// press gates it is the exact failure that rule rules out. Ruling 3 makes that
// sharing load-bearing rather than tidy: a catalogue that offered an entry the
// raw press would then refuse is a menu that lies.
import { useCallback, useMemo } from "react";
import { createShapeId, useEditor, useValue } from "tldraw";

import { EdgeDropMenu } from "@trunk/editor/edgeDropMenu";
import { catalogFor } from "@trunk/editor/nodeCatalog";
import { validateConnectionAtLevel } from "@trunk/scene/validationLevel";

import { sceneFromRecords, type DocNodeData, type DocumentScene } from "../../document/sceneFromStore";
import type { BlockShape } from "../block";
import { InFlightWire } from "./WireFace";
import { BLOCK_SHAPE_TYPE } from "../types";
import { createWire } from "./createWire";
import { EDGE_DROP_CATALOG, landingPortId, presetDocPorts, presetPorts, type EdgeDropPreset } from "./edgeDropCatalog";
import { connectionVocabulary, pendingEdgeDrop, type PendingEdgeDrop } from "./wireGesture";
import { useValidationLevel } from "../../chrome/ShareMenu/validationLevelHost";

/** The id the hypothetical node wears while the judge looks at it. Never
 *  persisted — the real shape id is minted in `onPick`, after a verdict. */
const CANDIDATE_NODE_ID = "ss-drop-candidate";
const CANDIDATE_EDGE_ID = "ss-drop-candidate-edge";

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
  // The same level `wireGesture.commit` reads at pointer-up (ruling 3), through
  // the same module store — subscribed here rather than read once so a level
  // changed while a drop is pending re-greys the catalogue instead of offering
  // an entry the press would refuse.
  const level = useValidationLevel();

  const want = pending?.want;
  const entries = useMemo(() => (want ? catalogFor(EDGE_DROP_CATALOG, want) : []), [want]);

  /**
   * Would the cable this entry would create be legal? Asked over a
   * HYPOTHETICAL scene with the entry's node already in it — because the node
   * does not exist yet, and `dangling-edge` (the first gate, and rightly
   * structural) would otherwise refuse every entry for naming a node the
   * scene has never heard of.
   */
  const judge = useCallback(
    (entry: EdgeDropPreset) => {
      if (!pending) return false;
      const ends = candidateEdge(pending, CANDIDATE_NODE_ID, entry);
      if (!ends) return false;
      const data: DocNodeData = {
        kind: "block",
        name: entry.label,
        view: entry.view,
        // The SAME table `onPick` mints the real ports from, in the
        // id-only spelling the scene speaks — so what the judge examined
        // and what gets created cannot drift, whatever the preset's arity.
        ports: presetDocPorts(entry),
      };
      const hypothetical: DocumentScene = {
        nodes: [...scene.nodes, { id: CANDIDATE_NODE_ID, type: "block", position: pending.page, data }],
        edges: scene.edges,
      };
      return validateConnectionAtLevel(hypothetical, ends, level, connectionVocabulary(hypothetical)).allowed;
    },
    [level, pending, scene],
  );

  const onPick = useCallback(
    (entry: EdgeDropPreset) => {
      if (!pending) return;
      const nodeId = createShapeId();
      const wantsConsumer = pending.want.direction === "sink";
      // The new block is placed so that the dot the cable lands on sits near
      // where the cable was DROPPED, not so its corner does: a consumer's
      // `in` dot is on its left wall, a producer's `out` dot on its right, so
      // the two cases offset opposite ways. Vertically centred either way.
      //
      // The box comes from the PRESET, not from one pair of module constants:
      // a Group is 320x240 and a Branch is taller than a Block, so a shared
      // constant would put four of the five offers in the wrong place.
      // Placing the landing DOT rather than the box centre is W1-25's job and
      // deliberately not done here.
      const x = wantsConsumer ? pending.page.x : pending.page.x - entry.w;
      const y = pending.page.y - entry.h / 2;
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
            view: entry.view,
            w: entry.w,
            h: entry.h,
            // The offered ports inherit the anchored port's declared type, so
            // the cable the user just asked for is type-agreeing by
            // construction rather than by luck (`presetPorts`' own WHY).
            ports: presetPorts(entry, pending.want.types?.[0] ?? ""),
          },
        });
        // Non-null: `catalogFor` already filtered this list on exactly the
        // polarity `candidateEdge` needs a dot for, and `judge` refused every
        // entry it came back `null` for — so an entry that reaches here has
        // one. Asserted from the other side in `edgeDropCatalog.test.ts`.
        const bound = candidateEdge(pending, nodeId, entry)!;
        createWire(editor, {
          from: { nodeId: bound.source, portId: bound.sourceHandle },
          to: { nodeId: bound.target, portId: bound.targetHandle },
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

/** The candidate edge for `nodeId` answering `pending` with `entry`, oriented
 *  so the anchored end keeps the role it already has: a cable wanting a
 *  CONSUMER runs anchored → new, one wanting a PRODUCER runs new → anchored.
 *  Shared by the judge and `onPick` so the edge examined is the edge created.
 *
 *  `null` when the preset has no dot on the rail the cable needs — unreachable
 *  from the menu (`catalogFor` filters on exactly that polarity before the
 *  judge ever runs), so it is a total signature rather than a second opinion. */
function candidateEdge(
  pending: PendingEdgeDrop,
  nodeId: string,
  entry: EdgeDropPreset,
): { id: string; source: string; sourceHandle: string; target: string; targetHandle: string } | null {
  const portId = landingPortId(entry, pending.want.direction);
  if (portId === undefined) return null;
  return pending.want.direction === "sink"
    ? { id: CANDIDATE_EDGE_ID, source: pending.from.nodeId, sourceHandle: pending.from.portId, target: nodeId, targetHandle: portId }
    : { id: CANDIDATE_EDGE_ID, source: nodeId, sourceHandle: portId, target: pending.from.nodeId, targetHandle: pending.from.portId };
}

/** The box `EdgeDropMenu` clamps itself inside: the editor container's own
 *  size, which is the frame `.tl-canvas__in-front` fills and the frame
 *  `pending.anchor` is relative to. */
function viewportOf(editor: { getContainer(): HTMLElement }): { width: number; height: number } {
  const rect = editor.getContainer().getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
