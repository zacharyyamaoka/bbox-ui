import { describe, expect, it } from "vitest";
import {
  assertDisjointPresets,
  defaultArgs,
  governedFieldIds,
  resolveField,
  toArgTypes,
} from "@bbox-ui/schema";
import { PORT_FIELDS } from "../src/port.fields";
import { PORT_PRESETS } from "../src/port.presets";
import { Port, PortDot, PortLabel } from "../src/port";
import {
  APPEARANCE_STATES,
  LENSES,
  TONES,
} from "../src/appearance";
import {
  BLOCK_SIDES,
  PORT_DECORATIONS,
  PORT_DIAMETERS,
  PORT_DIRECTIONS,
  PORT_REVEALS,
  PORT_ROLES,
  PORT_TEXT_LAYOUTS,
  PORT_TEXT_SIZES,
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
  const found = PORT_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no PORT_FIELDS entry for "${id}"`);
  return found;
}

// The bare, fully-defaulted tree: Port -> [PortDot element, PortLabel element].
const bareRoot = call(Port);
const [dotElement, labelElement] = bareRoot.props.children as [
  { props: Record<string, unknown> },
  { props: Record<string, unknown> },
];
// Invoke the two child components themselves to read THEIR real output —
// `Port` only threads props through; the geometry/paint live in these.
const dotRendered = call(PortDot, dotElement.props);
const labelRendered = call(PortLabel, labelElement.props);

describe("PORT_FIELDS", () => {
  it("has exactly Port's real props, in panel order — own fields, then the shared APPEARANCE_FIELDS bundle, then the host-computed interaction axis, then the escape hatch", () => {
    expect(PORT_FIELDS.map((f) => f.id)).toEqual([
      "name",
      "type",
      "defaultValue",
      "direction",
      "edge",
      "diameter",
      "role",
      "decoration",
      "textLayout",
      "textSize",
      "state",
      "tone",
      "lens",
    // WHY no "lensBefore" here: the field is declared in
    // appearance.fields.ts but deliberately NOT in APPEARANCE_FIELDS —
    // nothing renders it, so shipping it put a live control into 27 story
    // panels that moved nothing. See its docblock for the one-line undo.
      "eligible",
      "hinting",
      "dragging",
      "reveal",
      "producers",
      "children",
    ]);
  });

  it("name/type/defaultValue default to Port's real empty strings", () => {
    expect(field("name").defaultValue).toBe("");
    expect(field("type").defaultValue).toBe("");
    expect(field("defaultValue").defaultValue).toBe("");
    expect(labelRendered.props.children).toEqual([null, null, null]);
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

  it("diameter's declared default equals Port's real default and Port's own real rendered footprint", () => {
    expect(field("diameter").defaultValue).toBe("md");
    expect(dotElement.props.diameter).toBe("md");
    expect(dotRendered.props.style.width).toBe(PORT_DIAMETERS.md);
    expect(dotRendered.props.style.height).toBe(PORT_DIAMETERS.md);
  });

  it("role's declared default equals Port's real default; a non-\"data\" role paints the semantic cue, \"data\" paints nothing extra", () => {
    expect(field("role").defaultValue).toBe("data");
    expect(dotElement.props.role).toBe("data");
    // children: [halo, decoration-or-false, role-cue-or-false, badge-or-false]
    expect(dotRendered.props.children[2]).toBe(false);
    const eventDot = call(PortDot, { role: "event" });
    expect(eventDot.props.children[2]).not.toBe(false);
  });

  it("decoration's declared default equals Port's real default; \"none\" paints no ring, any other value does", () => {
    expect(field("decoration").defaultValue).toBe("none");
    expect(dotElement.props.decoration).toBe("none");
    expect(dotRendered.props.children[1]).toBe(false);
    const mutatesDot = call(PortDot, { decoration: "mutates" });
    expect(mutatesDot.props.children[1]).not.toBe(false);
  });

  it("textLayout's declared default equals inwardTextLayout(edge) at Port's real default edge (\"left\")", () => {
    expect(inwardTextLayout("left")).toBe("right");
    expect(field("textLayout").defaultValue).toBe("right");
    expect(bareRoot.props["data-text-layout"]).toBe("right");
  });

  it("textSize's declared default equals Port's real default", () => {
    expect(field("textSize").defaultValue).toBe("sm");
    expect(labelElement.props.textSize).toBe("sm");
  });

  it("includes the shared APPEARANCE_FIELDS bundle verbatim (state/tone/lens) — spread, never nested under an `appearance` key (Zach's flat-property-space ruling)", () => {
    expect(field("state").defaultValue).toBe("empty");
    expect(field("tone").defaultValue).toBe("neutral");
    expect(field("lens").defaultValue).toBe("normal");
    // lensBefore is intentionally out of the bundle; see appearance.fields.ts.
    expect(PORT_FIELDS.some((f) => f.id === "lensBefore")).toBe(false);
    expect(dotElement.props.state).toBe("empty");
    expect(dotElement.props.tone).toBe("neutral");
    expect(bareRoot.props["data-state"]).toBe("empty");
    // "normal" lens is not surfaced as a `data-lens` attribute at all.
    expect(bareRoot.props["data-lens"]).toBeUndefined();
    const changedRoot = call(Port, { lens: "changed" });
    expect(changedRoot.props["data-lens"]).toBe("changed");
  });

  it("the interaction axis (eligible/hinting/dragging/reveal/producers) is host-computed, defaults to inert, and is never a preset-governed field", () => {
    expect(field("eligible").defaultValue).toBe(false);
    expect(field("hinting").defaultValue).toBe(false);
    expect(field("dragging").defaultValue).toBe(false);
    expect(field("reveal").defaultValue).toBe("always");
    expect(field("producers").defaultValue).toBe(0);
    expect(dotElement.props.eligible).toBe(false);
    expect(dotElement.props.hinting).toBe(false);
    expect(dotElement.props.dragging).toBe(false);
    expect(dotElement.props.producers).toBe(0);
    // 2+ producers is the real threshold for the count badge (children[3]).
    expect(dotRendered.props.children[3]).toBe(false);
    expect(call(PortDot, { producers: 2 }).props.children[3]).not.toBe(false);
    expect(call(PortDot, { producers: 1 }).props.children[3]).toBe(false);
  });

  it("`state: \"hidden\"` renders nothing — Port, PortDot and PortLabel all return null", () => {
    expect(call(Port, { state: "hidden" })).toBeNull();
    expect(call(PortDot, { state: "hidden" })).toBeNull();
    expect(call(PortLabel, { state: "hidden" })).toBeNull();
  });

  it("children's default (\"\") behaves IDENTICALLY to omitting it — both fall through to the three-span rendering, so \"\" is a real default, not a demoable placeholder", () => {
    expect(field("children").defaultValue).toBe("");
    const withEmptyString = call(PortLabel, { children: "" });
    const omitted = call(PortLabel, {});
    expect(withEmptyString.props.children).toEqual(omitted.props.children);
    const withRealChildren = call(PortLabel, { children: "custom" });
    expect(withRealChildren.props.children).toBe("custom");
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    const args = defaultArgs(PORT_FIELDS);
    for (const f of PORT_FIELDS) {
      expect(args[f.id]).toBe(f.defaultValue);
    }
    expect(Object.keys(args)).toHaveLength(PORT_FIELDS.length);
  });

  it("every segments field's options are exactly its real source union, in the real declared order", () => {
    expect(field("direction").options?.map((o) => o.value)).toEqual(PORT_DIRECTIONS);
    expect(field("edge").options?.map((o) => o.value)).toEqual(BLOCK_SIDES);
    expect(field("diameter").options?.map((o) => o.value)).toEqual(
      Object.keys(PORT_DIAMETERS),
    );
    expect(field("role").options?.map((o) => o.value)).toEqual(PORT_ROLES);
    expect(field("decoration").options?.map((o) => o.value)).toEqual(PORT_DECORATIONS);
    expect(field("textLayout").options?.map((o) => o.value)).toEqual(PORT_TEXT_LAYOUTS);
    expect(field("textSize").options?.map((o) => o.value)).toEqual(
      Object.keys(PORT_TEXT_SIZES),
    );
    expect(field("state").options?.map((o) => o.value)).toEqual(APPEARANCE_STATES);
    expect(field("tone").options?.map((o) => o.value)).toEqual(TONES);
    expect(field("lens").options?.map((o) => o.value)).toEqual(LENSES);
    expect(field("reveal").options?.map((o) => o.value)).toEqual(PORT_REVEALS);
  });

  it("toArgTypes maps every segments field to a select control, number/toggle/text correctly", () => {
    const argTypes = toArgTypes(PORT_FIELDS);
    expect(argTypes.direction.control).toBe("select");
    expect(argTypes.diameter.control).toBe("select");
    expect(argTypes.state.control).toBe("select");
    expect(argTypes.eligible.control).toBe("boolean");
    expect(argTypes.producers.control).toBe("number");
    expect(argTypes.producers.min).toBe(0);
    expect(argTypes.producers.max).toBe(9);
    expect(argTypes.name.control).toBe("text");
    expect(argTypes.children.control).toBe("text");
  });
});

describe("PORT_PRESETS", () => {
  it("is empty — Port has no separate paint field for a preset to govern, colour is a hand-written lookup over STATE_TOKENS/TONE_TOKENS (see port.tsx's portDotStyle and port.presets.ts)", () => {
    expect(PORT_PRESETS).toEqual([]);
    expect(governedFieldIds(PORT_PRESETS)).toEqual([]);
  });

  it("does not throw assertDisjointPresets (vacuously true for an empty preset array)", () => {
    expect(() => assertDisjointPresets(PORT_PRESETS)).not.toThrow();
  });

  it("resolveField on `state` is always winner \"override\" or \"default\", NEVER \"preset\" — the honest-empty case docs/T1-SPEC.md §4.7 calls out", () => {
    const stateField = field("state");
    const withOverride = resolveField(stateField, { state: "wired" }, PORT_PRESETS);
    expect(withOverride.winner).toBe("override");
    expect(withOverride.resolved).toBe("wired");
    expect(withOverride.winningPresetId).toBeUndefined();
    expect(withOverride.candidates[1]).toEqual({ layer: "preset", value: undefined });

    const withoutOverride = resolveField(stateField, {}, PORT_PRESETS);
    expect(withoutOverride.winner).toBe("default");
    expect(withoutOverride.resolved).toBe("empty");
    expect(withoutOverride.winningPresetId).toBeUndefined();
  });
});
