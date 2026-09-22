// src/chrome/sites.test.ts — the burger's doors out to the other bbox-ui
// surfaces.
import { describe, expect, it } from "vitest";

import { BBOX_UI_SITE_URL, STORYBOOK_URL, expectedProductsFor, siteActionsFor } from "./sites";

describe("siteActionsFor", () => {
  it("offers both surfaces on a loopback origin, in the order they are reached", () => {
    const rows = siteActionsFor("127.0.0.1", () => {});
    expect(rows.map((row) => row.label)).toEqual(["Open bbox-ui.com", "Open Storybook"]);
  });

  it("pressing a row opens that surface's URL", () => {
    const opened: string[] = [];
    const rows = siteActionsFor("127.0.0.1", (url) => opened.push(url));
    rows.forEach((row) => row.run());
    expect(opened).toEqual([BBOX_UI_SITE_URL, STORYBOOK_URL]);
    expect(BBOX_UI_SITE_URL).toBe("https://bbox-ui.com/");
    // The port `apps/storybook-basics` defaults to, and the one Zach reviews on.
    expect(STORYBOOK_URL).toBe("http://127.0.0.1:5421/");
  });

  it("treats localhost the same as 127.0.0.1", () => {
    expect(siteActionsFor("localhost", () => {})).toHaveLength(2);
  });

  it("keeps the deployed site but drops Storybook when served from anywhere else", () => {
    // Storybook is a dev server on this machine; from another origin the row
    // would point at nothing, so it is absent rather than broken.
    const rows = siteActionsFor("bbox-ui.com", () => {});
    expect(rows.map((row) => row.label)).toEqual(["Open bbox-ui.com"]);
  });
});

describe("expectedProductsFor", () => {
  it("pins the Storybook row to the Storybook product", () => {
    // MUTATION: return `undefined` here and the probe accepts whatever is on
    // :5421 — the judge's finding that `product` was parsed and ignored.
    expect(expectedProductsFor("open-storybook")).toEqual(["bbox-ui-storybook"]);
  });

  it("asserts nothing for the deployed site, which is never probed", () => {
    expect(expectedProductsFor("open-bbox-ui-site")).toBeUndefined();
  });

  it("asserts nothing for a row it does not know", () => {
    // Better an unlabelled row than a wrong label.
    expect(expectedProductsFor("some-future-row")).toBeUndefined();
  });
});
