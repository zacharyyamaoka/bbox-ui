import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import type { FieldSpec } from "@bbox-ui/schema";
import { PORT_FIELDS } from "@bbox-ui/core";
import { randomValue, REGISTRY } from "../src/bench";
import type { RenderContext } from "../src/registerComponent";

const roll = () => 0.42;

/**
 * A `render()` call returns plain React ELEMENT descriptors — calling it
 * never invokes `Flex`'s own function body (only an actual reconciler does
 * that), so these tests read the returned tree directly instead of standing
 * up a DOM/jsdom renderer this package doesn't otherwise need.
 */
function findBySlot(node: ReactNode, slot: string): ReactNode {
  if (node == null || typeof node === "boolean") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findBySlot(child, slot);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: Record<string, unknown> }).props ?? {};
    if (props["data-slot"] === slot) return node;
    return findBySlot(props.children as ReactNode, slot);
  }
  return undefined;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node as { props?: Record<string, unknown> }).props?.children as ReactNode);
  }
  return "";
}

describe("randomValue", () => {
  it("never rolls an option that opts out, so a Port cannot randomise to hidden", () => {
    const state = PORT_FIELDS.find((f) => f.id === "state")!;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(String(randomValue(state, () => (i % 97) / 97)));
    expect(seen.has("hidden")).toBe(false);
    expect(seen.has("received")).toBe(false);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("returns nothing for a field that opts out", () => {
    const f: FieldSpec = { id: "reveal", label: "Reveal", kind: "segments", defaultValue: "always",
      options: [{ value: "always", label: "Always" }, { value: "onHover", label: "On hover" }], randomize: false };
    expect(randomValue(f, roll)).toBeUndefined();
  });

  it("still rolls an ordinary field", () => {
    const f: FieldSpec = { id: "state", label: "State", kind: "segments", defaultValue: "empty",
      options: [{ value: "empty", label: "Empty" }, { value: "wired", label: "Wired" }] };
    expect(randomValue(f, roll)).toBe("empty");
  });

  it('rolls a "textarea" field (e.g. TextBox\'s children once lines="multi") — this switch has no default, so a forgotten case would type-check clean and silently return undefined', () => {
    const f: FieldSpec = { id: "children", label: "Text", kind: "textarea", defaultValue: "" };
    expect(randomValue(f, roll)).not.toBeUndefined();
    expect(typeof randomValue(f, roll)).toBe("string");
  });

  it("Port's host-computed fields are all opted out, and nothing else is", () => {
    // The disappearing-instance report: reveal rolled to on-hover. Every
    // field whose hint says "Host-computed" is one the host derives, and must
    // be flagged; a persisted field must not be, or Randomize stops
    // exploring. (The shared `state` hint also says "never persisted" — about
    // ONE of its values — so "never persisted" alone is the wrong key.)
    const hostComputed = PORT_FIELDS.filter((f) => /host-computed/i.test(f.hint ?? "")).map((f) => f.id);
    expect(hostComputed).toEqual(["eligible", "hinting", "dragging", "reveal", "producers"]);
    for (const f of PORT_FIELDS) {
      expect(f.randomize === false, `${f.id} randomize flag`).toBe(hostComputed.includes(f.id));
    }
  });
});

describe("Flex's slot-highlight overlay", () => {
  const flex = REGISTRY.find((e) => e.name === "Flex")!;
  const REAL_CHILD = { type: "span", key: null, props: { children: "real content" } } as ReactNode;
  const ctx = (highlightSlots?: boolean): RenderContext => ({ nested: true, slotLabel: "Left", highlightSlots });

  it("empty + highlight on: paints the overlay AND the slot's label", () => {
    const el = flex.render({}, undefined, ctx(true));
    const overlay = findBySlot(el, "slot-overlay");
    expect(overlay).toBeDefined();
    expect(textOf(overlay)).toBe("Left");
  });

  it("empty + highlight on: also carries an invisible sizing spacer — deleting it (the Bar-CENTER-collapse fix) must not go unnoticed just because the overlay still paints", () => {
    const el = flex.render({}, undefined, ctx(true));
    const spacer = (el as { props: { children: [ReactNode, ReactNode] } }).props.children[0];
    expect(spacer).not.toBeNull();
    const spacerProps = (spacer as { props: { style?: Record<string, unknown> } }).props;
    expect(spacerProps.style?.visibility).toBe("hidden");
    expect(textOf(spacer)).toBe("Left");
  });

  it("filled + highlight on: paints the overlay, but never the label — real content already answers \"what's here\"", () => {
    const el = flex.render({}, REAL_CHILD, ctx(true));
    const overlay = findBySlot(el, "slot-overlay");
    expect(overlay).toBeDefined();
    expect(textOf(overlay)).toBe("");
  });

  it("empty + highlight off: renders exactly what ships — no overlay, no sizing spacer, nothing", () => {
    const el = flex.render({}, undefined, ctx(false));
    expect(findBySlot(el, "slot-overlay")).toBeUndefined();
    // The only DOM node a real empty Flex has is its own div — walking its
    // children must turn up nothing at all, not an invisible placeholder.
    const flexProps = (el as { props: { children: ReactNode; style?: Record<string, unknown> } }).props;
    expect(flexProps.children).toEqual([null, false]);
    // A dropped `&& highlight` guard on the growth style would leave this
    // silently `undefined` here — the actual ATTACK on "renders exactly
    // what ships" a missing overlay alone doesn't catch, since the Flex
    // would still look empty while quietly stretching to fill its parent.
    expect(flexProps.style?.flex).toBeUndefined();
  });

  it("filled + highlight off: real content passes through untouched, no overlay grafted on", () => {
    const el = flex.render({}, REAL_CHILD, ctx(false));
    expect(findBySlot(el, "slot-overlay")).toBeUndefined();
    const flexProps = (el as { props: { children: ReactNode } }).props;
    expect(flexProps.children).toEqual([REAL_CHILD, false]);
  });

  it("absent ctx (a caller with no toggle at all, e.g. a members-list preview thumbnail) defaults to highlighting on — never a silent opt-out", () => {
    const el = flex.render({}, undefined, undefined);
    expect(findBySlot(el, "slot-overlay")).toBeDefined();
  });

  it("the overlay never touches a FILLED Flex's own layout style — only an EMPTY, highlighted one grows to fill its slot", () => {
    const filled = flex.render({}, REAL_CHILD, ctx(true));
    const empty = flex.render({}, undefined, ctx(true));
    const filledStyle = (filled as { props: { style?: Record<string, unknown> } }).props.style;
    const emptyStyle = (empty as { props: { style?: Record<string, unknown> } }).props.style;
    expect(filledStyle?.flex).toBeUndefined();
    expect(emptyStyle?.flex).toBe("1 1 auto");
  });
});
