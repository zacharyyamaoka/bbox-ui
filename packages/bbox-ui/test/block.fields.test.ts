import { describe, expect, it } from "vitest";
import { assertDisjointPresets, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  BLOCK_FIELDS,
  BLOCK_ORIENTATIONS,
  HEIGHT_FIELD,
  ORIENTATION_FIELD,
  WIDTH_FIELD,
} from "../src/block.fields";
import { BLOCK_PRESETS } from "../src/block.presets";
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

describe("BLOCK_FIELDS", () => {
  it("is Block's own two props, then orientation, then the shared APPEARANCE_FIELDS bundle — T1-SPEC.md §4.8's pinned row order", () => {
    expect(BLOCK_FIELDS.map((f) => f.id)).toEqual([
      "width",
      "height",
      "orientation",
      "state",
      "tone",
      "lens",
      "lensBefore",
    ]);
  });

  it("is a flat property space — the bundle is spread in, never nested under an `appearance` key", () => {
    expect(BLOCK_FIELDS.every((f) => !f.id.startsWith("appearance"))).toBe(true);
  });

  it("its bundle tail is literally APPEARANCE_FIELDS, not a re-typed copy", () => {
    expect(BLOCK_FIELDS.slice(3)).toEqual(APPEARANCE_FIELDS);
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
    expect(argTypes.lensBefore.control).toBe("text");
  });

  it("has no `children`/`bodyLayout`/paint entries — Block's body-layout and own paint are explicitly deferred (T1-SPEC.md §4.8, §10)", () => {
    expect(BLOCK_FIELDS.find((f) => f.id === "children")).toBeUndefined();
    expect(BLOCK_FIELDS.find((f) => f.id === "bodyLayout")).toBeUndefined();
  });
});

describe("BLOCK_PRESETS", () => {
  it("is empty — Block forwards state/tone to its chip's own PILL_PRESETS rather than governing a paint field of its own (T1-SPEC.md §4.8)", () => {
    expect(BLOCK_PRESETS).toEqual([]);
  });

  it("assertDisjointPresets(BLOCK_PRESETS) does not throw", () => {
    expect(() => assertDisjointPresets(BLOCK_PRESETS)).not.toThrow();
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
    expect(rendered.props.style.background).toBe("var(--primary)");
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
