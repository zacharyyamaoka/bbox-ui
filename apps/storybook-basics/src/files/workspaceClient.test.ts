// src/files/workspaceClient.test.ts — ACCEPTANCE committed by the planning
// lane of docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to
// lane `files-kit`.
//
// A PORT of the donor's suite, `/home/bam/systemsketch/src/workspace/
// workspaceClient.test.ts:1-144`, onto the client OBJECT (an injected `fetch`
// and `baseUrl` instead of a stubbed global), minus the keepalive-flush case
// (`flushWorkspaceDocument` is not ported), plus the routes the donor suite
// never pinned (list/load/rename/trash/reveal) and the base-URL join.
import { describe, expect, it, vi } from "vitest";

import {
  WorkspaceConflict,
  WorkspaceRequestError,
  WorkspaceRequestTimeout,
  WorkspaceTransportError,
  createHttpWorkspaceClient,
  isRetryableWorkspaceFailure,
} from "./workspaceClient";

const INPUT = { path: "/boards/Recovery.tldr", source: '{"valid":true}', baseDigest: null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("workspace writes", () => {
  it("creates a directory through the confined workspace API", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ name: "Architecture Ω", path: "/boards/Architecture Ω" }));
    const client = createHttpWorkspaceClient({ fetch });
    await expect(client.createDirectory("/boards", "Architecture Ω")).resolves.toEqual({ name: "Architecture Ω", path: "/boards/Architecture Ω" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/workspace/directory",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ parent: "/boards", name: "Architecture Ω" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("carries force=true on an explicit Save As replacement retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ conflict: true, error: "Recovery.tldr already exists", mtime: 12, digest: "disk" }, 409))
      .mockResolvedValueOnce(json({ path: INPUT.path, title: "Recovery", digest: "saved", mtime: 13, size: 20 }));
    const client = createHttpWorkspaceClient({ fetch });
    const refused = client.save(INPUT);
    await expect(refused).rejects.toBeInstanceOf(WorkspaceConflict);
    await expect(refused).rejects.toMatchObject({ diskMtime: 12, diskDigest: "disk", message: "Recovery.tldr already exists" });
    await client.save({ ...INPUT, force: true });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...INPUT, force: false });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ force: true });
  });

  it("consumes the exact digest returned by stat", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ path: INPUT.path, mtime: 12, size: 99, digest: "exact-bytes" }));
    await expect(createHttpWorkspaceClient({ fetch }).stat(INPUT.path)).resolves.toMatchObject({ digest: "exact-bytes" });
    expect(fetch.mock.calls[0][0]).toBe(`/api/workspace/stat?path=${encodeURIComponent(INPUT.path)}`);
  });

  it("bounds a stalled request with an actionable timeout", async () => {
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }),
    );
    await expect(createHttpWorkspaceClient({ fetch }).stat(INPUT.path, { timeoutMs: 5 })).rejects.toBeInstanceOf(WorkspaceRequestTimeout);
  });

  it("lets a caller cancel an obsolete document read", async () => {
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }),
    );
    const controller = new AbortController();
    const pending = createHttpWorkspaceClient({ fetch }).load(INPUT.path, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("classifies fetch TypeErrors at the request boundary, not arbitrary save work", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("network unavailable"));
    await expect(createHttpWorkspaceClient({ fetch }).stat(INPUT.path)).rejects.toBeInstanceOf(WorkspaceTransportError);
  });

  it("surfaces a non-JSON or error answer as a WorkspaceRequestError with its status", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }))
      .mockResolvedValueOnce(json({ error: "path must stay under an allowed root: /home/bam" }, 400));
    const client = createHttpWorkspaceClient({ fetch });
    await expect(client.list()).rejects.toMatchObject({ name: "WorkspaceRequestError", status: 502 });
    await expect(client.list("/etc")).rejects.toMatchObject({ status: 400, message: "path must stay under an allowed root: /home/bam" });
  });

  it("retries only transient controller and transport failures", () => {
    expect(isRetryableWorkspaceFailure(new WorkspaceRequestError("invalid path", 400))).toBe(false);
    expect(isRetryableWorkspaceFailure(new WorkspaceRequestError("try again", 503))).toBe(true);
    expect(isRetryableWorkspaceFailure(new WorkspaceRequestError("slow down", 429))).toBe(true);
    expect(isRetryableWorkspaceFailure(new WorkspaceRequestTimeout(5))).toBe(true);
    expect(isRetryableWorkspaceFailure(new WorkspaceTransportError("fetch failed"))).toBe(true);
    expect(isRetryableWorkspaceFailure(new TypeError("serialization failed"))).toBe(false);
    expect(isRetryableWorkspaceFailure(new Error("serialization failed"))).toBe(false);
  });
});

describe("the donor's route shapes, on any origin", () => {
  it("joins every route onto baseUrl and sends the donor's bodies", async () => {
    const fetch = vi.fn().mockImplementation(async () => json({ path: "/p.tldr", title: "p", digest: "d", mtime: 1, size: 1, dir: "/", directories: [], documents: [] }));
    const client = createHttpWorkspaceClient({ fetch, baseUrl: "http://127.0.0.1:43127" });
    await client.list();
    await client.list("/home/bam/SystemSketch");
    await client.load("/home/bam/SystemSketch/a b.tldr");
    await client.rename({ path: "/x/a.tldr", destination: "/x/b.tldr", baseDigest: "d1" });
    await client.trash({ path: "/x/b.tldr", baseDigest: "d2" });
    await client.reveal("/x/b.tldr");
    const calls = fetch.mock.calls.map(([url, init]) => [url, (init as RequestInit | undefined)?.method ?? "GET", (init as RequestInit | undefined)?.body ?? null]);
    expect(calls).toEqual([
      ["http://127.0.0.1:43127/api/workspace/list", "GET", null],
      [`http://127.0.0.1:43127/api/workspace/list?dir=${encodeURIComponent("/home/bam/SystemSketch")}`, "GET", null],
      [`http://127.0.0.1:43127/api/workspace/file?path=${encodeURIComponent("/home/bam/SystemSketch/a b.tldr")}`, "GET", null],
      ["http://127.0.0.1:43127/api/workspace/rename", "POST", JSON.stringify({ path: "/x/a.tldr", destination: "/x/b.tldr", baseDigest: "d1" })],
      ["http://127.0.0.1:43127/api/workspace/trash", "POST", JSON.stringify({ path: "/x/b.tldr", baseDigest: "d2" })],
      ["http://127.0.0.1:43127/api/workspace/reveal", "POST", JSON.stringify({ path: "/x/b.tldr" })],
    ]);
  });

  it("reads a missing document as a null source, not an error", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ path: "/boards/None.tldr", source: null }));
    await expect(createHttpWorkspaceClient({ fetch }).load("/boards/None.tldr")).resolves.toEqual({ path: "/boards/None.tldr", source: null });
  });

  it("looks the global fetch up at call time when none is injected", async () => {
    const client = createHttpWorkspaceClient();
    const fetch = vi.fn().mockResolvedValue(json({ path: "/a.tldr", mtime: null }));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(client.stat("/a.tldr")).resolves.toEqual({ path: "/a.tldr", mtime: null });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
