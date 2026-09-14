import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { assertDisjointPresets, governedFieldIds, defaultArgs, resolveField, toArgTypes } from "@bbox-ui/schema";
import {
  BLOCK_FIELDS,
  BLOCK_HEADER_MODES,
  BLOCK_MEMBERS_MODES,
  BLOCK_ORIENTATIONS,
  BLOCK_PORTS_MODES,
  BLOCK_TYPE_PLACEMENTS,
  HEIGHT_FIELD,
  ORIENTATION_FIELD,
  WIDTH_FIELD,
} from "../src/block.fields";
import { BLOCK_PRESET_GOVERNS, BLOCK_PRESETS } from "../src/block.presets";
import { BLOCK_VIEWS } from "../src/block.view";
import { Block, BlockChip, BlockHeader } from "../src/block";
import { Pill } from "../src/pill";
import { APPEARANCE_STATES, TONES } from "../src/appearance";
import { APPEARANCE_FIELDS } from "../src/appearance.fields";
import { CHIP, CHIP_RIGHT_IN_HEADER_PX, META_FONT_PX, SIMPLE_BLOCK } from "../src/layout";

/**
 * `Block`/`BlockHeader`/`BlockChip` use no hooks (`BlockHeader`'s
 * `Children.toArray`/`isValidElement` are plain React utilities, not
 * hooks) — calling each directly, as a plain function, returns the exact
 * element tree it would render, with every real default already applied.
 * T0's own `port.fields.test.ts` pattern.
 */
function blockElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Block as any)(props);
}
function headerElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (BlockHeader as any)(props);
}
function chipElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (BlockChip as any)(props);
}
/**
 * `chipElement` returns the unrendered `<Pill .../>` element `BlockChip`
 * produces (its `.props` are what BlockChip PASSES INTO Pill — geometry,
 * `state`, `tone`, `data-slot` — never the border/background Pill's own
 * render computes from them). To read the actually-painted style/DOM
 * attributes, call that element's own type (`Pill`) with its props — one
 * more level of the same "call it as a plain function" idiom.
 */
function renderedChip(props: Record<string, unknown> = {}) {
  const el = chipElement(props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (el.type as any)(el.props);
}
function pillElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Pill as any)(props);
}

function field(id: string) {
  const found = BLOCK_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no BLOCK_FIELDS entry for "${id}"`);
  return found;
}

const bareBlock = blockElement();
const bareHeader = headerElement();
const bareChip = chipElement();

describe("BlockHeader chip reservation", () => {
  // The header reserves space for a chip so it cannot paint over the title's
  // last letters. `Children.toArray` flattens arrays but does not descend
  // into Fragments, so a Fragment-wrapped chip went undetected and the
  // reservation was skipped — the same class as PortEdge's cascade landing on
  // a Fragment and reaching no Port.
  const headerOf = (children: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (BlockHeader as any)({ children }) as { props: Record<string, unknown> };

  it("sees a chip passed directly", () => {
    expect(headerOf(createElement(BlockChip, {}, "Draft")).props["data-has-chip"]).toBe(true);
  });

  it("sees a chip wrapped in a Fragment", () => {
    expect(
      headerOf(createElement(Fragment, null, createElement(BlockChip, {}, "Draft"))).props[
        "data-has-chip"
      ],
    ).toBe(true);
  });

  // The attribute is `hasChip || undefined`, so "no chip" is an ABSENT
  // attribute rather than "false" — that is what keeps it off the DOM.
  it("still reports no chip when there genuinely is none", () => {
    expect(headerOf(createElement("span", {}, "Title")).props["data-has-chip"]).toBeUndefined();
  });
});

describe("BLOCK_FIELDS", () => {
  it("is view, then the six face fields it governs, then Block's own geometry, then the shared APPEARANCE_FIELDS bundle (P2 'views are presets' — T1-SPEC.md §4.8's original row order continues unchanged after the new view fields)", () => {
    expect(BLOCK_FIELDS.map((f) => f.id)).toEqual([
      "view",
      "header",
      "ports",
      "members",
      "description",
      "typePlacement",
      "footer",
      "width",
      "height",
      "radius",
      "orientation",
      "state",
      "tone",
      "lens",
    // WHY no "lensBefore" here: the field is declared in
    // appearance.fields.ts but deliberately NOT in APPEARANCE_FIELDS —
    // nothing renders it, so shipping it put a live control into 27 story
    // panels that moved nothing. See its docblock for the one-line undo.
    ]);
  });

  it("is a flat property space — the bundle is spread in, never nested under an `appearance` key", () => {
    expect(BLOCK_FIELDS.every((f) => !f.id.startsWith("appearance"))).toBe(true);
  });

  it("its bundle tail is literally APPEARANCE_FIELDS, not a re-typed copy", () => {
    expect(BLOCK_FIELDS.slice(-APPEARANCE_FIELDS.length)).toEqual(APPEARANCE_FIELDS);
  });

  it("width's declared default equals Block's real default width", () => {
    expect(WIDTH_FIELD.defaultValue).toBe(SIMPLE_BLOCK.width);
    expect(bareBlock.props.style.width).toBe(field("width").defaultValue);
  });

  it("height's declared default equals Block's real default height", () => {
    expect(HEIGHT_FIELD.defaultValue).toBe(SIMPLE_BLOCK.height);
    expect(bareBlock.props.style.height).toBe(field("height").defaultValue);
  });

  it("a non-default width/height renders as the real container size", () => {
    const el = blockElement({ width: 500, height: 300 });
    expect(el.props.style.width).toBe(500);
    expect(el.props.style.height).toBe(300);
  });

  it("orientation's declared default equals BlockHeader's real default (data-orientation)", () => {
    expect(ORIENTATION_FIELD.defaultValue).toBe("horizontal");
    expect(bareHeader.props["data-orientation"]).toBe(field("orientation").defaultValue);
  });

  it("orientation's options are exactly the real BlockOrientation union", () => {
    expect(field("orientation").options?.map((o) => o.value)).toEqual(BLOCK_ORIENTATIONS);
  });

  it("state's/tone's options are exactly the real AppearanceState/Tone unions (appearance.ts's own arrays)", () => {
    expect(field("state").options?.map((o) => o.value)).toEqual(APPEARANCE_STATES);
    expect(field("tone").options?.map((o) => o.value)).toEqual(TONES);
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(BLOCK_FIELDS)).toEqual(
      Object.fromEntries(BLOCK_FIELDS.map((f) => [f.id, f.defaultValue])),
    );
  });

  it("toArgTypes maps width/height to number and the rest to select/text", () => {
    const argTypes = toArgTypes(BLOCK_FIELDS);
    expect(argTypes.width.control).toBe("number");
    expect(argTypes.height.control).toBe("number");
    for (const id of ["orientation", "state", "tone", "lens"]) {
      expect(argTypes[id].control).toBe("select");
    }
    // Inverted deliberately: an argType for a field nothing renders IS the
    // defect. A control that moves nothing reads as broken.
    expect(argTypes).not.toHaveProperty("lensBefore");
  });

  it("has no `children`/`bodyLayout`/paint entries — Block's body-layout and own paint are explicitly deferred (T1-SPEC.md §4.8, §10)", () => {
    expect(BLOCK_FIELDS.find((f) => f.id === "children")).toBeUndefined();
    expect(BLOCK_FIELDS.find((f) => f.id === "bodyLayout")).toBeUndefined();
  });
});

function viewField(id: string) {
  const found = BLOCK_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no BLOCK_FIELDS entry for "${id}"`);
  return found;
}

describe("VIEW_FIELD — Block's first real preset selector (P2 'views are presets')", () => {
  it("exists, is a segments field, defaults to 'simple', with options exactly the three views in order", () => {
    const view = viewField("view");
    expect(view.kind).toBe("segments");
    expect(view.defaultValue).toBe("simple");
    expect(view.options?.map((o) => o.value)).toEqual(BLOCK_VIEWS);
    expect(BLOCK_VIEWS).toEqual(["simple", "port", "expanded"]);
  });

  it("header/ports/members/typePlacement options are exactly their real closed unions", () => {
    expect(viewField("header").options?.map((o) => o.value)).toEqual(BLOCK_HEADER_MODES);
    expect(viewField("ports").options?.map((o) => o.value)).toEqual(BLOCK_PORTS_MODES);
    expect(viewField("members").options?.map((o) => o.value)).toEqual(BLOCK_MEMBERS_MODES);
    expect(viewField("typePlacement").options?.map((o) => o.value)).toEqual(BLOCK_TYPE_PLACEMENTS);
  });
});

describe("BLOCK_PRESETS — Block's first real preset family (Definition of Done §9 item 3)", () => {
  it("is no longer empty — one preset per real BlockView, id === view, selector 'view'", () => {
    expect(BLOCK_PRESETS).toHaveLength(3);
    expect(BLOCK_PRESETS.map((p) => p.id)).toEqual(BLOCK_VIEWS);
    expect(BLOCK_PRESETS.every((p) => p.selector === "view")).toBe(true);
  });

  it("every preset governs exactly the eight face+size fields, and Object.keys(values) agrees with governs — no authoring gap", () => {
    for (const preset of BLOCK_PRESETS) {
      expect([...preset.governs].sort()).toEqual([...BLOCK_PRESET_GOVERNS].sort());
      expect(Object.keys(preset.values).sort()).toEqual([...BLOCK_PRESET_GOVERNS].sort());
      for (const id of preset.governs) {
        expect(preset.values[id]).not.toBeUndefined();
      }
    }
  });

  it("assertDisjointPresets(BLOCK_PRESETS) does not throw — every preset shares the single 'view' selector", () => {
    expect(() => assertDisjointPresets(BLOCK_PRESETS)).not.toThrow();
  });

  it("governedFieldIds(BLOCK_PRESETS) is exactly the eight governed ids", () => {
    expect(governedFieldIds(BLOCK_PRESETS).sort()).toEqual([...BLOCK_PRESET_GOVERNS].sort());
  });

  it("pins each preset's width/height to the measured view boxes", () => {
    const byId = Object.fromEntries(BLOCK_PRESETS.map((p) => [p.id, p.values]));
    expect(byId.simple).toMatchObject({ width: 384, height: 258 });
    expect(byId.port).toMatchObject({ width: 384, height: 346 });
    expect(byId.expanded).toMatchObject({ width: 707, height: 452 });
  });

  it("pins every face value from the P2 table", () => {
    const byId = Object.fromEntries(BLOCK_PRESETS.map((p) => [p.id, p.values]));
    expect(byId.simple).toMatchObject({
      header: "centered",
      ports: "anonymous",
      members: "hidden",
      description: true,
      typePlacement: "bottom",
      footer: false,
    });
    expect(byId.port).toMatchObject({
      header: "band",
      ports: "rows",
      members: "hidden",
      description: false,
      typePlacement: "header",
      footer: true,
    });
    expect(byId.expanded).toMatchObject({
      header: "band",
      ports: "walls",
      members: "shown",
      description: false,
      typePlacement: "header",
      footer: false,
    });
  });

  it("the §1.4 worked example, executed against the real BLOCK_PRESETS: resolveField(header, {view:'port'}, BLOCK_PRESETS) resolves 'band' from the preset layer", () => {
    const trace = resolveField(viewField("header"), { view: "port" }, BLOCK_PRESETS);
    expect(trace.winner).toBe("preset");
    expect(trace.winningPresetId).toBe("port");
    expect(trace.resolved).toBe("band");
  });

  it("an instance override reaches past the view preset honestly", () => {
    const trace = resolveField(
      viewField("header"),
      { view: "port", header: "centered" },
      BLOCK_PRESETS,
    );
    expect(trace.winner).toBe("override");
    expect(trace.resolved).toBe("centered");
  });
});

describe("Face-field defaults equal the 'simple' preset's values — the \"bare Block == Simple\" invariant", () => {
  it("every governed field's own FieldSpec default matches what view:'simple' resolves to", () => {
    const simple = BLOCK_PRESETS.find((p) => p.id === "simple")!;
    for (const id of BLOCK_PRESET_GOVERNS) {
      expect(viewField(id).defaultValue).toEqual(simple.values[id]);
    }
  });
});

describe("state/tone are inert on Block itself — they only mean something on a composed BlockChip", () => {
  it("Block does not destructure state/tone; passing them changes nothing it paints", () => {
    const plain = blockElement();
    const withState = blockElement({ state: "wired", tone: "danger" });
    expect(withState.props.style).toEqual(plain.props.style);
    expect(withState.props.className).toBe(plain.props.className);
  });
});

describe("BlockChip — a thin wrapper around the real Pill (T1-SPEC.md §4.8 point 2)", () => {
  it("state's/tone's declared defaults equal BlockChip's real destructured defaults", () => {
    const rendered = renderedChip();
    expect(rendered.props["data-state"]).toBe(field("state").defaultValue);
    expect(rendered.props["data-tone"]).toBe(field("tone").defaultValue);
  });

  it("keeps data-slot=\"block-chip\" (never Pill's own default \"pill\") — a real external DOM contract, demos/drive.mjs selects it", () => {
    // Two levels checked: BlockChip passes it into Pill explicitly (shallow,
    // on the unrendered element)...
    expect(bareChip.props["data-slot"]).toBe("block-chip");
    // ...and it actually reaches the rendered <span>, proving Pill's own
    // spread-props ordering doesn't quietly revert it to "pill".
    expect(renderedChip().props["data-slot"]).toBe("block-chip");
  });

  it("an explicit data-slot override from the caller still wins, exactly as before this edit", () => {
    const el = chipElement({ "data-slot": "custom" });
    expect(el.props["data-slot"]).toBe("custom");
    expect(renderedChip({ "data-slot": "custom" }).props["data-slot"]).toBe("custom");
  });

  it("reproduces the exact prior visual with zero props — hollow foreground outline, no fill (both existing adapters render a bare <BlockChip>{tag}</BlockChip>)", () => {
    const rendered = renderedChip();
    expect(rendered.props.style.borderStyle).toBe("solid");
    expect(rendered.props.style.borderWidth).toBe(2);
    expect(rendered.props.style.borderColor).toBe("var(--foreground)");
    expect(rendered.props.style.background).toBe("transparent");
  });

  it("paints through the SAME cascade a bare Pill runs — not a second, parallel colour system", () => {
    const wiredChip = renderedChip({ state: "wired" });
    const wiredPill = pillElement({ state: "wired" });
    expect(wiredChip.props.style.borderColor).toBe(wiredPill.props.style.borderColor);
    expect(wiredChip.props.style.background).toBe(wiredPill.props.style.background);
  });

  it("an explicit lineColor override reaches past the state preset on BlockChip too, the §1.4 worked example composed one level up", () => {
    const rendered = renderedChip({ state: "wired", lineColor: "bbox-danger" });
    expect(rendered.props.style.borderColor).toBe("var(--bbox-danger)");
    expect(rendered.props.style.background).toBe("var(--bbox-primary, var(--primary))");
  });

  it("tone recolours the chip exactly as it recolours a bare Pill", () => {
    const tonedChip = renderedChip({ state: "wired", tone: "success" });
    const tonedPill = pillElement({ state: "wired", tone: "success" });
    expect(tonedChip.props.style.borderColor).toBe(tonedPill.props.style.borderColor);
    expect(tonedChip.props.style.background).toBe(tonedPill.props.style.background);
  });

  it("geometry is unchanged — the measured CHIP box constants from layout.ts, byte-identical to before this edit", () => {
    expect(bareChip.props.style.right).toBe(CHIP_RIGHT_IN_HEADER_PX);
    expect(bareChip.props.style.minWidth).toBe(CHIP.minWidth);
    expect(bareChip.props.style.height).toBe(CHIP.height);
    expect(bareChip.props.style.fontSize).toBe(META_FONT_PX);
  });

  it("is positioned absolutely, vertically centered — geometry class unchanged", () => {
    expect(bareChip.props.className).toContain("absolute");
    expect(bareChip.props.className).toContain("top-1/2");
    expect(bareChip.props.className).toContain("-translate-y-1/2");
  });

  it("still forwards children as the chip's label", () => {
    const el = chipElement({ children: "Draft 1" });
    expect(el.props.children).toBe("Draft 1");
  });
});
