import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOLBAR_PREFERENCES,
  parseToolbarPreferences,
} from "../src/toolbar/toolbarModel";

describe("parseToolbarPreferences", () => {
  it("falls back to defaults on anything malformed", () => {
    expect(parseToolbarPreferences(null)).toEqual(DEFAULT_TOOLBAR_PREFERENCES);
    expect(parseToolbarPreferences("nope")).toEqual(DEFAULT_TOOLBAR_PREFERENCES);
    expect(parseToolbarPreferences(42)).toEqual(DEFAULT_TOOLBAR_PREFERENCES);
    expect(parseToolbarPreferences([])).toEqual(DEFAULT_TOOLBAR_PREFERENCES);
    expect(parseToolbarPreferences({})).toEqual(DEFAULT_TOOLBAR_PREFERENCES);
  });

  it("recovers field by field, keeping the valid ones", () => {
    expect(
      parseToolbarPreferences({
        lastShapeTool: "ellipse",
        lastDrawTool: "not-a-tool",
        lastBlackBoxTool: "bbox-port",
      }),
    ).toEqual({
      version: 1,
      lastShapeTool: "ellipse",
      lastDrawTool: "draw",
      lastBlackBoxTool: "bbox-port",
    });
  });

  it("rejects tools that are not members of their family", () => {
    expect(
      parseToolbarPreferences({
        lastShapeTool: "bbox-block",
        lastDrawTool: "rectangle",
        lastBlackBoxTool: "draw",
      }),
    ).toEqual(DEFAULT_TOOLBAR_PREFERENCES);
  });

  it("round-trips valid preferences unchanged", () => {
    const valid = {
      version: 1,
      lastShapeTool: "diamond",
      lastDrawTool: "highlight",
      lastBlackBoxTool: "bbox-block",
    };
    expect(parseToolbarPreferences(valid)).toEqual(valid);
  });
});
