import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { PORT_FIELDS } from "../src/port.fields";
import { Port } from "../src/port";
import { PORT_DIAMETERS, PORT_STATES, PORT_TEXT_LAYOUTS, TEXT_SIZES } from "../src/layout";

/**
 * `Port` uses no hooks — calling it directly, as a plain function, returns
 * the exact React element tree it would render, with every default already
 * applied by its own `= "..."` destructuring. Reading defaults off THIS
 * (not off a hand-retyped literal) is what makes this file fail the moment
 * `port.tsx`'s real default changes, instead of silently drifting alongside
 * a copy that only agrees with itself. No DOM/jsdom is needed: these are
 * plain element objects, never rendered or mounted.
 */
function portElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Port as any)(props);
}

function field(id: string) {
  const found = PORT_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no PORT_FIELDS entry for "${id}"`);
  return found;
}

// `state`/`size` are read off the child `PortDot` element: `Port` passes its
// own already-defaulted locals to it as `state={state} size={size}`, so
// these are Port's real resolved defaults, not PortDot's independent ones.
const bareDot = portElement();
const dotChild = (bareDot.props.children as unknown[])[0] as { props: Record<string, unknown> };

// `textSize` is only threaded to `PortLabel` when `children` is supplied
// (`children != null && <PortLabel textSize={textSize}>...`), so force that
// branch to read it.
const withLabel = portElement({ children: "x" });
const labelChild = (withLabel.props.children as unknown[])[1] as { props: Record<string, unknown> };

describe("PORT_FIELDS", () => {
  it("has exactly Port's five real props, in panel order", () => {
    expect(PORT_FIELDS.map((f) => f.id)).toEqual([
      "state",
      "size",
      "textLayout",
      "textSize",
      "children",
    ]);
  });

  it("state's declared default equals Port's real default (port.tsx: state = \"empty\")", () => {
    expect(field("state").defaultValue).toBe(dotChild.props.state);
    expect(bareDot.props["data-state"]).toBe(field("state").defaultValue);
  });

  it("size's declared default equals Port's real default", () => {
    expect(field("size").defaultValue).toBe(dotChild.props.size);
  });

  it("textLayout's declared default equals Port's real default", () => {
    expect(field("textLayout").defaultValue).toBe(bareDot.props["data-text-layout"]);
  });

  it("textSize's declared default equals Port's real default", () => {
    expect(field("textSize").defaultValue).toBe(labelChild.props.textSize);
  });

  it("children has NO real destructured default on Port — omitting it renders the bare dot with no label, not the literal string \"Port\"", () => {
    // The second child is `children != null && <PortLabel>...` — `false`
    // when `children` is omitted, proving the real default behavior is "no
    // label", which `FieldValue` (string | number | boolean) cannot encode.
    expect((bareDot.props.children as unknown[])[1]).toBe(false);
    // "Port" is therefore a deliberate demoable placeholder, not a fact
    // about the component — pinned consciously here rather than asserted
    // as if it were port.tsx's own default. See port.fields.ts's comment
    // on this field and docs/T0-SPEC.md §3 for the full disagreement.
    expect(field("children").defaultValue).toBe("Port");
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(PORT_FIELDS)).toEqual({
      state: field("state").defaultValue,
      size: field("size").defaultValue,
      textLayout: field("textLayout").defaultValue,
      textSize: field("textSize").defaultValue,
      children: field("children").defaultValue,
    });
  });

  it("state's options are exactly the real PortState union (layout.ts's own PORT_STATES), including runtime-only `received`", () => {
    expect(field("state").options?.map((o) => o.value)).toEqual(PORT_STATES);
  });

  it("size's options are exactly the real PortSize union (layout.ts's own PORT_DIAMETERS keys)", () => {
    expect(field("size").options?.map((o) => o.value)).toEqual(Object.keys(PORT_DIAMETERS));
  });

  it("textLayout's options are exactly the real PortTextLayout union (layout.ts's own PORT_TEXT_LAYOUTS)", () => {
    expect(field("textLayout").options?.map((o) => o.value)).toEqual(PORT_TEXT_LAYOUTS);
  });

  it("textSize's options are exactly the real TextSize union (layout.ts's own TEXT_SIZES keys)", () => {
    expect(field("textSize").options?.map((o) => o.value)).toEqual(Object.keys(TEXT_SIZES));
  });

  it("toArgTypes maps every segments field to a select control and children to text", () => {
    const argTypes = toArgTypes(PORT_FIELDS);
    expect(argTypes.state.control).toBe("select");
    expect(argTypes.size.control).toBe("select");
    expect(argTypes.textLayout.control).toBe("select");
    expect(argTypes.textSize.control).toBe("select");
    expect(argTypes.children.control).toBe("text");
  });
});
