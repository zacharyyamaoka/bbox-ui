import { describe, expect, it } from "vitest";
import { portDotStyle } from "../src/port";
import { APPEARANCE_STATES, TONES, type AppearanceState, type Tone } from "../src/appearance";

/**
 * Judge round 6, finding R12: with any non-neutral `tone` set, `tone`'s
 * paint token was substituted for BOTH the ring and fill unconditionally,
 * overwriting the fill/presence bit `state` is supposed to own. Result:
 * all five persistable `AppearanceState` values painted an identical
 * circle once a tone was applied — the State control went inert. This
 * violates Zach's 2026-09-10 ruling: a Port's colour comes from STATE,
 * not type/tone; `tone` may only modulate the HUE, never erase the
 * presence bit `state` decides.
 *
 * `hidden` is excluded — `PortDot` never calls `portDotStyle` for
 * `state: "hidden"` (it returns `null` first), and `portDotStyle` itself
 * intentionally renders `hidden` invisible regardless of tone (both ring
 * and fill are `null` in STATE_TOKENS), so it's not part of the
 * "distinguishable" claim this test makes.
 */
const PERSISTABLE_STATES = APPEARANCE_STATES.filter(
  (s): s is Exclude<AppearanceState, "hidden"> => s !== "hidden",
);

/** A stable fingerprint of what actually gets painted. */
function paintSignature(state: AppearanceState, tone: Tone): string {
  const style = portDotStyle({ state, tone });
  return `${style.background ?? "none"}|${style.boxShadow ?? "none"}`;
}

describe("portDotStyle — tone modulates hue, state owns presence (R12)", () => {
  for (const tone of TONES) {
    it(`within tone "${tone}", all ${PERSISTABLE_STATES.length} persistable states paint distinguishably`, () => {
      const signatures = PERSISTABLE_STATES.map((state) => paintSignature(state, tone));
      const distinct = new Set(signatures);
      expect(
        distinct.size,
        `expected ${PERSISTABLE_STATES.length} distinct paints for tone "${tone}", got ${distinct.size}: ` +
          PERSISTABLE_STATES.map((s, i) => `${s}=${signatures[i]}`).join(" | "),
      ).toBe(PERSISTABLE_STATES.length);
    });
  }

  it("empty stays hollow (no fill) under every tone — the presence bit survives", () => {
    for (const tone of TONES) {
      const style = portDotStyle({ state: "empty", tone });
      expect(style.background, `tone="${tone}"`).toBe("transparent");
    }
  });

  it("outOfFocus stays hollow (no fill) under every tone", () => {
    for (const tone of TONES) {
      const style = portDotStyle({ state: "outOfFocus", tone });
      expect(style.background, `tone="${tone}"`).toBe("transparent");
    }
  });

  it("a non-neutral tone still changes the hue actually painted (tone isn't a no-op), and leads the blend", () => {
    const neutralWired = portDotStyle({ state: "wired", tone: "neutral" });
    const dangerWired = portDotStyle({ state: "wired", tone: "danger" });
    expect(neutralWired.background).toBe("var(--bbox-primary, var(--primary))");
    expect(dangerWired.background).not.toBe(neutralWired.background);
    expect(dangerWired.background).toContain("--bbox-danger) 70%");
  });
});
