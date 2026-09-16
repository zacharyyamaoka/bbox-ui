import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeGlyphContent } from "@bbox-ui/glyph-content";
import { GlyphPicker, IconsGrid, EmojiGrid, encodePickedContent, makeChooseHandlers } from "../src/GlyphPicker";
import { LucideGlyphResolver } from "../src/resolveLucideName";
import { buildLucideLibrary, loadLucideLibrary, peekLucideLibrary } from "../src/lucideLibrary";
import type { LucideLibraryEntry } from "../src/lucideLibrary";
import { buildEmojiLibrary, loadEmojiLibrary, peekEmojiLibrary } from "../src/emojiLibrary";
import type { EmojiEntry } from "../src/emojiLibrary";

// A one-icon, one-emoji stand-in for the two generated data files —
// `loadLucideLibrary`/`loadEmojiLibrary` below stay the REAL, unmocked
// functions (`import("./data/….json")` and all), so every test still
// exercises production's actual load→cache→resolve wiring; only WHAT they
// import is swapped, never HOW. Full library fidelity (1,818 icons, the
// windowed grid, real search) is what the mandatory real-browser
// Storybook proof is for (this file's own header) — a unit test only
// needs the wiring to be provably real, not the data to be complete.
vi.mock("../src/data/lucide-icons.json", () => ({
  default: { version: "test", icons: [{ name: "Rocket", kebab: "rocket", tags: ["launch"], node: [] }] },
}));
vi.mock("../src/data/emoji.json", () => ({
  default: {
    version: "test",
    emoji: [{ char: "🚀", name: "rocket", slug: "rocket", group: "Travel & Places", keywords: ["launch"], skinTone: false }],
  },
}));

// WHY wrap the ACTUAL `load*Library`/`peek*Library` (their data source
// mocked just above) rather than stub the functions themselves: every
// test in this file needs the real module-level cache
// (`peekLucideLibrary`'s `loaded`) to behave exactly as it does in
// production — only the call COUNT needs to be independently observable.
// "GlyphPicker — encode on pick" is the one describe that overrides
// `peekLucideLibrary`/`peekEmojiLibrary` for its own reason (seeding the
// panel's grid before the real `Popover` opens, so there's no async gap
// for jsdom to hang on — see that describe's own header) and restores the
// real implementation afterwards using the captured references below.
vi.mock("../src/lucideLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lucideLibrary")>();
  return { ...actual, loadLucideLibrary: vi.fn(actual.loadLucideLibrary), peekLucideLibrary: vi.fn(actual.peekLucideLibrary) };
});
vi.mock("../src/emojiLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/emojiLibrary")>();
  return { ...actual, loadEmojiLibrary: vi.fn(actual.loadEmojiLibrary), peekEmojiLibrary: vi.fn(actual.peekEmojiLibrary) };
});

// Real, unmocked references — captured once so "encode on pick" can put
// the production `peek*Library` implementation back after seeding its
// own fixture, rather than guessing at what `mockReset`/`mockRestore`
// falls back to for a `vi.fn(impl)` created inside a factory.
const actualLucideLibrary = await vi.importActual<typeof import("../src/lucideLibrary")>("../src/lucideLibrary");
const actualEmojiLibrary = await vi.importActual<typeof import("../src/emojiLibrary")>("../src/emojiLibrary");

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
  // Back to production behaviour before every test, calls cleared — a
  // describe below that needs something else (a stub that never
  // resolves, a peek seeded with a fixture) layers its own `beforeEach`
  // on top of this one rather than leaking into a sibling describe.
  vi.mocked(loadLucideLibrary).mockImplementation(actualLucideLibrary.loadLucideLibrary).mockClear();
  vi.mocked(peekLucideLibrary).mockImplementation(actualLucideLibrary.peekLucideLibrary).mockClear();
  vi.mocked(loadEmojiLibrary).mockImplementation(actualEmojiLibrary.loadEmojiLibrary).mockClear();
  vi.mocked(peekEmojiLibrary).mockImplementation(actualEmojiLibrary.peekEmojiLibrary).mockClear();
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

/**
 * Polls a real DOM assertion until it stops throwing, or fails after
 * `timeoutMs`. Default sits BELOW `vitest.config.ts`'s `testTimeout`
 * (10000) on purpose: a `waitFor` that genuinely runs out has to lose the
 * race to vitest's own timeout so the failure prints this function's
 * assertion error ("rocket cell not rendered") rather than a bare,
 * anonymous "Test timed out in 10000ms".
 */
async function waitFor<T>(assertion: () => T, timeoutMs = 8000): Promise<T> {
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
 * synchronous check, before ever yielding to a timer. It is also, by
 * measurement, the ONLY test in this file allowed to open the real
 * `Popover` at all: a second and third open (an earlier version of
 * "GlyphPicker — encode on pick" opened one for an Icons-cell pick and
 * another for an Emoji-cell pick) each leave ~3s of held event loop
 * behind, and three opens in one file run past vitest's worker RPC
 * heartbeat — the whole command exits 1 on "Timeout calling
 * onTaskUpdate" even though every assertion passed. "Encode on pick"
 * below mounts `IconsGrid`/`EmojiGrid` directly instead, with no
 * `Popover` in the tree at all. What that leaves genuinely uncovered here
 * is the FILTER: searching by query, not just clicking one seeded entry,
 * still needs a live library and belongs to the mandatory real-browser
 * proof instead — `apps/storybook/src/stories/GlyphPicker.stories.tsx`'s
 * `Primary` story is the Icons-tab flow (click → filter "rocket" → pick →
 * trigger paints the svg) and `EmojiTab` is this one (switch tab → filter
 * "grinning" → pick → trigger shows 😀), both driven over CDP in a real
 * Chrome — see this file's own header for why jsdom, not a real browser,
 * is otherwise the right tool here.
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

/**
 * The bug this closes: the default trigger's `LucideGlyphResolver` used to
 * call `loadLucideLibrary()` unconditionally on mount, so the ~637KB
 * chunk fetched the moment ANY Glyph rendered — measured fetching at
 * 580ms with the picker never opened, for a trigger showing an emoji.
 * `LucideGlyphResolver`'s `active` prop (`resolveLucideName.ts`) is the
 * fix: the default trigger now only asks it to load when the trigger's
 * OWN value needs Lucide, or once the panel opens (about to let you pick
 * one) — never for an empty or emoji value sitting closed.
 */
describe("GlyphPicker — Lucide chunk load gating", () => {
  // Force a fresh "nothing loaded yet" view for EVERY test in this
  // describe, not just the two that used to inline this call. `loaded` is
  // a real, shared, module-level singleton (the whole point of this
  // describe: it's not stubbed) — without this, an earlier test in the
  // file (closed-state structure's `lucide:rocket` trigger, or one of
  // this describe's own siblings) can resolve it for real before a later
  // "never fetches" assertion runs, and that assertion then passes
  // vacuously: `active && !library` is false because `!library` is
  // false, not because the gate did its job. Mutation-tested: with this
  // reset in place, removing the `active &&` half of the gate in
  // `resolveLucideName.ts` fails three of the four tests below — the
  // "fetches immediately for a lucide value" test can't be one of them:
  // it only asserts the load DID happen, which an ungated resolver still
  // satisfies, so that assertion is monotone under this mutant.
  beforeEach(() => {
    vi.mocked(peekLucideLibrary).mockImplementation(() => null);
    vi.mocked(peekEmojiLibrary).mockImplementation(() => null);
  });

  it("never fetches for an empty value, closed", () => {
    renderPicker({ value: "", onChange: vi.fn() });
    expect(loadLucideLibrary).not.toHaveBeenCalled();
  });

  it("never fetches for an emoji value, closed", () => {
    renderPicker({ value: "emoji:🚀", onChange: vi.fn() });
    expect(loadLucideLibrary).not.toHaveBeenCalled();
  });

  it("fetches immediately for a lucide value, even closed — it still has to resolve", () => {
    renderPicker({ value: "lucide:rocket", onChange: vi.fn() });
    expect(loadLucideLibrary).toHaveBeenCalled();
  });

  it("fetches once `active` flips true — the transition GlyphPicker's own `isOpen` drives", () => {
    // `GlyphPicker`'s default trigger wires `LucideGlyphResolver`'s
    // `active` to `decoded.kind === "lucide" || isOpen` (see that WHY
    // comment in `GlyphPicker.tsx`), so the untested half of that gate is
    // "does opening the panel flip `active` from false to true, and does
    // the resolver actually fetch once it does". This used to exercise
    // that by rendering the full picker and clicking its real trigger —
    // which opens the real Base UI `Popover`. MEASURED: a second real
    // open in this file (on top of "GlyphPicker — Remove" above) cost
    // ~5.5s of held event loop, same order as the first, and pushed the
    // whole command past vitest's worker RPC heartbeat often enough to
    // exit 1 on 4 of 7 clean re-runs — every time with all 32 assertions
    // still green, so the flake was the SECOND open, not a wrong
    // assertion (this lane's own findings). `LucideGlyphResolver` is the
    // exact unit `active` belongs to, so mounting it directly and
    // flipping a plain bit of `useState` reproduces the same
    // false→true transition `isOpen` performs, with no Popover involved
    // at all — keeping this file at exactly one real Popover open.
    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <>
          <button type="button" data-testid="flip-active" onClick={() => setActive(true)} />
          <LucideGlyphResolver active={active} />
        </>
      );
    }
    act(() => {
      root.render(<Harness />);
    });
    expect(loadLucideLibrary).not.toHaveBeenCalled();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flip-active"]')!.click();
    });
    expect(loadLucideLibrary).toHaveBeenCalled();
  });
});

/**
 * "Encode on pick", below the Base UI `Popover` boundary rather than
 * through it: measured (see this lane's own findings) opening the real
 * Popover a second time in this file — on top of "Remove" above — costs
 * ~5.5s of held event loop and flakes the whole run's exit code often
 * enough to fail most re-runs, even though every individual assertion
 * still passes. So these two tests mount `IconsGrid`/`EmojiGrid` directly
 * — the same components `GlyphPicker`'s own body renders once its
 * `Popover.Popup` is open — with no `Popover` involved at all.
 *
 * This is NOT a hand-copy of `choose`'s call sites: an earlier version of
 * this test wrote its own `{ kind: "lucide", name: kebab }` /
 * `{ kind: "emoji", char }` inline, and a mutant that swapped which kind
 * the real `IconsGrid`/`EmojiGrid` wiring in `GlyphPicker.tsx` builds
 * (picking a Lucide icon silently encoding as an emoji) survived the
 * whole suite because nothing here actually called that code.
 * `makeChooseHandlers` (exported from `GlyphPicker.tsx`) IS that wiring —
 * `GlyphPicker`'s body builds `onChooseIcon`/`onChooseEmoji` from it and
 * hands them straight to the two grids below, unchanged — so importing it
 * here and wiring these grids' `onChoose` to its output exercises the
 * real call site, not a stand-in for it. The `choose` each test passes in
 * stays a small local fake (real `choose` closes over Recent-list state
 * and `setOpen`, which need the picker mounted to exist) — only the
 * kind/name/char MAPPING is under test, which is the piece a mutant could
 * actually get away with changing.
 */
describe("GlyphPicker — encode on pick", () => {
  const rocket: LucideLibraryEntry = { name: "Rocket", kebab: "rocket", tags: ["launch"], node: [] };
  const rocketEmoji: EmojiEntry = { char: "🚀", name: "rocket", slug: "rocket", group: "Travel & Places", keywords: ["launch"], skinTone: false };
  const empty = decodeGlyphContent("");

  function fakeChoose(onChange: (next: string) => void): Parameters<typeof makeChooseHandlers>[0] {
    return (content) => {
      const encoded = encodePickedContent(empty, content);
      if (encoded !== null) onChange(encoded);
    };
  }

  it("an Icons cell calls onChange with lucide:<kebab>", () => {
    const onChange = vi.fn();
    const { onChooseIcon } = makeChooseHandlers(fakeChoose(onChange));
    act(() => {
      root.render(
        <div className="GlyphPicker-body">
          <IconsGrid entries={[rocket]} recent={[]} query="" decoded={empty} onChoose={onChooseIcon} />
        </div>,
      );
    });
    const cell = container.querySelector<HTMLButtonElement>('[data-testid="glyph-picker-cell-lucide-rocket"]');
    if (!cell) throw new Error("rocket cell not rendered");
    act(() => cell.click());
    expect(onChange).toHaveBeenCalledWith("lucide:rocket");
  });

  it("an Emoji cell calls onChange with emoji:<char>", () => {
    const onChange = vi.fn();
    const { onChooseEmoji } = makeChooseHandlers(fakeChoose(onChange));
    act(() => {
      root.render(
        <div className="GlyphPicker-body">
          <EmojiGrid
            entries={[rocketEmoji]}
            recent={[]}
            groups={["Travel & Places"]}
            query=""
            tone={0}
            decoded={empty}
            onChoose={onChooseEmoji}
          />
        </div>,
      );
    });
    const cell = container.querySelector<HTMLButtonElement>('[data-testid="glyph-picker-cell-emoji-rocket"]');
    if (!cell) throw new Error("rocket emoji cell not rendered");
    act(() => cell.click());
    expect(onChange).toHaveBeenCalledWith("emoji:🚀");
  });
});
