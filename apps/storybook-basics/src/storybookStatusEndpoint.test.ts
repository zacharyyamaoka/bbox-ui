// src/storybookStatusEndpoint.test.ts — the Origin gate, the opaque checkout
// id and the published ports on `.storybook/statusEndpoint.ts`, the
// `storybook dev` `/api/health` this product's badge now derives its whole
// identity from.
//
// WHY it is tested separately from apps/systemsketch's copy rather than the
// two sharing a module: CLAUDE.md records the duplication as deliberate (two
// Vite configs, no cross-app import path). A deliberate duplicate needs a
// duplicate test, or the copy that nobody checks is the one that drifts —
// and the thing that must not drift here is a security gate and a digest two
// languages compute independently.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { checkoutId, decideOrigin, healthDocument } from "../.storybook/statusEndpoint";

describe("decideOrigin (Storybook copy)", () => {
  it("allows a request with no Origin and emits no CORS header", () => {
    expect(decideOrigin(undefined)).toEqual({ allow: true, echo: null });
  });

  it.each(["http://127.0.0.1:5421", "http://localhost:5430", "http://[::1]:5431"])(
    "echoes the loopback origin %s back exactly",
    (origin) => {
      expect(decideOrigin(origin)).toEqual({ allow: true, echo: origin });
    },
  );

  it.each([
    ["https://evil.example", "non-loopback origin"],
    ["http://127.0.0.1.evil.example", "non-loopback origin"],
    ["http://localhost.evil.example", "non-loopback origin"],
    ["null", "opaque origin"],
    ["file://", "non-http origin"],
    ["garbage", "unparseable Origin"],
  ])("refuses %s", (origin, reason) => {
    // MUTATION: this endpoint used to send `Access-Control-Allow-Origin: *`
    // unconditionally; replacing the body with `{ allow: true, echo: raw }`
    // turns every row here red.
    expect(decideOrigin(origin)).toEqual({ allow: false, reason });
  });
});

describe("checkoutId (Storybook copy)", () => {
  // Same pinned literal as scripts/tests/test_bbox_release.py's
  // CheckoutIdTests.PINNED and apps/systemsketch's own copy. Three
  // implementations, one value, asserted in all three places.
  const PINNED = "574a7e5872fd";

  it("agrees with the Python and SystemSketch implementations", () => {
    expect(checkoutId("/home/bam/bbox-ui")).toBe(PINNED);
    expect(PINNED).toBe(createHash("sha256").update("/home/bam/bbox-ui").digest("hex").slice(0, 12));
  });
});

describe("healthDocument (Storybook copy)", () => {
  it("names this product, the live channel, and an opaque checkout id", () => {
    const document = healthDocument();
    expect(document.product).toBe("bbox-ui-storybook");
    expect(document.channel).toBe("preview");
    expect(document.checkoutId).toMatch(/^[0-9a-f]{12}$/);
  });

  it("publishes the Stable origin so the badge never hardcodes a port", () => {
    // MUTATION: delete `stableOrigin` and the badge silently falls back to
    // :5430 — which is exactly the hardcoded behaviour this replaced, and a
    // configured BBOXUI_SB_STABLE_PORT stops being reachable.
    const document = healthDocument();
    expect(document.stableOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(document.previewOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("no longer leaks the absolute project path", () => {
    const serialised = JSON.stringify(healthDocument());
    expect(serialised).not.toContain("projectRoot");
    expect(serialised).not.toContain("/home/");
  });
});
