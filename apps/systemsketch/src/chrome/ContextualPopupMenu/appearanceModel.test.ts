// src/chrome/ContextualPopupMenu/appearanceModel.test.ts — the pure half of the
// selection pill's APPEARANCE vocabulary. No editor internals, no DOM:
// everything here is a function of what `getSharedStyles()` reports, which is
// the whole reason `buildAppearance` reads that map and nothing else to decide
// what the bar offers.
//
// PROVENANCE. These four claims were `arrangeActions.test.ts`'s `STYLE_ROWS`
// and `activeStyleRows` describes, which tested a vocabulary that no longer
// exists: the six per-tldraw-style rows were replaced on 2026-09-24 by the four
// triggers `appearanceModel.ts` declares (shape · inside · edge · text, plus
// the app's diff). The claims did not change — only the export they are made
// against, and the fact that a "row" is now either a TRIGGER or a stacked
// SECTION inside one trigger's panel. Each one is carried across below with its
// original reasoning, amended where the mechanism moved.
//
// WHY a stand-in editor rather than the real one, and why that is honest here:
// `src/appearance/testEditor.ts`'s `makeTestEditor()` is a real tldraw `Editor`
// and would be the better oracle, but it needs a DOM (`TextManager` reaches for
// `document` in the constructor) and the `unit` project is `environment:
// "node"` — measured, `ReferenceError: document is not defined` from
// `Editor.getContainer`. That costs nothing that matters to THESE claims: every
// one of them is about what `buildAppearance` does with the shared-style map,
// and the thing that must not be faked — the option lists — is not faked. They
// come from tldraw's real imported `StyleProp` objects, exactly as the old
// `STYLE_ROWS` test read them. Anything that measures the EDITOR (a colour
// actually landing on a shape, a face painting the theme's hex) lives in
// `src/selectionPill.smoke.test.tsx`, against the real mounted app.
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  type Editor,
  type StyleProp,
} from "tldraw";
import { describe, expect, it } from "vitest";

import { stackModes, type BoundControl } from "@trunk/editor/controlRegistry";

import { DiffMarkStyle } from "../../shapes/shared/diffMark";
import { TWO_FACES_RECIPE, buildAppearance } from "./appearanceModel";

type SharedEntry = { type: "shared"; value: string } | { type: "mixed" };

/**
 * A stand-in for the live editor: `getSharedStyles()` answers from the map the
 * test hands it, and NOTHING is selected.
 *
 * WHY an empty selection is the right posture and not a dodge: every non-style
 * reader `buildAppearance` calls — `sharedStrokeWidth`, `sharedEdgeFollowsFill`,
 * `sharedEdgeColor`, `sharedFontPx` — funnels through
 * `selectedShapesDeep(editor)` and returns `null` ("this section does not
 * apply") for an empty one. So the composition under test is driven by the
 * shared-style map alone, which is exactly the claim: what appears is tldraw's
 * answer, never a switch on shape type.
 */
function editorSharing(entries: ReadonlyMap<StyleProp<string>, SharedEntry>): Editor {
  return {
    getSharedStyles: () => ({ get: (style: unknown) => entries.get(style as StyleProp<string>) }),
    getSelectedShapes: () => [],
    getSelectedShapeIds: () => [],
    getSharedOpacity: () => ({ type: "shared", value: 1 }),
  } as unknown as Editor;
}

function shared(...styles: StyleProp<string>[]): Map<StyleProp<string>, SharedEntry> {
  return new Map(styles.map((style) => [style, { type: "shared", value: valuesOf(style)[0]! }]));
}

/** tldraw's runtime enum for a style — the same reach `appearanceModel.ts` makes. */
function valuesOf(style: StyleProp<string>): readonly string[] {
  return (style as unknown as { values: readonly string[] }).values ?? [];
}

const GEO = GeoShapeGeoStyle as unknown as StyleProp<string>;
const DIFF = DiffMarkStyle as unknown as StyleProp<string>;

/** Every style a stock geo box shares, which is the widest bar this app draws. */
const EVERY_STYLE = [
  GEO,
  DefaultColorStyle,
  DefaultFillStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
] as StyleProp<string>[];

function triggerIds(editor: Editor): string[] {
  const bundle = buildAppearance(editor);
  if (!bundle) return [];
  return bundle.composition.groups.flatMap((group) => group.controls.map((control) => control.id));
}

function controlById(editor: Editor, id: string): BoundControl | undefined {
  const bundle = buildAppearance(editor);
  return bundle?.composition.groups
    .flatMap((group) => group.controls as BoundControl[])
    .find((control) => control.id === id);
}

/** A trigger's own options PLUS every section stacked above them — i.e. every
 *  option list its panel actually renders, walked with the same `stackModes`
 *  the panel walks rather than a second traversal written here. */
function panelSections(control: BoundControl): BoundControl[] {
  return [control, ...stackModes(control)];
}

describe("the appearance vocabulary — read off tldraw's own enums, never re-spelled here", () => {
  // THIS IS THE LOAD-BEARING ONE, and it is load-bearing for the same reason it
  // was under `STYLE_ROWS`: `valuesOf()` reaches for `StyleProp.values`, which
  // is a runtime field rather than a documented part of the type. If a tldraw
  // upgrade renames or drops it, every control silently becomes an empty option
  // list and the panels render as rows of empty popovers — a failure that looks
  // like a CSS bug, not a break. This test turns that into a red line the day it
  // happens.
  //
  // AMENDED for the new vocabulary: a "row" used to be a top-level entry in
  // `STYLE_ROWS`, so iterating that array reached all of them. Now `fill`,
  // `dash`, `font` and `align` are stacked SECTIONS inside a trigger's panel, so
  // the walk goes through `stackModes` — the same function `ControlPanel` uses
  // to decide what to draw. A section with no options would render exactly the
  // empty panel this test exists to catch.
  it("every control and every stacked section has a non-empty option list", () => {
    const editor = editorSharing(shared(...EVERY_STYLE, DIFF));
    const bundle = buildAppearance(editor)!;
    expect(bundle, "a selection sharing every style gets a bar").not.toBeNull();

    const seen: string[] = [];
    for (const group of bundle.composition.groups) {
      for (const control of group.controls as BoundControl[]) {
        for (const section of panelSections(control)) {
          seen.push(section.id);
          expect(
            section.options.length,
            `${section.id} has options (StyleProp.values still exists?)`,
          ).toBeGreaterThan(0);
        }
      }
    }
    // Guard the guard: a walk that silently reached nothing would pass the loop
    // above vacuously. The four triggers plus fill, dash, font and align.
    expect(seen.length, `sections walked: ${seen.join(", ")}`).toBeGreaterThanOrEqual(8);
  });

  it("carries tldraw's real vocabulary, not a guess: colours include black and blue, dash includes solid and dashed, size includes s and xl, fill includes none and solid", () => {
    const editor = editorSharing(shared(...EVERY_STYLE, DIFF));
    const valuesFor = (triggerId: string, sectionId: string): string[] => {
      const control = controlById(editor, triggerId)!;
      const section = panelSections(control).find((entry) => entry.id === sectionId)!;
      return section.options.map((option) => option.value);
    };

    expect(valuesFor("inside", "inside")).toEqual(expect.arrayContaining(["black", "blue"]));
    expect(valuesFor("inside", "fill-style")).toEqual(expect.arrayContaining(["none", "solid"]));
    expect(valuesFor("edge", "dash")).toEqual(expect.arrayContaining(["solid", "dashed"]));
    expect(valuesFor("text", "text")).toEqual(expect.arrayContaining(["s", "xl"]));
  });

  it("only the two paint triggers paint swatches; the rest are named, because there is nothing to show", () => {
    // Carried from `STYLE_ROWS`' "only the colour row paints swatches". The
    // colour row split in two — inside and edge — when Zach asked for "1 for
    // dealing with the inside, 1 for dealling with the stroke", so the claim is
    // now that exactly those two carry the swatch layout and nothing else does.
    const editor = editorSharing(shared(...EVERY_STYLE, DIFF));
    const bundle = buildAppearance(editor)!;
    const swatched = bundle.composition.groups
      .flatMap((group) => group.controls as BoundControl[])
      .flatMap(panelSections)
      .filter((section) => section.layout === "swatches")
      .map((section) => section.id);
    expect(swatched).toEqual(["inside", "edge"]);
  });
});

describe("the selection decides which controls exist", () => {
  it("drops a control the selection does not carry at all — a shape with a colour and a fill gets Inside and nothing else", () => {
    // The direct descendant of "an arrow has a colour but no fill". Same
    // mechanism, read at the trigger the styles now feed: no geo style means no
    // Shape trigger, no dash means no Edge trigger, no size means no Text
    // trigger. Nothing here switches on a shape type, and nothing should.
    const editor = editorSharing(shared(DefaultColorStyle, DefaultFillStyle));
    expect(triggerIds(editor)).toEqual(["inside"]);
  });

  it("Inside needs BOTH a colour and a fill treatment — a colour alone is not a fill", () => {
    // Not in the old suite, and it belongs here: `buildAppearance` binds the
    // Inside trigger only when the selection shares `DefaultFillStyle` too,
    // because the trigger's face PAINTS the fill treatment and a face drawn from
    // a colour the shape has no way to fill with would be a picture of a lie.
    expect(triggerIds(editorSharing(shared(DefaultColorStyle)))).toEqual([]);
  });

  it("reports a DISAGREEING selection as mixed rather than picking a winner", () => {
    // Verbatim in force from `activeStyleRows`' own case, with the one word that
    // changed: the answer used to be `null` on an `ActiveStyleRow`; the kit's
    // `ControlValue` spells the same state `{ type: "mixed" }`, and
    // `ControlPanel`/`TriggerFace` both key their empty rendering off it.
    const editor = editorSharing(
      new Map<StyleProp<string>, SharedEntry>([
        [DefaultColorStyle, { type: "mixed" }],
        [DefaultFillStyle, { type: "shared", value: "solid" }],
      ]),
    );
    const inside = controlById(editor, "inside")!;
    expect(inside.value, "mixed is mixed, not the first shape's colour").toEqual({ type: "mixed" });
    expect(inside.value?.type === "shared" ? inside.value.value : null).toBeNull();
  });

  it("returns nothing at all for a selection that shares no styles", () => {
    // `buildAppearance` returns null rather than an empty composition, which is
    // the pill's own "render no appearance cluster" signal — the same answer
    // `activeStyleRows` gave as `[]`.
    expect(buildAppearance(editorSharing(new Map()))).toBeNull();
  });
});

describe("the recipe's order is stable", () => {
  it("keeps the recipe's order regardless of what the shared map iterates in", () => {
    // The descendant of "keeps STYLE_ROWS' order regardless of what the map
    // iterates in", and it is a SHARPER test than that one was, because the
    // order can now disagree in two places rather than one:
    //
    //   `buildAppearance` pushes its candidates geo → inside → edge → DIFF →
    //   text, while `TWO_FACES_RECIPE` renders geo → inside → edge → text →
    //   diff. So a composition that leaked the push order (or the map's) would
    //   put Diff in the middle, and this assertion fails.
    //
    // Zach named the bar's order himself — "shape selector, inside, edge, text"
    // — with the app's own Diff last, so this is his sentence, pinned.
    const scrambled = new Map<StyleProp<string>, SharedEntry>(
      [DIFF, DefaultSizeStyle, DefaultDashStyle, DefaultFillStyle, DefaultColorStyle, GEO].map((style) => [
        style,
        { type: "shared", value: valuesOf(style)[0]! } as SharedEntry,
      ]),
    );
    expect(triggerIds(editorSharing(scrambled))).toEqual(["geo", "inside", "edge", "text", "diff"]);
  });

  it("groups the four the way the recipe names them, with the app's own control last", () => {
    const editor = editorSharing(shared(...EVERY_STYLE, DIFF));
    const bundle = buildAppearance(editor)!;
    expect(bundle.composition.id).toBe(TWO_FACES_RECIPE.id);
    expect(bundle.composition.groups.map((group) => group.id)).toEqual(["shape", "paint", "type", "app"]);
  });

  it("elides a group whose every item went unbound, rather than leaving a gap", () => {
    // `composeControls` never emits an empty group, which is what lets
    // `ControlStrip` draw a separator between every pair of groups with no
    // emptiness check of its own. A text-only selection is the real case: no
    // geo, no fill, no dash.
    const editor = editorSharing(shared(DefaultSizeStyle, DefaultFontStyle));
    const bundle = buildAppearance(editor)!;
    expect(bundle.composition.groups.map((group) => group.id)).toEqual(["type"]);
  });
});
