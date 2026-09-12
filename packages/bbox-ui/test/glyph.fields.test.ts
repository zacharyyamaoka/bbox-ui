import React from "react";
import { act, create, type ReactTestRendererJSON } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { assertDisjointPresets, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { GLYPH_FIELDS, GLYPH_PRESETS } from "../src/glyph.fields";
import { Glyph, GlyphResolverProvider, type GlyphProps } from "../src/glyph";
import { GLYPH_SIZES } from "../src/glyph.layout";

// React 19's test renderer only flushes its render synchronously inside
// `act()`; without this flag it warns "not configured to support act()"
// even though `act()` is exactly what every render below already uses.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Glyph v2 reads a React context (`useGlyphResolver`) to resolve a Lucide
 * name — the frozen contract's own design (docs/GLYPH-PLAN.md), so it can
 * no longer be called as a bare function the way `port.fields.test.ts`
 * calls `Port`: `useContext` throws "Invalid hook call" outside an actual
 * React render (no fiber, no dispatcher). `react-test-renderer` renders it
 * for real, with zero DOM/jsdom, and hands back the same host-node prop
 * object (`.toJSON().props`) the old direct-call pattern read — every
 * assertion below is unchanged in shape, only the getter changed.
 */
function renderGlyph(props: GlyphProps = {}): ReactTestRendererJSON {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Glyph, props));
  });
  const json = renderer.toJSON() as ReactTestRendererJSON;
  act(() => renderer.unmount());
  return json;
}

function field(id: string) {
  const found = GLYPH_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no GLYPH_FIELDS entry for "${id}"`);
  return found;
}

const bareGlyph = renderGlyph();

describe("GLYPH_FIELDS", () => {
  it("every id is a real GlyphProps key, in panel order (docs/GLYPH-PLAN.md's contract table)", () => {
    expect(GLYPH_FIELDS.map((f) => f.id)).toEqual(["content", "sizePreset", "size", "padding"]);
  });

  it('content defaults to "", the encoded empty slot (glyph.tsx: content = "")', () => {
    expect(field("content").defaultValue).toBe("");
    expect(field("content").kind).toBe("glyph");
    expect(bareGlyph.props["data-content-kind"]).toBe("none");
    expect(bareGlyph.props["data-empty"]).toBe("true");
  });

  it('sizePreset defaults to "sm" (D1 — glyph.tsx: sizePreset = "sm")', () => {
    expect(field("sizePreset").defaultValue).toBe("sm");
    expect(bareGlyph.props["data-size-preset"]).toBe("sm");
  });

  it("size's declared default equals GLYPH_SIZES.sm, and the bare glyph paints at that footprint", () => {
    expect(field("size").defaultValue).toBe(GLYPH_SIZES.sm);
    expect(bareGlyph.props["data-size"]).toBe(GLYPH_SIZES.sm);
    expect((bareGlyph.props.style as Record<string, unknown>).width).toBe(GLYPH_SIZES.sm);
    expect((bareGlyph.props.style as Record<string, unknown>).height).toBe(GLYPH_SIZES.sm);
    expect((bareGlyph.props.style as Record<string, unknown>).fontSize).toBe(GLYPH_SIZES.sm);
  });

  it("padding's declared default equals Glyph's real default (glyph.tsx: padding = 0)", () => {
    expect(field("padding").defaultValue).toBe(0);
    expect((bareGlyph.props.style as Record<string, unknown>).padding).toBe(0);
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(GLYPH_FIELDS, GLYPH_PRESETS)).toEqual({
      content: field("content").defaultValue,
      sizePreset: field("sizePreset").defaultValue,
      // "size" is governed by every GLYPH_PRESETS entry — omitted from
      // defaultArgs on purpose, same reason storybook.ts's own header
      // comment gives: materialising it would pin the override layer and
      // make the preset layer unreachable in a Storybook story.
      padding: field("padding").defaultValue,
    });
  });

  it("an explicit size overrides the preset, even size:0 (checked with !== undefined, never ??)", () => {
    const el = renderGlyph({ size: 0 });
    expect((el.props.style as Record<string, unknown>).width).toBe(0);
    expect(el.props["data-size"]).toBe(0);
  });

  it("padding is additive to the rendered footprint, never folded into size", () => {
    const el = renderGlyph({ padding: 8 });
    expect((el.props.style as Record<string, unknown>).width).toBe(GLYPH_SIZES.sm);
    expect((el.props.style as Record<string, unknown>).padding).toBe(8);
  });

  it("sizePreset's options are exactly the real GlyphSize union (glyph.layout.ts's own GLYPH_SIZES keys)", () => {
    expect(field("sizePreset").options?.map((o) => o.value)).toEqual(Object.keys(GLYPH_SIZES));
  });

  it("every size preset resolves to Glyph's real rendered footprint for that preset", () => {
    for (const option of field("sizePreset").options ?? []) {
      const el = renderGlyph({ sizePreset: option.value as GlyphProps["sizePreset"] });
      expect((el.props.style as Record<string, unknown>).width).toBe(
        GLYPH_SIZES[option.value as keyof typeof GLYPH_SIZES],
      );
    }
  });

  it("toArgTypes maps content to text (Storybook has no picker), sizePreset to select, size/padding to number", () => {
    const argTypes = toArgTypes(GLYPH_FIELDS);
    expect(argTypes.content.control).toBe("text");
    expect(argTypes.sizePreset.control).toBe("select");
    expect(argTypes.size.control).toBe("number");
    expect(argTypes.size.min).toBe(8);
    expect(argTypes.size.max).toBe(512);
    expect(argTypes.padding.control).toBe("number");
    expect(argTypes.padding.min).toBe(0);
    expect(argTypes.padding.max).toBe(64);
  });

  it("GLYPH_PRESETS has exactly the four size presets, each governing only size", () => {
    expect(GLYPH_PRESETS.map((p) => p.id)).toEqual(["sm", "md", "lg", "xl"]);
    for (const preset of GLYPH_PRESETS) {
      expect(preset.selector).toBe("sizePreset");
      expect(preset.governs).toEqual(["size"]);
    }
  });

  it("each preset's values keys equal its own governs — no orphaned or missing value", () => {
    for (const preset of GLYPH_PRESETS) {
      expect(Object.keys(preset.values).sort()).toEqual([...preset.governs].sort());
    }
  });

  it("every preset's governed value matches the real GLYPH_SIZES ladder", () => {
    for (const preset of GLYPH_PRESETS) {
      expect(preset.values.size).toBe(GLYPH_SIZES[preset.id as keyof typeof GLYPH_SIZES]);
    }
  });

  it("the governed set is closed — no two presets on different selectors ever claim the same field", () => {
    expect(() => assertDisjointPresets(GLYPH_PRESETS)).not.toThrow();
  });
});

describe("Glyph content rendering", () => {
  it('renders children through the backwards-compatible slot while content is ""', () => {
    const el = renderGlyph({ children: "◆" });
    expect(el.props["data-content-kind"]).toBe("none");
    expect(el.props["data-empty"]).toBeUndefined();
    expect(el.children).toEqual(["◆"]);
  });

  it("renders emoji content at 0.85em", () => {
    const el = renderGlyph({ content: "emoji:🚀" });
    expect(el.props["data-content-kind"]).toBe("emoji");
    const child = (el.children as { props: Record<string, unknown> }[])[0]!;
    expect(child.props.style).toMatchObject({ fontSize: "0.85em" });
  });

  it("renders text content as a plain string child", () => {
    const el = renderGlyph({ content: "text:◆" });
    expect(el.props["data-content-kind"]).toBe("text");
    expect(el.children).toEqual(["◆"]);
  });

  it("renders image content as a contain-fit <img>, never cropped or stretched", () => {
    const el = renderGlyph({ content: "data:image/png;base64,AAAA" });
    expect(el.props["data-content-kind"]).toBe("image");
    const img = (el.children as { type: string; props: Record<string, unknown> }[])[0]!;
    expect(img.type).toBe("img");
    expect(img.props.src).toBe("data:image/png;base64,AAAA");
    expect(img.props.style).toMatchObject({ objectFit: "contain" });
  });

  it("an UNRESOLVED lucide name (no GlyphResolverProvider) renders empty and marks data-unresolved with the name", () => {
    const el = renderGlyph({ content: "lucide:rocket" });
    expect(el.props["data-content-kind"]).toBe("lucide");
    expect(el.props["data-unresolved"]).toBe("rocket");
    expect(el.children).toBeNull();
  });

  it("a RESOLVED lucide name (GlyphResolverProvider mounted) renders the provider's element and clears data-unresolved", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(
          GlyphResolverProvider,
          { value: { renderLucide: (name: string) => React.createElement("svg", { "data-icon": name }) } },
          React.createElement(Glyph, { content: "lucide:rocket" }),
        ),
      );
    });
    const json = renderer.toJSON() as ReactTestRendererJSON;
    const children = json.children as ReactTestRendererJSON[];
    expect(json.props["data-unresolved"]).toBeUndefined();
    expect(children[0]!.type).toBe("svg");
    expect(children[0]!.props["data-icon"]).toBe("rocket");
    act(() => renderer.unmount());
  });
});
