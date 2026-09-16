import { describe, expect, it } from "vitest";
import { REGISTRY } from "../src/bench";
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

  /**
   * Round-3 Codex judge finding: `ScenarioInstanceSpec.props` is a bare
   * `Record<string, unknown>`, so a typo like `state: "wried"` typechecks
   * clean and every OTHER test above still passes — nothing previously
   * caught a stock scenario asserting a value its own component's real
   * FieldSpec doesn't recognize. This cross-checks every closed-vocabulary
   * ("segments") prop `scenario.ts` sets against that component's ACTUAL
   * registered `FieldSpec.options` (`REGISTRY`, ./bench.tsx) — the exact
   * data `PORT_FIELDS`/`PILL_FIELDS`/etc. are built from, so a renamed or
   * removed option value here fails loudly instead of silently mis-
   * rendering. Only checks fields that declare `options`; a `number`/
   * `text`/`toggle` prop has no closed vocabulary to validate against.
   */
  it("every closed-vocabulary prop value is a REAL option on that component's own FieldSpec", () => {
    const fieldsByComponent = new Map(REGISTRY.map((entry) => [entry.name, entry.fields]));
    for (const [name, list] of Object.entries(SCENARIOS)) {
      const fields = fieldsByComponent.get(name);
      expect(fields, `no registered component named "${name}"`).toBeDefined();
      const optionsById = new Map(
        fields!.filter((f) => f.options).map((f) => [f.id, new Set(f.options!.map((o) => o.value))]),
      );
      for (const scenario of list) {
        for (const spec of scenario.instances) {
          for (const [propId, value] of Object.entries(spec.props)) {
            const legal = optionsById.get(propId);
            if (!legal) continue; // not a closed-vocabulary field — nothing to check
            expect(legal.has(value as string), `${name}/${scenario.id}: "${propId}" = ${JSON.stringify(value)}`).toBe(
              true,
            );
          }
        }
      }
    }
  });
});

/**
 * The defect this guards against shipped to main and was invisible: every
 * `SCENARIOS.Port` instance passed `direction`/`producers`/`textLayout` and a
 * `children` label while naming the bare `Port` primitive, which after the
 * 2026-09-15 two-primitive split is dot geometry only (PORT_FIELD_IDS in
 * port.fields.ts: diameter/state/tone/hidden/dimmed/hinting). Nothing threw —
 * `PortProps extends ComponentProps<"span">` so the spread is legal — so the
 * labels silently failed to appear on /create and `producers` reached the DOM
 * as a non-attribute. This file merged onto main clean and had never been
 * exercised against the split.
 *
 * WHY the assertion is shaped this narrowly, having tried two wider ones:
 *   - Walking `entry.render()` output for the label text passes even against
 *     the broken version — render returns element DESCRIPTORS without
 *     executing the component, and the label arrives via a slot fill that only
 *     `renderInstance` builds. Verified vacuous by mutation.
 *   - Checking props against `entry.fields` reports false positives:
 *     `entry.fields` is a curated inspector subset, so real props the
 *     component does accept (`producers`, `children`, `placeholder`,
 *     `textSize`, `disabled`) are absent from it.
 * What is decidable here is the component NAME, and that is exactly what was
 * wrong. Typechecking cannot catch it: a scenario names its component with a
 * string and `props` is `Record<string, unknown>` by design.
 */
describe("scenarios name a component that can actually carry them", () => {
  const cases = Object.entries(SCENARIOS).flatMap(([name, list]) =>
    list.flatMap((s) => s.instances.map((inst, i) => ({ name, scenario: s.id, index: i, inst }))),
  );

  it("covers every scenario instance in the file, so a new one cannot slip past", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it("every named component exists in the registry", () => {
    for (const { inst } of cases) {
      expect(REGISTRY.find((e) => e.name === inst.type), `${inst.type} is not in REGISTRY`).toBeDefined();
    }
  });

  it("no scenario instance carrying a label or composite prop names the bare Port primitive", () => {
    const COMPOSITE_ONLY = ["children", "direction", "producers", "textLayout", "edge", "labelOrigin"];
    const offenders = cases
      .filter(({ inst }) => inst.type === "Port" && COMPOSITE_ONLY.some((k) => k in inst.props))
      .map(({ name, scenario, index }) => `${name}/${scenario}[${index}]`);
    expect(offenders, "bare Port has no label slot — these belong to LabeledPort").toEqual([]);
  });

  it("the Port-family scenarios are keyed to the component that renders them", () => {
    // The key decides whose sidebar offers these (workbench.tsx reads
    // SCENARIOS[activeName]). It must be LabeledPort: the bare Port primitive
    // has no label slot, so keyed to "Port" these four would be offered under
    // a component that cannot draw them.
    expect(Object.keys(SCENARIOS)).toContain("LabeledPort");
    expect(Object.keys(SCENARIOS)).not.toContain("Port");
  });
});
