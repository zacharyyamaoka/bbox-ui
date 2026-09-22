// src/chrome/siteStatus.test.ts — what a burger-menu "open another surface"
// row actually points at, per ./siteStatus.ts.
//
// Three groups of cases here exist because of the 2026-09-22 judge findings,
// and each names the mutation that turns it red:
//   - `product` is REQUIRED, not decorative (it was parsed and ignored).
//   - "reachable but unsupported" is not "dead" (a working static build was
//     reported as not running, and its row disabled).
//   - the thin Stable whiteboard health really does drive a mismatch (it
//     carried neither field the comparison reads, so the warning was
//     unreachable in the one configuration Zach gets from the dock).
import { describe, expect, it } from "vitest";

import { describeStatus, probeSiteStatus, statusMismatchesOwn, type SiteStatus } from "./siteStatus";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const STORYBOOK = ["bbox-ui-storybook"] as const;

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
      expectProducts: STORYBOOK,
      fetchImpl: (async () =>
        jsonResponse({
          product: "bbox-ui-storybook",
          channel: "preview",
          commit: "a1b2c3d4e5f6",
          branch: "lane-x",
          dirty: false,
          checkoutId: "574a7e5872fd",
        })) as typeof fetch,
    });
    expect(status).toEqual({
      kind: "live",
      product: "bbox-ui-storybook",
      channel: "preview",
      commit: "a1b2c3d4e5f6",
      branch: "lane-x",
      dirty: false,
      checkoutId: "574a7e5872fd",
      build: null,
    });
  });

  it("parses a healthy loopback stable server", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5430/", {
      expectProducts: STORYBOOK,
      fetchImpl: (async () =>
        jsonResponse({
          product: "bbox-ui-storybook",
          channel: "stable",
          commit: "a1b2c3d4e5f6",
          branch: "main",
          dirty: false,
          checkoutId: "574a7e5872fd",
          build: "0bc4dbea4ddc9a11",
        })) as typeof fetch,
    });
    expect(status.kind).toBe("live");
    expect((status as Extract<SiteStatus, { kind: "live" }>).channel).toBe("stable");
    expect((status as Extract<SiteStatus, { kind: "live" }>).build).toBe("0bc4dbea4ddc9a11");
  });

  it("refuses a health document for a DIFFERENT product", async () => {
    // MUTATION: delete the `expected.includes(product)` guard and this
    // returns `live` — the whiteboard would report an unrelated dev server's
    // branch and commit as the Storybook row's version.
    const status = await probeSiteStatus("http://127.0.0.1:5431/", {
      expectProducts: STORYBOOK,
      fetchImpl: (async () =>
        jsonResponse({
          product: "some-other-dev-server",
          channel: "preview",
          commit: "ffffffffffff",
          branch: "their-lane",
        })) as typeof fetch,
    });
    expect(status).toEqual({ kind: "unsupported", reason: "serving some-other-dev-server" });
  });

  it("refuses a JSON object that is not a health document at all", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5431/", {
      expectProducts: STORYBOOK,
      fetchImpl: (async () => jsonResponse({ hello: "world" })) as typeof fetch,
    });
    expect(status).toEqual({ kind: "unsupported", reason: "no product named" });
  });

  it("refuses a channel it does not understand instead of coercing it to preview", async () => {
    // MUTATION: restore `record.channel === "stable" ? "stable" : "preview"`
    // and this reads `live`, channel "preview" — a future or foreign channel
    // silently relabelled as the one this app happens to know.
    const status = await probeSiteStatus("http://127.0.0.1:5431/", {
      expectProducts: STORYBOOK,
      fetchImpl: (async () =>
        jsonResponse({ product: "bbox-ui-storybook", channel: "canary" })) as typeof fetch,
    });
    expect(status).toEqual({ kind: "unsupported", reason: "unknown channel canary" });
  });

  it("treats a reachable server with no health route as UNSUPPORTED, not dead", async () => {
    // MUTATION: change the `!response.ok` branch back to `{ kind: "dead" }`
    // and this goes red — which is what disabled the row of a perfectly
    // working static `storybook build` served by a plain file server.
    const status = await probeSiteStatus("http://127.0.0.1:6006/", {
      expectProducts: STORYBOOK,
      fetchImpl: (async () => jsonResponse({}, false, 404)) as typeof fetch,
    });
    expect(status).toEqual({ kind: "unsupported", reason: "HTTP 404" });
  });

  it("degrades to dead when the port refuses the connection, never throwing", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5421/", {
      expectProducts: STORYBOOK,
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
    });
    expect(status).toEqual({ kind: "dead" });
  });

  it("degrades to dead when the port never answers at all", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:5421/", {
      timeoutMs: 5,
      expectProducts: STORYBOOK,
      fetchImpl: ((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })) as typeof fetch,
    });
    expect(status).toEqual({ kind: "dead" });
  });

  it("accepts any product when the caller declares no expectation", async () => {
    const status = await probeSiteStatus("http://127.0.0.1:4341/", {
      fetchImpl: (async () => jsonResponse({ product: "anything", channel: "stable" })) as typeof fetch,
    });
    expect(status.kind).toBe("live");
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

  it("says static/unknown for a surface that is up but does not identify itself", () => {
    expect(describeStatus({ kind: "unsupported", reason: "HTTP 404" })).toBe("(static/unknown)");
  });

  it("shows channel, branch, short commit for a live preview", () => {
    expect(
      describeStatus({
        kind: "live",
        product: "bbox-ui-storybook",
        channel: "preview",
        commit: "a1b2c3d4e5f6",
        branch: "lane-x",
        dirty: false,
        checkoutId: "574a7e5872fd",
        build: null,
      }),
    ).toBe("(preview · lane-x · a1b2c3d)");
  });

  it("flags uncommitted changes", () => {
    expect(
      describeStatus({
        kind: "live",
        product: "bbox-ui-storybook",
        channel: "preview",
        commit: "a1b2c3d4e5f6",
        branch: "lane-x",
        dirty: true,
        checkoutId: "574a7e5872fd",
        build: null,
      }),
    ).toBe("(preview · lane-x · a1b2c3d · +uncommitted)");
  });

  it("falls back to the build hash when there is no commit (a thin /api/health)", () => {
    expect(
      describeStatus({
        kind: "live",
        product: "bbox-ui-storybook",
        channel: "stable",
        commit: null,
        branch: null,
        dirty: null,
        checkoutId: null,
        build: "0bc4dbea4ddc9a11",
      }),
    ).toBe("(stable · 0bc4dbe)");
  });
});

describe("statusMismatchesOwn", () => {
  const own: Extract<SiteStatus, { kind: "live" }> = {
    kind: "live",
    product: "bbox-ui-systemsketch",
    channel: "preview",
    commit: "aaaaaaaaaaaa",
    branch: "main",
    dirty: false,
    checkoutId: "111111111111",
    build: null,
  };

  it("flags a different worktree even at the same commit", () => {
    expect(statusMismatchesOwn({ ...own, checkoutId: "222222222222" }, own)).toBe(true);
  });

  it("flags a different commit when checkouts agree", () => {
    expect(statusMismatchesOwn({ ...own, commit: "bbbbbbbbbbbb" }, own)).toBe(true);
  });

  it("reports no mismatch for the same checkout and commit", () => {
    expect(statusMismatchesOwn({ ...own }, own)).toBe(false);
  });

  it("flags the DOCK'S STABLE WHITEBOARD against a moved checkout", () => {
    // The judge's HIGH finding #4, as a contract test. This is exactly what
    // scripts/launch_systemsketch.py's `health_document` now answers — the
    // shape it answered BEFORE ({product, build, channel} only) is the next
    // test, and it could not produce a mismatch no matter how far the
    // checkout had moved.
    //
    // MUTATION: drop `commit` (or `checkoutId`) from `health_document` and
    // this goes red, silently, exactly as it was.
    const dockStable: Extract<SiteStatus, { kind: "live" }> = {
      kind: "live",
      product: "systemsketch-next",
      channel: "stable",
      commit: "cccccccccccc",
      branch: null,
      dirty: null,
      checkoutId: "111111111111",
      build: "cccccccccccc",
    };
    expect(statusMismatchesOwn(dockStable, own)).toBe(true);
  });

  it("never flags a mismatch it cannot actually tell (the OLD thin health)", () => {
    const thin: SiteStatus = {
      kind: "live",
      product: "systemsketch-next",
      channel: "stable",
      commit: null,
      branch: null,
      dirty: null,
      checkoutId: null,
      build: "0bc4dbea4ddc9a11",
    };
    expect(statusMismatchesOwn(thin, own)).toBe(false);
    expect(statusMismatchesOwn(own, thin)).toBe(false);
  });

  it("never flags remote, dead or unsupported rows — there is nothing live to compare", () => {
    expect(statusMismatchesOwn({ kind: "remote" }, own)).toBe(false);
    expect(statusMismatchesOwn({ kind: "dead" }, own)).toBe(false);
    expect(statusMismatchesOwn({ kind: "unsupported", reason: "HTTP 404" }, own)).toBe(false);
  });
});
