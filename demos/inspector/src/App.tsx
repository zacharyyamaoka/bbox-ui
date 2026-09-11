import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FieldValue } from "@bbox-ui/schema";
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

/** One seeded instance per component, plus a second for Pill/Port so
 * multi-selection/MIXED has something real to show out of the box. */
function seedInstances(name: string): Subject[] {
  switch (name) {
    case "Port":
      return [
        { id: "port-a", props: { state: "empty", diameter: "md", textLayout: "right", children: "Port A" } },
        { id: "port-b", props: { state: "wired", diameter: "md", textLayout: "right", children: "Port B" } },
      ];
    case "Pill":
      return [
        { id: "pill-a", props: { state: "wired", children: "Wired" } },
        { id: "pill-b", props: { state: "valueSet", children: "Default" } },
      ];
    case "Glyph":
      return [
        { id: "glyph-a", props: { size: "xl", children: "🔍" } },
        { id: "glyph-b", props: { size: "lg", children: "⚙️" } },
      ];
    case "TextBox":
      return [{ id: "textbox-a", props: { size: "md", children: "Text Box" } }];
    case "RowContainer":
      return [{ id: "row-a", props: {} }];
    case "Stack":
      return [{ id: "stack-a", props: {} }];
    case "PortEdge":
      return [{ id: "edge-a", props: { edge: "left" } }];
    case "Block":
      return [{ id: "block-a", props: { state: "wired", tone: "neutral" } }];
    default:
      return [];
  }
}

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

export default function App() {
  const [activeName, setActiveName] = useState(REGISTRY[0].name);
  const [variantId, setVariantId] = useState<string>(() => findVariant(readStoredVariant()).id);
  const [instancesByComponent, setInstancesByComponent] = useState<Record<string, Subject[]>>(() =>
    Object.fromEntries(REGISTRY.map((entry) => [entry.name, seedInstances(entry.name)])),
  );
  const [selectedByComponent, setSelectedByComponent] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      REGISTRY.map((entry) => [entry.name, new Set(seedInstances(entry.name).map((s) => s.id))]),
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

  const entry = REGISTRY.find((e) => e.name === activeName)!;
  const instances = instancesByComponent[activeName];
  const selectedIds = selectedByComponent[activeName];
  const selected = instances.filter((i) => selectedIds.has(i.id));

  function toggleSelected(id: string) {
    setSelectedByComponent((prev) => {
      const next = new Set(prev[activeName]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [activeName]: next };
    });
  }

  function applyToSelected(fieldId: string, value: FieldValue) {
    setInstancesByComponent((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) =>
        selectedIds.has(instance.id)
          ? { ...instance, props: { ...instance.props, [fieldId]: value } }
          : instance,
      ),
    }));
  }

  function clearOverride(fieldId: string) {
    setInstancesByComponent((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) => {
        if (!selectedIds.has(instance.id)) return instance;
        const nextProps = { ...instance.props };
        delete nextProps[fieldId];
        return { ...instance, props: nextProps };
      }),
    }));
  }

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
          <div style={previewHeaderStyle}>Instances</div>
          {instances.map((instance) => (
            <label key={instance.id} data-slot="subject-row" data-subject-id={instance.id} style={subjectRowStyle}>
              <input
                type="checkbox"
                checked={selectedIds.has(instance.id)}
                onChange={() => toggleSelected(instance.id)}
              />
              <div style={previewBoxStyle}>{entry.render(instance.props)}</div>
            </label>
          ))}
        </div>

        <div ref={panelRef} data-slot="panel-variant-host" data-variant={variant.id}>
          <variant.Panel
            componentName={entry.name}
            fields={entry.fields}
            presets={entry.presets}
            subjects={selected}
            toSubject={entry.toSubject}
            onChange={applyToSelected}
            onClearOverride={clearOverride}
          />
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
const previewColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, minWidth: 260 };
const previewHeaderStyle: CSSProperties = { fontWeight: 600, color: "#666", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 };
const subjectRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const previewBoxStyle: CSSProperties = { display: "flex", alignItems: "center" };
