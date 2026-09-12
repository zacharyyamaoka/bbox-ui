import { describe, expect, it } from "vitest";
import { assertDisjointPresets, defaultArgs, governedFieldIds, toArgTypes } from "@bbox-ui/schema";
import { STACK_FIELDS, STACK_PRESETS } from "../src/stack.fields";
import { Stack, STACK_INSET_BACKGROUNDS, STACK_MEMBER_WIDTHS } from "../src/stack";

/**
 * `Stack` uses no hooks — calling it directly, as a plain function,
 * returns the exact React element it would render, with every default
 * already applied by its own `= ...` destructuring. Reading defaults off
 * THIS (not off a hand-retyped literal) is what makes this file fail the
 * moment `stack.tsx`'s real default changes — T0's own `port.fields.test.ts`
 * pattern.
 */
function stackElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Stack as any)(props);
}

function field(id: string) {
  const found = STACK_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no STACK_FIELDS entry for "${id}"`);
  return found;
}

const bare = stackElement();

describe("STACK_FIELDS", () => {
  it("has exactly Stack's four real props, in panel order", () => {
    expect(STACK_FIELDS.map((f) => f.id)).toEqual([
      "gap",
      "gutter",
      "memberWidth",
      "insetBackground",
    ]);
  });

  it("gap's declared default equals Stack's real default (stack.tsx: gap = 12)", () => {
    expect(field("gap").defaultValue).toBe((bare.props.style as Record<string, unknown>).gap);
  });

  it("gutter's declared default equals Stack's real default (stack.tsx: gutter = 12)", () => {
    expect(field("gutter").defaultValue).toBe(
      (bare.props.style as Record<string, unknown>).padding,
    );
  });

  it("memberWidth's declared default equals Stack's real default", () => {
    expect(field("memberWidth").defaultValue).toBe(bare.props["data-member-width"]);
  });

  it("insetBackground's declared default equals Stack's real default", () => {
    expect(field("insetBackground").defaultValue).toBe(bare.props["data-inset-background"]);
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(STACK_FIELDS)).toEqual({
      gap: field("gap").defaultValue,
      gutter: field("gutter").defaultValue,
      memberWidth: field("memberWidth").defaultValue,
      insetBackground: field("insetBackground").defaultValue,
    });
  });

  it("memberWidth's options are exactly the real StackMemberWidth union (stack.tsx's own STACK_MEMBER_WIDTHS)", () => {
    expect(field("memberWidth").options?.map((o) => o.value)).toEqual([...STACK_MEMBER_WIDTHS]);
  });

  it("insetBackground's options are exactly the real StackInsetBackground union (stack.tsx's own STACK_INSET_BACKGROUNDS)", () => {
    expect(field("insetBackground").options?.map((o) => o.value)).toEqual([
      ...STACK_INSET_BACKGROUNDS,
    ]);
  });

  it("toArgTypes maps gap/gutter to number controls and memberWidth/insetBackground to select controls", () => {
    const argTypes = toArgTypes(STACK_FIELDS);
    expect(argTypes.gap.control).toBe("number");
    expect(argTypes.gutter.control).toBe("number");
    expect(argTypes.memberWidth.control).toBe("select");
    expect(argTypes.insetBackground.control).toBe("select");
  });

  it("has no presets — Stack paints nothing beyond structure and the insetBackground containment toggle, which carries no semantic state ladder for a preset to govern", () => {
    expect(STACK_PRESETS).toEqual([]);
    // Still real, exported, tested data per docs/T1-SPEC.md §0 — every
    // generic consumer can `.map()` over it without a null check.
    expect(governedFieldIds(STACK_PRESETS)).toEqual([]);
    expect(() => assertDisjointPresets(STACK_PRESETS)).not.toThrow();
  });

  it("memberWidth changes align-items without touching the flex-basis stretch default — 'own' opts a member out to its intrinsic width", () => {
    const own = stackElement({ memberWidth: "own" });
    expect((own.props.className as string).includes("items-start")).toBe(true);
    expect((bare.props.className as string).includes("items-start")).toBe(false);
  });

  it('insetBackground "white" applies no background class; "soft-gray" applies bg-muted', () => {
    expect((bare.props.className as string).includes("bg-muted")).toBe(false);
    const soft = stackElement({ insetBackground: "soft-gray" });
    expect((soft.props.className as string).includes("bg-muted")).toBe(true);
  });
});
