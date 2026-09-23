import type { Preview } from "@storybook/react-vite";
import { useLayoutEffect, type ReactNode } from "react";
import { Anchor, Circle, Play, Rocket } from "lucide-react";

import { GlyphResolverProvider } from "../src/components/glyph";
import { BBOX_SKINS, BBOX_SKIN_LABELS, bboxSkinAttrs, type BboxSkin } from "../src/skin/skin";
import { SketchAtEdge } from "../src/skin/SketchAtEdge";
import { PORT_VARIANT_IDS, PORT_VARIANTS } from "../src/skin/portVariants";
import { REGION_VARIANT_IDS, REGION_VARIANTS } from "../src/skin/regionVariants";
import "../src/globals.css";

/**
 * The skin picker — a Storybook toolbar global, so Zach can flip skins
 * live instead of typing a URL flag (`feedback_prototype_switch_in_app`'s
 * rule, applied to a toolbar rather than an in-app dropdown since this
 * control needs to reach every story, not one prototype's own board).
 *
 * WHY the empty string is its own rung, not just "default" as the initial
 * value: "no skin attribute at all" and "the `default` skin explicitly
 * active" are two different states (skin.css's own header — `default`'s
 * block exists only so a picker has a way to switch BACK, and it paints a
 * 2px border where the unset case paints whatever each component's own
 * pre-skin literal was, e.g. Block's 1px). Defaulting the global to `""`
 * is what keeps every existing story byte-identical to before this port
 * (S1) — see the decorator below, which renders NO wrapper at all when
 * `skin` is unset, rather than one stamped with `data-bbox-skin="default"`.
 */
const SKIN_GLOBAL = "skin";

type SkinGlobal = BboxSkin | "";


/**
 * WHY this lives in preview.tsx and not glyph.tsx itself: the "zero direct
 * lucide-react dependency in the core" rule (see glyph.tsx's own header
 * comment, ported from packages/bbox-ui/src/glyph.tsx) means the resolver
 * function has to be assembled by a HOST — here, this Storybook app's
 * preview decorator, wrapping every story. A handful of statically-imported
 * icons looked up by name is enough to demo Glyph for real.
 *
 * SUPERSEDED IN PART, 2026-09-21 (P-036/P-043): the sentence that used to end
 * this comment — "the full Notion-style picker (packages/glyph-picker) is out
 * of scope for this pass" — is no longer true. The trunk has its own picker at
 * `src/editor/glyphPicker/`, and it mounts its OWN `LucideGlyphResolver` over
 * the whole Lucide library. A nested provider wins for its subtree, so any
 * story that renders a `GlyphPicker` gets all 1,818 icons while every other
 * story keeps this four-icon stand-in. Both are correct; this one is just the
 * cheap default, not a ceiling.
 */
const LUCIDE_ICONS: Record<string, ReactNode> = {
  rocket: <Rocket />,
  anchor: <Anchor />,
  circle: <Circle />,
  play: <Play />,
};

function renderLucide(name: string): ReactNode {
  return LUCIDE_ICONS[name] ?? null;
}

/** The app's bottom-right variant pill (apps/systemsketch/src/chrome/variantSwitch.tsx) as two toolbar globals: the SAME
 *  `<html>` attributes. WHY `v1` stamps nothing: it IS the absent attribute, so every story not switched is untouched. */
function stampVariants(port: string, region: string): void {
  const html = document.documentElement.dataset;
  if (port !== "v1") html.bboxPortVariant = port;
  else delete html.bboxPortVariant;
  if (region !== "v1") html.bboxRegionVariant = region;
  else delete html.bboxRegionVariant;
}

function VariantAttrs({ port, region, children }: { port: string; region: string; children: ReactNode }) {
  // Stamped DURING render as well as in the effect below. WHY: a child's
  // layout effects run BEFORE its parent's, so a stamp made only in this
  // decorator's `useLayoutEffect` lands after every story component has
  // already mounted, measured and drawn against the ABSENT attribute (v1).
  // That never showed while v1 was the default; since the default became
  // v2/v9 (2026-09-22) it drew the sketch skin's ring twins at v1's size
  // under v2 dots (`SkinAtTheEdges` › Side By Side, measured "0 0 12.5
  // 12.5" vs "0 0 13 13"). Idempotent, so a re-render costs nothing.
  if (typeof document !== "undefined") stampVariants(port, region);
  useLayoutEffect(() => {
    stampVariants(port, region);
    const html = document.documentElement.dataset;
    return () => {
      if (port !== "v1") delete html.bboxPortVariant;
      if (region !== "v1") delete html.bboxRegionVariant;
    };
  }, [port, region]);
  return children;
}

/**
 * The port style and region drawing a FRESH Storybook opens on — a viewer
 * who picked another one keeps it (Storybook keeps a picked global in the
 * URL; these are only `initialGlobals`).
 *
 * WHY v2 and v9: Zach, 2026-09-22 — "Please also lets do ports v2 as the
 * default ones … and for regions make v9 the default one". WHY here and not
 * by moving the tables' own `DEFAULT_*` constants: each variant's CSS is
 * keyed on the `<html>` attribute, with `v1` as every token's built-in
 * fallback (regionVariants.css's own header), so an absent attribute always
 * PAINTS v1. Moving the TS default alone would read v9's numbers (its arm
 * header height) while painting v1's frame. A host that wants another
 * default therefore stamps it — exactly what the app's variant pill does
 * (apps/systemsketch/src/chrome/DevMenu/variantSwitch.tsx).
 */
const DEFAULT_PORT_VARIANT_GLOBAL = "v2";
const DEFAULT_REGION_VARIANT_GLOBAL = "v9";

const preview: Preview = {
  globalTypes: {
    [SKIN_GLOBAL]: {
      name: "Skin",
      description: "bbox-ui shape language (src/skin/**)",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "", title: "No skin (today)" },
          ...BBOX_SKINS.map((skin) => ({ value: skin, title: BBOX_SKIN_LABELS[skin] })),
        ],
        dynamicTitle: true,
      },
    },
    portVariant: { name: "Port style", toolbar: { icon: "circle", dynamicTitle: true, items: PORT_VARIANT_IDS.map((id) => ({ value: id, title: `Ports ${id} · ${PORT_VARIANTS[id].title}` })) } },
    regionVariant: { name: "Region style", toolbar: { icon: "component", dynamicTitle: true, items: REGION_VARIANT_IDS.map((id) => ({ value: id, title: `Regions ${id} · ${REGION_VARIANTS[id].title}` })) } },
  },
  initialGlobals: {
    [SKIN_GLOBAL]: "" as SkinGlobal,
    portVariant: DEFAULT_PORT_VARIANT_GLOBAL,
    regionVariant: DEFAULT_REGION_VARIANT_GLOBAL,
  },
  decorators: [
    (Story, { globals }) => <VariantAttrs port={String(globals.portVariant ?? DEFAULT_PORT_VARIANT_GLOBAL)} region={String(globals.regionVariant ?? DEFAULT_REGION_VARIANT_GLOBAL)}><Story /></VariantAttrs>,
    (Story, context) => {
      const skin = (context.globals[SKIN_GLOBAL] as SkinGlobal | undefined) || "";
      // WHY no wrapper at all when unset, rather than a div stamped
      // `data-bbox-skin="default"`: an always-present wrapper would move
      // every existing story's `canvasElement`/`getBoundingClientRect`
      // measurement by however much the wrapper's own box costs — S1
      // (no skin set -> byte-identical to today) has to hold with zero
      // DOM difference, not just zero paint difference.
      if (!skin) return <Story />;
      // WHY <SketchAtEdge> wraps here (docs/peps/0001-sketch-skin-at-the-
      // boundary.md M8): this decorator already knows the active skin from
      // Storybook's own toolbar global — the proof the edge was always the
      // right place to run the boundary pass. `active` is gated on
      // `"sketch"` specifically: `default`/`plain` are pure CSS (a token
      // layer with no drawn geometry at all), so running the pass for them
      // would be work with nothing to draw. `SketchAtEdge`'s own wrapper is
      // `display: contents`, so it adds no box for a descendant's own
      // `getBoundingClientRect` to trip over — the S1 case (no skin at all)
      // stays wrapper-free entirely via the early return just above.
      return (
        <SketchAtEdge active={skin === "sketch"}>
          <div {...bboxSkinAttrs(skin)} style={{ display: "contents" }}>
            <Story />
          </div>
        </SketchAtEdge>
      );
    },
    (Story) => (
      <GlyphResolverProvider value={{ renderLucide }}>
        <Story />
      </GlyphResolverProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // WHY this order: the sections ARE the repo's top-level folders, in
    // ARCHITECTURE.md's order (Zach, 2026-09-22: "top level same as repo and
    // then families beneath"). Families under Components and Scene (Scene by
    // his choice, for the functionality still to come) and Editor; every other section
    // stays flat. Titles are held to this shape by src/storyOrganisation.test.ts.
    // Must stay an inline literal: Storybook reads storySort statically from
    // this file.
    options: {
      storySort: {
        method: "alphabetical",
        order: [
          "Components",
          [
            "Ports",
            ["Port", "LabeledPort", "PortEdge"],
            "Blocks",
            ["Block", "BlockPort", "BlockRegion", ["Labeled Group", "Loop", "Branch", "*"], "*"],
            "Traces",
            ["Trace", "*"],
            "Text & Marks",
            "Stock",
          ],
          "Scene",
          ["Model & Diff", ["Scene", "*"], "Wiring", "Validation", "Layout & Drag"],
          "Editor",
          ["Menus & Bars", "Panels & Dialogs", "On Canvas"],
          "Hosts",
          "Skin",
        ],
      },
    },
  },
};

export default preview;
