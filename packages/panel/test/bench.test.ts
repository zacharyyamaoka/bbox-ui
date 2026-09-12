import { describe, expect, it } from "vitest";
import type { FieldSpec } from "@bbox-ui/schema";
import { PORT_FIELDS } from "@bbox-ui/core";
import { randomValue } from "../src/bench";

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
