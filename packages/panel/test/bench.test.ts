import { describe, expect, it } from "vitest";
import type { FieldSpec } from "@bbox-ui/schema";
import { PORT_FIELDS } from "@bbox-ui/core";
import { randomValue, sharedFields } from "../src/bench";
import type { ComponentEntry } from "../src/registerComponent";

const roll = () => 0.42;

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

describe("sharedFields", () => {
  const entry = (name: string, fields: FieldSpec[]): ComponentEntry => ({ name, fields, presets: [], render: () => null });
  const height = (max: number | undefined, def = 0): FieldSpec => ({ id: "height", label: "Height", kind: "number", defaultValue: def, min: 0, max, step: 1 });

  it("does not share a number field whose range differs — the range IS the option set (round 5)", () => {
    // Block's height has no max; RowContainer's stops at 200. One box over
    // both wrote 500 into the one that forbids it.
    const { fields, excluded } = sharedFields([entry("Block", [height(undefined)]), entry("RowContainer", [height(200)])]);
    expect(fields).toEqual([]);
    expect(excluded).toEqual(["Height (different options on RowContainer)"]);
  });

  it("does not share a number field whose resting default differs", () => {
    const { fields } = sharedFields([entry("Stack", [height(24, 12)]), entry("RowContainer", [height(24, 8)])]);
    expect(fields).toEqual([]);
  });

  it("still shares a number field that agrees on everything", () => {
    const { fields } = sharedFields([entry("A", [height(24)]), entry("B", [height(24)])]);
    expect(fields.map((f) => f.id)).toEqual(["height"]);
  });
});
