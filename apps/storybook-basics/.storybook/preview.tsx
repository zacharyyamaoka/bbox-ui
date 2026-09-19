import type { Preview } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Anchor, Circle, Play, Rocket } from "lucide-react";

import { GlyphResolverProvider } from "../src/components/glyph";
import { BBOX_SKINS, BBOX_SKIN_LABELS, bboxSkinAttrs, type BboxSkin } from "../src/skin/skin";
import { SketchAtEdge } from "../src/skin/SketchAtEdge";
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
 * icons looked up by name is enough to demo Glyph for real; the full
 * Notion-style picker (packages/glyph-picker) is out of scope for this pass.
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
  },
  initialGlobals: {
    [SKIN_GLOBAL]: "" as SkinGlobal,
  },
  decorators: [
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
  },
};

export default preview;
