import { describe, expect, it } from "vitest";
import { defaultArgs, governedFieldIds } from "@bbox-ui/schema";
import {
  ANIMATED_FIELD,
  LABEL_POSITION_FIELD,
  MARKER_END_FIELD,
  SPLIT_AT_LABEL_FIELD,
  STROKE_COLOR_FIELD,
  TRACE_FIELDS,
  TRACE_MARKER_ENDS,
  VARIANT_FIELD,
} from "../src/trace.fields";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ASYNC_CADENCE_PX,
  ASYNC_PACKET_DASHARRAY,
  DATA_MARCH_DASHOFFSET_PX,
  DELAY_DOT_GAP_PX,
  DELAY_DOT_PX,
  LABEL_POSITION_MAX,
  LABEL_POSITION_MIN,
  PATH_LENGTH_UNITS,
  TRACE_VARIANTS,
  asyncDashOffsetForLength,
  clampLabelPosition,
  pointAtFraction,
  polylineLength,
  safeElementId,
  splitDashArrays,
} from "../src/trace.layout";
import { TraceBody, TraceLabel, TraceMarkerDef, resolveTraceStrokeColor, traceStrokeStyle } from "../src/trace";
import { PAINT_TOKENS } from "../src/pill.fields";

/** Same T0 pattern `pill.fields.test.ts` documents: calling a hookless
 * component as a plain function returns the real element tree with every
 * default already applied, no DOM/jsdom needed. `TraceBody` deliberately
 * takes `id` as a prop rather than `useId()` specifically so this stays
 * possible — see `trace.tsx`'s own doc comment on `TraceProps.id`. */
function traceBody(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (TraceBody as any)({ id: "t1", path: "M0 0 L100 0", length: 100, ...props });
}

function field(id: string) {
  const found = TRACE_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no TRACE_FIELDS entry for "${id}"`);
  return found;
}

describe("trace.layout — pure geometry", () => {
  it("polylineLength sums segment distances", () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 }])).toBe(5);
  });

  it("pointAtFraction interpolates along a polyline", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(pointAtFraction(points, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(points, 0.5)).toEqual({ x: 5, y: 0 });
    expect(pointAtFraction(points, 1)).toEqual({ x: 10, y: 0 });
  });

  it("clampLabelPosition keeps a label off the terminals (0.05..0.95)", () => {
    expect(clampLabelPosition(0)).toBe(LABEL_POSITION_MIN);
    expect(clampLabelPosition(1)).toBe(LABEL_POSITION_MAX);
    expect(clampLabelPosition(0.5)).toBe(0.5);
  });

  it("asyncDashOffsetForLength is 0 once a path reaches one full cadence", () => {
    expect(asyncDashOffsetForLength(ASYNC_CADENCE_PX)).toBe(0);
    expect(asyncDashOffsetForLength(ASYNC_CADENCE_PX * 4)).toBe(0);
  });

  it("asyncDashOffsetForLength centers the one mark a short path can fit", () => {
    const offset = asyncDashOffsetForLength(20);
    expect(offset).toBeGreaterThan(0);
    expect(Number.isFinite(offset)).toBe(true);
  });

  it("splitDashArrays produces complementary before/after patterns normalised to PATH_LENGTH_UNITS", () => {
    const dash = splitDashArrays(200, 0.5);
    expect(dash.before).toBe(`500 ${PATH_LENGTH_UNITS}`);
    // after starts with a gap up to the split point, then repeats dot/gap
    expect(dash.after.startsWith("0 500")).toBe(true);
  });

  it("splitDashArrays regression: an earlier version's open-ended while loop hung (then crashed with RangeError: Invalid array length) on a pathologically large lengthPx — adversarial review found this live. A closed-form, capped dot count replaces the loop; every one of these must now return promptly with a bounded array", () => {
    for (const lengthPx of [Infinity, Number.MAX_VALUE, 1e20, NaN, -5, 0]) {
      const dash = splitDashArrays(lengthPx, 0.5);
      expect(typeof dash.after).toBe("string");
      // "0 500" + at most MAX_DELAY_DOTS (2000) dot/gap pairs + "0 1000" —
      // never unbounded, whatever the input.
      expect(dash.after.split(" ").length).toBeLessThanOrEqual(2 + 2000 * 2 + 2);
    }
  });

  it("safeElementId is a legal SVG/CSS id — prefix plus only [a-z0-9-]", () => {
    expect(safeElementId("bbox-trace-head", "anything at all!")).toMatch(/^bbox-trace-head-[a-z0-9]+$/);
  });

  it("safeElementId regression (v1): an earlier stripping-based version collided 'edge.a'/'edgea' down to the same id — fixed", () => {
    expect(safeElementId("bbox-trace-head", "edge.a")).not.toBe(safeElementId("bbox-trace-head", "edgea"));
  });

  it("safeElementId regression (v2): a 32-bit-hash-based version STILL collided — adversarial review found this exact pair hashing identically to 'bbox-trace-head-1hghfsz' in seconds. Hex-encoding (bijective, not a hash) fixes it for real, not just probabilistically", () => {
    expect(safeElementId("bbox-trace-head", "edge-e1e5ffef518ed9d7"))
      .not.toBe(safeElementId("bbox-trace-head", "edge-e900fd5e0596d262"));
  });

  it("safeElementId regression (v3): a UTF-8-byte-encoding version STILL collided — adversarial review found TextEncoder silently maps every lone UTF-16 surrogate to U+FFFD, so '\\uD800', '\\uDC00', and the literal '�' all encoded identically. Encoding UTF-16 CODE UNITS directly (what a JS string actually is) fixes it for real this time", () => {
    const a = safeElementId("bbox-trace-head", "\uD800");
    const b = safeElementId("bbox-trace-head", "\uDC00");
    const c = safeElementId("bbox-trace-head", "�");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("safeElementId is deterministic — the same id always encodes the same, so re-renders don't shift the marker's DOM id", () => {
    expect(safeElementId("bbox-trace-head", "edge-42")).toBe(safeElementId("bbox-trace-head", "edge-42"));
  });

  it("safeElementId is INJECTIVE (distinct inputs -> distinct outputs) by construction, not just empirically — hex-encoding every UTF-16 code unit is reversible over the FULL string domain (lone surrogates included), so this large random sample is a sanity check on that proof, not the proof itself", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `edge-${i}-${Math.random()}`);
    const encoded = new Set(ids.map((id) => safeElementId("bbox-trace-head", id)));
    expect(encoded.size).toBe(ids.length);
  });

  it("theme.css's hardcoded marching-ants dashoffset (10) matches DATA_MARCH_DASHOFFSET_PX — CSS can't import the JS constant, so this catches drift by hand", () => {
    const themePath = fileURLToPath(new URL("../src/theme.css", import.meta.url));
    const css = readFileSync(themePath, "utf-8");
    expect(css).toContain(`.bbox-trace-march`);
    expect(css).toContain(`stroke-dashoffset: ${DATA_MARCH_DASHOFFSET_PX};`);
  });
});

describe("trace.fields — TRACE_FIELDS", () => {
  it("variant's options are exactly TRACE_VARIANTS, default 'data'", () => {
    expect(field("variant").options?.map((o) => o.value)).toEqual(TRACE_VARIANTS);
    expect(field("variant").defaultValue).toBe("data");
  });

  it("strokeColor's options are exactly PAINT_TOKENS (Pill's own token vocabulary, reused not redeclared)", () => {
    expect(field("strokeColor").options?.map((o) => o.value)).toEqual(PAINT_TOKENS);
    expect(field("strokeColor").defaultValue).toBe("foreground");
  });

  it("strokeColor is NOT governed by any preset — no TRACE_PRESETS exists; see trace.fields.ts's own deviation note", () => {
    expect(governedFieldIds([])).not.toContain("strokeColor");
  });

  it("markerEnd's options are exactly TRACE_MARKER_ENDS, default 'arrow'", () => {
    expect(field("markerEnd").options?.map((o) => o.value)).toEqual(TRACE_MARKER_ENDS);
    expect(field("markerEnd").defaultValue).toBe("arrow");
  });

  it("labelPosition is clamped to the same 0.05..0.95 bounds trace.layout.ts enforces at runtime", () => {
    expect(field("labelPosition").min).toBe(LABEL_POSITION_MIN);
    expect(field("labelPosition").max).toBe(LABEL_POSITION_MAX);
  });

  it("animated/splitAtLabel are toggles defaulting false", () => {
    expect(field("animated").kind).toBe("toggle");
    expect(field("animated").defaultValue).toBe(false);
    expect(field("splitAtLabel").kind).toBe("toggle");
    expect(field("splitAtLabel").defaultValue).toBe(false);
  });

  it("TRACE_FIELDS is variant, strokeColor, tone, lens, animated, splitAtLabel, labelPosition, markerEnd — in panel order", () => {
    expect(TRACE_FIELDS.map((f) => f.id)).toEqual([
      "variant", "strokeColor", "tone", "lens", "animated", "splitAtLabel", "labelPosition", "markerEnd",
    ]);
  });

  it("defaultArgs mirrors every field's own declared defaultValue", () => {
    expect(defaultArgs(TRACE_FIELDS)).toEqual(
      Object.fromEntries(TRACE_FIELDS.map((f) => [f.id, f.defaultValue])),
    );
  });

  it("exported field constants are the exact objects TRACE_FIELDS holds — one declaration, not a re-typed copy", () => {
    expect(TRACE_FIELDS).toEqual(
      expect.arrayContaining([VARIANT_FIELD, STROKE_COLOR_FIELD, ANIMATED_FIELD, SPLIT_AT_LABEL_FIELD, LABEL_POSITION_FIELD, MARKER_END_FIELD]),
    );
  });
});

describe("resolveTraceStrokeColor — override reached past by tone, matching Pill's real precedence", () => {
  it("default strokeColor resolves to the foreground token", () => {
    expect(resolveTraceStrokeColor("neutral")).toBe("var(--foreground)");
  });

  it("an explicit strokeColor wins when tone is neutral", () => {
    expect(resolveTraceStrokeColor("neutral", "bbox-accent")).toBe("var(--bbox-accent)");
  });

  it("a non-neutral tone reaches past an explicit strokeColor — tone wins, same as Pill's lineColor", () => {
    expect(resolveTraceStrokeColor("danger", "bbox-accent")).toBe("var(--bbox-danger)");
  });

  it("tone:'neutral' (the default) never overrides anything", () => {
    expect(resolveTraceStrokeColor("neutral", "primary")).toBe(resolveTraceStrokeColor("neutral", "primary"));
    expect(resolveTraceStrokeColor("neutral", "primary")).toBe("var(--bbox-primary, var(--primary))");
  });
});

describe("traceStrokeStyle — dash mechanics only, never colour", () => {
  it("data (not animated): solid, no dasharray, round caps, no className", () => {
    const style = traceStrokeStyle("data", 200, false);
    expect(style.strokeDasharray).toBeUndefined();
    expect(style.strokeLinecap).toBe("round");
    expect(style.className).toBeUndefined();
  });

  it("data (animated): the marching class, butt caps, the 5px dasharray", () => {
    const style = traceStrokeStyle("data", 200, true);
    expect(style.className).toBe("bbox-trace-march");
    expect(style.strokeLinecap).toBe("butt");
    expect(style.strokeDasharray).toBe("5");
  });

  it("async: the real ASYNC_PACKET_DASHARRAY, butt caps, a computed dashoffset", () => {
    const style = traceStrokeStyle("async", 200, false);
    expect(style.strokeDasharray).toBe(ASYNC_PACKET_DASHARRAY);
    expect(style.strokeLinecap).toBe("butt");
    expect(typeof style.strokeDashoffset).toBe("number");
  });

  it("delayed: the dot/gap dasharray, round caps", () => {
    const style = traceStrokeStyle("delayed", 200, false);
    expect(style.strokeDasharray).toBe(`${DELAY_DOT_PX} ${DELAY_DOT_GAP_PX}`);
    expect(style.strokeLinecap).toBe("round");
  });

  it("never returns a stroke/colour field — trace.tsx's TraceStrokeStyle type has none", () => {
    const style = traceStrokeStyle("async", 200, false);
    expect(style).not.toHaveProperty("stroke");
  });
});

describe("TraceBody — the real component, called plain-function style (no DOM/jsdom)", () => {
  const bare = traceBody();

  it("renders one <path> for data/async, none of the delayed-split machinery", () => {
    expect(bare.type).toBe("g");
    const children = bare.props.children as unknown[];
    // [marker-defs-or-false, one <path>]
    expect(children).toHaveLength(2);
    const path = children[1] as { type: string; props: Record<string, unknown> };
    expect(path.type).toBe("path");
    expect(path.props.d).toBe("M0 0 L100 0");
  });

  it("data-variant reflects the resolved variant, defaulting 'data'", () => {
    expect(bare.props["data-variant"]).toBe("data");
    expect(traceBody({ variant: "async" }).props["data-variant"]).toBe("async");
  });

  it("stroke colour comes from resolveTraceStrokeColor, not a second, separately-derived value", () => {
    const pathEl = bare.props.children[1] as { props: Record<string, unknown> };
    expect(pathEl.props.stroke).toBe(resolveTraceStrokeColor("neutral", "foreground"));
  });

  it("delayed + splitAtLabel renders TWO <path> segments, not one", () => {
    const split = traceBody({ variant: "delayed", splitAtLabel: true });
    const children = split.props.children as unknown[];
    const paths = children.filter((c): c is { type: string } => (c as { type?: string })?.type === "path");
    expect(paths).toHaveLength(2);
  });

  it("delayed WITHOUT splitAtLabel renders exactly one dotted <path>, the SystemSketch default", () => {
    const delayed = traceBody({ variant: "delayed" });
    const children = delayed.props.children as unknown[];
    const paths = children.filter((c): c is { type: string } => (c as { type?: string })?.type === "path");
    expect(paths).toHaveLength(1);
  });

  it("markerEnd:'arrow' (the default) renders a <defs><marker> and wires marker-end onto the path", () => {
    const children = bare.props.children as unknown[];
    const defs = children[0] as { type: string } | false;
    expect(defs && (defs as { type: string }).type).toBe("defs");
    const path = children[1] as { props: Record<string, unknown> };
    expect(path.props.markerEnd).toBe(`url(#${safeElementId("bbox-trace-head", "t1")})`);
  });

  it("markerEnd:'none' renders no marker def and no marker-end attribute", () => {
    const noMarker = traceBody({ markerEnd: "none" });
    const children = noMarker.props.children as unknown[];
    expect(children[0]).toBe(false);
    const path = children[1] as { props: Record<string, unknown> };
    expect(path.props.markerEnd).toBeUndefined();
  });

  it("two different Trace ids get two different marker DOM ids — no collision on one page", () => {
    const a = traceBody({ id: "edge-a" });
    const b = traceBody({ id: "edge-b" });
    const markerIdOf = (el: typeof a) => (el.props.children[1] as { props: Record<string, unknown> }).props.markerEnd;
    expect(markerIdOf(a)).not.toBe(markerIdOf(b));
  });

  it("regression: the exact 'edge.a' vs 'edgea' pair an adversarial review caught stays distinct end-to-end", () => {
    const a = traceBody({ id: "edge.a" });
    const b = traceBody({ id: "edgea" });
    const markerIdOf = (el: typeof a) => (el.props.children[1] as { props: Record<string, unknown> }).props.markerEnd;
    expect(markerIdOf(a)).not.toBe(markerIdOf(b));
  });

  it("the marker def element itself carries the same DOM id used in marker-end", () => {
    const children = bare.props.children as unknown[];
    const defs = children[0] as { props: { children: { props: { id: string } } } };
    expect(defs.props.children.props.id).toBe(safeElementId("bbox-trace-head", "t1"));
  });
});

describe("TraceMarkerDef — the open chevron, rendered directly", () => {
  it("uses context-stroke so it always matches whatever line it's attached to, with no second colour prop", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marker = (TraceMarkerDef as any)({ id: "bbox-trace-head-t1" });
    const innerPath = marker.props.children as { type: string; props: Record<string, unknown> };
    expect(marker.props.id).toBe("bbox-trace-head-t1");
    expect(marker.props.orient).toBe("auto");
    expect(innerPath.type).toBe("path");
    expect(innerPath.props.stroke).toBe("context-stroke");
    expect(innerPath.props.fill).toBe("none");
  });
});

describe("TraceLabel — reuses Pill, no positioning logic", () => {
  it("returns an (unevaluated) Pill element with data-slot='trace-label' and the children forwarded", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = (TraceLabel as any)({ children: "retry × 3" });
    expect(el.props["data-slot"]).toBe("trace-label");
    expect(el.props.children).toBe("retry × 3");
  });

  it("forwards tone/state through to Pill's own render — the caller passes it explicitly, TraceLabel never reads it from a sibling TraceBody", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = (TraceLabel as any)({ children: "z⁻¹", tone: "danger" });
    // One more level of plain-function evaluation: `el` is `<Pill ...props>`,
    // unevaluated — call Pill itself (el.type) with el.props to get what it paints.
    const rendered = el.type(el.props);
    expect(rendered.props.style.borderColor).toBe("var(--bbox-danger)");
  });
});
