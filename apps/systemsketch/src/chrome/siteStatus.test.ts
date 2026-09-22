// src/chrome/siteStatus.test.ts — what a burger-menu "open another surface"
// row actually points at, per ./siteStatus.ts.
import { describe, expect, it } from "vitest";

import { describeStatus, probeSiteStatus, statusMismatchesOwn, type SiteStatus } from "./siteStatus";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("probeSiteStatus", () => {
  it("reports a non-loopback URL as remote without making a network call", async () => {
    let called = false;
    const status = await probeSiteStatus("https://bbox-ui.com/", {
      fetchImpl: (async () => {
        called = true;
        throw new Error("should not be called");
      }) as typeof fetch,
    });
    expect(status).toEqual({ kind: "remote" });
    expect(called).toBe(false);
  });

  it("parses a healthy loopback preview server", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5431/", {
      fetchImpl: (async () =>
        jsonResponse({
          product: "bbox-ui-storybook",
          channel: "preview",
          commit: "a1b2c3d4e5f6",
          branch: "lane-x",
          dirty: false,
          projectRoot: "/home/bam/bbox-ui",
        })) as typeof fetch,
    });
    expect(status).toEqual({
      kind: "live",
      channel: "preview",
      commit: "a1b2c3d4e5f6",
      branch: "lane-x",
      dirty: false,
      projectRoot: "/home/bam/bbox-ui",
      build: null,
    });
  });

  it("parses a healthy loopback stable server", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5430/", {
      fetchImpl: (async () =>
        jsonResponse({
          product: "bbox-ui-storybook",
          channel: "stable",
          commit: "a1b2c3d4e5f6",
          branch: "main",
          dirty: false,
          projectRoot: "/home/bam/bbox-ui",
          build: "0bc4dbea4ddc9a11",
        })) as typeof fetch,
    });
    expect(status.kind).toBe("live");
    expect((status as Extract<SiteStatus, { kind: "live" }>).channel).toBe("stable");
    expect((status as Extract<SiteStatus, { kind: "live" }>).build).toBe("0bc4dbea4ddc9a11");
  });

  it("degrades to dead on a non-OK response, never throwing", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5421/", {
      fetchImpl: (async () => jsonResponse({}, false)) as typeof fetch,
    });
    expect(status).toEqual({ kind: "dead" });
  });

  it("degrades to dead when the port refuses the connection, never throwing", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5421/", {
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
    });
    expect(status).toEqual({ kind: "dead" });
  });

  it("degrades to dead when the port never answers at all", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5421/", {
      timeoutMs: 5,
      fetchImpl: ((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })) as typeof fetch,
    });
    expect(status).toEqual({ kind: "dead" });
  });
});

describe("describeStatus", () => {
  it("labels remote plainly", () => {
    expect(describeStatus({ kind: "remote" })).toBe("(remote)");
  });

  it("shows nothing yet for an unresolved probe", () => {
    expect(describeStatus({ kind: "unknown" })).toBe("");
  });

  it("says a dead port is not running", () => {
    expect(describeStatus({ kind: "dead" })).toBe("(not running)");
  });

  it("shows channel, branch, short commit for a live preview", () => {
    const status: SiteStatus = {
      kind: "live",
      channel: "preview",
      commit: "a1b2c3d4e5f6",
      branch: "lane-x",
      dirty: false,
      projectRoot: "/repo",
      build: null,
    };
    expect(describeStatus(status)).toBe("(preview · lane-x · a1b2c3d)");
  });

  it("flags uncommitted changes", () => {
    const status: SiteStatus = {
      kind: "live",
      channel: "preview",
      commit: "a1b2c3d4e5f6",
      branch: "lane-x",
      dirty: true,
      projectRoot: "/repo",
      build: null,
    };
    expect(describeStatus(status)).toBe("(preview · lane-x · a1b2c3d · +uncommitted)");
  });

  it("falls back to the build hash when there is no commit (a thin /api/health)", () => {
    const status: SiteStatus = {
      kind: "live",
      channel: "stable",
      commit: null,
      branch: null,
      dirty: null,
      projectRoot: null,
      build: "0bc4dbea4ddc9a11",
    };
    expect(describeStatus(status)).toBe("(stable · 0bc4dbe)");
  });
});

describe("statusMismatchesOwn", () => {
  const own: SiteStatus = {
    kind: "live",
    channel: "preview",
    commit: "aaaaaaaaaaaa",
    branch: "main",
    dirty: false,
    projectRoot: "/home/bam/bbox-ui/.claude/worktrees/whiteboard-lane",
    build: null,
  };

  it("flags a different worktree even at the same commit", () => {
    const target: SiteStatus = { ...own, projectRoot: "/home/bam/bbox-ui" };
    expect(statusMismatchesOwn(target, own)).toBe(true);
  });

  it("flags a different commit when project roots agree", () => {
    const target: SiteStatus = { ...own, commit: "bbbbbbbbbbbb" };
    expect(statusMismatchesOwn(target, own)).toBe(true);
  });

  it("reports no mismatch for the same worktree and commit", () => {
    const target: SiteStatus = { ...own };
    expect(statusMismatchesOwn(target, own)).toBe(false);
  });

  it("never flags a mismatch it cannot actually tell (no projectRoot or commit on either side)", () => {
    const thin: SiteStatus = {
      kind: "live",
      channel: "stable",
      commit: null,
      branch: null,
      dirty: null,
      projectRoot: null,
      build: "0bc4dbea4ddc9a11",
    };
    expect(statusMismatchesOwn(thin, own)).toBe(false);
    expect(statusMismatchesOwn(own, thin)).toBe(false);
  });

  it("never flags remote or dead rows — there is nothing live to compare", () => {
    expect(statusMismatchesOwn({ kind: "remote" }, own)).toBe(false);
    expect(statusMismatchesOwn({ kind: "dead" }, own)).toBe(false);
  });
});
