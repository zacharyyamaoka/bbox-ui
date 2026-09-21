// src/backend/pyblocksClient.test.ts — ACCEPTANCE for the pyblocks HTTP
// client (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`). RED
// until the lane lands; off-limits to the builder. Runs with a FAKE fetch:
// the wire format it asserts is the one `test_systemsketch_scene_acceptance.py`
// makes the real server honor, so the two sides meet at these bytes.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { authorId } from "../scene/history";
import { PyblocksSceneError } from "../hosts/pyblocksScene";
import type { SceneEventBatch } from "../scene/sceneEvents";
import { createPyblocksClient, PyblocksRequestError, type FetchLike } from "./pyblocksClient";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../../../../docs/fixtures/pyblocks-scene");
const LINEAR = JSON.parse(readFileSync(path.join(FIXTURES, "linear_chain.scene.json"), "utf8"));

interface Call {
  input: string;
  init?: RequestInit;
}

function fakeFetch(handler: (call: Call) => { status: number; body: unknown } | Error): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init) => {
    const call = { input, init };
    calls.push(call);
    const reply = handler(call);
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls };
}

const HEALTH = { status: "ok", analyzer: "pyblocks-blockview-v1", mode: "static-no-execution", build: "dev", channel: "development", livePreview: false };

describe("health", () => {
  test("GETs /api/health and reports capabilities from the `systemsketch` key", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { ...HEALTH, systemsketch: { scene: 1, events: 1 } } }));
    const client = createPyblocksClient("http://127.0.0.1:4177", fetch);
    const result = await client.health();
    expect(calls[0].input).toBe("http://127.0.0.1:4177/api/health");
    expect(result).toEqual({ ok: true, health: { ...HEALTH, systemsketch: { scene: 1, events: 1 } }, capabilities: { scene: true, events: true } });
  });

  test("an older pyblocks (no `systemsketch` key) is reachable but has no capabilities", async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: HEALTH }));
    const result = await createPyblocksClient("http://127.0.0.1:4177", fetch).health();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.capabilities).toEqual({ scene: false, events: false });
  });

  test("a server that is not pyblocks, or is unreachable, yields ok:false with a reason — never a throw", async () => {
    const wrong = fakeFetch(() => ({ status: 200, body: { hello: "world" } }));
    const a = await createPyblocksClient("http://127.0.0.1:1", wrong.fetch).health();
    expect(a.ok).toBe(false);
    const down = fakeFetch(() => new TypeError("fetch failed"));
    const b = await createPyblocksClient("http://127.0.0.1:1", down.fetch).health();
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toContain("fetch failed");
    const notFound = fakeFetch(() => ({ status: 404, body: { error: "not found" } }));
    const c = await createPyblocksClient("http://127.0.0.1:1", notFound.fetch).health();
    expect(c.ok).toBe(false);
  });
});

describe("scene", () => {
  test("POSTs JSON to /api/systemsketch/scene and returns the parsed document", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: LINEAR }));
    const client = createPyblocksClient("http://127.0.0.1:4177/", fetch);
    const doc = await client.scene({ source: "def run(raw): ...", filename: "linear_chain.py", viewId: null });
    expect(calls[0].input).toBe("http://127.0.0.1:4177/api/systemsketch/scene");
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("content-type")).toMatch(/^application\/json/);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ source: "def run(raw): ...", filename: "linear_chain.py", viewId: null });
    expect(doc.kind).toBe("pyblocks-scene");
    expect(doc.scene.nodes).toHaveLength(4);
  });

  test("a non-2xx reply throws PyblocksRequestError carrying the server's own error text", async () => {
    const { fetch } = fakeFetch(() => ({ status: 400, body: { error: "source must be a string" } }));
    const client = createPyblocksClient("http://127.0.0.1:4177", fetch);
    await expect(client.scene({ source: "", filename: "x.py" })).rejects.toMatchObject({ name: "PyblocksRequestError", status: 400, message: expect.stringContaining("source must be a string") });
    await expect(client.scene({ source: "", filename: "x.py" })).rejects.toBeInstanceOf(PyblocksRequestError);
  });

  test("a 2xx reply that is not a PyblocksSceneDocument throws PyblocksSceneError (validated, never trusted)", async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: { kind: "tldraw", records: [] } }));
    const client = createPyblocksClient("http://127.0.0.1:4177", fetch);
    await expect(client.scene({ source: "x", filename: "x.py" })).rejects.toBeInstanceOf(PyblocksSceneError);
  });
});

describe("events", () => {
  const batch: SceneEventBatch = {
    id: "b1",
    author: authorId("tldraw"),
    label: "move",
    at: "2026-09-18T21:00:00Z",
    documentUri: "workspace:linear_chain.py",
    events: [{ type: "node-moved", nodeId: "n", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }],
  };

  test("POSTs {batches} to /api/systemsketch/events and returns the echo verbatim", async () => {
    const echo = { accepted: 1, applied: 0, classified: [{ batchId: "b1", events: [{ eventIndex: 0, type: "node-moved", class: "presentation", reason: "geometry only" }] }] };
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: echo }));
    const client = createPyblocksClient("http://127.0.0.1:4177", fetch);
    const result = await client.events([batch]);
    expect(calls[0].input).toBe("http://127.0.0.1:4177/api/systemsketch/events");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ batches: [batch] });
    expect(result).toEqual(echo);
  });

  test("sends nothing for an empty batch list and resolves an empty echo", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { accepted: 0, applied: 0, classified: [] } }));
    const client = createPyblocksClient("http://127.0.0.1:4177", fetch);
    const result = await client.events([]);
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ accepted: 0, applied: 0, classified: [] });
  });
});
