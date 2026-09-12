import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GlyphPicker } from "../src/GlyphPicker";

/**
 * jsdom + a real `react-dom` root, NOT `react-test-renderer` — the frozen
 * skeleton's own tests used the renderer (see `resolver.test.tsx` for
 * where that still applies), but `GlyphPicker` is now a real Base UI
 * `Popover`: a portal into `document.body`, floating-ui positioning, a
 * document-level Escape listener. None of that exists under
 * `react-test-renderer`'s DOM-free tree — it needs an actual `document` to
 * mount into, which is the one thing that renderer deliberately doesn't
 * have. `vitest.config.ts` scopes `environment: 'jsdom'` to this package
 * alone so no sibling package pays for it.
 *
 * jsdom implements neither `ResizeObserver` (used by `useWindowedGrid`)
 * nor `requestAnimationFrame` (used for the filter input's autofocus) —
 * both are stubbed once, globally, for this file only.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0)) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
  }
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function renderPicker(props: Partial<Parameters<typeof GlyphPicker>[0]> & { value: string; onChange(next: string): void }) {
  act(() => {
    root.render(<GlyphPicker {...props} />);
  });
}

/** Polls a real DOM assertion until it stops throwing, or fails after `timeoutMs`. */
async function waitFor<T>(assertion: () => T, timeoutMs = 15000): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      });
    }
  }
}

function trigger(): HTMLButtonElement {
  const el = container.querySelector('[data-slot="glyph-picker-trigger"]');
  if (!el) throw new Error("trigger not found");
  return el as HTMLButtonElement;
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-slot="glyph-picker-panel"]');
}

describe("GlyphPicker — closed-state structure", () => {
  it("renders a trigger button wrapping a Glyph painted with `value`, closed by default", async () => {
    renderPicker({ value: "lucide:rocket", onChange: vi.fn() });
    const button = trigger();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector('[data-slot="glyph"]')?.getAttribute("data-content-kind")).toBe("lucide");
    expect(panel()).toBeNull();
  });

  it("a custom trigger (children) replaces the default Glyph trigger", () => {
    renderPicker({
      value: "",
      onChange: vi.fn(),
      children: <span data-testid="my-custom-trigger" />,
    });
    expect(trigger().querySelector('[data-slot="glyph"]')).toBeNull();
    expect(trigger().querySelector('[data-testid="my-custom-trigger"]')).not.toBeNull();
  });

  it("disabled disables the trigger", () => {
    renderPicker({ value: "", onChange: vi.fn(), disabled: true });
    expect(trigger().disabled).toBe(true);
  });

  it("open/onOpenChange controlled mode: an external open=false keeps the panel closed even after a click", () => {
    const onOpenChange = vi.fn();
    renderPicker({ value: "", onChange: vi.fn(), open: false, onOpenChange });
    act(() => {
      trigger().click();
    });
    expect(panel()).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

/**
 * NOT COVERED HERE, by measurement rather than assumption: any flow that
 * waits on the picker's own async library load (`loadLucideLibrary`/
 * `loadEmojiLibrary`) while the real Base UI `Popover` is open — the
 * Icons tab's filter→pick and the Emoji tab's filter→pick alike. A bare
 * `Popover.Root/Trigger/Portal/Positioner/Popup` with nothing but static
 * text — no picker content, no grid, no library — reliably never settles
 * under jsdom once open (confirmed with a `setInterval` armed before
 * opening: it never ticks again, ruling out "just slow" — the event loop
 * itself stops advancing for as long as the test keeps polling). Whether
 * a GIVEN open-and-wait sequence hangs turned out to be non-deterministic
 * across otherwise-identical runs — an Icons-tab pick hung every time, an
 * Emoji-tab pick that had passed cleanly three runs in a row then hung on
 * a fourth — so this is a real, reproducible Base UI + jsdom
 * incompatibility, not a bug in this component, and not something I
 * could pin down further inside this lane's budget (ruled out:
 * `useWindowedGrid` alone — a real 1818-cell windowed render with no
 * `Popover` involved settles in ~60ms; a plain DOM node count — 1818 bare
 * cells with no windowing at all also settles in ~300ms; the act()
 * environment flag; `ResizeObserver`/`IntersectionObserver` polyfills;
 * `Element.prototype.getAnimations`, absent either way).
 *
 * The one open-then-interact flow kept below (`Remove`) is structurally
 * different, not just luckier: its target button lives in the picker's
 * HEADER, rendered unconditionally on open, so the test never has to wait
 * on the library load at all — `waitFor` finds it on its very first,
 * synchronous check, before ever yielding to a timer. Every path that
 * DOES need that library — Icons and Emoji alike — belongs to the
 * mandatory real-browser proof instead:
 * `apps/storybook/src/stories/GlyphPicker.stories.tsx`'s `Primary` story
 * is the Icons-tab flow (click → filter "rocket" → pick → trigger paints
 * the svg) and `EmojiTab` is this one (switch tab → filter "grinning" →
 * pick → trigger shows 😀), both driven over CDP in a real Chrome — see
 * this file's own header for why jsdom, not a real browser, is otherwise
 * the right tool here.
 */

describe("GlyphPicker — Remove", () => {
  it("clears the value and closes", async () => {
    const onChange = vi.fn();
    renderPicker({ value: "lucide:rocket", onChange });
    act(() => trigger().click());
    const remove = await waitFor(() => {
      const el = panel()!.querySelector<HTMLButtonElement>('[data-testid="glyph-picker-remove"]');
      if (!el) throw new Error("not ready");
      return el;
    });
    act(() => remove.click());
    expect(onChange).toHaveBeenCalledWith("");
    await waitFor(() => {
      if (panel()) throw new Error("should have closed");
    });
  });
});
