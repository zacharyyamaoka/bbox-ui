// src/statusEndpointCors.test.ts — the Origin gate and the opaque checkout id
// on ../statusEndpoint.ts, this app's dev-server `/api/health`.
//
// WHY this test exists (judge finding, 2026-09-22 — HIGH): that endpoint
// answered EVERY caller with `Access-Control-Allow-Origin: *` while returning
// the checkout's absolute path, branch, commit and dirty state. Binding the
// listener to loopback does not close that: a tab open on any public site is
// itself running on this machine, so the page becomes the bridge and reads
// localhost on the remote origin's behalf. The gate is the fix, so the gate
// gets the test.
//
// It lives under `src/` because apps/systemsketch/vitest.config.ts's `unit`
// project includes `src/**/*.test.ts` — the same reason `src/devFileHost.test.ts`
// tests a module that also sits at the app root.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { checkoutId, decideOrigin, healthDocument } from "../statusEndpoint";

describe("decideOrigin", () => {
  it("allows a request with no Origin and emits no CORS header", () => {
    // A same-origin GET sends no Origin, and neither does curl or a Node
    // probe. Refusing these would break the badge and the launcher.
    expect(decideOrigin(undefined)).toEqual({ allow: true, echo: null });
  });

  it.each([
    "http://127.0.0.1:5421",
    "http://localhost:6006",
    "http://[::1]:4341",
    "https://localhost:8443",
  ])("echoes the loopback origin %s back exactly", (origin) => {
    expect(decideOrigin(origin)).toEqual({ allow: true, echo: origin });
  });

  it.each([
    ["https://evil.example", "non-loopback origin"],
    ["http://bbox-ui.com", "non-loopback origin"],
    ["http://127.0.0.1.evil.example", "non-loopback origin"],
    ["http://169.254.169.254", "non-loopback origin"],
    ["null", "opaque origin"],
    ["", "opaque origin"],
    // `new URL("file://")` parses — it is refused on the scheme, not the
    // shape. An opaque file:// page's real Origin header is the literal
    // "null" above; this row pins the scheme check itself.
    ["file://", "non-http origin"],
    ["not a url", "unparseable Origin"],
  ])("refuses %s", (origin, reason) => {
    // MUTATION: replace the body with `{ allow: true, echo: raw }` (the
    // `Access-Control-Allow-Origin: *` this replaced) and every row here
    // goes red.
    expect(decideOrigin(origin)).toEqual({ allow: false, reason });
  });

  it("refuses a duplicated Origin header, which no browser sends", () => {
    expect(decideOrigin(["http://127.0.0.1:1", "https://evil.example"])).toEqual({
      allow: false,
      reason: "duplicated Origin header",
    });
  });

  it("does not treat a hostname that merely CONTAINS a loopback name as loopback", () => {
    expect(decideOrigin("http://localhost.evil.example").allow).toBe(false);
  });
});

describe("checkoutId", () => {
  // The cross-language contract, pinned on both sides. Python's
  // `bbox_release.checkout_id` asserts this same literal
  // (scripts/tests/test_bbox_release.py, CheckoutIdTests.PINNED) — drift
  // between the two would make every cross-surface "same checkout?" answer
  // a permanent "no", and nothing else in either suite would notice.
  const PINNED = "574a7e5872fd";

  it("agrees with the Python implementation on a known path", () => {
    expect(checkoutId("/home/bam/bbox-ui")).toBe(PINNED);
  });

  it("is sha256 truncated to 12 hex chars", () => {
    expect(PINNED).toBe(createHash("sha256").update("/home/bam/bbox-ui").digest("hex").slice(0, 12));
    expect(checkoutId("/anything")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("gives two worktrees of one repo different ids", () => {
    expect(checkoutId("/home/bam/bbox-ui")).not.toBe(checkoutId("/home/bam/bbox-ui/.claude/worktrees/lane-a"));
  });
});

describe("healthDocument", () => {
  it("names the product and channel, and carries an opaque checkout id", () => {
    const document = healthDocument();
    expect(document.product).toBe("bbox-ui-systemsketch");
    expect(document.channel).toBe("preview");
    expect(document.checkoutId).toMatch(/^[0-9a-f]{12}$/);
  });

  it("no longer leaks the absolute project path", () => {
    // MUTATION: put `projectRoot: PROJECT_ROOT` back and this goes red.
    const serialised = JSON.stringify(healthDocument());
    expect(serialised).not.toContain("projectRoot");
    expect(serialised).not.toContain("/home/");
  });
});
