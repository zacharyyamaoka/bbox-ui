import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import {
  Block,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  BLOCK_FIELDS,
  BLOCK_PRESETS,
  Glyph,
  GLYPH_FIELDS,
  GLYPH_PRESETS,
  Pill,
  pillResolutionSubject,
  PILL_FIELDS,
  PILL_PRESETS,
  Port,
  PORT_FIELDS,
  PORT_PRESETS,
  PortEdge,
  PORT_EDGE_FIELDS,
  PORT_EDGE_PRESETS,
  RowContainer,
  ROW_CONTAINER_FIELDS,
  ROW_CONTAINER_PRESETS,
  Stack,
  STACK_FIELDS,
  STACK_PRESETS,
  TextBox,
  TEXT_BOX_FIELDS,
  TEXT_BOX_PRESETS,
  type AppearanceState,
  type Tone,
  type Lens,
} from "@bbox-ui/core";
import { registerComponent, type ComponentEntry } from "./schema/registerComponent";
import { PANEL_VARIANTS, findVariant } from "./variants";
import type { Subject } from "./FieldTraceRow";

/**
 * demos/inspector/src/App.tsx — Integration's wiring (T1-SPEC.md
 * §7.1): one `import` + one `registerComponent(...)` call per shipped
 * component. `ComponentInspector`/`FieldTraceRow` (Lane D) know nothing
 * about any of these by name — this file is the only place that changes
 * when an 8th component ships.
 *
 * `render` for a component whose fields ARE its own real props
 * (Glyph/TextBox/Pill/Port) is a bare spread — the T1-SPEC.md §7.1
 * illustrative shape. `RowContainer`/`Stack`/`PortEdge`'s `children` are
 * structural, not `FieldSpec` rows (their own field files say so), so
 * their `render` composes a small placeholder — the same convention
 * their own Storybook galleries already use. `Block`'s fields are spread
 * across three real components (`Block`/`BlockHeader`/`BlockChip`), so
 * its `render` mirrors `Block.stories.tsx`'s own `renderBlock` exactly —
 * never a bare `<Block {...props} />`, which would leave every field but
 * width/height inert.
 */

function swatch(label: string): ReactNode {
  return (
    <div
      key={label}
      style={{
        border: "2px solid currentColor",
        borderRadius: 4,
        padding: "6px 10px",
        fontFamily: "monospace",
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      {label}
    </div>
  );
}

function stackMember(label: string): ReactNode {
  return (
    <div
      key={label}
      style={{ border: "2px solid currentColor", padding: "8px 12px", whiteSpace: "nowrap" }}
    >
      {label}
    </div>
  );
}

function threePorts(): ReactNode {
  return (
    <>
      <Port key="a" state="empty">
        alpha
      </Port>
      <Port key="b" state="wired">
        beta
      </Port>
      <Port key="c" state="received">
        gamma
      </Port>
    </>
  );
}

interface BlockRenderProps {
  width?: number;
  height?: number;
  orientation?: "horizontal" | "vertical";
  state?: AppearanceState;
  tone?: Tone;
  lens?: Lens;
  lensBefore?: string;
}

function renderBlock(props: Record<string, unknown>): ReactNode {
  const p = props as BlockRenderProps;
  return (
    <Block width={p.width} height={p.height}>
      <BlockHeader orientation={p.orientation}>
        <BlockGlyph>◆</BlockGlyph>
        <BlockTitle>Block</BlockTitle>
        <BlockChip state={p.state} tone={p.tone} lens={p.lens} lensBefore={p.lensBefore}>
          Chip
        </BlockChip>
      </BlockHeader>
      <BlockDescription>Description</BlockDescription>
      <BlockType>Type</BlockType>
    </Block>
  );
}

const REGISTRY: ComponentEntry[] = [
  registerComponent({
    name: "Port",
    fields: PORT_FIELDS,
    presets: PORT_PRESETS,
    render: (props) => <Port {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "Pill",
    fields: PILL_FIELDS,
    presets: PILL_PRESETS,
    // Pill folds `tone` into the override layer before resolving, so the
    // panel has to resolve against the same subject or its trace disagrees
    // with the pixels. Imported, not reimplemented.
    toSubject: pillResolutionSubject,
    render: (props) => <Pill {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "Glyph",
    fields: GLYPH_FIELDS,
    presets: GLYPH_PRESETS,
    render: (props) => <Glyph {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "TextBox",
    fields: TEXT_BOX_FIELDS,
    presets: TEXT_BOX_PRESETS,
    render: (props) => (
      <div style={{ width: 220, border: "1px dashed #ccc" }}>
        <TextBox {...(props as Record<string, never>)} />
      </div>
    ),
  }),
  registerComponent({
    name: "RowContainer",
    fields: ROW_CONTAINER_FIELDS,
    presets: ROW_CONTAINER_PRESETS,
    render: (props) => (
      <div style={{ width: 320, border: "1px dashed #ccc" }}>
        <RowContainer {...(props as Record<string, never>)}>
          {swatch("A")}
          {swatch("B")}
          {swatch("C")}
        </RowContainer>
      </div>
    ),
  }),
  registerComponent({
    name: "Stack",
    fields: STACK_FIELDS,
    presets: STACK_PRESETS,
    render: (props) => (
      <div style={{ width: 240, border: "1px dashed #ccc" }}>
        <Stack {...(props as Record<string, never>)}>
          {stackMember("Member A")}
          {stackMember("Member B")}
        </Stack>
      </div>
    ),
  }),
  registerComponent({
    name: "PortEdge",
    fields: PORT_EDGE_FIELDS,
    presets: PORT_EDGE_PRESETS,
    render: (props) => (
      <div style={{ position: "relative", width: 260, height: 160, border: "1px dashed #ccc" }}>
        <PortEdge {...(props as Record<string, never>)}>{threePorts()}</PortEdge>
      </div>
    ),
  }),
  registerComponent({
    name: "Block",
    fields: BLOCK_FIELDS,
    presets: BLOCK_PRESETS,
    render: renderBlock,
  }),
];

/**
 * Seed props per component, as a LIST of genuinely different variations.
 *
 * WHY a list rather than one instance: the bench's whole purpose is checking
 * what a panel does when a selection disagrees — "it's good being able to
 * check the logic of what happens when you click multiple mixed instances".
 * If instance 2 were a copy of instance 1, nothing would ever read Mixed and
 * the bench would prove nothing. So each variation differs in at least one
 * field the panel actually shows.
 *
 * WHY the bench nonetheless opens with ONE: two instances and a pair of
 * checkboxes on first load reads as a puzzle rather than a primitive —
 * Zach, 2026-09-11: "I kinda wanted to see the primitive in isolation
 * first." Isolation is the default; disagreement is one click away.
 */
const SEED_VARIANTS: Record<string, Record<string, unknown>[]> = {
  Port: [
    { state: "empty", diameter: "md", textLayout: "right", children: "Port A" },
    { state: "wired", diameter: "md", textLayout: "right", children: "Port B" },
    { state: "received", diameter: "lg", textLayout: "right", children: "Port C" },
    { state: "valueSet", diameter: "sm", textLayout: "below", children: "Port D" },
  ],
  Pill: [
    { state: "wired", children: "Wired" },
    { state: "valueSet", children: "Default" },
    { state: "empty", children: "Empty" },
    { state: "outOfFocus", children: "Dimmed" },
  ],
  Glyph: [
    { size: "xl", children: "🔍" },
    { size: "lg", children: "⚙️" },
    { size: "md", children: "◆" },
  ],
  TextBox: [
    { size: "md", children: "Text Box" },
    { size: "lg", children: "Bigger text" },
    { size: "sm", children: "Small print" },
  ],
  RowContainer: [{}, { gap: "lg" }, { align: "center" }],
  Stack: [{}, { gap: "lg" }],
  PortEdge: [{ edge: "left" }, { edge: "right" }, { edge: "top" }],
  Block: [
    { state: "wired", tone: "neutral" },
    { state: "empty", tone: "accent" },
    { state: "received", tone: "neutral" },
  ],
};

interface Instance extends Subject {
  /** Which registered component this instance is. Always the active component
   *  in a focused bench; the whole point of the mixed bench is that it varies. */
  type: string;
}

function makeInstance(type: string, index: number, uid: number): Instance {
  const variants = SEED_VARIANTS[type] ?? [{}];
  return {
    id: `${type.toLowerCase()}-${uid}`,
    type,
    props: { ...variants[index % variants.length] },
  };
}

/**
 * The cross-type bench. Zach, 2026-09-11: "a free flowing one where you can
 * add instances of any types of primitives so that you're able to check the
 * logic of what happens when you multiselect on various different types...
 * to see what are the things that you're able to update across all of them."
 */
const MIXED_BENCH = "Mixed bench";

/**
 * The fields a panel may show when the selection spans several components.
 *
 * Intersection by id is not enough. Two components can both call a field
 * `size` and mean different option sets, and offering one control over both
 * would write a value that is legal for one and nonsense for the other. So a
 * field survives only when its id, kind AND option set all agree; anything
 * that merely shares a name is reported as excluded rather than silently
 * dropped, because "what can I edit across all of these" is the question the
 * bench exists to answer and a quiet omission is a wrong answer to it.
 */
function sharedFields(entries: ComponentEntry[]): { fields: FieldSpec[]; excluded: string[] } {
  if (entries.length === 0) return { fields: [], excluded: [] };
  const [first, ...rest] = entries;
  const signature = (f: FieldSpec) =>
    `${f.kind}|${(f.options ?? []).map((o) => String(o.value)).join(",")}`;

  const fields: FieldSpec[] = [];
  const excluded: string[] = [];

  for (const field of first.fields) {
    // WHY two separate reasons and not one: "Stack has no State field" and
    // "Glyph's Size means something else" are different facts, and collapsing
    // them into one phrase told the reader the opposite of the truth in the
    // common case. A bench that explains why a field is missing has to
    // explain it correctly or it is worse than saying nothing.
    const absentFrom = rest.filter((e) => !e.fields.some((o) => o.id === field.id));
    const differsOn = rest.filter((e) =>
      e.fields.some((o) => o.id === field.id && signature(o) !== signature(field)),
    );
    if (absentFrom.length === 0 && differsOn.length === 0) fields.push(field);
    else if (differsOn.length > 0)
      excluded.push(`${field.label} (different options on ${differsOn.map((e) => e.name).join(", ")})`);
    else excluded.push(`${field.label} (not on ${absentFrom.map((e) => e.name).join(", ")})`);
  }

  const firstIds = new Set(first.fields.map((f) => f.id));
  const seen = new Set(excluded);
  for (const entry of rest) {
    for (const field of entry.fields) {
      if (firstIds.has(field.id)) continue;
      const line = `${field.label} (only on ${entry.name})`;
      if (!seen.has(line)) {
        seen.add(line);
        excluded.push(line);
      }
    }
  }
  return { fields, excluded };
}

/** The excluded list is for orientation, not for reading end to end — Port and
 *  Pill alone already produce seven entries. Show enough to see the shape. */
const EXCLUDED_SHOWN = 5;

/** WHY localStorage and not a URL flag: a prototype gated behind a query
 * string Zach has to remember and type is one he will not switch to, and it
 * forgets his choice on every reload. Rated Bad on 2026-09-09 for exactly
 * that (`?portLanes=1`). The switcher lives in the app and the app remembers. */
const VARIANT_STORAGE_KEY = "bbox-ui.inspector.panelVariant";

function readStoredVariant(): string | null {
  try {
    return window.localStorage.getItem(VARIANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Live panel height, so "more compact" is a number in the app rather than a
 * claim in a report. Measures the rendered subtree, re-measuring on every
 * resize — variants change height when a disclosure opens, and a number taken
 * once at mount would quietly describe the wrong state. */
function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const node = ref.current;
    if (node) setHeight(Math.round(node.getBoundingClientRect().height));
  }, []);

  useLayoutEffect(measure);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  return { ref, height };
}

/** Every focused bench opens with exactly ONE instance. The mixed bench opens
 *  with two DIFFERENT components, because a bench of one type is just the
 *  focused view and would say nothing about the cross-type question it exists
 *  to answer. Both pieces of state read from this one seed, so the selection
 *  can never start out pointing at an instance that is not there. */
const INITIAL_BENCHES: Record<string, Instance[]> = (() => {
  const seeded: Record<string, Instance[]> = {};
  let n = 0;
  for (const entry of REGISTRY) seeded[entry.name] = [makeInstance(entry.name, 0, n++)];
  seeded[MIXED_BENCH] = [makeInstance("Port", 0, n++), makeInstance("Pill", 0, n++)];
  return seeded;
})();

const INITIAL_UID = Object.values(INITIAL_BENCHES).reduce((n, list) => n + list.length, 0);

/** Label words for randomising a text field. Randomising a name to a UUID is
 *  noise; randomising it to a word keeps the preview readable, which is the
 *  point of the button. */
const RANDOM_WORDS = ["alpha", "beta", "gamma", "delta", "signal", "frame", "pose", "goal", "mask", "tick"];

/**
 * A random legal value for one field, from the field's OWN declaration.
 *
 * WHY it reads the FieldSpec rather than a per-component table: a table would
 * be an eighth place that has to learn about a new component, and would go
 * stale silently the first time an option set changed. The schema already
 * says exactly what is legal here.
 */
function randomValue(field: FieldSpec, roll: () => number): FieldValue | undefined {
  switch (field.kind) {
    case "segments": {
      const options = field.options ?? [];
      if (options.length === 0) return undefined;
      return options[Math.floor(roll() * options.length)]!.value;
    }
    case "toggle":
      return roll() < 0.5;
    case "number": {
      const min = field.min ?? 0;
      const max = field.max ?? min + 10;
      const step = field.step ?? 1;
      const steps = Math.max(1, Math.round((max - min) / step));
      return Math.round((min + Math.floor(roll() * (steps + 1)) * step) * 1000) / 1000;
    }
    case "text":
      return RANDOM_WORDS[Math.floor(roll() * RANDOM_WORDS.length)]!;
  }
}

export default function App() {
  const [activeName, setActiveName] = useState(REGISTRY[0].name);
  const [variantId, setVariantId] = useState<string>(() => findVariant(readStoredVariant()).id);
  const uid = useRef(INITIAL_UID);

  const [benches, setBenches] = useState<Record<string, Instance[]>>(() =>
    Object.fromEntries(
      Object.entries(INITIAL_BENCHES).map(([name, list]) => [
        name,
        list.map((i) => ({ ...i, props: { ...i.props } })),
      ]),
    ),
  );
  const [selectedIdsByBench, setSelectedIdsByBench] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      Object.entries(INITIAL_BENCHES).map(([name, list]) => [name, new Set(list.map((i) => i.id))]),
    ),
  );

  const variant = findVariant(variantId);
  const { ref: panelRef, height: panelHeight } = useMeasuredHeight<HTMLDivElement>();

  useEffect(() => {
    try {
      window.localStorage.setItem(VARIANT_STORAGE_KEY, variantId);
    } catch {
      /* private browsing; the switcher still works, it just forgets. */
    }
  }, [variantId]);

  const isMixed = activeName === MIXED_BENCH;
  const instances = benches[activeName] ?? [];
  const selectedIds = selectedIdsByBench[activeName] ?? new Set<string>();
  const selected = instances.filter((i) => selectedIds.has(i.id));

  const entryFor = (name: string) => REGISTRY.find((e) => e.name === name)!;
  const selectedTypes = Array.from(new Set(selected.map((i) => i.type)));
  const selectedEntries = selectedTypes.map(entryFor);

  // One type selected — even inside the mixed bench — behaves exactly like the
  // focused view: full fields, its own presets, its own resolution subject.
  // Only a genuine multi-type selection narrows to the shared set.
  const single = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const shared = selectedEntries.length > 1 ? sharedFields(selectedEntries) : null;
  const panelFields: FieldSpec[] = single ? single.fields : (shared?.fields ?? []);
  const panelPresets = single ? single.presets : [];
  const panelToSubject = single ? single.toSubject : undefined;
  const panelName = isMixed
    ? selectedTypes.length === 0
      ? MIXED_BENCH
      : selectedTypes.join(" + ")
    : activeName;

  function toggleSelected(id: string) {
    setSelectedIdsByBench((prev) => {
      const next = new Set(prev[activeName]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [activeName]: next };
    });
  }

  function addInstance(type: string) {
    const id = `${type.toLowerCase()}-${uid.current}`;
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const sameType = bench.filter((i) => i.type === type).length;
      return { ...prev, [activeName]: [...bench, makeInstance(type, sameType, uid.current)] };
    });
    // A newly added instance arrives SELECTED. Adding one is how you ask for a
    // multi-selection; making you then tick it would be a second step for the
    // thing you just asked for.
    setSelectedIdsByBench((prev) => ({ ...prev, [activeName]: new Set([...(prev[activeName] ?? []), id]) }));
    uid.current += 1;
  }

  function removeLastInstance() {
    const bench = benches[activeName] ?? [];
    if (bench.length <= 1) return;
    const doomed = bench[bench.length - 1];
    setBenches((prev) => ({ ...prev, [activeName]: prev[activeName].slice(0, -1) }));
    setSelectedIdsByBench((prev) => {
      const next = new Set(prev[activeName]);
      next.delete(doomed.id);
      // Never leave the panel with nothing selected because a row vanished.
      if (next.size === 0 && bench.length >= 2) next.add(bench[bench.length - 2].id);
      return { ...prev, [activeName]: next };
    });
  }

  /**
   * Zach, 2026-09-11: "I really like this where you add new instances, it kind
   * of gives it a random configuration, that's really fun just to explore
   * different things. I think there could also be a button that just says do
   * something random or randomize everything."
   *
   * It randomises the SELECTED instances, or all of them when nothing is
   * selected, and each instance rolls independently — a shared roll would
   * make every instance identical, which is the opposite of exploring.
   */
  function randomizeInstances() {
    const roll = () => Math.random();
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) => {
        const targeted = selectedIds.size === 0 || selectedIds.has(instance.id);
        if (!targeted) return instance;
        const props: Record<string, unknown> = {};
        for (const field of entryFor(instance.type).fields) {
          const value = randomValue(field, roll);
          if (value !== undefined) props[field.id] = value;
        }
        return { ...instance, props };
      }),
    }));
  }

  function applyToSelected(fieldId: string, value: FieldValue) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) =>
        selectedIds.has(instance.id)
          ? { ...instance, props: { ...instance.props, [fieldId]: value } }
          : instance,
      ),
    }));
  }

  function clearOverride(fieldId: string) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) => {
        if (!selectedIds.has(instance.id)) return instance;
        const nextProps = { ...instance.props };
        delete nextProps[fieldId];
        return { ...instance, props: nextProps };
      }),
    }));
  }

  // WHY the checkbox is conditional: with one instance there is nothing to
  // choose between, so a tickbox is a control whose only reachable state is
  // the one it is already in. It appears the moment a second instance does.
  const showCheckboxes = instances.length > 1;

  return (
    <div data-slot="product-inspector-demo" style={rootStyle}>
      <div style={pickerRowStyle}>
        <label style={pickerLabelStyle}>
          Component
          <select
            data-slot="component-picker"
            value={activeName}
            onChange={(e) => setActiveName(e.target.value)}
            style={selectStyle}
          >
            {REGISTRY.map((e) => (
              <option key={e.name} value={e.name}>
                {e.name}
              </option>
            ))}
            <option value={MIXED_BENCH}>{MIXED_BENCH} —</option>
          </select>
        </label>

        <label style={pickerLabelStyle}>
          Panel design
          <select
            data-slot="variant-picker"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            style={selectStyle}
          >
            {PANEL_VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <div data-slot="variant-height" style={heightBadgeStyle}>
          {panelHeight === null ? "measuring…" : `${panelHeight}px tall`}
        </div>
      </div>

      <p data-slot="variant-blurb" style={blurbStyle}>
        {variant.blurb}
      </p>

      <div style={mainRowStyle}>
        <div style={previewColumnStyle}>
          <div style={previewHeaderStyle}>
            {isMixed ? "Bench" : "Instances"}
          </div>

          {instances.map((instance) => (
            <label
              key={instance.id}
              data-slot="subject-row"
              data-subject-id={instance.id}
              data-subject-type={instance.type}
              style={subjectRowStyle}
            >
              {showCheckboxes && (
                <input
                  type="checkbox"
                  data-slot="subject-checkbox"
                  checked={selectedIds.has(instance.id)}
                  onChange={() => toggleSelected(instance.id)}
                />
              )}
              {isMixed && <span style={typeTagStyle}>{instance.type}</span>}
              <div style={previewBoxStyle}>{entryFor(instance.type).render(instance.props)}</div>
            </label>
          ))}

          {isMixed ? (
            <div data-slot="bench-adder" style={adderRowStyle}>
              {REGISTRY.map((e) => (
                <button
                  key={e.name}
                  type="button"
                  data-slot="add-type"
                  data-type={e.name}
                  onClick={() => addInstance(e.name)}
                  style={adderChipStyle}
                  title={`Add a ${e.name} to the bench`}
                >
                  + {e.name}
                </button>
              ))}
              {instances.length > 1 && (
                <button type="button" data-slot="instance-minus" onClick={removeLastInstance} style={stepperButtonStyle} title="Remove the last one">
                  −
                </button>
              )}
              <button
                type="button"
                data-slot="randomize"
                onClick={randomizeInstances}
                style={randomizeStyle}
                title="Give every selected instance a random legal value for every field"
              >
                🎲 Randomize
              </button>
            </div>
          ) : (
            <div data-slot="instance-stepper" style={stepperRowStyle}>
              <button
                type="button"
                data-slot="instance-minus"
                onClick={removeLastInstance}
                disabled={instances.length <= 1}
                style={stepperButtonStyle}
              >
                −
              </button>
              <span data-slot="instance-count" style={stepperCountStyle}>
                {instances.length} {instances.length === 1 ? "instance" : "instances"}
              </span>
              <button
                type="button"
                data-slot="instance-plus"
                onClick={() => addInstance(activeName)}
                style={stepperButtonStyle}
              >
                +
              </button>
              <button
                type="button"
                data-slot="randomize"
                onClick={randomizeInstances}
                style={randomizeStyle}
                title="Give every selected instance a random legal value for every field"
              >
                🎲 Randomize
              </button>
            </div>
          )}
        </div>

        <div style={panelColumnStyle}>
          {shared && (
            <div data-slot="shared-field-note" style={sharedNoteStyle}>
              <strong>{selectedTypes.join(" + ")}</strong> —{" "}
              {shared.fields.length === 0 ? (
                <>nothing can be edited across all {selected.length}: these types have no field in common.</>
              ) : (
                <>
                  {shared.fields.length} field{shared.fields.length === 1 ? "" : "s"} can be edited
                  across all {selected.length}.
                </>
              )}
              {shared.excluded.length > 0 && (
                <span style={{ color: "#8a6a3a" }}>
                  {" "}
                  Not shared: {shared.excluded.slice(0, EXCLUDED_SHOWN).join(", ")}
                  {shared.excluded.length > EXCLUDED_SHOWN
                    ? `, and ${shared.excluded.length - EXCLUDED_SHOWN} more.`
                    : "."}
                </span>
              )}
            </div>
          )}
          <div ref={panelRef} data-slot="panel-variant-host" data-variant={variant.id}>
            {selected.length > 0 && panelFields.length === 0 ? (
              // WHY its own card rather than the panel rendering an empty list:
              // a bordered box with a header and nothing under it reads as a
              // bug. The bench's answer to "what can I change across these?"
              // is sometimes "nothing", and it has to say so out loud.
              <div data-slot="no-shared-fields" style={emptyPanelStyle}>
                <strong>{selectedTypes.join(" + ")}</strong>
                <p style={{ margin: "6px 0 0" }}>
                  No field is common to all {selected.length} selected instances, so there is
                  nothing a single control could write. Deselect a type to get a panel back.
                </p>
              </div>
            ) : (
            <variant.Panel
              componentName={panelName}
              fields={panelFields}
              presets={panelPresets}
              subjects={selected}
              toSubject={panelToSubject}
              onChange={applyToSelected}
              onClearOverride={clearOverride}
            />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16, padding: 32 };
const pickerRowStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center" };
const pickerLabelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "#666" };
const selectStyle: CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 };
const heightBadgeStyle: CSSProperties = { marginLeft: "auto", alignSelf: "flex-end", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#666", border: "1px solid #ddd", borderRadius: 999, padding: "4px 10px" };
const blurbStyle: CSSProperties = { margin: 0, maxWidth: 760, fontSize: 13, lineHeight: 1.5, color: "#555" };
const mainRowStyle: CSSProperties = { display: "flex", gap: 32, alignItems: "flex-start" };
const panelColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const emptyPanelStyle: CSSProperties = { width: 420, border: "1px solid #e0e0e6", borderRadius: 10, background: "#fff", padding: "18px 20px", fontSize: 13, color: "#555", lineHeight: 1.55 };
const sharedNoteStyle: CSSProperties = { maxWidth: 460, fontSize: 12, lineHeight: 1.5, color: "#555", background: "#fbf7f0", border: "1px solid #efe2cf", borderRadius: 8, padding: "8px 12px" };
const stepperRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 4 };
const adderRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8, maxWidth: 260 };
const adderChipStyle: CSSProperties = { border: "1px dashed #c8c8d0", background: "transparent", color: "#555", borderRadius: 999, padding: "3px 9px", fontSize: 11, cursor: "pointer" };
const stepperButtonStyle: CSSProperties = { width: 24, height: 24, lineHeight: "20px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: 15, padding: 0 };
const randomizeStyle: CSSProperties = { border: "1px solid #d8d8e0", background: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, color: "#555", cursor: "pointer", whiteSpace: "nowrap" };
const stepperCountStyle: CSSProperties = { fontSize: 12, color: "#666", minWidth: 74, textAlign: "center" };
const typeTagStyle: CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#999", minWidth: 62 };
const previewColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, minWidth: 260 };
const previewHeaderStyle: CSSProperties = { fontWeight: 600, color: "#666", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 };
const subjectRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const previewBoxStyle: CSSProperties = { display: "flex", alignItems: "center" };
