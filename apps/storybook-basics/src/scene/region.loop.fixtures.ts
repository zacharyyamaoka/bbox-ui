// src/scene/region.loop.fixtures.ts — the loop preset's benches, in the
// style `hosts/hostScene.ts`'s `HOST_SCENE` set: `HostScene` literals, one
// per board, shared by every host a story mounts them in.
//
// The boards are Zach's own sketches, transcribed rather than invented:
// `Pasted image 20260918145709.png` (the `for` with `merge()`/`smooth()`,
// the seed arriving from `estimate()` OUTSIDE the loop, the chip reading
// "iteration 3 of 7" and the dotted z⁻¹ bottom lane), `…145125.png` (the
// `While Loop` corner block with its condition ports on the left wall and
// NO right wall) and `…20260903175205.png` (a `while` whose `break` is an
// inline mark, never a cable).
//
// Every member carries `view: "port"` and an explicit `w`/`h`: the region's
// body is `BlockMembers layout="free"`, so a member's `position` is read as
// its (x, y) inside the body — the body starts UNDER the corner block
// (`regionLayout`'s `body.y = corner.h`), which is why body-space y values
// here are small while the frame still has a header-high band above them.

import type { HostScene } from "../hosts/hostScene";
import { carriedValueEdge, forLoopNode, whileLoopNode, LOOP_PORT_IDS } from "./region.loop";

/** Elbow routing is what makes a cable obey the keep-outs (lane D): a
 *  default-routed curve is drawn without obstacles at all. These boards are
 *  the ones the bypass rule is FOR, so every cable on them is orthogonal —
 *  which is also what Zach's sketches draw. */
const ELBOW = { routing: "elbow" } as const;

/** Nothing inside yet: the P1 frame, the corner block, and the typed
 *  unnamed header — `Iterable` in, `Iter` out, and no third thing. */
export const FOR_LOOP_EMPTY: HostScene = {
  nodes: [forLoopNode({ id: "loop", position: { x: 40, y: 30 }, w: 440, h: 280 })],
  edges: [],
};

/**
 * `for other in others:` — the whole grammar on one board
 * (`Pasted image 20260918145709.png`).
 *
 * Read it as the sketch reads: `run()` hands the collection to the header
 * (`others → Iterable`); the header hands out this turn's element
 * (`Iter → merge/other`) on an ordinary SOLID cable; the seed arrives from
 * `estimate()`, which lives OUTSIDE the loop and therefore runs once;
 * `merge() → smooth() → encode()` is the body's straight-through data path;
 * and `e-carry` is the one cable that comes back — `merge`'s own `Pose`
 * into its own `pose`, dotted, badged with the seed that stands in for it
 * on turn one.
 *
 * WHY the seed's cable crosses the frame straight into a member instead of
 * entering through a port on the region: V1 (plan §3.1) — the expanded
 * document has DIRECT crossing cables. The region's ports are its OWN
 * interface (what the loop consumes and emits), not a tunnel every value
 * that happens to be read inside has to be threaded through.
 */
export const FOR_LOOP_CARRIED: HostScene = {
  nodes: [
    { id: "run", type: "block", position: { x: 0, y: 60 }, data: { name: "run()", view: "port", w: 150, h: 90, ports: { right: ["others"] } } },
    { id: "estimate", type: "block", position: { x: 0, y: 250 }, data: { name: "estimate()", view: "port", w: 150, h: 90, ports: { right: ["pose"] } } },
    forLoopNode({ id: "loop", position: { x: 260, y: 30 }, w: 600, h: 300 }),
    {
      id: "merge",
      type: "block",
      parentId: "loop",
      // WHY the members hug the top of the body: "go to the end first, then
      // loop back" puts the back cable on the BOTTOM lane (DP - Loop), and
      // the router picks whichever side of the obstacle is cheaper. Leaving
      // a corridor above `merge` is what sends it over the top instead.
      position: { x: 180, y: 10 },
      data: { name: "merge()", view: "port", w: 160, h: 120, ports: { left: ["pose", "other"], right: ["Pose"] } },
    },
    {
      id: "smooth",
      type: "block",
      parentId: "loop",
      position: { x: 420, y: 10 },
      data: { name: "smooth()", view: "port", w: 150, h: 90, ports: { left: ["fused"], right: ["Pose"] } },
    },
    { id: "encode", type: "block", position: { x: 900, y: 140 }, data: { name: "encode()", view: "port", w: 150, h: 90, ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "e-iterable", source: "run", sourceHandle: "others", target: "loop", targetHandle: "Iterable", data: ELBOW },
    { id: "e-iter", source: "loop", sourceHandle: "Iter", target: "merge", targetHandle: "other", data: ELBOW },
    { id: "e-seed", source: "estimate", sourceHandle: "pose", target: "merge", targetHandle: "pose", data: ELBOW },
    { id: "e-ms", source: "merge", sourceHandle: "Pose", target: "smooth", targetHandle: "fused", data: ELBOW },
    { id: "e-out", source: "smooth", sourceHandle: "Pose", target: "encode", targetHandle: "pose", data: ELBOW },
    // The one cable that comes back. `estimate()` is named as the seed, so
    // the pill reads "z⁻¹ = estimate()" instead of the bare derived "z⁻¹" —
    // and the thing it names is a block you can see on this very board.
    carriedValueEdge({ id: "e-carry", nodeId: "merge", from: "Pose", to: "pose", seed: "estimate()" }),
  ],
};

/**
 * `while condition:` — `Pasted image 20260918145125.png` for the header,
 * DP - Loop for why there is a cable at all.
 *
 * The re-check is the point. An iterable is consumed once at entry; a
 * condition is evaluated AGAIN after every pass, and is usually derived
 * from state the body just produced. So `check/ok` runs back to the
 * header's `Bool` — visibly wired, one turn late (`delayed`), rather than
 * hidden inside a long title. It is still a DATA cable: what travels is the
 * Boolean, and the only thing "delayed" says is when it is read.
 */
export const WHILE_LOOP_RECHECK: HostScene = {
  nodes: [
    { id: "cond", type: "block", position: { x: 30, y: 40 }, data: { name: "ready()", view: "port", w: 170, h: 80, ports: { right: ["ok"] } } },
    whileLoopNode({ id: "loop", position: { x: 320, y: 40 }, w: 460, h: 300 }),
    {
      id: "step",
      type: "block",
      parentId: "loop",
      position: { x: 50, y: 30 },
      data: { name: "step()", view: "port", w: 150, h: 80, ports: { left: ["state"], right: ["next"] } },
    },
    {
      id: "check",
      type: "block",
      parentId: "loop",
      position: { x: 260, y: 30 },
      data: { name: "check()", view: "port", w: 150, h: 80, ports: { left: ["next"], right: ["ok"] } },
    },
  ],
  edges: [
    { id: "e-cond", source: "cond", sourceHandle: "ok", target: "loop", targetHandle: "Bool", data: ELBOW },
    { id: "e-sc", source: "step", sourceHandle: "next", target: "check", targetHandle: "next", data: ELBOW },
    { id: "e-recheck", source: "check", sourceHandle: "ok", target: "loop", targetHandle: "Bool", data: { variant: "delayed", ...ELBOW } },
  ],
};

/** The header chip — the donor's `turn` (`loopModel.ts:77-78`), generalised
 *  to any region's `data.badge`. It is a `Badge` in the corner block's
 *  header `Bar`; it mints no port, so nothing can ever wire to it. */
export const LOOP_WITH_TURN: HostScene = {
  nodes: [
    forLoopNode({ id: "loop", position: { x: 40, y: 30 }, w: 520, h: 260, badge: "iteration 3 of 7" }),
    {
      id: "accumulate",
      type: "block",
      parentId: "loop",
      position: { x: 170, y: 30 },
      data: { name: "accumulate()", view: "port", w: 180, h: 90, ports: { left: ["item"], right: ["total"] } },
    },
  ],
  edges: [{ id: "e-iter", source: "loop", sourceHandle: "Iter", target: "accumulate", targetHandle: "item", data: ELBOW }],
};

/**
 * `break`, as `Pasted image 20260903175205.png` draws it: a mark beside the
 * call, inside a `while` (B5, DP - Break & Continue — "break is not data
 * flow", and ten marks were drawn against that constraint before this one
 * won).
 *
 * WHY there is no edge leaving `check` here, and no `break` port on it: the
 * exit IS the mark. The tempting alternative — a cable from `check` to the
 * loop's frame meaning "leave now" — is a control line drawn as data, and
 * `expectControlMark` asserts mechanically that no wire originates at one.
 */
export const LOOP_WITH_BREAK: HostScene = {
  nodes: [
    { id: "cond", type: "block", position: { x: 30, y: 40 }, data: { name: "ready()", view: "port", w: 170, h: 80, ports: { right: ["ok"] } } },
    whileLoopNode({ id: "loop", position: { x: 320, y: 40 }, w: 460, h: 260 }),
    {
      id: "step",
      type: "block",
      parentId: "loop",
      position: { x: 50, y: 30 },
      data: { name: "step()", view: "port", w: 150, h: 80, ports: { left: ["state"], right: ["next"] } },
    },
    {
      id: "check",
      type: "block",
      parentId: "loop",
      position: { x: 250, y: 30 },
      data: { name: "check()", view: "port", w: 190, h: 80, ports: { left: ["next"] }, marks: ["break"] },
    },
  ],
  edges: [
    { id: "e-cond", source: "cond", sourceHandle: "ok", target: "loop", targetHandle: "Bool", data: ELBOW },
    { id: "e-sc", source: "step", sourceHandle: "next", target: "check", targetHandle: "next", data: ELBOW },
  ],
};

/**
 * `for batch in batches: for item in batch: process(item)` — a `for`
 * nested inside a `for`. Proves nesting a loop works the same way
 * `BRANCH_NESTED` (`region.branch.fixtures.ts`) proves it for branches: the
 * inner region is an ORDINARY member of the outer's body (`parentId:
 * "outer"`), never a second top-level node — `bodyChildrenOf` does not
 * distinguish a region member from a block one, and this fixture is the
 * loop preset's own proof of that rather than an assumption carried over
 * from branch.
 *
 * The cable that matters: `outer`'s own `Iter` feeds `inner`'s own
 * `Iterable`, corner card to corner card — the identical crossing any two
 * plain blocks' ports would resolve through ("everything is a block" has
 * no special case for "even when the block is a region").
 */
export const FOR_LOOP_NESTED: HostScene = {
  nodes: [
    { id: "batches", type: "block", position: { x: 0, y: 80 }, data: { name: "batches()", view: "port", w: 150, h: 80, ports: { right: ["values"] } } },
    forLoopNode({ id: "outer", position: { x: 220, y: 20 }, w: 620, h: 420, name: "For Batch" }),
    forLoopNode({ id: "inner", parentId: "outer", position: { x: 50, y: 30 }, w: 480, h: 280, name: "For Item" }),
    {
      id: "process",
      type: "block",
      parentId: "inner",
      position: { x: 60, y: 30 },
      data: { name: "process()", view: "port", w: 170, h: 80, ports: { left: ["item"] } },
    },
  ],
  edges: [
    { id: "e-batches", source: "batches", sourceHandle: "values", target: "outer", targetHandle: LOOP_PORT_IDS.iterable, data: ELBOW },
    { id: "e-outer-inner", source: "outer", sourceHandle: LOOP_PORT_IDS.iter, target: "inner", targetHandle: LOOP_PORT_IDS.iterable, data: ELBOW },
    { id: "e-process", source: "inner", sourceHandle: LOOP_PORT_IDS.iter, target: "process", targetHandle: "item", data: ELBOW },
  ],
};

/**
 * `for` with `continue`: skip this turn without leaving the loop — the
 * exact grammar `LOOP_WITH_BREAK` gives `while`'s `break`, given here to
 * `for` and to the sibling mark (scenario 6: `continue` was the one mark
 * this file never drew). No edge leaves `skip_if_empty` for the same
 * reason none leaves `check` in `LOOP_WITH_BREAK`: the exit-this-turn IS
 * the mark, never a cable.
 */
export const FOR_LOOP_CONTINUE: HostScene = {
  nodes: [
    { id: "items", type: "block", position: { x: 0, y: 40 }, data: { name: "items()", view: "port", w: 150, h: 80, ports: { right: ["values"] } } },
    forLoopNode({ id: "loop", position: { x: 220, y: 20 }, w: 480, h: 260 }),
    {
      id: "skip",
      type: "block",
      parentId: "loop",
      position: { x: 60, y: 30 },
      data: { name: "skip_if_empty()", view: "port", w: 220, h: 80, ports: { left: ["item"] }, marks: ["continue"] },
    },
  ],
  edges: [
    { id: "e-items", source: "items", sourceHandle: "values", target: "loop", targetHandle: LOOP_PORT_IDS.iterable, data: ELBOW },
    { id: "e-iter", source: "loop", sourceHandle: LOOP_PORT_IDS.iter, target: "skip", targetHandle: "item", data: ELBOW },
  ],
};

/**
 * A `while` whose body MUTATES the value the condition reads — the case
 * where the re-check actually matters (scenario 9). `mutate()` advances
 * the state; `over_limit()` re-derives the boolean from that MUTATED value
 * and is what feeds `Bool` back, one turn late. The mutated value also
 * carries into `mutate`'s own input next turn (`carriedValueEdge`) — the
 * same z⁻¹ device `FOR_LOOP_CARRIED` uses for its accumulator — which is
 * what makes "the body changed the thing the condition reads" a cable you
 * can see rather than a claim in this comment.
 *
 * WHY this is not just `WHILE_LOOP_RECHECK` again: that fixture's `check`
 * reads a value `step` produced but never itself carries forward — nothing
 * on that board shows the SAME value being both mutated and re-tested.
 * Here `next` is that one value, twice: into `over_limit` for the test, and
 * back into `mutate` for the next turn.
 */
export const WHILE_LOOP_MUTATES: HostScene = {
  nodes: [
    { id: "start", type: "block", position: { x: 0, y: 40 }, data: { name: "ready()", view: "port", w: 150, h: 80, ports: { right: ["ok"] } } },
    whileLoopNode({ id: "loop", position: { x: 300, y: 30 }, w: 560, h: 300 }),
    {
      id: "mutate",
      type: "block",
      parentId: "loop",
      position: { x: 50, y: 20 },
      data: { name: "mutate()", view: "port", w: 170, h: 100, ports: { left: ["state"], right: ["next"] } },
    },
    {
      id: "overLimit",
      type: "block",
      parentId: "loop",
      position: { x: 310, y: 20 },
      data: { name: "over_limit()", view: "port", w: 180, h: 100, ports: { left: ["next"], right: ["ok"] } },
    },
  ],
  edges: [
    { id: "e-start", source: "start", sourceHandle: "ok", target: "loop", targetHandle: LOOP_PORT_IDS.bool, data: ELBOW },
    { id: "e-check", source: "mutate", sourceHandle: "next", target: "overLimit", targetHandle: "next", data: ELBOW },
    { id: "e-recheck", source: "overLimit", sourceHandle: "ok", target: "loop", targetHandle: LOOP_PORT_IDS.bool, data: { variant: "delayed", ...ELBOW } },
    carriedValueEdge({ id: "e-carry", nodeId: "mutate", from: "next", to: "state", seed: "0" }),
  ],
};
