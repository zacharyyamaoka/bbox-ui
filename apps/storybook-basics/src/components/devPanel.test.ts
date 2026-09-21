// src/components/devPanel.test.ts — the two things about `DevPanel` a
// browser cannot see.
//
// The behavioural half lives in `src/components/DevPanel.stories.tsx` (the panel
// renders every row kind, a toggle reaches the host with its own id, the
// select opens, an action card fires, the X and Escape both close). This file
// covers what a play function structurally cannot:
//
//   1. The PURE MODEL — `visibleDevPanelSections` and friends are array maths
//      with no DOM, so testing them through a rendered panel would be slower
//      and would only ever reach the cases a story happens to paint.
//   2. OWNERSHIP — "the panel holds none of the actual things" is invisible to
//      a rendered test. A shell that imported a recorder store and one that
//      takes a `slot` row look identical in a browser and pass the same play
//      function; the only thing that tells them apart is what the file says.
//      Same failure class, and the same remedy, as `trunkOwnership.test.ts`.
//   3. THE DARK SCOPE — the panel re-declares the theme's dark tokens on its
//      own root, so the theme file is its oracle. A snapshot of values nobody
//      re-checks is how a panel ends up painting last year's dark.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEV_PANEL_DARK_TOKENS,
  DEV_PANEL_ROW_KINDS,
  devPanelRowIds,
  duplicateDevPanelRowIds,
  visibleDevPanelSections,
  type DevPanelSection,
} from "./devPanel.model";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.join(here, relative), "utf8");

const noop = () => {};

/** A section per row kind, so the helpers are exercised over the real union
 *  rather than three hand-picked shapes. */
function fixture(): DevPanelSection[] {
  return [
    {
      id: "channel",
      rows: [
        { kind: "status", id: "stable", title: "Stable", detail: "Verified 0.1.0", status: "Current", tone: "positive" },
        { kind: "action", id: "latest", eyebrow: "New", title: "Open Latest", onSelect: noop },
      ],
    },
    {
      id: "presentation",
      title: "Cable presentation",
      caption: "This browser, live",
      rows: [{ kind: "toggle", id: "solid", title: "Solid before the pill", checked: false, onCheckedChange: noop }],
    },
    {
      id: "boards",
      title: "Isolated presets",
      rows: [
        { kind: "avatar", id: "block-dev", initial: "B", title: "Block Dev", onSelect: noop },
        { kind: "slot", id: "recording", content: null },
      ],
    },
    {
      id: "bottom",
      rows: [
        { kind: "link", id: "version", title: "Version & updates", detail: "0.1.0", onSelect: noop },
        {
          kind: "select",
          id: "prototype",
          label: "Prototype",
          value: "lanes",
          options: [{ value: "lanes", label: "Lanes" }],
          onValueChange: noop,
        },
      ],
    },
  ];
}

describe("the model", () => {
  it("lists every visible row id in paint order", () => {
    expect(devPanelRowIds(fixture())).toEqual([
      "stable",
      "latest",
      "solid",
      "block-dev",
      "recording",
      "version",
      "prototype",
    ]);
  });

  it("drops hidden rows and hidden sections", () => {
    const sections = fixture();
    sections[0] = { ...sections[0], rows: [{ ...sections[0].rows[0], hidden: true }, sections[0].rows[1]] };
    sections[2] = { ...sections[2], hidden: true };
    expect(devPanelRowIds(sections)).toEqual(["latest", "solid", "version", "prototype"]);
  });

  it("drops a section whose last row went away, header and caption with it", () => {
    // The failure this prevents: a "CABLE PRESENTATION" heading and a "THIS
    // BROWSER, LIVE" caption floating above nothing.
    const sections = fixture().map((section) =>
      section.id === "presentation"
        ? { ...section, rows: section.rows.map((row) => ({ ...row, hidden: true })) }
        : section,
    );
    const visible = visibleDevPanelSections(sections);
    expect(visible.map((section) => section.id)).toEqual(["channel", "boards", "bottom"]);
    expect(visible.some((section) => section.caption === "This browser, live")).toBe(false);
  });

  it("never mutates its input, and hands back the same row objects", () => {
    const sections = fixture();
    const before = JSON.parse(JSON.stringify(sections, (_key, value) => (typeof value === "function" ? "fn" : value)));
    const visible = visibleDevPanelSections(sections);
    expect(JSON.parse(JSON.stringify(sections, (_key, value) => (typeof value === "function" ? "fn" : value)))).toEqual(before);
    expect(visible[0].rows[0]).toBe(sections[0].rows[0]);
  });

  it("reports a duplicate row id once, in first-seen order, and says nothing when there is none", () => {
    expect(duplicateDevPanelRowIds(fixture())).toEqual([]);
    const clashing = fixture();
    clashing[3] = {
      ...clashing[3],
      rows: [...clashing[3].rows, { kind: "link", id: "version", title: "Again", onSelect: noop }],
    };
    expect(duplicateDevPanelRowIds(clashing)).toEqual(["version"]);
  });

  it("does not count a HIDDEN twin as a duplicate", () => {
    // A host keeping both branches of an either/or in its array (the donor's
    // `isPreview ? … : …`) with one hidden is correct, not a clash.
    const sections = fixture();
    sections[3] = {
      ...sections[3],
      rows: [...sections[3].rows, { kind: "link", id: "version", title: "Again", onSelect: noop, hidden: true }],
    };
    expect(duplicateDevPanelRowIds(sections)).toEqual([]);
  });
});

/**
 * Comments out. A file is allowed to SAY "recording" while explaining why it
 * does not know what one is — `//` is only a comment when it is not the `://`
 * of a URL. Lifted from `trunkOwnership.test.ts`, which draws the same line.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every JSX element opened in a source file. Deliberately text-level: the
 *  point is what the file WRITES, not what React ends up rendering. */
function jsxTags(source: string): string[] {
  return [...code(source).matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s/>]/g)].map((match) => match[1]);
}

describe("the panel holds none of the actual things", () => {
  const shell = read("devPanel.tsx");
  const model = read("devPanel.model.ts");

  // Zach, 2026-09-19: "LIke the dev panel it self. should just use
  // placeholders for things. it shouldn't it self kinda hold any of the
  // actual things." Each of these is a real section of the donor panel; the
  // shell must know the WORD only as something a host passed it.
  it.each(["cable", "behavior tree", "behaviour tree", "preset", "recording", "recorder", "tldraw", "systemsketch"])(
    "the shell never mentions %s in code",
    (domainWord) => {
      expect(code(shell).toLowerCase()).not.toContain(domainWord);
      expect(code(model).toLowerCase()).not.toContain(domainWord);
    },
  );

  it("reaches for no store, no URL flag and no browser storage", () => {
    // A DevPanel that reads any of these has failed the brief: it takes
    // values and callbacks. `useEffect`/`useId` are React, not ambient state.
    for (const escape of ["localStorage", "sessionStorage", "URLSearchParams", "location.search", "window."]) {
      expect(code(shell), escape).not.toContain(escape);
    }
  });

  it("renders every declared row kind — a new kind cannot ship unpainted", () => {
    for (const kind of DEV_PANEL_ROW_KINDS) {
      expect(code(shell), kind).toContain(`case "${kind}":`);
    }
  });

  it("is assembled from stock parts, with nothing hand-rolled beside them", () => {
    for (const stockPart of ["Button", "Switch", "Select", "Badge", "Field", "Label", "Separator"]) {
      expect(jsxTags(shell), stockPart).toContain(stockPart);
    }
    // The raw DOM controls a stock part already exists for.
    expect(jsxTags(shell).filter((tag) => ["button", "input", "select", "label"].includes(tag))).toEqual([]);
  });
});

describe("the dark scope tracks the theme", () => {
  /** The `:root` block inside globals.css's `prefers-color-scheme: dark`
   *  media query — the oracle, written before this component existed and
   *  owned by the theme, not by this lane. */
  function themeDarkTokens(): Record<string, string> {
    const css = read("../globals.css");
    const media = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(media, "globals.css no longer declares a dark media query").toBeGreaterThan(-1);
    const open = css.indexOf("{", css.indexOf(":root", media));
    const close = css.indexOf("}", open);
    const block = css.slice(open + 1, close);
    return Object.fromEntries(
      [...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
    );
  }

  it("re-declares exactly the theme's dark values, character for character", () => {
    expect({ ...DEV_PANEL_DARK_TOKENS }).toEqual(themeDarkTokens());
  });

  it("is frozen, so no host can half-apply it", () => {
    expect(Object.isFrozen(DEV_PANEL_DARK_TOKENS)).toBe(true);
  });
});
