// src/chrome/legacyApp.test.ts — the burger's door back to the archived app.
import { describe, expect, it } from "vitest";

import { LEGACY_SYSTEMSKETCH_URL, legacyAppActionsFor } from "./legacyApp";

describe("legacyAppActionsFor", () => {
  it("offers one row on a loopback origin, and pressing it navigates to the old Stable channel", () => {
    const visited: string[] = [];
    const rows = legacyAppActionsFor("127.0.0.1", (url) => visited.push(url));
    expect(rows.map((row) => row.label)).toEqual(["Switch to old SystemSketch"]);
    rows[0].run();
    expect(visited).toEqual([LEGACY_SYSTEMSKETCH_URL]);
    expect(LEGACY_SYSTEMSKETCH_URL).toBe("http://127.0.0.1:4321/");
  });

  it("treats localhost the same as 127.0.0.1", () => {
    expect(legacyAppActionsFor("localhost", () => {})).toHaveLength(1);
  });

  it("offers nothing when the app is served from anywhere else", () => {
    expect(legacyAppActionsFor("bbox-ui.com", () => {})).toEqual([]);
  });
});
