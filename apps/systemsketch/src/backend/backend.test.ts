// src/backend/backend.test.ts — the acceptance for the optional pyblocks
// backend, written from docs/PYBLOCKS-BACKEND-PLAN.md §6 L3 and COMMITTED
// BEFORE the implementation it grades (the lane brief's own instruction: the
// dispatcher's copy does not exist, so the builder writes these assertions
// first, in their own commit, and never weakens them afterwards).
//
// WHY this file imports no component and no tldraw: it runs in the `unit`
// project (`vitest.config.ts`: `environment: "node"`, `src/**/*.test.ts`), so
// there is no DOM to render into. Everything it asserts is therefore a
// PURE seam — `src/backend/pyblocksConsumer.ts` (what the setting turns on,
// and the consumer that listens when it does) and the bridge core in
// `src/backend/useSceneEventBridge.ts`. The six DOM-level assertions of
// §6 L3 — nothing pyblocks in the rendered app at `none`, the health reason
// in the settings row, the board that `linear_chain.py` opens as — are the
// job of `tests/pyblocks_backend_smoke.mjs`, which drives the real app in a
// real Chromium against a real `python3 -m pyblocks serve`.
import { readFileSync } from "node:fs";

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PYBLOCKS_URL, NO_BACKEND, type BackendSetting } from "@trunk/backend/backendSetting";
import type { PyblocksEventsEcho, PyblocksHealthResult } from "@trunk/backend/pyblocksClient";
import type { HostScene } from "@trunk/hosts/hostScene";
import { authorId } from "@trunk/scene/history";
import { createSceneEventSeam, type SceneEventBatch } from "@trunk/scene/sceneEvents";
import { loadPyblocksScene, type PyblocksSceneDocument } from "@trunk/hosts/pyblocksScene";

import { boardLintFindings, shapeIdOfSubject } from "../chrome/problems";
// Ruling 3 gave `boardLintFindings` a required level. These cases are about
// what a person SEES when they open one of these boards, so they ask at the
// level a person who has never opened Settings is on — the shipped default.
import { DEFAULT_VALIDATION_LEVEL } from "@trunk/scene/validationLevel";
import { pyblocksBoardFrom } from "./OpenPython";

import {
  BRIDGE_AUTHOR,
  PYBLOCKS_CONSUMER_AUTHOR,
  attachPyblocksConsumer,
  backendClientFor,
  echoSummary,
  pyblocksSurfaces,
  readStoredSetting,
  writeStoredSetting,
} from "./pyblocksConsumer";
import { createSceneEventBridge } from "./useSceneEventBridge";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PYBLOCKS: BackendSetting = { kind: "pyblocks", url: DEFAULT_PYBLOCKS_URL };

const HEALTHY: PyblocksHealthResult = {
  ok: true,
  health: { status: "ok", analyzer: "pyblocks-blockview-v1", systemsketch: { scene: 1, events: 1 } },
  capabilities: { scene: true, events: true },
};

const DOWN: PyblocksHealthResult = { ok: false, reason: "fetch failed" };

function sceneWith(x: number, name = "decode()"): HostScene {
  return {
    nodes: [{ id: "n1", type: "block", position: { x, y: 0 }, data: { name, view: "port", ports: { left: ["in"], right: ["out"] } } }],
    edges: [],
  };
}

/** A storage that answers, and a storage that throws — a private window or
 *  blocked site data is the ordinary case, never a crash. */
function memoryStorage(seed?: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

function throwingStorage(): Storage {
  return {
    get length(): number {
      throw new Error("blocked");
    },
    clear: () => {
      throw new Error("blocked");
    },
    getItem: () => {
      throw new Error("blocked");
    },
    key: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  } as unknown as Storage;
}

function batch(overrides: Partial<SceneEventBatch> = {}): SceneEventBatch {
  return {
    id: "b1",
    author: BRIDGE_AUTHOR,
    label: "node-moved",
    at: "2026-09-19T00:00:00.000Z",
    events: [{ type: "node-moved", nodeId: "n1", from: { x: 0, y: 0 }, to: { x: 40, y: 0 } }],
    ...overrides,
  };
}

function echoFor(batches: SceneEventBatch[], klass: "semantic" | "presentation" | "unknown" = "presentation"): PyblocksEventsEcho {
  return {
    accepted: batches.length,
    applied: 0,
    classified: batches.map((one) => ({
      batchId: one.id,
      events: one.events.map((event, eventIndex) => ({ eventIndex, type: event.type, class: klass, reason: "test" })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* §6 L3 (1) — `none` is the default and nothing pyblocks happens      */
/* ------------------------------------------------------------------ */

describe("Backend: none — the whiteboard promise", () => {
  it("renders no pyblocks surface at all and attaches no consumer", () => {
    // Every surface the feature owns, off. The DOM half of this assertion
    // (no element whose text or data-* says "pyblocks") is the smoke test's.
    expect(pyblocksSurfaces(NO_BACKEND, null)).toEqual({ healthPill: false, menuItem: false, statusLine: false, consumer: false });
    expect(pyblocksSurfaces(NO_BACKEND, HEALTHY)).toEqual({ healthPill: false, menuItem: false, statusLine: false, consumer: false });
  });

  it("builds no client, so a fetch spy records zero calls", () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(backendClientFor(NO_BACKEND, fetchSpy)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is what a missing, garbage or hostile localStorage reads as", () => {
    expect(readStoredSetting(memoryStorage())).toEqual(NO_BACKEND);
    expect(readStoredSetting(memoryStorage({ "systemsketch.backend.v1": "not json" }))).toEqual(NO_BACKEND);
    expect(readStoredSetting(memoryStorage({ "systemsketch.backend.v1": '{"kind":"redis"}' }))).toEqual(NO_BACKEND);
    expect(readStoredSetting(memoryStorage({ "systemsketch.backend.v1": '{"kind":"pyblocks","url":"javascript:alert(1)"}' }))).toEqual(NO_BACKEND);
    expect(readStoredSetting(throwingStorage())).toEqual(NO_BACKEND);
    expect(readStoredSetting(null)).toEqual(NO_BACKEND);
  });

  it("round-trips a real setting through storage, and never throws on a blocked one", () => {
    const storage = memoryStorage();
    writeStoredSetting(storage, PYBLOCKS);
    expect(readStoredSetting(storage)).toEqual(PYBLOCKS);
    expect(() => writeStoredSetting(throwingStorage(), PYBLOCKS)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* §6 L3 (2) — the server is down: a reason, and still no menu item    */
/* ------------------------------------------------------------------ */

describe("Backend: pyblocks — health gates every surface", () => {
  it("shows the health pill but no menu item and no consumer while the server is down", () => {
    expect(pyblocksSurfaces(PYBLOCKS, DOWN)).toEqual({ healthPill: true, menuItem: false, statusLine: false, consumer: false });
  });

  it("shows the health pill and nothing else while health has not answered yet", () => {
    expect(pyblocksSurfaces(PYBLOCKS, null)).toEqual({ healthPill: true, menuItem: false, statusLine: false, consumer: false });
  });

  it("opens the menu item and the consumer only on the capability the route needs", () => {
    expect(pyblocksSurfaces(PYBLOCKS, HEALTHY)).toEqual({ healthPill: true, menuItem: true, statusLine: true, consumer: true });
    const noScene: PyblocksHealthResult = { ...HEALTHY, capabilities: { scene: false, events: true } };
    expect(pyblocksSurfaces(PYBLOCKS, noScene).menuItem).toBe(false);
    expect(pyblocksSurfaces(PYBLOCKS, noScene).consumer).toBe(true);
    const noEvents: PyblocksHealthResult = { ...HEALTHY, capabilities: { scene: true, events: false } };
    expect(pyblocksSurfaces(PYBLOCKS, noEvents).menuItem).toBe(true);
    expect(pyblocksSurfaces(PYBLOCKS, noEvents).consumer).toBe(false);
  });

  it("builds a client at the setting's own url", () => {
    const client = backendClientFor(PYBLOCKS, vi.fn());
    expect(client?.url).toBe(DEFAULT_PYBLOCKS_URL);
  });
});

/* ------------------------------------------------------------------ */
/* §6 L3 (4)(5) — the seam, the bridge, one batch per gesture          */
/* ------------------------------------------------------------------ */

describe("the scene-event bridge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function bridgeOn(initial: HostScene) {
    const seam = createSceneEventSeam();
    const published: SceneEventBatch[] = [];
    seam.subscribe((one) => published.push(one));
    let current = initial;
    let notify = () => {};
    const bridge = createSceneEventBridge({
      read: () => current,
      subscribe: (onChange) => {
        notify = onChange;
        return () => {
          notify = () => {};
        };
      },
      publish: (one) => seam.publish(one),
      documentUri: () => "workspace:linear_chain.py",
      quietMs: 100,
      newId: () => "batch-1",
      now: () => "2026-09-19T00:00:00.000Z",
    });
    return {
      seam,
      published,
      bridge,
      set(next: HostScene) {
        current = next;
        notify();
      },
    };
  }

  it("the seam exists with no consumer, and a publish into it is a no-op", () => {
    const seam = createSceneEventSeam();
    expect(seam.size).toBe(0);
    expect(() => seam.publish(batch())).not.toThrow();
  });

  it("publishes ONE batch with ONE node-moved for a drag, however many store writes it took", () => {
    const run = bridgeOn(sceneWith(0));
    // A drag is many transactions; this is three of them.
    run.set(sceneWith(12));
    run.set(sceneWith(28));
    run.set(sceneWith(40));
    expect(run.published).toHaveLength(0); // nothing while the gesture is live
    vi.advanceTimersByTime(150);
    expect(run.published).toHaveLength(1);
    expect(run.published[0].events).toEqual([{ type: "node-moved", nodeId: "n1", from: { x: 0, y: 0 }, to: { x: 40, y: 0 } }]);
    expect(run.published[0].author).toBe(BRIDGE_AUTHOR);
    expect(run.published[0].label).toBe("node-moved");
    expect(run.published[0].documentUri).toBe("workspace:linear_chain.py");
    expect(run.published[0].at).toBe("2026-09-19T00:00:00.000Z");
    run.bridge.stop();
  });

  it("publishes one node-renamed for a header rename", () => {
    const run = bridgeOn(sceneWith(0, "decode()"));
    run.set(sceneWith(0, "parse()"));
    vi.advanceTimersByTime(150);
    expect(run.published).toHaveLength(1);
    expect(run.published[0].events).toEqual([{ type: "node-renamed", nodeId: "n1", from: "decode()", to: "parse()" }]);
    expect(run.published[0].label).toBe("node-renamed");
    run.bridge.stop();
  });

  it("publishes nothing when the document settled back to where it started", () => {
    const run = bridgeOn(sceneWith(0));
    run.set(sceneWith(40));
    run.set(sceneWith(0));
    vi.advanceTimersByTime(150);
    expect(run.published).toHaveLength(0);
    run.bridge.stop();
  });

  it("defers while the host says it is mid-gesture", () => {
    const seam = createSceneEventSeam();
    const published: SceneEventBatch[] = [];
    seam.subscribe((one) => published.push(one));
    let current = sceneWith(0);
    let notify = () => {};
    let busy = true;
    const bridge = createSceneEventBridge({
      read: () => current,
      subscribe: (onChange) => {
        notify = onChange;
        return () => {};
      },
      publish: (one) => seam.publish(one),
      quietMs: 100,
      isBusy: () => busy,
    });
    current = sceneWith(40);
    notify();
    vi.advanceTimersByTime(1000);
    expect(published).toHaveLength(0);
    busy = false;
    vi.advanceTimersByTime(150);
    expect(published).toHaveLength(1);
    bridge.stop();
  });

  it("rebases without publishing — a board pyblocks just sent is not an edit the person made", () => {
    const run = bridgeOn(sceneWith(0));
    run.set(sceneWith(40));
    run.bridge.rebase();
    vi.advanceTimersByTime(150);
    expect(run.published).toHaveLength(0);
    // …and the NEXT real edit is derived from the rebased scene.
    run.set(sceneWith(80));
    vi.advanceTimersByTime(150);
    expect(run.published).toHaveLength(1);
    expect(run.published[0].events).toEqual([{ type: "node-moved", nodeId: "n1", from: { x: 40, y: 0 }, to: { x: 80, y: 0 } }]);
    run.bridge.stop();
  });

  it("stops listening and stops publishing when it is stopped", () => {
    const run = bridgeOn(sceneWith(0));
    run.bridge.stop();
    run.set(sceneWith(40));
    vi.advanceTimersByTime(150);
    expect(run.published).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* §6 L3 (4)(5) — the consumer, attached only while pyblocks is on     */
/* ------------------------------------------------------------------ */

describe("the pyblocks consumer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fakeClient(reply: (batches: SceneEventBatch[]) => Promise<PyblocksEventsEcho>) {
    const sent: SceneEventBatch[][] = [];
    return {
      sent,
      client: {
        url: DEFAULT_PYBLOCKS_URL,
        health: async () => HEALTHY,
        scene: async () => {
          throw new Error("not used here");
        },
        events: async (batches: SceneEventBatch[]) => {
          sent.push(batches);
          return reply(batches);
        },
      },
    };
  }

  it("attaches to the seam and gives it back on detach", () => {
    const seam = createSceneEventSeam();
    const { client } = fakeClient(async (batches) => echoFor(batches));
    expect(seam.size).toBe(0);
    const detach = attachPyblocksConsumer(seam, client, {});
    expect(seam.size).toBe(1);
    detach();
    expect(seam.size).toBe(0);
  });

  it("coalesces batches inside the window into ONE POST, and echoes it back", async () => {
    const seam = createSceneEventSeam();
    const echoes: PyblocksEventsEcho[] = [];
    const { client, sent } = fakeClient(async (batches) => echoFor(batches));
    const detach = attachPyblocksConsumer(seam, client, { onEcho: (echo) => echoes.push(echo), coalesceMs: 250 });
    seam.publish(batch({ id: "b1" }));
    seam.publish(batch({ id: "b2" }));
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(sent).toHaveLength(1);
    expect(sent[0].map((one) => one.id)).toEqual(["b1", "b2"]);
    expect(echoes).toHaveLength(1);
    expect(echoes[0].accepted).toBe(2);
    detach();
  });

  it("never hears its own write back — the self-skip is the author id", async () => {
    const seam = createSceneEventSeam();
    const { client, sent } = fakeClient(async (batches) => echoFor(batches));
    const detach = attachPyblocksConsumer(seam, client, {});
    seam.publish(batch({ id: "mine", author: PYBLOCKS_CONSUMER_AUTHOR }));
    await vi.advanceTimersByTimeAsync(400);
    expect(sent).toHaveLength(0);
    // …but a batch from the board still arrives.
    seam.publish(batch({ id: "theirs", author: authorId("tldraw") }));
    await vi.advanceTimersByTimeAsync(400);
    expect(sent).toHaveLength(1);
    detach();
  });

  it("surfaces a request error once and retries the batches on the next flush", async () => {
    const seam = createSceneEventSeam();
    const errors: string[] = [];
    let fail = true;
    const { client, sent } = fakeClient(async (batches) => {
      if (fail) throw new Error("boom");
      return echoFor(batches);
    });
    const detach = attachPyblocksConsumer(seam, client, { onError: (text) => errors.push(text), coalesceMs: 100 });
    seam.publish(batch({ id: "b1" }));
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toHaveLength(1);
    expect(errors).toEqual(["boom"]);
    fail = false;
    seam.publish(batch({ id: "b2" }));
    await vi.advanceTimersByTimeAsync(150);
    // The failed batch went back on the queue and rode along with the next one.
    expect(sent[1].map((one) => one.id)).toEqual(["b1", "b2"]);
    expect(errors).toEqual(["boom"]);
    detach();
  });

  it("keeps at most 20 queued batches, dropping the oldest", async () => {
    const seam = createSceneEventSeam();
    let fail = true;
    const { client, sent } = fakeClient(async (batches) => {
      if (fail) throw new Error("down");
      return echoFor(batches);
    });
    const detach = attachPyblocksConsumer(seam, client, { coalesceMs: 100, maxQueued: 20 });
    for (let index = 0; index < 25; index += 1) {
      seam.publish(batch({ id: `b${index}` }));
      await vi.advanceTimersByTimeAsync(150);
    }
    fail = false;
    seam.publish(batch({ id: "last" }));
    await vi.advanceTimersByTimeAsync(150);
    const delivered = sent[sent.length - 1].map((one) => one.id);
    expect(delivered).toHaveLength(20);
    expect(delivered[delivered.length - 1]).toBe("last");
    expect(delivered).not.toContain("b0");
    detach();
  });

  it("stops POSTing the moment it is detached", async () => {
    const seam = createSceneEventSeam();
    const { client, sent } = fakeClient(async (batches) => echoFor(batches));
    const detach = attachPyblocksConsumer(seam, client, { coalesceMs: 100 });
    seam.publish(batch({ id: "b1" }));
    detach();
    await vi.advanceTimersByTimeAsync(400);
    expect(sent).toHaveLength(0);
    expect(seam.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* §6 L3 (4)(5) — the status line reads the echo                       */
/* ------------------------------------------------------------------ */

describe("the status line", () => {
  it("reads a presentation-only echo as `1 batch · 0 semantic · 0 applied`", () => {
    expect(echoSummary(echoFor([batch()], "presentation"))).toBe("1 batch · 0 semantic · 0 applied");
  });

  it("counts the semantic events the server classified", () => {
    expect(echoSummary(echoFor([batch({ label: "node-renamed" })], "semantic"))).toBe("1 batch · 1 semantic · 0 applied");
  });

  it("says nothing before the first echo", () => {
    expect(echoSummary(null)).toBe("");
  });

  it("reports `applied` from the server, which is 0 by tonight's contract", () => {
    expect(echoSummary({ accepted: 2, applied: 0, classified: [] })).toBe("2 batch · 0 semantic · 0 applied");
  });
});

/* ------------------------------------------------------------------ */
/* §6 L3 (3) — the board the projection hands the linter               */
/* ------------------------------------------------------------------ */

/**
 * ADDED 2026-09-19, after an independent audit opened `linear_chain.py` and
 * got a red "3 problems" badge on a program with no cycle in it: three
 * ERROR rows reading `Nodes form a cycle: run#corner → scale() → decode() →
 * run#corner`. Nothing here weakens an earlier assertion — these are new
 * ones, and they are the regression guard for the seam that produced it.
 *
 * The projection is graded against the REAL linter over the REAL committed
 * fixtures, with no React tree and no browser: `pyblocksBoardFrom` is pure,
 * `boardLintFindings` is the pure half of the Problems panel, and the
 * fixtures are the frozen bytes the whole stream shares.
 */
describe("the board the projection hands the linter", () => {
  const fixture = (name: string): PyblocksSceneDocument =>
    JSON.parse(readFileSync(new URL(`../../../../docs/fixtures/pyblocks-scene/${name}.scene.json`, import.meta.url), "utf8")) as PyblocksSceneDocument;

  const boardFor = (name: string) => pyblocksBoardFrom(loadPyblocksScene(fixture(name)));

  it("reports NO cycle on linear_chain — a straight line is not a loop", () => {
    const findings = boardLintFindings(boardFor("linear_chain").scene, DEFAULT_VALIDATION_LEVEL);
    expect(findings.filter((finding) => finding.ruleId === "cycle")).toEqual([]);
  });

  it("opens linear_chain with a clean Problems panel — no error of any rule", () => {
    const findings = boardLintFindings(boardFor("linear_chain").scene, DEFAULT_VALIDATION_LEVEL);
    expect(findings.filter((finding) => finding.severity === "error").map((finding) => finding.message)).toEqual([]);
  });

  it("reports NO cycle on region_for_if either", () => {
    const findings = boardLintFindings(boardFor("region_for_if").scene, DEFAULT_VALIDATION_LEVEL);
    expect(findings.filter((finding) => finding.ruleId === "cycle")).toEqual([]);
  });

  it("STILL reports a real loop that closes outside the region's boundary", () => {
    // The region's own output wired back into its own input, through a block
    // outside it — the case the two-faced split must not swallow.
    const board = boardFor("linear_chain");
    const corner = board.scene.nodes.find((node) => node.id.endsWith("#corner"))!;
    const feedback = "shape:feedback";
    const scene = {
      nodes: [
        ...board.scene.nodes,
        { id: feedback, type: "block" as const, position: { x: 900, y: 0 }, data: { kind: "block" as const, name: "feedback()", view: "port" as const, ports: { left: ["in"], right: ["out"], top: [], bottom: [] } } },
      ],
      edges: [
        ...board.scene.edges,
        { id: "shape:fb-out", source: corner.id, sourceHandle: "boundary-output-scaled", target: feedback, targetHandle: "in", data: { variant: "data" as const, routing: "elbow" as const } },
        { id: "shape:fb-in", source: feedback, sourceHandle: "out", target: corner.id, targetHandle: "boundary-input-raw", data: { variant: "data" as const, routing: "elbow" as const } },
      ],
    };
    const cycles = boardLintFindings(scene, DEFAULT_VALIDATION_LEVEL).filter((finding) => finding.ruleId === "cycle");
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles.map((finding) => finding.subject.id)).toContain(feedback);
  });

  it("STILL reports a loop that never touches a region at all", () => {
    const scene = {
      nodes: [
        { id: "a", type: "block" as const, position: { x: 0, y: 0 }, data: { kind: "block" as const, name: "a", ports: { left: ["in"], right: ["out"] } } },
        { id: "b", type: "block" as const, position: { x: 200, y: 0 }, data: { kind: "block" as const, name: "b", ports: { left: ["in"], right: ["out"] } } },
      ],
      edges: [
        { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", data: { variant: "data" as const, routing: "elbow" as const } },
        { id: "e2", source: "b", sourceHandle: "out", target: "a", targetHandle: "in", data: { variant: "data" as const, routing: "elbow" as const } },
      ],
    };
    expect(boardLintFindings(scene, DEFAULT_VALIDATION_LEVEL).filter((finding) => finding.ruleId === "cycle").map((finding) => finding.subject.id).sort()).toEqual(["a", "b"]);
  });

  it("points a Problems row at the SHAPE, even when the node id carries slashes", () => {
    // A pyblocks id rides through verbatim behind the `shape:` prefix, so a
    // real node id on this board is
    // `shape:function:run@3:0/transform:call@4:12-4:23`. Splitting it at the
    // FIRST slash — what the panel did before — named a shape that does not
    // exist, and every row revealed nothing when clicked.
    const node = "shape:function:run@3:0/transform:call@4:12-4:23";
    expect(shapeIdOfSubject({ kind: "node", id: node })).toBe(node);
    expect(shapeIdOfSubject({ kind: "port", id: `${node}/in-raw` })).toBe(node);
    expect(shapeIdOfSubject({ kind: "edge", id: "shape:edge@1" })).toBe("shape:edge@1");
  });
});
