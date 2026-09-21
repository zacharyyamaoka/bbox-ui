// src/review/boardParam.smoke.test.tsx — `?board=` against the real App in real
// headless Chromium: the loaded board is exactly the fixture's shapes, it is
// not undoable, the viewport lands on it, and every failure is a visible
// banner that leaves the editor alone.
//
// __fixtures__/two-blocks.tldr was produced ONCE by driving the real app on a
// private dev server: two `ss-block`s (decode() -> scale()) and one wire made
// with the app's own `createWire`, then `serializeBoard(editor)`.
// __fixtures__/schema-invalid.tldr is that file with decode()'s `name` changed
// from a string to the number 12345, which the block validator refuses.
// __fixtures__/empty.tldr is a valid board with ZERO shapes: mount the real app
// with `persistenceKey: null`, touch nothing, and write `serializeBoard(editor)`
// (chrome/FileMenu/fileActions.ts) out verbatim — the app's own serializer, not a
// hand-edited file, so "it parses" is a measurement.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";
import { mountApp, waitFor, type MountedApp } from "../testing/harness";
import twoBlocksUrl from "./__fixtures__/two-blocks.tldr?url";
import schemaInvalidUrl from "./__fixtures__/schema-invalid.tldr?url";
import emptyUrl from "./__fixtures__/empty.tldr?url";
import { boardUrlFromSearch, loadBoardFromUrl, openBoardFromBoot } from "./boardParam";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
  document.querySelectorAll('[data-testid="board-load-error"]').forEach((banner) => banner.remove());
  vi.restoreAllMocks();
});

/** What `main.tsx` does at boot, minus the URL: parse `?board=<value>` and open it. */
async function boot(editor: Editor, boardValue: string): Promise<void> {
  const search = `?board=${boardValue}`;
  await openBoardFromBoot(editor, boardUrlFromSearch(search, location.origin), search);
}

function banner(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="board-load-error"]');
}

function shapeIds(editor: Editor): string[] {
  return [...editor.getCurrentPageShapeIds()].sort();
}

/** A board with something on it, so "the editor was left alone" is a real claim. */
function seedPreviousBoard(editor: Editor): TLShapeId {
  const id = createShapeId("previous");
  editor.createShape({ id, type: "geo", x: 10, y: 10, props: { w: 50, h: 50 } });
  return id;
}

describe("?board= — loading a good board", () => {
  it("puts exactly the fixture's shapes in the editor, not undoable, viewport on the content, wire bound at both ends", async () => {
    app = await mountApp();
    const { editor } = app;
    const previous = seedPreviousBoard(editor);
    expect(editor.getCanUndo()).toBe(true);
    // Park the camera nowhere near the fixture, so "the viewport covers the
    // content" is a measurement of the swap, not of where the camera started.
    editor.setCamera({ x: -9000, y: -9000, z: 1 });
    const cameraBefore = editor.getCamera();

    const result = await loadBoardFromUrl(editor, twoBlocksUrl);

    expect(result).toEqual({ ok: true, shapeCount: 3 });
    expect(editor.getShape(previous)).toBeUndefined();
    expect(shapeIds(editor)).toEqual(["shape:decode", "shape:scale", expect.stringMatching(/^shape:/)].sort());
    const types = editor.getCurrentPageShapes().map((shape) => shape.type).sort();
    expect(types).toEqual(["ss-block", "ss-block", WIRE_SHAPE_TYPE]);

    // Ctrl+Z must not resurrect the previous board.
    expect(editor.getCanUndo()).toBe(false);

    const bounds = editor.getCurrentPageBounds();
    expect(bounds).toBeDefined();
    expect(editor.getCamera()).not.toEqual(cameraBefore);
    expect(editor.getViewportPageBounds().contains(bounds!)).toBe(true);

    const wire = editor.getCurrentPageShapes().find((shape) => shape.type === WIRE_SHAPE_TYPE)!;
    const bindings = editor.getBindingsFromShape(wire, WIRE_BINDING_TYPE);
    expect(bindings).toHaveLength(2);
    expect(bindings.map((binding) => binding.toId).sort()).toEqual(["shape:decode", "shape:scale"]);
    for (const binding of bindings) expect(editor.getShape(binding.toId)).toBeDefined();
    expect(banner()).toBeNull();
  });

  it("opens through the boot path with the literal ?board= form and shows no banner", async () => {
    app = await mountApp();
    await boot(app.editor, twoBlocksUrl);
    await waitFor(() => (app!.editor.getCurrentPageShapeIds().size === 3 ? true : null), { what: "the fixture's three shapes" });
    expect(banner()).toBeNull();
  });
});

describe("?board= — failures are loud and leave the editor alone", () => {
  async function expectBannerAndUntouched(boardValue: string, reasonText: RegExp, stubFetch?: () => void) {
    app = await mountApp();
    const previous = seedPreviousBoard(app.editor);
    const idsBefore = shapeIds(app.editor);
    // Installed only now: tldraw's own mount-time fetches would consume a `Once` stub.
    stubFetch?.();
    await boot(app.editor, boardValue);
    const shown = await waitFor(banner, { what: "the board-load-error banner" });
    expect(shown.textContent).toMatch(reasonText);
    expect(shapeIds(app.editor)).toEqual(idsBefore);
    expect(app.editor.getShape(previous)).toBeDefined();
    expect(app.editor.getCanUndo()).toBe(true);
    return shown;
  }

  it("a 404 names the status and the URL it tried", async () => {
    // The Vitest dev server answers EVERY unknown path with 200 + index.html
    // (SPA fallback; measured on eight probe paths), so a real 404 cannot be
    // provoked from it. The status is stubbed and the fetch is still the real
    // call site; the missing-path-served-as-HTML case is the next test.
    const url = "/src/review/__fixtures__/does-not-exist.tldr";
    const shown = await expectBannerAndUntouched(url, /HTTP 404 Not Found/, () => {
      vi.spyOn(window, "fetch").mockResolvedValueOnce(new Response("gone", { status: 404, statusText: "Not Found" }));
    });
    expect(shown.textContent).toContain(url);
  });

  it("a network failure names the fetch error", async () => {
    await expectBannerAndUntouched("/src/review/__fixtures__/two-blocks.tldr", /fetch failed: Failed to fetch/, () => {
      vi.spyOn(window, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    });
  });

  it("a non-JSON body names the parse failure", async () => {
    // Vite serves this module as JavaScript: a real 200 whose body is not a
    // .tldr (the same thing a missing path gets here, as index.html).
    const shown = await expectBannerAndUntouched("/src/review/boardParam.ts", /\.tldr parse failed: notATldrawFile/);
    expect(shown.textContent).toContain("/src/review/boardParam.ts");
  });

  it("a schema-invalid .tldr names the parse failure", async () => {
    await expectBannerAndUntouched(schemaInvalidUrl, /\.tldr parse failed: (invalidRecords|migrationFailed)/);
  });

  it("a valid board with zero shapes is refused with a banner, not swapped in as a blank canvas", async () => {
    const shown = await expectBannerAndUntouched(emptyUrl, /it loaded but contains no shapes, so the canvas would be blank/);
    expect(shown.textContent).toBe(`Could not open the board ${new URL(emptyUrl, location.origin).href}: it loaded but contains no shapes, so the canvas would be blank`);
    // Direct call too: the result is the refusal, not `ok: true, shapeCount: 0`.
    const result = await loadBoardFromUrl(app!.editor, emptyUrl);
    expect(result).toEqual({ ok: false, reason: "it loaded but contains no shapes, so the canvas would be blank" });
  });

  it("a cross-origin URL is refused with its reason and NEVER fetched", async () => {
    app = await mountApp();
    const previous = seedPreviousBoard(app.editor);
    const idsBefore = shapeIds(app.editor);
    const fetchSpy = vi.spyOn(window, "fetch");
    await boot(app.editor, "https://evil.example/board.tldr");
    const shown = await waitFor(banner, { what: "the board-load-error banner" });
    expect(shown.textContent).toContain("https://evil.example is not this app's origin");
    expect(shown.textContent).toContain("https://evil.example/board.tldr");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(shapeIds(app.editor)).toEqual(idsBefore);
    expect(app.editor.getShape(previous)).toBeDefined();
  });
});
