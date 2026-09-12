import { defineConfig } from "vitest/config";

/**
 * packages/glyph-picker/vitest.config.ts
 *
 * Scoped to this package only — every sibling package's tests are pure
 * logic and run fine under vitest's plain-Node default. `GlyphPicker`
 * itself is a real Base UI `Popover` (portal, floating-ui positioning,
 * document-level focus/Escape handling), which needs an actual `document`
 * to mount into; `jsdom` is the smallest thing that provides one.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    // GlyphPicker.test.tsx's own header explains why: only ONE test in
    // this package ever waits on the real Popover's async library load
    // (`GlyphPicker — Remove`), and it does so reliably in a couple of
    // seconds. A little headroom over the vitest default (5s), not the
    // large budget an earlier version of this file needed before the
    // open-and-wait tests that actually needed it were removed.
    testTimeout: 10000,
  },
});
