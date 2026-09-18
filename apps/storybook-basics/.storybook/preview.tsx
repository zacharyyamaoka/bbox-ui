import type { Preview } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Anchor, Circle, Play, Rocket } from "lucide-react";

import { GlyphResolverProvider } from "../src/components/glyph";
import "../src/globals.css";

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
  decorators: [
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
