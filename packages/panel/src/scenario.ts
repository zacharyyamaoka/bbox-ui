/**
 * packages/panel/src/scenario.ts
 *
 * A Scenario replaces the `/create` sidebar's field-ladder "Presets"
 * dropdown (2026-09-15). Zach, after seeing the first version — one
 * governed field on the current selection, "Small/Medium/Large" — asked
 * for stock examples with "full control basically over the entire
 * thing... you can set any number of instances, and any value on the
 * instances," and offered "Scenarios" or "Examples" as a better name.
 * This is closer to a real Storybook STORY (`apps/storybook`'s own
 * galleries — Port's `AllStates`, `TwoSlotsTogether`, each a full,
 * hand-authored render) than to a `PresetSpec` (one selector field
 * governing a closed set of OTHER fields on ONE subject,
 * `packages/schema/src/resolve.ts`).
 *
 * WHY a new, much simpler type rather than stretching `PresetSpec`: a
 * `PresetSpec` is deliberately narrow — one field's alternatives on the
 * subject the cascade already resolves (`resolve.ts`'s own module doc) —
 * and that narrowness is exactly what Zach is asking to get past. A
 * Scenario instead says what the WHOLE BENCH should hold: N instances,
 * each an arbitrary prop bag, no cascade, no governed-field bookkeeping.
 * Selecting one REPLACES `benches[activeName]` outright, the same shape
 * `SEED_VARIANTS`/`INITIAL_BENCHES` (./bench.tsx) already use to seed a
 * fresh bench — a Scenario is a named ALTERNATIVE seed, not a new kind of
 * fact about a component. `PresetSpec`/`resolveField`/`readFieldRow` are
 * UNCHANGED and still exactly what the right-hand Inspector's own field
 * rows use; a Scenario has nothing to do with that cascade.
 *
 * WHY it lives here and not inside a component's own `*.presets.ts`
 * (port.presets.ts etc): those are pure schema data with zero React/host
 * knowledge, describing one component's own field cascade. A Scenario is
 * host-BENCH data — instantiating one produces real `Instance`s — so it
 * belongs beside `SEED_VARIANTS`/`Instance` in this file's own package,
 * not inside a component package that has no concept of a bench.
 *
 * WHY only Port/Pill/Glyph/TextBox have scenarios today: every other
 * registered component (Bar, Block, Stack, Flex, PortEdge, PortEdges)
 * declares `slots` and/or `members` in its `ComponentEntry` — its real
 * instance list is not a flat `{type, props}` array but a tree with slot
 * fills, member ids and (for Block/PortEdges) an Arrangement, built by
 * `makeInstanceWithSlots`/`seedBlockPorts`. A scenario for one of those
 * needs that same construction, not a literal array — real, separate
 * follow-up work, left out of this pass rather than shipped half-built.
 * `SCENARIOS[name]` is simply absent for them, and the sidebar hides the
 * dropdown whenever the active component has none.
 */
import type { Instance } from "./bench";

export interface ScenarioInstanceSpec {
  /** The registered component name. Every entry in a Scenario today shares
   *  this with the Scenario's own component; nothing here forces that —
   *  a future mixed-bench scenario could set several types at once. */
  type: string;
  props: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  label: string;
  instances: ScenarioInstanceSpec[];
}

/**
 * Turn a Scenario's specs into real bench `Instance`s with fresh ids drawn
 * from `uid` upward — the same id shape `makeInstance` already uses
 * (`${type.toLowerCase()}-${uid}`), so a loaded scenario's instances are
 * indistinguishable to the rest of the bench from any instance it already
 * knows how to select, drag, edit or delete.
 */
export function instantiateScenario(scenario: Scenario, uid: number): Instance[] {
  return scenario.instances.map((spec, i) => ({
    id: `${spec.type.toLowerCase()}-${uid + i}`,
    type: spec.type,
    props: { ...spec.props },
  }));
}

// WHY no render assertion can guard any of this, which is the expensive half
// of the lesson: a Port's label is never React-rendered at all. PortLabel
// hands `children` to CodeField as `value`, and CodeField's JSX contains no
// `{value}` whatsoever (grep it — zero occurrences); the text becomes a
// CodeMirror document built imperatively inside a useLayoutEffect
// (`new EditorView({ state: EditorState.create({ doc: value ... }) })`,
// codeField.tsx). renderToStaticMarkup runs no effects, so it returns the
// empty label container and no text for EITHER component, slots supplied or
// not — two regression tests were written against that and both passed while
// the bug was present. Walking `entry.render()` output is no better: it
// returns UNEXECUTED descriptors, so the string is still sitting in
// PortLabel's props and is found for either type. A guard here must assert on
// component NAMES (see test/scenario.test.ts) or run in a real browser.
// Diagnosed with the port-primary-secondary-slot session, 2026-09-16.
//
// LabeledPort, not Port. Every scenario below passes `children` (the port's
// label) and most pass direction/producers/textLayout — all composite props.
// The bare `Port` primitive is dot geometry only (PORT_FIELD_IDS in
// port.fields.ts: diameter/state/tone/hidden/dimmed/hinting), so naming it
// here dropped every label silently: PortProps extends ComponentProps<"span">
// and spreads, but JSX children win over a spread `children`, so the text
// vanished rather than erroring, and direction/producers/textLayout leaked
// onto the span as unknown DOM attributes. This file merged onto main clean
// and was never exercised against the 2026-09-15 two-primitive split.
const port = (props: Record<string, unknown>): ScenarioInstanceSpec => ({ type: "LabeledPort", props });
const pill = (props: Record<string, unknown>): ScenarioInstanceSpec => ({ type: "Pill", props });
const glyph = (props: Record<string, unknown>): ScenarioInstanceSpec => ({ type: "Glyph", props });
const textBox = (props: Record<string, unknown>): ScenarioInstanceSpec => ({ type: "TextBox", props });

export const SCENARIOS: Record<string, Scenario[]> = {
  // Keyed to LabeledPort, matching the instances above. `SCENARIOS[activeName]`
  // (workbench.tsx) is read against the /create Component dropdown, which maps
  // REGISTRY directly and therefore lists LabeledPort — verified in the running
  // app, where selecting it shows all four of these. Selecting the bare `Port`
  // primitive now offers no scenarios, which is correct: the sidebar hides the
  // control when `SCENARIOS[name]` is absent, and every scenario here is about
  // a LABELLED port. Geometry-only ones can be authored under "Port" later.
  LabeledPort: [
    // Identical to SEED_VARIANTS.Port[0] (./bench.tsx) — picking "Default"
    // after wandering through the others returns exactly to what a fresh
    // Port bench opens with, never a near-miss.
    { id: "default", label: "Default", instances: [port({ state: "empty", diameter: "md", children: "Port A" })] },
    {
      id: "function-signature",
      label: "Function Signature",
      instances: [
        port({ direction: "input", state: "wired", diameter: "md", children: "frame: Image" }),
        port({ direction: "input", state: "empty", diameter: "sm", children: "config: Config" }),
        port({ direction: "output", state: "received", diameter: "lg", producers: 3, children: "pose: Pose" }),
      ],
    },
    {
      id: "all-states",
      label: "All States",
      instances: [
        port({ state: "empty", children: "idle" }),
        port({ state: "valueSet", children: "cached" }),
        port({ state: "wired", children: "connected" }),
        port({ state: "received", children: "streaming" }),
      ],
    },
    {
      id: "fan-in-out",
      label: "Fan-in / Fan-out",
      instances: [
        port({ direction: "input", state: "wired", producers: 5, textLayout: "right", children: "images" }),
        port({ direction: "output", state: "received", diameter: "lg", children: "detections" }),
      ],
    },
  ],
  Pill: [
    { id: "default", label: "Default", instances: [pill({ state: "wired", children: "Wired" })] },
    {
      id: "all-states",
      label: "All States",
      instances: [
        pill({ state: "empty", children: "Empty" }),
        pill({ state: "valueSet", children: "Default Value" }),
        pill({ state: "wired", children: "Wired" }),
        pill({ state: "received", children: "Data Recived" }),
      ],
    },
    {
      id: "all-tones",
      label: "All Tones",
      instances: [
        pill({ tone: "neutral", children: "Neutral" }),
        pill({ tone: "accent", children: "Accent" }),
        pill({ tone: "warning", children: "Warning" }),
        pill({ tone: "success", children: "Success" }),
        pill({ tone: "danger", children: "Danger" }),
      ],
    },
    {
      id: "status-board",
      label: "Status Board",
      instances: [
        pill({ state: "wired", children: "Connected" }),
        pill({ state: "empty", children: "Idle" }),
        pill({ tone: "danger", children: "Error" }),
        pill({ tone: "warning", children: "Retrying" }),
      ],
    },
  ],
  Glyph: [
    { id: "default", label: "Default", instances: [glyph({ children: "🔍" })] },
    {
      id: "all-sizes",
      label: "All Sizes",
      instances: [
        glyph({ size: "sm", children: "🔍" }),
        glyph({ size: "md", children: "⚙️" }),
        glyph({ size: "lg", children: "📦" }),
        glyph({ size: "xl", children: "🚀" }),
      ],
    },
    {
      id: "padding",
      label: "Padding",
      instances: [
        glyph({ size: "lg", children: "◆", padding: 0 }),
        glyph({ size: "lg", children: "◆", padding: 8 }),
        glyph({ size: "lg", children: "◆", padding: 20 }),
      ],
    },
  ],
  TextBox: [
    { id: "default", label: "Default", instances: [textBox({ children: "Text Box" })] },
    {
      id: "sizes",
      label: "Sizes",
      instances: [
        textBox({ size: "xl", children: "Heading" }),
        textBox({ size: "lg", children: "Subheading" }),
        textBox({ size: "md", children: "Body text" }),
        textBox({ size: "sm", children: "Caption" }),
      ],
    },
    {
      id: "fonts",
      label: "Fonts",
      instances: [
        textBox({ font: "sans", children: "Sans" }),
        textBox({ font: "sketch", children: "Sketch" }),
        textBox({ font: "mono", children: "Mono" }),
      ],
    },
    {
      id: "paragraph",
      label: "Multi-line Paragraph",
      instances: [
        textBox({
          lines: "multi",
          align: "top",
          justify: "left",
          children: "A paragraph of wrapped text, left-aligned and anchored to the top of its box.",
        }),
      ],
    },
  ],
};
