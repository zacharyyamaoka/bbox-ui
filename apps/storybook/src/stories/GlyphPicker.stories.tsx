import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { GlyphPicker, type GlyphPickerProps } from "@bbox-ui/glyph-picker";

/**
 * apps/storybook/src/stories/GlyphPicker.stories.tsx
 *
 * The ONE Notion-style Glyph picker (docs/GLYPH-PLAN.md phase 3), ported
 * by value from SystemSketch's `BlockIconPicker.tsx`. `GlyphPicker` is a
 * controlled component (`value`/`onChange`), so every story renders it
 * through `ControlledPicker` — a thin `useState` wrapper — rather than
 * `GlyphPicker` directly; the `meta.component` points at the wrapper for
 * exactly that reason.
 *
 * A picked value's proof lives in the DOM, not a mock's call log: the
 * default trigger always renders a live `<Glyph content={value} .../>`
 * (see `GlyphPicker.tsx`'s own header), so asserting on what the TRIGGER
 * paints after a pick — an `<svg>`, an emoji character, an `<img src=
 * "data:...">` — is the same assertion as reading `value` itself.
 */
function ControlledPicker(props: Omit<GlyphPickerProps, "value" | "onChange"> & { initialValue?: string }) {
  const { initialValue, ...rest } = props;
  const [value, setValue] = useState(initialValue ?? "");
  return <GlyphPicker {...rest} value={value} onChange={setValue} />;
}

const meta = {
  title: "Components/GlyphPicker",
  component: ControlledPicker,
  args: { initialValue: "" },
} satisfies Meta<typeof ControlledPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

function trigger(canvasElement: HTMLElement): HTMLButtonElement {
  const el = canvasElement.querySelector('[data-slot="glyph-picker-trigger"]');
  if (!(el instanceof HTMLButtonElement)) throw new Error('expected a [data-slot="glyph-picker-trigger"] button');
  return el;
}

function panel(): HTMLElement {
  const el = document.querySelector('[data-slot="glyph-picker-panel"]');
  if (!(el instanceof HTMLElement)) throw new Error('expected an open [data-slot="glyph-picker-panel"]');
  return el;
}

/**
 * THE STORY THAT CARRIES THE MAIN PLAY FUNCTION: click the trigger, the
 * dialog opens; filter to a real Lucide match ("rocket"); click the cell;
 * the dialog closes; the trigger now paints that icon's real `<svg>`.
 * Every step reads the actual rendered DOM of the real picker — the real
 * ~636KB Lucide chunk really loads, the real windowed grid really renders
 * the cell, the real Base UI `Popover` really opens and closes.
 */
export const Primary: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));
    await waitFor(() => panel());

    const filterInput = await waitFor(() => {
      const el = panel().querySelector<HTMLInputElement>('[data-testid="glyph-picker-filter"]');
      if (!el) throw new Error("filter not mounted yet");
      return el;
    });
    await userEvent.type(filterInput, "rocket");

    const cell = await waitFor(() => {
      const el = panel().querySelector<HTMLButtonElement>('[data-testid="glyph-picker-cell-lucide-rocket"]');
      if (!el) throw new Error("rocket cell not rendered yet");
      return el;
    });
    await expect(cell.querySelector("svg")).not.toBeNull();
    await userEvent.click(cell);

    await waitFor(() => {
      if (document.querySelector('[data-slot="glyph-picker-panel"]')) throw new Error("still open");
    });
    await waitFor(() => {
      const svg = trigger(canvasElement).querySelector('[data-slot="glyph"] svg');
      if (!svg) throw new Error("trigger hasn't painted the picked icon yet");
    });
  },
};

/**
 * NO play function, deliberately — this story's whole point is that
 * nothing ever opens it. Regression guard for the bug this closed: the
 * default trigger's `LucideGlyphResolver` used to call
 * `loadLucideLibrary()` unconditionally on mount, so the ~637KB Lucide
 * chunk fetched even for a trigger that will only ever show an emoji.
 * The durable guard is `packages/glyph-picker/test/GlyphPicker.test.tsx`'s
 * "GlyphPicker — Lucide chunk load gating" describe (tracked, runs in CI;
 * confirmed red when the `active` gate is removed) — this story is the
 * same regression proved once more in a real browser: a network-log probe
 * over CDP asserts zero `lucide-icons.json` requests while this story sits
 * closed; `Primary`'s own click (which opens on the Icons tab by default)
 * is the other half of that proof — it must fetch once opened, story
 * value or not.
 */
export const EmojiClosed: Story = {
  args: { initialValue: "emoji:🚀" },
};

/** Switches to the Emoji tab, filters, and picks — the trigger ends up
 *  showing the literal emoji character. */
export const EmojiTab: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));
    await waitFor(() => panel());

    const emojiTab = await waitFor(() => {
      const el = panel().querySelector<HTMLButtonElement>('[data-testid="glyph-picker-tab-emoji"]');
      if (!el) throw new Error("not ready");
      return el;
    });
    await userEvent.click(emojiTab);

    const filterInput = await waitFor(() => {
      const el = panel().querySelector<HTMLInputElement>('[data-testid="glyph-picker-filter"]');
      if (!el) throw new Error("not ready");
      return el;
    });
    await userEvent.type(filterInput, "grinning");

    const cell = await waitFor(() => {
      const el = panel().querySelector<HTMLButtonElement>('[data-testid="glyph-picker-cell-emoji-grinning_face"]');
      if (!el) throw new Error("not ready");
      return el;
    });
    await userEvent.click(cell);

    await waitFor(() => {
      const glyph = trigger(canvasElement).querySelector('[data-slot="glyph"]');
      if (glyph?.textContent !== "😀") throw new Error("trigger hasn't painted the picked emoji yet");
    });
  },
};

/**
 * Ctrl+V onto the open Upload tab: a synthetic `paste` with a real 2×2
 * PNG file (built from literal bytes below, not a fixture on disk — this
 * package ships no test assets), the exact entry point
 * docs/GLYPH-PLAN.md's own definition-of-done names. Runs only where
 * `createImageBitmap`/`<canvas>` are real — this is why this story, not a
 * vitest unit test, is what proves the raster downscale path
 * (`uploadIcon.test.ts`'s own header explains the split).
 */
const SWATCH_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP4z8DAAMIM////ZwAAHu8E/HMcU8wAAAAASUVORK5CYII=";

function swatchPngFile(): File {
  const bytes = Uint8Array.from(atob(SWATCH_PNG_BASE64), (c) => c.charCodeAt(0));
  return new File([bytes], "swatch.png", { type: "image/png" });
}

export const Upload: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));
    await waitFor(() => panel());

    const uploadTab = await waitFor(() => {
      const el = panel().querySelector<HTMLButtonElement>('[data-testid="glyph-picker-tab-upload"]');
      if (!el) throw new Error("not ready");
      return el;
    });
    await userEvent.click(uploadTab);

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(swatchPngFile());
    const pasteEvent = new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true, cancelable: true });
    document.dispatchEvent(pasteEvent);

    const saveButton = await waitFor(() => {
      const el = panel().querySelector<HTMLButtonElement>(".GlyphPicker-save:not([disabled])");
      if (!el || el.textContent !== "Save") throw new Error("upload not staged yet");
      return el;
    });
    await userEvent.click(saveButton);

    await waitFor(() => {
      if (document.querySelector('[data-slot="glyph-picker-panel"]')) throw new Error("still open");
    });
    const img = await waitFor(() => {
      const el = trigger(canvasElement).querySelector<HTMLImageElement>('[data-slot="glyph"] img');
      if (!el) throw new Error("trigger hasn't painted the upload yet");
      return el;
    });
    await expect(img.src.startsWith("data:image/png")).toBe(true);
  },
};
