import { describe, expect, it } from "vitest";
import { instantiateScenario, SCENARIOS, type Scenario } from "../src/scenario";

describe("instantiateScenario", () => {
  const scenario: Scenario = {
    id: "example",
    label: "Example",
    instances: [
      { type: "Port", props: { children: "a" } },
      { type: "Port", props: { children: "b" } },
      { type: "Pill", props: { children: "c" } },
    ],
  };

  it("makes one Instance per spec, ids drawn from `uid` upward in order", () => {
    const made = instantiateScenario(scenario, 5);
    expect(made.map((i) => i.id)).toEqual(["port-5", "port-6", "pill-7"]);
    expect(made.map((i) => i.type)).toEqual(["Port", "Port", "Pill"]);
  });

  it("copies each spec's props, never sharing a reference back to the scenario data", () => {
    const made = instantiateScenario(scenario, 0);
    made[0]!.props.children = "mutated";
    expect(scenario.instances[0]!.props.children).toBe("a");
  });

  it("produces distinct ids across two loads of the same scenario, given advancing uid", () => {
    const first = instantiateScenario(scenario, 0);
    const second = instantiateScenario(scenario, 100);
    const overlap = first.map((i) => i.id).filter((id) => second.some((s) => s.id === id));
    expect(overlap).toEqual([]);
  });
});

describe("SCENARIOS — stock data", () => {
  it("gives every scenario at least one instance", () => {
    for (const [name, list] of Object.entries(SCENARIOS)) {
      for (const scenario of list) {
        expect(scenario.instances.length, `${name}/${scenario.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate scenario id within one component's list", () => {
    for (const [name, list] of Object.entries(SCENARIOS)) {
      const ids = list.map((s) => s.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it("every scenario instance's `type` matches the component it's filed under", () => {
    // Not a hard rule (scenario.ts's own doc leaves room for a future mixed
    // scenario) but true of every one authored so far — catches a
    // copy-paste that put a Pill spec under Port's list, or similar.
    for (const [name, list] of Object.entries(SCENARIOS)) {
      for (const scenario of list) {
        for (const spec of scenario.instances) {
          expect(spec.type, `${name}/${scenario.id}`).toBe(name);
        }
      }
    }
  });

  it("opens with a 'default' scenario first, so picking it after browsing others is a true reset", () => {
    for (const [name, list] of Object.entries(SCENARIOS)) {
      expect(list[0]!.id, name).toBe("default");
    }
  });
});
