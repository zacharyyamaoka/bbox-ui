/**
 * The bench: which components exist, how each renders a preview, what a fresh
 * instance holds, and what "randomise" is allowed to write.
 *
 * WHY it lives in the package and not in an app: the Vite demo and the
 * bbox-ui.com create page both need exactly this, and a second copy would
 * drift the first time a component was added to one of them. Adding a ninth
 * component stays one import and one `registerComponent` call, in one file.
 */
import type { ReactNode } from "react";
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
import { registerComponent, type ComponentEntry } from "./registerComponent";
import type { Subject } from "./fieldModel";
import type { MembersSpec } from "./members/contract";

/**
 * Which components hold others, and what. `accepts` is closed on purpose:
 * a PortEdge is a lane of Ports and nothing else; a Stack is a column of
 * block-shaped things; a Block's body takes one layout container or a few
 * leaves; a RowContainer takes leaves. Widening a set is a one-line edit
 * here, and the Members control offers exactly this list.
 */
const LEAVES = ["Port", "Pill", "Glyph", "TextBox"];
export const MEMBER_SPECS: Record<string, MembersSpec> = {
  RowContainer: { accepts: LEAVES },
  Stack: { accepts: ["Block", "Stack", "RowContainer", ...LEAVES] },
  PortEdge: { accepts: ["Port"], label: "Ports" },
  Block: { accepts: ["Stack", "RowContainer", ...LEAVES], label: "Body" },
};

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

function renderBlock(props: Record<string, unknown>, children?: ReactNode): ReactNode {
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
      {/* The body: whatever the Block holds, laid down the column between
          the description and the pinned type line. */}
      {children !== undefined && (
        <div data-slot="block-body" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, width: "100%" }}>
          {children}
        </div>
      )}
      <BlockType>Type</BlockType>
    </Block>
  );
}

export const REGISTRY: ComponentEntry[] = [
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
    members: MEMBER_SPECS.RowContainer,
    // WHY placeholders when there are no members: a container with nothing
    // in it paints nothing, and a blank 320px well on the bench reads as a
    // bug. The swatches stand in until a member is added, then step aside.
    render: (props, children) => (
      <div style={{ width: 320, border: "1px dashed #ccc" }}>
        <RowContainer {...(props as Record<string, never>)}>
          {children ?? (
            <>
              {swatch("A")}
              {swatch("B")}
              {swatch("C")}
            </>
          )}
        </RowContainer>
      </div>
    ),
  }),
  registerComponent({
    name: "Stack",
    fields: STACK_FIELDS,
    presets: STACK_PRESETS,
    members: MEMBER_SPECS.Stack,
    render: (props, children) => (
      <div style={{ width: 240, border: "1px dashed #ccc" }}>
        <Stack {...(props as Record<string, never>)}>
          {children ?? (
            <>
              {stackMember("Member A")}
              {stackMember("Member B")}
            </>
          )}
        </Stack>
      </div>
    ),
  }),
  registerComponent({
    name: "PortEdge",
    fields: PORT_EDGE_FIELDS,
    presets: PORT_EDGE_PRESETS,
    members: MEMBER_SPECS.PortEdge,
    render: (props, children) => (
      <div style={{ position: "relative", width: 260, height: 160, border: "1px dashed #ccc" }}>
        <PortEdge {...(props as Record<string, never>)}>{children ?? threePorts()}</PortEdge>
      </div>
    ),
  }),
  registerComponent({
    name: "Block",
    fields: BLOCK_FIELDS,
    presets: BLOCK_PRESETS,
    members: MEMBER_SPECS.Block,
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
export const SEED_VARIANTS: Record<string, Record<string, unknown>[]> = {
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

export interface Instance extends Subject {
  /** Which registered component this instance is. Always the active component
   *  in a focused bench; the whole point of the mixed bench is that it varies. */
  type: string;
  /**
   * The ids of the instances this one holds, in order. Only present on an
   * instance whose component declares `members`. A held instance lives in
   * the same bench array as everything else — it just is not top-level —
   * so selecting it puts it in the inspector exactly like any other.
   * See members/model.ts for every derived fact (parent, depth, subtree).
   */
  members?: string[];
}

export function makeInstance(type: string, index: number, uid: number): Instance {
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
export const MIXED_BENCH = "Mixed bench";

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
export function sharedFields(entries: ComponentEntry[]): { fields: FieldSpec[]; excluded: string[] } {
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
export const EXCLUDED_SHOWN = 5;


/** Label words for randomising a text field. Randomising a name to a UUID is
 *  noise; randomising it to a word keeps the preview readable, which is the
 *  point of the button. */
export const RANDOM_WORDS = ["alpha", "beta", "gamma", "delta", "signal", "frame", "pose", "goal", "mask", "tick"];

/**
 * A random legal value for one field, from the field's OWN declaration.
 *
 * WHY it reads the FieldSpec rather than a per-component table: a table would
 * be an eighth place that has to learn about a new component, and would go
 * stale silently the first time an option set changed. The schema already
 * says exactly what is legal here.
 */
export function randomValue(field: FieldSpec, roll: () => number): FieldValue | undefined {
  // A field may opt out (FieldSpec.randomize): host-computed state such as
  // Port's reveal-on-hover made instances vanish from the bench when rolled.
  if (field.randomize === false) return undefined;
  switch (field.kind) {
    case "segments": {
      const options = (field.options ?? []).filter((o) => o.randomize !== false);
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

/**
 * Every focused bench opens with exactly ONE instance — a primitive in
 * isolation. The mixed bench opens with two DIFFERENT components, because a
 * bench of one type is just the focused view and would say nothing about the
 * cross-type question it exists to answer. Both pieces of an app's state read
 * from this one seed, so a selection can never start out pointing at an
 * instance that is not there.
 */
export const INITIAL_BENCHES: Record<string, Instance[]> = (() => {
  const seeded: Record<string, Instance[]> = {};
  let n = 0;
  for (const entry of REGISTRY) seeded[entry.name] = [makeInstance(entry.name, 0, n++)];
  seeded[MIXED_BENCH] = [makeInstance("Port", 0, n++), makeInstance("Pill", 0, n++)];
  return seeded;
})();

export const INITIAL_UID = Object.values(INITIAL_BENCHES).reduce((n, list) => n + list.length, 0);
