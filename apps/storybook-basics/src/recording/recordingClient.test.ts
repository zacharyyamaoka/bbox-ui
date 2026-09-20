// src/recording/recordingClient.test.ts — the four ported routes and the
// donor's exact error wording, over an injected transport.

import { describe, expect, it } from "vitest";

import { createRecordingClient } from "./recordingClient";
import type { RecordingPayload } from "./flightRecorder";

interface Call {
  url: string;
  init?: RequestInit;
}

function transport(reply: (call: Call) => { status?: number; body: string }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    const { status = 200, body } = reply(call);
    return new Response(body, { status });
  }) as typeof globalThis.fetch;
  return { calls, fetchImpl };
}

const EMPTY = {} as unknown as RecordingPayload;

describe("routes and payloads are the donor's", () => {
  it("arms the host with the page URL", async () => {
    const { calls, fetchImpl } = transport(() => ({ body: '{"screencast":true,"reason":"ok"}' }));
    const client = createRecordingClient({ fetch: fetchImpl });

    expect(await client.arm(true, "http://127.0.0.1:4340/?board=x")).toEqual({ screencast: true, reason: "ok" });
    expect(calls[0].url).toBe("/api/recordings/arm");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ enabled: true, url: "http://127.0.0.1:4340/?board=x" });
  });

  it("merges the extras into the buffer on save, as the donor did", async () => {
    const { calls, fetchImpl } = transport(() => ({
      body: '{"path":"/p","packet":"x","savedAt":"t","frames":2,"framesSource":"canvas"}',
    }));
    const client = createRecordingClient({ fetch: fetchImpl });

    const saved = await client.save(EMPTY, { channel: "preview", build: "dev", version: "0.1.0" });
    expect(saved.framesSource).toBe("canvas");
    expect(calls[0].url).toBe("/api/recordings");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ channel: "preview", build: "dev", version: "0.1.0" });
  });

  it("reads the last recording, and null is an answer not an error", async () => {
    const { calls, fetchImpl } = transport(() => ({ body: '{"recording":null}' }));
    const client = createRecordingClient({ fetch: fetchImpl });

    expect(await client.readLast()).toBeNull();
    expect(calls[0].url).toBe("/api/recordings/last");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("asks for a specific recording's bundle by path", async () => {
    const { calls, fetchImpl } = transport(() => ({ body: '{"recording":null}' }));
    const client = createRecordingClient({ fetch: fetchImpl });

    await client.readBundle("/home/t/SystemSketch/recordings/2026-09-19_18-24-45-take");
    expect(calls[0].url).toBe(
      "/api/recordings/bundle?path=%2Fhome%2Ft%2FSystemSketch%2Frecordings%2F2026-09-19_18-24-45-take",
    );
    await client.readBundle();
    expect(calls[1].url).toBe("/api/recordings/bundle");
  });

  it("honours a base URL for a host that is not same-origin", async () => {
    const { calls, fetchImpl } = transport(() => ({ body: '{"recording":null}' }));
    await createRecordingClient({ fetch: fetchImpl, baseUrl: "http://127.0.0.1:4341" }).readLast();
    expect(calls[0].url).toBe("http://127.0.0.1:4341/api/recordings/last");
  });
});

describe("failures carry the donor's own wording", () => {
  it("non-JSON names the controller and the status", async () => {
    const { fetchImpl } = transport(() => ({ status: 502, body: "<html>bad gateway</html>" }));
    await expect(createRecordingClient({ fetch: fetchImpl }).readLast()).rejects.toThrow(
      "the local SystemSketch controller returned non-JSON (502)",
    );
  });

  it("a JSON error body is surfaced verbatim", async () => {
    const { fetchImpl } = transport(() => ({ status: 409, body: '{"error":"recording holds 300000 rows; the cap is 200000"}' }));
    await expect(createRecordingClient({ fetch: fetchImpl }).save(EMPTY, { channel: "c", build: "b", version: "v" })).rejects.toThrow(
      "recording holds 300000 rows; the cap is 200000",
    );
  });

  it("a JSON body with no error field falls back to the status", async () => {
    const { fetchImpl } = transport(() => ({ status: 503, body: "{}" }));
    await expect(createRecordingClient({ fetch: fetchImpl }).readLast()).rejects.toThrow("recording request failed (503)");
  });
});
