// src/scene/sceneEvents.test.ts — ACCEPTANCE for semantic edit events
// (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`). Committed
// BEFORE the implementation exists; RED until the lane lands; off-limits
// to the builder. The fixture `events_edit_session.json` is shared with
// pyblocks' own acceptance, which classifies these same events.
// Node project: `pnpm exec vitest --project=unit run src/scene/sceneEvents.test.ts`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import type { HostScene } from "../hosts/hostScene";
import { authorId } from "./history";
import { createSceneEventSeam, deriveSceneEvents, type SceneEvent, type SceneEventBatch } from "./sceneEvents";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, "../../../../docs/fixtures/pyblocks-scene/events_edit_session.json");

interface EventsFixture {
  before: HostScene;
  after: HostScene;
  events: SceneEvent[];
}

function fixture(): EventsFixture {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as EventsFixture;
}

const DECODE = "function:run@3:0/transform:call@4:12-4:23";
const SCALE = "function:run@3:0/transform:call@5:13-5:35";

describe("deriveSceneEvents", () => {
  test("identical scenes yield no events (total, never a throw)", () => {
    const { before } = fixture();
    expect(deriveSceneEvents(before, before)).toEqual([]);
    expect(deriveSceneEvents(before, JSON.parse(JSON.stringify(before)))).toEqual([]);
    expect(deriveSceneEvents({ nodes: [], edges: [] }, { nodes: [], edges: [] })).toEqual([]);
  });

  test("the edit session derives EXACTLY the frozen event list, in the contract's order", () => {
    const { before, after, events } = fixture();
    expect(deriveSceneEvents(before, after)).toEqual(events);
  });

  test("a move is reported even though sceneDiff.ts excludes position (the one fact this file adds)", () => {
    const { before } = fixture();
    const moved: HostScene = {
      ...before,
      nodes: before.nodes.map((node) => (node.id === DECODE ? { ...node, position: { x: 1, y: 2 } } : node)),
    };
    expect(deriveSceneEvents(before, moved)).toEqual([{ type: "node-moved", nodeId: DECODE, from: { x: 40, y: 80 }, to: { x: 1, y: 2 } }]);
  });

  test("an added node reports node-added and NOTHING else about itself", () => {
    const { before } = fixture();
    const node = { id: "n", type: "code", position: { x: 5, y: 5 }, data: { name: "n", code: "x = 1" } };
    const after: HostScene = { ...before, nodes: [...before.nodes, node] };
    const events = deriveSceneEvents(before, after);
    expect(events).toEqual([{ type: "node-added", nodeId: "n", node }]);
  });

  test("a removed node reports node-removed; a wire that dies with it reports wire-disconnected", () => {
    const { before } = fixture();
    const after: HostScene = {
      nodes: before.nodes.filter((node) => node.id !== SCALE),
      edges: before.edges.filter((edge) => edge.source !== SCALE && edge.target !== SCALE),
    };
    const events = deriveSceneEvents(before, after);
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === "node-removed")).toHaveLength(1);
    expect(types.filter((type) => type === "wire-disconnected")).toHaveLength(3); // e-frame, e-gain, e-out
    // Node events precede edge events.
    expect(types.indexOf("node-removed")).toBeLessThan(types.indexOf("wire-disconnected"));
  });

  test("a rename detaches nothing else: renaming one node yields one event", () => {
    const { before } = fixture();
    const after: HostScene = {
      ...before,
      nodes: before.nodes.map((node) => (node.id === SCALE ? { ...node, data: { ...node.data, name: "other()" } } : node)),
    };
    expect(deriveSceneEvents(before, after)).toEqual([{ type: "node-renamed", nodeId: SCALE, from: "scale()", to: "other()" }]);
  });

  test("an unnamed data key is reported as data-changed, never dropped", () => {
    const { before } = fixture();
    const after: HostScene = {
      ...before,
      nodes: before.nodes.map((node) => (node.id === DECODE ? { ...node, data: { ...node.data, mystery: 7 } } : node)),
    };
    expect(deriveSceneEvents(before, after)).toEqual([{ type: "data-changed", nodeId: DECODE, key: "mystery", from: undefined, to: 7 }]);
  });
});

describe("createSceneEventSeam", () => {
  function batch(author: string, events: SceneEvent[] = []): SceneEventBatch {
    return { id: `b-${author}`, author: authorId(author), label: "test", at: "2026-09-18T00:00:00Z", events };
  }

  test("starts with zero subscribers and a publish is a no-op", () => {
    const seam = createSceneEventSeam();
    expect(seam.size).toBe(0);
    expect(() => seam.publish(batch("tldraw"))).not.toThrow();
  });

  test("delivers to a subscriber and stops after unsubscribe", () => {
    const seam = createSceneEventSeam();
    const heard: SceneEventBatch[] = [];
    const off = seam.subscribe((b) => heard.push(b));
    expect(seam.size).toBe(1);
    seam.publish(batch("tldraw"));
    expect(heard).toHaveLength(1);
    off();
    expect(seam.size).toBe(0);
    seam.publish(batch("tldraw"));
    expect(heard).toHaveLength(1);
  });

  test("self-skip: a subscriber never hears its own author's batch (history.ts's shouldNotify)", () => {
    const seam = createSceneEventSeam();
    const heard: string[] = [];
    seam.subscribe((b) => heard.push(`pyblocks:${b.id}`), authorId("pyblocks"));
    seam.subscribe((b) => heard.push(`any:${b.id}`));
    seam.publish(batch("pyblocks"));
    seam.publish(batch("tldraw"));
    expect(heard).toEqual(["any:b-pyblocks", "pyblocks:b-tldraw", "any:b-tldraw"]);
  });

  test("two seams share no state (no module-level bus)", () => {
    const a = createSceneEventSeam();
    const b = createSceneEventSeam();
    const heard: string[] = [];
    a.subscribe(() => heard.push("a"));
    b.publish(batch("x"));
    expect(heard).toEqual([]);
    expect(b.size).toBe(0);
  });
});
