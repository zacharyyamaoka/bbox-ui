import { describe, expect, it } from "vitest";
import {
  assertDisjointPresets,
  defaultArgs,
  governedFieldIds,
  resolveField,
  toArgTypes,
} from "@bbox-ui/schema";
import { CodeField } from "../src/codeField";
import { LABELED_PORT_FIELDS, PORT_FIELDS } from "../src/port.fields";
import { PORT_PRESETS } from "../src/port.presets";
import { LabeledPort, Port, PortCountBadge, PortLabel, portResolutionSubject } from "../src/port";
import {
  APPEARANCE_STATES,
  LENSES,
  TONES,
} from "../src/appearance";
import {
  BLOCK_SIDES,
  PORT_DIAMETERS,
  PORT_DIRECTIONS,
  PORT_REVEALS,
  PORT_SIZE_RUNGS,
  PORT_TEXT_LAYOUTS,
  PORT_TEXT_SIZES,
  SECONDARY_SLOT_LAYOUTS,
  defaultSecondarySlotLayout,
  slotPlacementStyle,
  inwardTextLayout,
} from "../src/port.layout";

/**
 * `Port`/`PortDot`/`PortLabel` use no hooks — calling any of them
 * directly, as a plain function, returns the exact React element tree it
 * would render, with every default already applied by its own `= "..."`
 * destructuring. Reading defaults off THIS (not off a hand-retyped
 * literal) is what makes this file fail the moment `port.tsx`'s real
 * default changes, instead of silently drifting alongside a copy that
 * only agrees with itself. No DOM/jsdom is needed: these are plain
 * element objects, never rendered or mounted. Same pattern as T0's own
 * `port.fields.test.ts` and every sibling T1 lane's `*.fields.test.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call(fn: any, props: Record<string, unknown> = {}) {
  return fn(props);
}

function field(id: string) {
  const found = LABELED_PORT_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no LABELED_PORT_FIELDS entry for "${id}"`);
  return found;
}

// The bare, fully-defaulted tree: Port -> [PortDot element, PortLabel element].
const bareRoot = call(LabeledPort);
const [dotElement, labelElement] = bareRoot.props.children as [
  { type: unknown; props: Record<string, unknown> },
  { props: Record<string, unknown> },
];
// Invoke the two child components themselves to read THEIR real output —
// `Port` only threads props through; the geometry/paint live in these.
const dotRendered = call(Port, dotElement.props);
const labelRendered = call(PortLabel, labelElement.props);

describe("PORT_FIELDS", () => {
  it("has exactly Port's real props, in panel order — own fields, then the shared APPEARANCE_FIELDS bundle, then the author-set hidden/disabled toggles, then the host-computed interaction axis, then the label fields", () => {
    expect(LABELED_PORT_FIELDS.map((f) => f.id)).toEqual([
      // "name"/"type"/"defaultValue" REMOVED 2026-09-12 (the two-slot
      // proposal) — folded into the single `children` field, now the
      // label slot's real CodeField value. See port.tsx's own module doc.
      "direction",
      "edge",
      "size",
      "diameter",
      // "role"/"decoration" REMOVED 2026-09-12 — vestigial, no host
      // adapter ever set or read either (recon confirmed zero call
      // sites); Python-specific annotations are SystemSketch's business,
      // not this package's. See port.layout.ts's own WHY.
      "textLayout",
      // The label's placement, unified 2026-09-15: `textLayout` above is
      // the Simple-tier PRESET over exactly these three (Zach: "thoose are
      // just presets!"), which are the Expert-tier truth. `labelOffsetY`
      // replaces the old positive-only `labelOffset`.
      "labelOrigin",
      "labelOffsetX",
      "labelOffsetY",
      "textSize",
      "state",
      "tone",
      "lens",
    // WHY no "lensBefore" here: the field is declared in
    // appearance.fields.ts but deliberately NOT in APPEARANCE_FIELDS —
    // nothing renders it, so shipping it put a live control into 27 story
    // panels that moved nothing. See its docblock for the one-line undo.
      "hidden",
      "disabled",
      "dimmed",
      "hinting",
      "reveal",
      "producers",
      "secondarySlotLayout",
      // …and the secondary slot's matching trio, over the SAME SlotOrigin
      // type. One model for both slots is the point of the unification.
      "secondaryOrigin",
      "secondaryOffsetX",
      "secondaryOffsetY",
      "children",
      "placeholder",
    ]);
  });

  it("children defaults to Port's real empty string, and PortLabel renders a CodeField bound to it", () => {
    expect(field("children").defaultValue).toBe("");
    const codeFieldElement = labelRendered.props.children;
    expect(codeFieldElement.type).toBe(CodeField);
    expect(codeFieldElement.props.value).toBe("");
  });

  it("direction's declared default equals Port's real default (port.tsx: direction = \"input\")", () => {
    expect(field("direction").defaultValue).toBe("input");
    expect(bareRoot.props["data-direction"]).toBe("input");
    expect(labelElement.props.direction).toBe("input");
  });

  it("edge's declared default equals Port's real default (port.tsx: edge = \"left\")", () => {
    expect(field("edge").defaultValue).toBe("left");
    expect(bareRoot.props["data-edge"]).toBe("left");
  });

  it("size's declared default equals Port's real default, cascades, and its options are the real PortSizeRung union", () => {
    expect(field("size").defaultValue).toBe("md");
    expect(field("size").cascades).toBe(true);
    expect(bareRoot.props["data-size"]).toBe("md");
    expect(field("size").options?.map((o) => o.value)).toEqual([...PORT_SIZE_RUNGS]);
  });

  // Pins Zach's 2026-09-14 curation of Port's Inspector Simple tab
  // (@bbox-ui/panel's fieldTiers.ts): `size` is a preset selector, which
  // `classifyField` would otherwise infer as Simple (the same rule `state`
  // gets it from) — an explicit `tier` override is the ONLY thing keeping
  // it out. A silent revert of this one line would put a Small/Medium/
  // Large/Extra Large control back in Simple with every other assertion
  // in this file (and the panel's own tests) still green.
  it("size is explicitly demoted to \"advanced\" — Zach: \"No need for size control here\"", () => {
    expect(field("size").tier).toBe("advanced");
  });

  it("diameter's declared default equals Port's real default and Port's own real rendered footprint — reached via the `size` cascade (size defaults to \"md\", whose preset governs diameter to \"md\")", () => {
    expect(field("diameter").defaultValue).toBe("md");
    expect(dotElement.props.diameter).toBe("md");
    expect(dotRendered.props.style.width).toBe(PORT_DIAMETERS.md);
    expect(dotRendered.props.style.height).toBe(PORT_DIAMETERS.md);
  });

  it("textLayout's declared default equals inwardTextLayout(edge) at Port's real default edge (\"left\")", () => {
    expect(inwardTextLayout("left")).toBe("right");
    expect(field("textLayout").defaultValue).toBe("right");
    expect(bareRoot.props["data-text-layout"]).toBe("right");
  });

  // Pins the field Zach actually asked to see move in the Simple tab
  // (2026-09-14: "Label Slot Location — Where is the slot located").
  // Without shape-inference to fall back on for a field this important,
  // a silent label/tier revert here would leave every other test green
  // while the Inspector's Simple tab quietly lost its one geometry
  // control again.
  it("textLayout is labelled \"Label Slot Location\" and explicitly promoted to \"simple\"", () => {
    expect(field("textLayout").label).toBe("Label Slot Location");
    expect(field("textLayout").tier).toBe("simple");
  });

  it("textSize's declared default equals Port's real default — \"md\" (24px), not textSize's own former \"sm\" rung, now that a truly bare Port resolves it through the size cascade", () => {
    expect(field("textSize").defaultValue).toBe("md");
    expect(labelElement.props.textSize).toBe("md");
  });

  it("includes the shared APPEARANCE_FIELDS bundle verbatim (state/tone/lens) — spread, never nested under an `appearance` key (Zach's flat-property-space ruling)", () => {
    expect(field("state").defaultValue).toBe("empty");
    expect(field("tone").defaultValue).toBe("neutral");
    expect(field("lens").defaultValue).toBe("normal");
    // lensBefore is intentionally out of the bundle; see appearance.fields.ts.
    expect(LABELED_PORT_FIELDS.some((f) => f.id === "lensBefore")).toBe(false);
    expect(dotElement.props.state).toBe("empty");
    expect(dotElement.props.tone).toBe("neutral");
    expect(bareRoot.props["data-state"]).toBe("empty");
    // "normal" lens is not surfaced as a `data-lens` attribute at all.
    expect(bareRoot.props["data-lens"]).toBeUndefined();
    const changedRoot = call(LabeledPort, { lens: "changed" });
    expect(changedRoot.props["data-lens"]).toBe("changed");
  });

  it("the interaction axis (dimmed/hinting/reveal/producers) is host-computed, defaults to inert, and is never a preset-governed field", () => {
    expect(field("dimmed").defaultValue).toBe(false);
    expect(field("hinting").defaultValue).toBe(false);
    expect(field("reveal").defaultValue).toBe("always");
    expect(field("producers").defaultValue).toBe(0);
    expect(dotElement.props.dimmed).toBe(false);
    expect(dotElement.props.hinting).toBe(false);
    // The bare `Port` geometry primitive has NO producers prop, no
    // secondary slot and no producers-aware logic at all (the 2026-09-15
    // split: "Port is just the actual like Port geometry its self in
    // isolation"). `LabeledPort` composes the count badge into the slot
    // it owns. 2+ producers is still the real threshold, now one level up.
    expect("secondarySlot" in dotElement.props).toBe(false);
    // With no slot content, LabeledPort's first child IS the bare Port —
    // no wrapper at all.
    expect(dotElement.type).toBe(Port);

    // With a badge, the first child becomes the geometry wrapper carrying
    // [Port, secondary-slot span].
    type Wrapper = {
      props: {
        "data-slot"?: string;
        children: [unknown, { props: { children: { type: unknown; props: { count: number } } } }];
      };
    };
    const [twoProducers] = call(LabeledPort, { producers: 2 }).props.children as [Wrapper, unknown];
    expect(twoProducers.props["data-slot"]).toBe("port-geometry");
    const badge = twoProducers.props.children[1].props.children;
    expect(badge.type).toBe(PortCountBadge);
    expect(badge.props.count).toBe(2);

    // Below the threshold there is no slot content, so no wrapper either.
    const [oneProducer] = call(LabeledPort, { producers: 1 }).props.children as [
      { type: unknown },
      unknown,
    ];
    expect(oneProducer.type).toBe(Port);
  });

  it("`hidden: true` renders nothing — Port, PortDot and PortLabel all return null", () => {
    expect(call(LabeledPort, { hidden: true })).toBeNull();
    expect(call(Port, { hidden: true })).toBeNull();
    expect(call(PortLabel, { hidden: true })).toBeNull();
  });

  it("hidden's declared default equals Port's real default (false, persisted — not host-computed)", () => {
    expect(field("hidden").defaultValue).toBe(false);
    expect(field("hidden").randomize).not.toBe(false);
    expect(dotElement.props.hidden).toBe(false);
  });

  it("children's default (\"\") is CodeField's own honest empty value, identical to omitting it — no separate fall-through case anymore", () => {
    expect(field("children").defaultValue).toBe("");
    const withEmptyString = call(PortLabel, { children: "" });
    const omitted = call(PortLabel, {});
    expect(withEmptyString.props.children.props.value).toBe("");
    expect(omitted.props.children.props.value).toBe("");
    const withRealChildren = call(PortLabel, { children: "custom" });
    expect(withRealChildren.props.children.props.value).toBe("custom");
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    const args = defaultArgs(LABELED_PORT_FIELDS);
    for (const f of LABELED_PORT_FIELDS) {
      expect(args[f.id]).toBe(f.defaultValue);
    }
    expect(Object.keys(args)).toHaveLength(LABELED_PORT_FIELDS.length);
  });

  it("every segments field's options are exactly its real source union, in the real declared order", () => {
    expect(field("direction").options?.map((o) => o.value)).toEqual(PORT_DIRECTIONS);
    expect(field("edge").options?.map((o) => o.value)).toEqual(BLOCK_SIDES);
    expect(field("size").options?.map((o) => o.value)).toEqual([...PORT_SIZE_RUNGS]);
    expect(field("diameter").options?.map((o) => o.value)).toEqual(
      Object.keys(PORT_DIAMETERS),
    );
    expect(field("textLayout").options?.map((o) => o.value)).toEqual(PORT_TEXT_LAYOUTS);
    expect(field("textSize").options?.map((o) => o.value)).toEqual(
      Object.keys(PORT_TEXT_SIZES),
    );
    expect(field("state").options?.map((o) => o.value)).toEqual(APPEARANCE_STATES);
    expect(field("tone").options?.map((o) => o.value)).toEqual(TONES);
    expect(field("lens").options?.map((o) => o.value)).toEqual(LENSES);
    expect(field("reveal").options?.map((o) => o.value)).toEqual(PORT_REVEALS);
    expect(field("secondarySlotLayout").options?.map((o) => o.value)).toEqual(
      SECONDARY_SLOT_LAYOUTS,
    );
  });

  it("toArgTypes maps every segments field to a select control, number/toggle/text correctly", () => {
    const argTypes = toArgTypes(LABELED_PORT_FIELDS);
    expect(argTypes.direction.control).toBe("select");
    expect(argTypes.size.control).toBe("select");
    expect(argTypes.diameter.control).toBe("select");
    expect(argTypes.state.control).toBe("select");
    expect(argTypes.dimmed.control).toBe("boolean");
    expect(argTypes.hidden.control).toBe("boolean");
    expect(argTypes.producers.control).toBe("number");
    expect(argTypes.producers.min).toBe(0);
    expect(argTypes.producers.max).toBe(9);
    expect(argTypes.children.control).toBe("text");
    expect(argTypes.placeholder.control).toBe("text");
    expect(argTypes.secondarySlotLayout.control).toBe("select");
  });
});

describe("PORT_PRESETS — governed-set discipline, now that `size` gives Port a real ladder", () => {
  it("has exactly one preset per real PortSizeRung, id === size, selector 'size'", () => {
    expect(PORT_PRESETS.map((p) => p.id)).toEqual([...PORT_SIZE_RUNGS]);
    expect(PORT_PRESETS.every((p) => p.selector === "size")).toBe(true);
  });

  it("every preset governs exactly {diameter, textSize} — Port's colour stays the hand-written lookup over STATE_TOKENS/TONE_TOKENS (port.tsx's portDotStyle), untouched by this ladder", () => {
    for (const preset of PORT_PRESETS) {
      expect([...preset.governs].sort()).toEqual(["diameter", "textSize"]);
    }
    expect(governedFieldIds(PORT_PRESETS).sort()).toEqual(["diameter", "textSize"]);
  });

  it("every `governs` entry has a matching key in that preset's own `values` — no authoring gap", () => {
    for (const preset of PORT_PRESETS) {
      for (const governedId of preset.governs) {
        expect(Object.keys(preset.values)).toContain(governedId);
        expect(preset.values[governedId]).not.toBeUndefined();
      }
    }
  });

  it("every governed value is itself a legal option of its own field", () => {
    for (const preset of PORT_PRESETS) {
      expect(field("diameter").options!.map((o) => o.value)).toContain(preset.values.diameter);
      expect(field("textSize").options!.map((o) => o.value)).toContain(preset.values.textSize);
    }
  });

  it('the "xl" rung pairs Port\'s largest real diameter ("lg", 18px — Port has no xl dot) with the largest text ("xl", 44px)', () => {
    const xl = PORT_PRESETS.find((p) => p.id === "xl")!;
    expect(xl.values).toEqual({ diameter: "lg", textSize: "xl" });
  });

  it("assertDisjointPresets(PORT_PRESETS) does not throw — every preset shares the single 'size' selector", () => {
    expect(() => assertDisjointPresets(PORT_PRESETS)).not.toThrow();
  });

  it('resolveField on `state` is always winner "override" or "default", NEVER "preset"/"inherited" — PORT_PRESETS governs only diameter/textSize, never state', () => {
    const stateField = field("state");
    const withOverride = resolveField(stateField, { state: "wired" }, PORT_PRESETS);
    expect(withOverride.winner).toBe("override");
    expect(withOverride.resolved).toBe("wired");
    expect(withOverride.winningPresetId).toBeUndefined();
    expect(withOverride.candidates[2]).toEqual({ layer: "preset", value: undefined });

    const withoutOverride = resolveField(stateField, {}, PORT_PRESETS);
    expect(withoutOverride.winner).toBe("default");
    expect(withoutOverride.resolved).toBe("empty");
    expect(withoutOverride.winningPresetId).toBeUndefined();
  });
});

describe("Port — the real component reached through the same size cascade the trace panel reads", () => {
  it('size:"xl" paints an 18px dot (Port\'s diameter ceiling) and xl (44px) text', () => {
    const xlRoot = call(LabeledPort, { size: "xl" });
    const [xlDotElement, xlLabelElement] = xlRoot.props.children as [
      { props: Record<string, unknown> },
      { props: Record<string, unknown> },
    ];
    expect(xlDotElement.props.diameter).toBe("lg");
    expect(xlLabelElement.props.textSize).toBe("xl");
    const xlDotRendered = call(Port, xlDotElement.props);
    expect(xlDotRendered.props.style.width).toBe(PORT_DIAMETERS.lg);
    expect(xlDotRendered.props.style.height).toBe(PORT_DIAMETERS.lg);
  });

  it('an explicit diameter override reaches past size — size:"sm" with diameter:"lg" paints the explicit diameter; textSize still follows size', () => {
    const overriddenRoot = call(LabeledPort, { size: "sm", diameter: "lg" });
    const [dotElement2, labelElement2] = overriddenRoot.props.children as [
      { props: Record<string, unknown> },
      { props: Record<string, unknown> },
    ];
    expect(dotElement2.props.diameter).toBe("lg");
    expect(labelElement2.props.textSize).toBe("sm");
  });
});

/**
 * `portResolutionSubject` (port.tsx) is what the Inspector panel resolves
 * against instead of a subject's raw props (`packages/panel/src/bench.tsx`'s
 * `toSubject`, same mechanism `pillResolutionSubject` already uses for
 * Pill) — so the panel's OWN display of "what is this field's current
 * value" agrees with what `Port` actually renders, instead of reading
 * `textLayout`/`secondarySlotLayout`'s static `defaultValue` literals
 * (port.fields.ts: "right"/"leftOffset", correct only at Port's own
 * default `edge`/`textLayout`). Not exercised by any test above this one,
 * which only ever call `Port`/`PortDot` directly — never this function.
 */
/**
 * Found by an adversarial judge, 2026-09-15. `labelOffset: 0` is a legal
 * tuned lift ("bottom edge exactly on the wire" — the field's own `min`
 * is 0), but the flex path used to gate its bottom-anchoring on
 * `labelLift > 0`. At exactly 0 the anchored path put the label's bottom
 * on the dot's centre line while the flex path fell back to centring the
 * label ON the dot — the two renderings of the same Port disagreeing by
 * half a label height at one endpoint.
 */
/**
 * The unified model deleted the old `labelOffset: 0` endpoint problem
 * outright rather than patching it. There is no longer a "lifted layout
 * carrying a zero lift" state to disagree about: `offsetY` IS the
 * displacement, so 0 means flush, negative means up, positive means down.
 * The flex row's bottom-anchoring is derived from the resolved offset
 * (`labelLift = max(0, -offsetY)`), so the two paths cannot disagree by
 * construction — the earlier bug is unrepresentable, not just fixed.
 */
describe("labelOffsetY is a real displacement, in both directions", () => {
  // Reading the label's own style out of the flex row.
  const labelStyleOf = (props: Record<string, unknown>) => {
    const [, label] = call(LabeledPort, { children: "x", ...props }).props.children as [
      unknown,
      { props: { style?: { transform?: string } } },
    ];
    return label.props.style;
  };

  it("offsetY 0 is flush — no style at all, whatever the preset says", () => {
    expect(labelStyleOf({ textLayout: "rightOffset", labelOffsetY: 0 })).toBeUndefined();
  });

  it("a NEGATIVE offsetY lifts", () => {
    expect(labelStyleOf({ textLayout: "right", labelOffsetY: -30 })!.transform).toBe("translate(0px, -30px)");
  });

  it("a POSITIVE offsetY pushes DOWN — the direction the old enum could not express", () => {
    expect(labelStyleOf({ textLayout: "right", labelOffsetY: 12 })!.transform).toBe("translate(0px, 12px)");
  });

  it("a NEGATIVE offsetX pulls the label back toward the dot — the other direction the enum could not express", () => {
    expect(labelStyleOf({ textLayout: "right", labelOffsetX: -6 })!.transform).toBe("translate(-6px, 0px)");
  });

  it("mirrors x on a left origin, so +x means AWAY FROM THE DOT on either side", () => {
    expect(labelStyleOf({ textLayout: "left", labelOffsetX: 6 })!.transform).toBe("translate(-6px, 0px)");
    expect(labelStyleOf({ textLayout: "right", labelOffsetX: 6 })!.transform).toBe("translate(6px, 0px)");
  });

  /**
   * The flex row and an absolutely-positioned host must displace a label
   * by the SAME rule — that equivalence is the whole reason the offsets
   * ride in a transform in both paths instead of a margin in one of them.
   */
  it("the flex row and the anchored path agree on the displacement", () => {
    const placement = { origin: "right" as const, offsetX: 4, offsetY: -18 };
    const flex = labelStyleOf({ textLayout: "right", labelOffsetX: 4, labelOffsetY: -18 })!.transform;
    const anchored = slotPlacementStyle(placement, { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md }, 8).transform;
    // The anchored one folds in the cross-axis centring; strip it and the
    // two carry the identical displacement.
    expect(flex).toBe("translate(4px, -18px)");
    expect(anchored).toBe("translate(4px, calc(-50% + -18px))");
  });
});

/**
 * The bare `Port` primitive's field list, checked STRUCTURALLY against the
 * component rather than by eye.
 *
 * An adversarial judge (2026-09-15) caught `size` and `lens` in this list
 * while `PortProps` declared neither: the bench showed two controls that
 * moved nothing, and `Port` spread both onto its root `<span>` as inert
 * DOM attributes. Asserting a hand-typed id list would not have caught
 * that — the list agreed with itself. Asserting that nothing SURVIVES the
 * destructure does, for every field, forever.
 */
describe("PORT_FIELDS names only props the bare Port really consumes", () => {
  it("no field id leaks through to the rendered root — every one is destructured", () => {
    const leaked = PORT_FIELDS.filter((f) => {
      const rendered = call(Port, { [f.id]: f.defaultValue });
      return rendered !== null && f.id in rendered.props;
    }).map((f) => f.id);
    expect(leaked).toEqual([]);
  });

  it("is a strict subset of the composite's list, sharing the very same FieldSpec objects", () => {
    for (const f of PORT_FIELDS) expect(LABELED_PORT_FIELDS, f.id).toContain(f);
    expect(PORT_FIELDS.length).toBeLessThan(LABELED_PORT_FIELDS.length);
  });
});

describe("portResolutionSubject", () => {
  /**
   * Found by an adversarial probe, 2026-09-15: `labelOffset` was resolved
   * from `props.diameter ?? "md"`, but `diameter` is GOVERNED by the `size`
   * cascade — so a Port carrying `size: "lg"` and no explicit `diameter`
   * renders an 18px dot (lift 22) while the panel printed the `md` lift
   * (19). The panel disagreeing with the pixels is the ONE thing this
   * function exists to prevent, so it is pinned against the component's
   * own rendered output rather than against a retyped number.
   */
  it("reports the offset the component ACTUALLY renders when `size` cascades the text size", () => {
    for (const size of ["sm", "md", "lg", "xl"] as const) {
      const reported = portResolutionSubject({ size, textLayout: "rightOffset" }).labelOffsetY as number;
      const [, labelElement] = call(LabeledPort, { size, textLayout: "rightOffset", children: "x" }).props
        .children as [unknown, { props: { style?: { transform?: string } } }];
      // What Port really puts on the label, read back off the transform.
      const rendered = Number(/translate\(0px, (-?[\d.]+)px\)/.exec(labelElement.props.style!.transform!)![1]);
      expect(reported, `size:${size}`).toBe(rendered);
    }
  });


  it("fills textLayout from inwardTextLayout(edge) when omitted, defaulting edge to \"left\"", () => {
    expect(portResolutionSubject({}).textLayout).toBe(inwardTextLayout("left"));
    expect(portResolutionSubject({ edge: "top" }).textLayout).toBe(inwardTextLayout("top"));
  });

  it("fills secondarySlotLayout from defaultSecondarySlotLayout(textLayout) using the JUST-COMPUTED textLayout, not the raw omitted one", () => {
    const subject = portResolutionSubject({ edge: "top" });
    expect(subject.textLayout).toBe(inwardTextLayout("top"));
    expect(subject.secondarySlotLayout).toBe(defaultSecondarySlotLayout(inwardTextLayout("top")));
  });

  it("never overrides an explicit textLayout or secondarySlotLayout the subject already set", () => {
    const subject = portResolutionSubject({ edge: "top", textLayout: "left", secondarySlotLayout: "botOffset" });
    expect(subject.textLayout).toBe("left");
    expect(subject.secondarySlotLayout).toBe("botOffset");
  });

  it("preserves every other prop on the subject untouched", () => {
    const subject = portResolutionSubject({ state: "wired", children: "get_aruco: ArucoSrv" });
    expect(subject.state).toBe("wired");
    expect(subject.children).toBe("get_aruco: ArucoSrv");
  });
});
