import { describe, expect, it } from "vitest";
import { portCoreStyle, portDotStyle } from "../src/port";
import { APPEARANCE_STATES, TONES, type AppearanceState, type Tone } from "../src/appearance";

/**
 * Judge round 6, finding R12: with any non-neutral `tone` set, `tone`'s
 * paint token was substituted for BOTH the ring and fill unconditionally,
 * overwriting the fill/presence bit `state` is supposed to own. Result:
 * all persistable `AppearanceState` values painted an identical circle
 * once a tone was applied — the State control went inert. This violates
 * Zach's 2026-09-10 ruling: a Port's colour comes from STATE, not
 * type/tone; `tone` may only modulate the HUE, never erase the
 * presence/core bit `state` decides.
 *
 * A stable fingerprint now spans all THREE channels (ring, fill, core) —
 * `wired` and `received` both paint a lit core after the 2026-09-12
 * ruling ("the three circles are one token-table row"), so ring+fill
 * alone can no longer tell every state apart.
 */
function paintSignature(state: AppearanceState, tone: Tone): string {
  const style = portDotStyle({ state, tone });
  const core = portCoreStyle({ state, tone });
  return `${style.background ?? "none"}|${style.boxShadow ?? "none"}|${core?.background ?? "none"}`;
}

describe("portDotStyle/portCoreStyle — tone modulates hue, state owns presence (R12)", () => {
  for (const tone of TONES) {
    it(`within tone "${tone}", all ${APPEARANCE_STATES.length} states paint distinguishably`, () => {
      const signatures = APPEARANCE_STATES.map((state) => paintSignature(state, tone));
      const distinct = new Set(signatures);
      expect(
        distinct.size,
        `expected ${APPEARANCE_STATES.length} distinct paints for tone "${tone}", got ${distinct.size}: ` +
          APPEARANCE_STATES.map((s, i) => `${s}=${signatures[i]}`).join(" | "),
      ).toBe(APPEARANCE_STATES.length);
    });
  }

  it("empty stays hollow (no fill, no core) under every tone — the presence bit survives", () => {
    for (const tone of TONES) {
      const style = portDotStyle({ state: "empty", tone });
      // "hollow" means a hollow RING, not a see-through window: a wall-mounted
      // dot straddles the block's border, so the resting disc paints the
      // surface token instead of letting the wall line show through the middle.
      expect(style.background, `tone="${tone}"`).toBe("var(--card)");
      expect(portCoreStyle({ state: "empty", tone }), `tone="${tone}"`).toBeNull();
    }
  });

  it("wired stays hollow (disc kept, no fill) under every tone — only the core lights", () => {
    for (const tone of TONES) {
      const style = portDotStyle({ state: "wired", tone });
      // Same wall-line rationale as "empty" above — hollow is a punch-out
      // disc (`var(--card)`), never a transparent window onto the wall.
      expect(style.background, `tone="${tone}"`).toBe("var(--card)");
      expect(portCoreStyle({ state: "wired", tone }), `tone="${tone}"`).not.toBeNull();
    }
  });

  it("a non-neutral tone still changes the hue actually painted (tone isn't a no-op), and leads the blend — on the ring, since wired's fill is null", () => {
    const neutralWired = portDotStyle({ state: "wired", tone: "neutral" });
    const dangerWired = portDotStyle({ state: "wired", tone: "danger" });
    expect(neutralWired.boxShadow).toContain("var(--bbox-primary, var(--primary))");
    expect(dangerWired.boxShadow).not.toBe(neutralWired.boxShadow);
    expect(dangerWired.boxShadow).toContain("--bbox-danger) 70%");
  });

  it("dimmed forces the ring to muted-foreground regardless of state/tone, and fades the whole dot — but never touches fill/core", () => {
    const restingWired = portDotStyle({ state: "wired", tone: "danger" });
    const dimmedWired = portDotStyle({ state: "wired", tone: "danger", dimmed: true });
    expect(dimmedWired.boxShadow).toContain("var(--muted-foreground)");
    expect(dimmedWired.opacity).toBe(0.45);
    expect(dimmedWired.background).toBe(restingWired.background);
    // core paint is a separate function/layer — dimming the ring/fill
    // doesn't touch it; the whole DOT (including its core child span)
    // fades via the outer `opacity`, not by portCoreStyle itself.
    expect(portCoreStyle({ state: "wired", tone: "danger" })).toEqual(
      portCoreStyle({ state: "wired", tone: "danger", hinting: false }),
    );
  });

  it("hinting wins over dimmed, wears wired's shape in primary ink regardless of resting state, and is never faded", () => {
    const hinted = portDotStyle({ state: "empty", dimmed: true, hinting: true });
    expect(hinted.opacity).toBeUndefined();
    // Hollow means a hollow RING, not a window — see the "empty"/"wired"
    // hollow cases above for the same wall-line rationale.
    expect(hinted.background).toBe("var(--card)");
    expect(hinted.boxShadow).toContain("var(--bbox-primary, var(--primary))");
    expect(portCoreStyle({ state: "empty", hinting: true })?.background).toBe(
      "var(--bbox-primary, var(--primary))",
    );
  });
});
