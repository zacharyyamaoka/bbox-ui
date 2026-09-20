// src/components/trunkOwnership.test.ts — the trunk owns the chrome, and it
// owns it out of STOCK parts. Acceptance for the judge's P2-7 and P2-8.
//
// Zach, 2026-09-19: "all of the feedback regarding the chrome should be made in
// bbox-ui editor-components, not in system sketch, system sketch should just be
// kinda like importing these stock menus and doing a light bit of
// configuration" and "as always please be using stock shadcn as much as
// possible".
//
// WHY this is a SOURCE test and not only a story: both findings are about
// OWNERSHIP, and ownership is invisible to a behavioural test. A confirmation
// dialog hand-built inside `apps/systemsketch` and one imported from the trunk
// look identical in a browser and pass the same play function — the only thing
// that tells them apart is which file the JSX lives in. Same for a hand-styled
// `<button className="…hover:bg-muted">` versus stock `Button`: identical to a
// click, and the next host inherits nothing from the first. The failure this
// prevents is silent divergence (`ARCHITECTURE.md:44-81` measured the last
// vendored copy diverging inside a day), so the assertion has to be able to see
// the divergence — i.e. read the file.
//
// The behavioural half lives beside it and is NOT replaced by this file:
// `stories/ConfirmDialog.stories.tsx` (the confirm surface actually confirms,
// cancels and dismisses exactly once) and
// `stories/FileNavigatorStockParts.stories.tsx` (breadcrumb navigation, the
// current crumb's `aria-current="page"`, the rails' keyboard order).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");

const read = (relative: string) => readFileSync(path.join(repo, relative), "utf8");

const CHROME_BAR = "apps/systemsketch/src/chrome/chromeBar.tsx";
const CONFIRM_DIALOG = "apps/storybook-basics/src/components/confirmDialog.tsx";
const FILE_NAVIGATOR = "apps/storybook-basics/src/components/fileNavigator.tsx";
const SETTINGS_VIEW = "apps/storybook-basics/src/components/settingsView.tsx";

/**
 * Comments out. A file is allowed to SAY `<button>` while explaining why it no
 * longer writes one — `//` is only a comment when it is not the `://` of a URL.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Every JSX element opened in a source file, e.g. `<button`, `<Button`,
 * `<BreadcrumbLink`. Deliberately text-level: the point is what the file
 * WRITES, not what React ends up rendering.
 */
function jsxTags(source: string): string[] {
  return [...code(source).matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s/>]/g)].map((match) => match[1]);
}

/** The lowercase (raw DOM) interactive elements a stock part already exists for. */
const HAND_ROLLED_CONTROLS = ["button", "input", "select", "table", "thead", "tbody", "th", "td", "tr"];

describe("P2-7 · the confirmation surface belongs to the trunk", () => {
  it("the trunk ships a data-driven confirm surface over the stock Dialog", async () => {
    const source = read(CONFIRM_DIALOG);
    // Built on the stock primitives, not on a second hand-rolled modal.
    expect(source).toMatch(/from "\.\/dialog"/);
    expect(source).toMatch(/from "\.\/button"/);
    for (const stockPart of ["Dialog", "DialogContent", "DialogTitle", "DialogFooter", "Button"]) {
      expect(jsxTags(source), stockPart).toContain(stockPart);
    }
    // …and nothing hand-rolled beside them.
    expect(jsxTags(source).filter((tag) => HAND_ROLLED_CONTROLS.includes(tag))).toEqual([]);

    const module = (await import("./confirmDialog")) as Record<string, unknown>;
    expect(typeof module.ConfirmDialog).toBe("function");
    expect(typeof module.useConfirm).toBe("function");
  });

  it("the app configures that surface and builds no dialog chrome of its own", () => {
    const source = read(CHROME_BAR);
    expect(source).toMatch(/from "@trunk\/components\/confirmDialog"/);
    expect(source).toMatch(/useConfirm\(/);

    // The exact chrome the judge found at chromeBar.tsx:79 — a header, a body,
    // a footer, two buttons and a dismissal, all authored inside the app.
    // Comments out: the file may still NAME what it stopped doing.
    const written = code(source);
    for (const appOwnedChrome of [
      "TldrawUiDialogHeader",
      "TldrawUiDialogTitle",
      "TldrawUiDialogCloseButton",
      "TldrawUiDialogBody",
      "TldrawUiDialogFooter",
      "TldrawUiButton",
      "TldrawUiButtonLabel",
      "useDialogs",
      "addDialog",
    ]) {
      expect(written, appOwnedChrome).not.toContain(appOwnedChrome);
    }
    expect(jsxTags(source).filter((tag) => HAND_ROLLED_CONTROLS.includes(tag))).toEqual([]);
  });
});

describe("P2-8 · the trunk's own controls are stock parts", () => {
  it.each([
    ["fileNavigator.tsx", FILE_NAVIGATOR],
    ["settingsView.tsx", SETTINGS_VIEW],
  ])("%s hand-styles no control a stock part already covers", (_name, file) => {
    expect(jsxTags(read(file)).filter((tag) => HAND_ROLLED_CONTROLS.includes(tag))).toEqual([]);
  });

  it("the navigator's path row is the stock Breadcrumb", () => {
    const source = read(FILE_NAVIGATOR);
    expect(source).toMatch(/from "\.\/breadcrumb"/);
    for (const stockPart of ["Breadcrumb", "BreadcrumbList", "BreadcrumbItem", "BreadcrumbLink", "BreadcrumbPage", "BreadcrumbSeparator"]) {
      expect(jsxTags(source), stockPart).toContain(stockPart);
    }
  });

  it("the navigator's Places/Recent rail and sort headers are stock Buttons", () => {
    const source = read(FILE_NAVIGATOR);
    // Each rail row and each sort header still carries its test id, and each
    // now sits on a `Button` — the ids are the behaviour the stories drive.
    for (const testId of ["place", "recent", "sort-"]) {
      // Either quoting form — `testId("place")` or `` testId(`sort-${column}`) ``.
      expect(new RegExp(`testId\\([\`"]${testId}`).test(source), testId).toBe(true);
    }
    expect(jsxTags(source)).toContain("Button");
  });

  it("the settings category nav is stock Buttons that still mark the open page", () => {
    const source = read(SETTINGS_VIEW);
    expect(source).toMatch(/from "\.\/button"/);
    expect(source).toMatch(/data-slot="settings-nav"/);
    // The donor's own semantics (InterfaceSettings.tsx:164-222) and the
    // SettingsView DOM contract: the active category is `aria-current="page"`.
    expect(source).toMatch(/aria-current=\{[^}]*"page"/);
  });

  it("keeps settingsView's reading measure and the WHY that explains it", () => {
    const source = read(SETTINGS_VIEW);
    expect(source).toContain("max-w-2xl");
    expect(source).toMatch(/WHY: the pane fills the window in `page` presentation/);
  });
});
