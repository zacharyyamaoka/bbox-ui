import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { BADGE_FIELDS, BADGE_PRESETS, BADGE_SIZES } from "../src/badge.fields";
import { Badge } from "../src/badge";

/**
 * `Badge` uses no hooks — calling it directly, as a plain function, returns
 * the exact React element tree it would render, with every default already
 * applied by its own `= "..."` destructuring. Reading defaults off THIS
 * (not off a hand-retyped literal) is what makes this file fail the moment
 * `badge.tsx`'s real default changes, instead of silently drifting alongside
 * a copy that only agrees with itself. No DOM/jsdom is needed: these are
 * plain element objects, never rendered or mounted. Same pattern as
 * `glyph.fields.test.ts`.
 */
function badgeElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Badge as any)(props);
}

function field(id: string) {
  const found = BADGE_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no BADGE_FIELDS entry for "${id}"`);
  return found;
}

const bareBadge = badgeElement();

describe("BADGE_FIELDS", () => {
  it("has exactly Badge's three real props, in panel order", () => {
    expect(BADGE_FIELDS.map((f) => f.id)).toEqual(["hidden", "size", "children"]);
  });

  it("hidden's declared default equals Badge's real default (badge.tsx: hidden = false)", () => {
    expect(field("hidden").defaultValue).toBe(false);
  });

  it("hidden renders nothing, same convention as PortDot/PortLabel", () => {
    expect(badgeElement({ hidden: true })).toBeNull();
  });

  it("size's declared default equals Badge's real default (badge.tsx: size = \"md\"), and matches PortCountBadge's original measured chip", () => {
    expect(field("size").defaultValue).toBe("md");
    expect(bareBadge.props["data-size"]).toBe(field("size").defaultValue);
    expect(bareBadge.props.style.height).toBe(16);
    expect(bareBadge.props.style.minWidth).toBe(16);
    expect(bareBadge.props.style.borderRadius).toBe(7);
    expect(bareBadge.props.style.fontSize).toBe(10);
    expect(bareBadge.props.style.paddingLeft).toBe(5);
    expect(bareBadge.props.style.paddingRight).toBe(5);
    expect(bareBadge.props.style.lineHeight).toBe("16px");
  });

  it("size cascades — a header can hand its rung down to Badge the same way it hands one to a Port", () => {
    expect(field("size").cascades).toBe(true);
  });

  it("children has NO real destructured default on Badge — omitting it renders an empty chip, not the literal placeholder", () => {
    // Badge's own `children` prop is exactly what was passed in — no
    // fallback branch exists, so an omitted `children` reads back as
    // `undefined`, proving the real default behavior is "empty chip",
    // which `FieldValue` (string | number | boolean) cannot encode.
    expect(bareBadge.props.children).toBeUndefined();
    // "4" is therefore a deliberate demoable placeholder, not a fact about
    // the component — pinned consciously here rather than asserted as if
    // it were badge.tsx's own default. Same deviation as
    // `glyph.fields.ts`'s own `children` field.
    expect(field("children").defaultValue).toBe("4");
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(BADGE_FIELDS)).toEqual({
      hidden: field("hidden").defaultValue,
      size: field("size").defaultValue,
      children: field("children").defaultValue,
    });
  });

  it("size's options are exactly the real BadgeSize union (badge.fields.ts's own BADGE_SIZES keys)", () => {
    expect(field("size").options?.map((o) => o.value)).toEqual(Object.keys(BADGE_SIZES));
  });

  it("every size option resolves to Badge's real rendered footprint for that size", () => {
    for (const option of field("size").options ?? []) {
      const size = option.value as keyof typeof BADGE_SIZES;
      const el = badgeElement({ size });
      const spec = BADGE_SIZES[size];
      expect(el.props.style.height).toBe(spec.height);
      expect(el.props.style.minWidth).toBe(spec.height);
      expect(el.props.style.borderRadius).toBe(spec.radius);
      expect(el.props.style.fontSize).toBe(spec.fontSize);
      expect(el.props.style.paddingLeft).toBe(spec.paddingX);
      expect(el.props.style.paddingRight).toBe(spec.paddingX);
      expect(el.props.style.lineHeight).toBe(`${spec.height}px`);
    }
  });

  it("children is additive content, never baked into size", () => {
    const el = badgeElement({ children: "Event" });
    expect(el.props.children).toBe("Event");
    expect(el.props.style.height).toBe(BADGE_SIZES.md.height);
  });

  it("data-slot is 'badge', matching every sibling component's convention", () => {
    expect(bareBadge.props["data-slot"]).toBe("badge");
  });

  it("toArgTypes maps hidden to a boolean control, size to select, children to text", () => {
    const argTypes = toArgTypes(BADGE_FIELDS);
    expect(argTypes.hidden.control).toBe("boolean");
    expect(argTypes.size.control).toBe("select");
    expect(argTypes.children.control).toBe("text");
  });

  it("tier: children and size are simple; hidden is unset (defaults to expert)", () => {
    expect(field("children").tier).toBe("simple");
    expect(field("size").tier).toBe("simple");
    expect(field("hidden").tier).toBeUndefined();
  });

  it("has no presets — nothing on the board or in any donor gives Badge a state axis (same convention as GLYPH_PRESETS)", () => {
    expect(BADGE_PRESETS).toEqual([]);
  });
});
