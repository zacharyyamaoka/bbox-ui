# T0 — Port, end to end. Pinned implementation spec.

Status: **pinned**. Every export name, file path, and signature below is final.
Agents implement against this document without needing to coordinate with each
other — that is the whole point of writing it down first.

Zach's brief, verbatim: *"Let's please start implementing this end to end with
just as simple as possible case, which is literally a single port, which is
just a circle... we can have all the views of it. We can have a storyboard
view. We can even publish it to our website. Fully end to end for just the one
simplest thing possible."*

Where the component-proposal report and the spike disagree, **the spike wins**
— it actually ran, the proposal didn't. Where recon found real code, this spec
reuses it and names the file. Where the proposal's aspirational future props
(`polarity`, `diameter` override, `hitRadius`, `visible`) don't exist on the
real `Port` component today, this spec does not invent them — see §9.

---

## 0. What already exists, frozen, do not touch

The T0 spike (commit `18372e9`, branch `claude/port-t0`, already in this
worktree) proved the three-host mechanism end to end and its scaffolding is
kept as-is. **No lane in this spec edits any of these files.** If your lane
seems to need to, stop — you've misread your boundary.

- `apps/storybook/.storybook/main.ts`
- `apps/storybook/.storybook/preview.tsx`
- `apps/storybook/.storybook/preview.css`
- `apps/storybook/tsconfig.json`
- `demos/story-hosts/**` (`DomHost.tsx`, `ReactFlowHost.tsx`, `TldrawHost.tsx`, `index.ts`, `package.json`, `tsconfig.json`)
- `pnpm-workspace.yaml`'s existing lines (one new line is added, see Lane I)
- `registry.json`, `public/r/**` — see §9, this is a deliberate T0 non-goal
- `packages/inspector/**` — SystemSketch's tldraw-only styling-lab inspector.
  It also has a type called `FieldSpec` (`packages/inspector/src/inspector/inspectorModel.ts:378`).
  **That is a name collision, not a relationship.** It is Editor-coupled,
  lives in a different package, and T0 does not read, import, or extend it.
- `apps/playground/**` — the existing tldraw-editor product surface and its
  `@bbox-ui/inspector`-based `StylePanel`. T0's product inspector (§6) is a
  new, separate, minimal demo — not a retrofit of this file.
- `apps/storybook/src/stories/Port.stories.tsx`'s *spike* content is replaced
  by Lane T below — that one file is not frozen, everything else in this list is.

No plumbing lane is needed. `pnpm-workspace.yaml` uses `packages/*` as a glob
(`packages/schema` is picked up automatically) and an explicit list for
`demos/*` (one new line, owned solely by Lane I, below). No other shared root
file — root `package.json`, `tsconfig.base.json`, `registry.json` — is edited
by any lane.

---

## 1. File manifest

One row per file. **Lane** is the sole owner — no two lanes touch the same
path. Lanes S/F/T/I have no file overlap and can run fully in parallel; V and
P read the artifacts the others produce, so run them after.

| Path | Lane | New/Edit | Purpose |
|---|---|---|---|
| `packages/schema/package.json` | **S** schema | new | `@bbox-ui/schema` — zero deps |
| `packages/schema/tsconfig.json` | **S** | new | extends `tsconfig.base.json` |
| `packages/schema/src/field.ts` | **S** | new | `FieldSpec`, `FieldReading`, `MIXED`, `readFields` |
| `packages/schema/src/storybook.ts` | **S** | new | `toArgTypes`, `defaultArgs` |
| `packages/schema/src/index.ts` | **S** | new | re-exports |
| `packages/schema/test/field.test.ts` | **S** | new | `readFields`/`MIXED` unit tests |
| `packages/schema/test/storybook.test.ts` | **S** | new | `toArgTypes`/`defaultArgs` unit tests |
| `packages/bbox-ui/src/port.fields.ts` | **F** port-fields | new | `PORT_FIELDS` — see §3 |
| `packages/bbox-ui/src/index.ts` | **F** | edit | add `export * from "./port.fields";` |
| `packages/bbox-ui/package.json` | **F** | edit | add `"@bbox-ui/schema": "workspace:*"` dependency |
| `packages/bbox-ui/test/port.fields.test.ts` | **F** | new | pins `PORT_FIELDS` against `port.tsx`'s real defaults |
| `apps/storybook/src/stories/Port.stories.tsx` | **T** stories | edit (replace spike content) | full story set, see §4 |
| `apps/storybook/package.json` | **T** | edit | add `"@bbox-ui/schema": "workspace:*"` dependency |
| `pnpm-workspace.yaml` | **I** product-inspector | edit | add one line: `- demos/port-inspector` |
| `demos/port-inspector/package.json` | **I** | new | `demo-port-inspector` (unscoped runnable leaf) |
| `demos/port-inspector/vite.config.ts` | **I** | new | port 5421, `--strictPort` |
| `demos/port-inspector/tsconfig.json` | **I** | new | extends base |
| `demos/port-inspector/index.html` | **I** | new | Vite entry |
| `demos/port-inspector/src/main.tsx` | **I** | new | React root |
| `demos/port-inspector/src/index.css` | **I** | new | Tailwind + theme import |
| `demos/port-inspector/src/PortInspectorPanel.tsx` | **I** | new | the product-side inspector, see §6 |
| `demos/port-inspector/src/App.tsx` | **I** | new | 2 Ports + selection + the panel |
| `apps/storybook/scripts/verify-hosts.mjs` | **V** verify | new | CDP proof, 3 hosts, see §8 |
| `demos/port-inspector/scripts/verify-inspector.mjs` | **V** | new | CDP proof, mixed values |
| `.github/workflows/pages.yml` | **P** publish | new | builds + deploys Storybook to Pages |

Run order: **S, F, T, I in parallel** (every name they need from each other is
pinned below, not discovered by reading each other's code). **V** and **P**
start once S/F/T/I are present in the tree — they drive built artifacts, not
pinned types.

---

## 2. The schema contract — `packages/schema`, verbatim

`packages/schema/src/field.ts`:

```ts
/**
 * @bbox-ui/schema — packages/schema/src/field.ts
 *
 * Zero dependencies. No React, no host engine, no tldraw, no Storybook.
 * A FieldSpec is the DECLARATION half of a controllable prop: everything a
 * panel needs to know to draw a control, before any subject (a component
 * instance, a shape, a selection) exists to read a value from.
 *
 * WHY split from the value: component-proposal Section 4, Option E — the
 * declaration is portable and static (exactly the shape Storybook's
 * `argTypes` wants); the value is per-subject and can disagree across a
 * multi-selection (`MIXED`). Conflating them is what made
 * `packages/inspector`'s `FieldSpec` (SystemSketch's tldraw-only inspector,
 * a different package, unrelated to this one beyond the coincidental name)
 * impossible to reuse outside a live tldraw Editor. This package never
 * imports an engine, so it structurally cannot make that mistake.
 */

export type FieldKind = "segments" | "number" | "toggle" | "text";

export type FieldValue = string | number | boolean;

export interface FieldOption {
  /** The literal prop value this option sets. */
  value: string;
  /** What a control (a segmented row, a select) prints for it. */
  label: string;
}

export interface FieldSpec<TValue = FieldValue> {
  /**
   * Must equal the real component prop name it describes. `readFields` and
   * `toArgTypes` both key off this string directly — there is no separate
   * id-to-prop mapping table to keep in sync.
   */
  id: string;
  /** Human caption for a panel row. */
  label: string;
  kind: FieldKind;
  /**
   * The value this field reads as when a subject does not specify it, and
   * what an empty selection (§ readFields) reads as. For a component prop
   * with a real default (e.g. `Port`'s `state = "empty"`), this MUST equal
   * that default — `port.fields.test.ts` pins it.
   */
  defaultValue: TValue;
  /** Required when `kind === "segments"`; the field's exhaustive value set, in display order. */
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
}

/**
 * Sentinel meaning "the subjects disagree" — tldraw's own `SharedStyle`
 * draws exactly this distinction (`{type: 'shared'}` vs `{type: 'mixed'}`)
 * for a multi-shape selection; this is that idea with zero tldraw import.
 */
export const MIXED = Symbol("bbox-ui/schema/mixed");
export type Mixed = typeof MIXED;

export interface FieldReading<TValue = FieldValue> {
  field: FieldSpec<TValue>;
  /** The field's value across every subject, or `MIXED` when subjects disagree. */
  value: TValue | Mixed;
}

/**
 * The reading side. `subjects` are plain prop bags (a component's own
 * `props`, a tldraw shape's `props`, anything keyed like React props) —
 * never an Editor, never a shape record. One reading per field, in the
 * same order `fields` was given. Zero subjects reads as each field's own
 * `defaultValue`, never `MIXED` — an empty selection is not disagreement.
 */
export function readFields<TProps extends Record<string, unknown>>(
  fields: FieldSpec[],
  subjects: TProps[],
): FieldReading[] {
  return fields.map((field) => {
    if (subjects.length === 0) {
      return { field, value: field.defaultValue };
    }
    const values = subjects.map((subject) => {
      const raw = subject[field.id];
      return raw === undefined ? field.defaultValue : (raw as FieldValue);
    });
    const [first, ...rest] = values;
    const agree = rest.every((value) => value === first);
    return { field, value: agree ? first : MIXED };
  });
}
```

`packages/schema/src/storybook.ts`:

```ts
/**
 * @bbox-ui/schema — packages/schema/src/storybook.ts
 *
 * 2 pure functions, unit-testable, no Storybook import. `toArgTypes` and
 * `defaultArgs` turn a `FieldSpec[]` into the two halves of a Storybook CSF
 * `Meta`: `argTypes` (how Controls draws each row) and `args` (what a story
 * renders with when it does not override a field).
 */

import type { FieldKind, FieldSpec, FieldValue } from "./field";

const CONTROL: Record<FieldKind, "select" | "number" | "boolean" | "text"> = {
  segments: "select",
  number: "number",
  toggle: "boolean",
  text: "text",
};

export interface StorybookArgType {
  name: string;
  description?: string;
  control: "select" | "number" | "boolean" | "text";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

/** One entry per field, keyed by `field.id` — matches a CSF `Meta.argTypes`. */
export function toArgTypes(fields: FieldSpec[]): Record<string, StorybookArgType> {
  const result: Record<string, StorybookArgType> = {};
  for (const field of fields) {
    result[field.id] = {
      name: field.label,
      description: field.hint,
      control: CONTROL[field.kind],
      options: field.options?.map((option) => option.value),
      min: field.min,
      max: field.max,
      step: field.step,
    };
  }
  return result;
}

/** One entry per field, keyed by `field.id` — matches a CSF `Meta.args`. */
export function defaultArgs(fields: FieldSpec[]): Record<string, FieldValue> {
  const result: Record<string, FieldValue> = {};
  for (const field of fields) {
    result[field.id] = field.defaultValue;
  }
  return result;
}
```

`packages/schema/src/index.ts`:

```ts
export * from "./field";
export * from "./storybook";
```

`packages/schema/package.json`:

```json
{
  "name": "@bbox-ui/schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "FieldSpec/FieldReading — the declaration/value split behind every bbox-ui control surface (Storybook argTypes, the product inspector). Zero dependencies: no React, no host engine, no Storybook.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/schema/test/field.test.ts` (full):

```ts
import { describe, expect, it } from "vitest";
import { MIXED, readFields, type FieldSpec } from "../src/field";

const FIELDS: FieldSpec[] = [
  {
    id: "state",
    label: "State",
    kind: "segments",
    defaultValue: "empty",
    options: [
      { value: "empty", label: "Empty" },
      { value: "wired", label: "Wired" },
    ],
  },
  { id: "label", label: "Label", kind: "text", defaultValue: "Port" },
];

describe("readFields", () => {
  it("reads defaultValue for every field with zero subjects", () => {
    const readings = readFields(FIELDS, []);
    expect(readings).toEqual([
      { field: FIELDS[0], value: "empty" },
      { field: FIELDS[1], value: "Port" },
    ]);
  });

  it("reads the shared value when every subject agrees", () => {
    const readings = readFields(FIELDS, [{ state: "wired" }, { state: "wired" }]);
    expect(readings[0].value).toBe("wired");
  });

  it("reads MIXED the instant subjects disagree", () => {
    const readings = readFields(FIELDS, [{ state: "wired" }, { state: "empty" }]);
    expect(readings[0].value).toBe(MIXED);
  });

  it("falls back to defaultValue per-subject when a subject omits the key", () => {
    const readings = readFields(FIELDS, [{ state: "empty" }, {}]);
    // {} reads as "empty" (the field default) too, so both subjects agree.
    expect(readings[0].value).toBe("empty");
  });

  it("a single subject can never read MIXED", () => {
    const readings = readFields(FIELDS, [{ state: "wired" }]);
    expect(readings[0].value).not.toBe(MIXED);
  });
});
```

`packages/schema/test/storybook.test.ts` (full):

```ts
import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "../src/storybook";
import type { FieldSpec } from "../src/field";

const FIELDS: FieldSpec[] = [
  {
    id: "state",
    label: "State",
    kind: "segments",
    defaultValue: "empty",
    options: [
      { value: "empty", label: "Empty" },
      { value: "wired", label: "Wired" },
    ],
    hint: "test hint",
  },
  { id: "count", label: "Count", kind: "number", defaultValue: 1, min: 0, max: 10, step: 1 },
  { id: "visible", label: "Visible", kind: "toggle", defaultValue: true },
  { id: "label", label: "Label", kind: "text", defaultValue: "Port" },
];

describe("toArgTypes", () => {
  it("maps every FieldKind to the matching Storybook control", () => {
    const argTypes = toArgTypes(FIELDS);
    expect(argTypes.state.control).toBe("select");
    expect(argTypes.count.control).toBe("number");
    expect(argTypes.visible.control).toBe("boolean");
    expect(argTypes.label.control).toBe("text");
  });

  it("carries options, min/max/step and the hint through", () => {
    const argTypes = toArgTypes(FIELDS);
    expect(argTypes.state.options).toEqual(["empty", "wired"]);
    expect(argTypes.state.description).toBe("test hint");
    expect(argTypes.count).toMatchObject({ min: 0, max: 10, step: 1 });
  });
});

describe("defaultArgs", () => {
  it("is keyed by field id, one entry per field", () => {
    expect(defaultArgs(FIELDS)).toEqual({
      state: "empty",
      count: 1,
      visible: true,
      label: "Port",
    });
  });
});
```

---

## 3. `port.fields.ts`, in full

`packages/bbox-ui/src/port.fields.ts` — the actual field declarations for
`Port`'s five REAL props (`state`, `size`, `textLayout`, `textSize`,
`children`), derived from the real enumerations in `./layout.ts`. This does
**not** include `polarity`, a numeric `diameter` override, `hitRadius`, or a
`visible` boolean — none of those exist on the real `Port` component
(`port.tsx`) today; they were the component-proposal's Section 3 gallery
sketch of a *future* Port. Adding fields for props the component doesn't have
would make this file lie the moment someone reads it next to `port.tsx`. See
§9.

```ts
/**
 * packages/bbox-ui/src/port.fields.ts
 *
 * `Port`'s controllable props as data — the declaration half of the
 * schema-driven loop (T0). Every `id` below is a REAL `PortProps` key (see
 * `./port.tsx`); `readFields`/`toArgTypes` look subjects up by that key
 * directly, so there is no separate id-to-prop mapping to keep in sync.
 * Every enum and default mirrors `./layout.ts` — this file adds no new
 * vocabulary, it only describes the vocabulary that already exists.
 *
 * WHY these five fields only: the component-proposal's Section 3 gallery
 * sketched a richer future Port (`diameter` override, `hitRadius`,
 * `polarity`, `visible`) — none of those props exist on the real `Port`
 * component today. T0 describes the component that exists, not the one
 * imagined; see docs/T0-SPEC.md §9 for the explicit scope cut.
 */
import type { FieldOption, FieldSpec } from "@bbox-ui/schema";

import {
  PORT_DIAMETERS,
  PORT_STATE_LABELS,
  PORT_STATES,
  PORT_TEXT_LAYOUTS,
  TEXT_SIZE_NAMES,
  TEXT_SIZES,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "./layout";

const STATE_OPTIONS: FieldOption[] = PORT_STATES.map((state) => ({
  value: state,
  label: PORT_STATE_LABELS[state as PortState],
}));

const SIZE_OPTIONS: FieldOption[] = (Object.keys(PORT_DIAMETERS) as PortSize[]).map(
  (size) => ({ value: size, label: `${size} · ${PORT_DIAMETERS[size]}px` }),
);

/**
 * Board labels (see `layout.ts`'s own `PortTextLayout` comment: "Top",
 * "Bot", "Right", "Left", "Right (Offset)", "Left Offset"). No exported
 * labels record exists there yet, so this is the one place that names them
 * for a panel.
 */
const TEXT_LAYOUT_LABELS: Record<PortTextLayout, string> = {
  top: "Top",
  bot: "Bot",
  right: "Right",
  left: "Left",
  "right-offset": "Right (Offset)",
  "left-offset": "Left Offset",
};

const TEXT_LAYOUT_OPTIONS: FieldOption[] = PORT_TEXT_LAYOUTS.map((layout) => ({
  value: layout,
  label: TEXT_LAYOUT_LABELS[layout],
}));

const TEXT_SIZE_OPTIONS: FieldOption[] = (Object.keys(TEXT_SIZES) as TextSize[]).map(
  (size) => ({ value: size, label: TEXT_SIZE_NAMES[size] }),
);

/**
 * `Port`'s five controllable props, in the order a panel should draw them.
 * Every `defaultValue` equals that prop's real default in `port.tsx` —
 * `test/port.fields.test.ts` pins this so the two files cannot drift.
 */
export const PORT_FIELDS: FieldSpec[] = [
  {
    id: "state",
    label: "State",
    kind: "segments",
    defaultValue: "empty",
    options: STATE_OPTIONS,
    hint: "`received` is runtime-only — never persisted (see PERSISTABLE_PORT_STATES).",
  },
  {
    id: "size",
    label: "Size",
    kind: "segments",
    defaultValue: "md",
    options: SIZE_OPTIONS,
  },
  {
    id: "textLayout",
    label: "Text Layout",
    kind: "segments",
    defaultValue: "right",
    options: TEXT_LAYOUT_OPTIONS,
  },
  {
    id: "textSize",
    label: "Text Size",
    kind: "segments",
    defaultValue: "md",
    options: TEXT_SIZE_OPTIONS,
  },
  {
    id: "children",
    label: "Label",
    kind: "text",
    defaultValue: "Port",
    hint: "The text slot. Empty renders the bare dot — see the `NoLabel` story.",
  },
];
```

Companion edits (same lane, same file set as §1):

`packages/bbox-ui/src/index.ts` gains one line, appended after the existing
`export * from "./port";`:

```ts
export * from "./port.fields";
```

`packages/bbox-ui/package.json`'s `"dependencies"` gains:

```json
"@bbox-ui/schema": "workspace:*"
```

`packages/bbox-ui/test/port.fields.test.ts` (full):

```ts
import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { PORT_FIELDS } from "../src/port.fields";

describe("PORT_FIELDS", () => {
  it("has exactly Port's five real props, in panel order", () => {
    expect(PORT_FIELDS.map((f) => f.id)).toEqual([
      "state",
      "size",
      "textLayout",
      "textSize",
      "children",
    ]);
  });

  it("defaultArgs matches Port's actual default props (port.tsx's own destructuring)", () => {
    expect(defaultArgs(PORT_FIELDS)).toEqual({
      state: "empty",
      size: "md",
      textLayout: "right",
      textSize: "md",
      children: "Port",
    });
  });

  it("state carries all four real PortState values, including runtime-only `received`", () => {
    const state = PORT_FIELDS.find((f) => f.id === "state")!;
    expect(state.options?.map((o) => o.value)).toEqual(["empty", "default", "wired", "received"]);
  });

  it("size carries the three real PORT_DIAMETERS keys", () => {
    const size = PORT_FIELDS.find((f) => f.id === "size")!;
    expect(size.options?.map((o) => o.value)).toEqual(["sm", "md", "lg"]);
  });

  it("textLayout carries all six real PORT_TEXT_LAYOUTS values", () => {
    const layout = PORT_FIELDS.find((f) => f.id === "textLayout")!;
    expect(layout.options?.map((o) => o.value)).toEqual([
      "top",
      "bot",
      "right",
      "left",
      "right-offset",
      "left-offset",
    ]);
  });

  it("toArgTypes produces a select control for every segments field", () => {
    const argTypes = toArgTypes(PORT_FIELDS);
    expect(argTypes.state.control).toBe("select");
    expect(argTypes.size.control).toBe("select");
    expect(argTypes.textLayout.control).toBe("select");
    expect(argTypes.textSize.control).toBe("select");
    expect(argTypes.children.control).toBe("text");
  });
});
```

---

## 4. The story set

`apps/storybook/src/stories/Port.stories.tsx` — full replacement of the
spike's content:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  Port,
  PORT_FIELDS,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T0: Port, end to end. `argTypes`/`args` below are GENERATED from
 * `PORT_FIELDS` (packages/bbox-ui/src/port.fields.ts) — the SAME array
 * `PortInspectorPanel` (demos/port-inspector) reads with `readFields`. Add
 * a field there and both surfaces pick it up; nothing here is kept in sync
 * by hand.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every future schema-driven component
 * shares — one degree looser than `Port`'s own literal-union prop types.
 * `port.fields.test.ts` is what actually proves the values line up.
 */
const meta = {
  title: "T0 Spike/Port",
  component: Port,
  args: defaultArgs(PORT_FIELDS) as Partial<ComponentProps<typeof Port>>,
  argTypes: toArgTypes(PORT_FIELDS),
} satisfies Meta<typeof Port>;

export default meta;

type Story = StoryObj<typeof meta>;

const STATE_FIELD = PORT_FIELDS.find((f) => f.id === "state")!;
const SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "size")!;
const LAYOUT_FIELD = PORT_FIELDS.find((f) => f.id === "textLayout")!;
const TEXT_SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "textSize")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Click the painted dot —
 * reachable whether this DOM node sits three frameworks deep (plain div,
 * a React Flow node, a tldraw HTMLContainer shape) by the time this runs —
 * then assert the label text and the dot's `data-state` both match the
 * args this story was actually rendered with, in whichever host is active.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dot = canvasElement.querySelector('[data-slot="port-dot"]');
    if (!(dot instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="port-dot"] element in the DOM');
    }
    await userEvent.click(dot);
    await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    await expect(dot.getAttribute("data-state")).toBe(args.state);
  },
};

/** Every real PortState, side by side — including runtime-only `received`. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {STATE_FIELD.options!.map((option) => (
        <Port key={option.value} state={option.value as PortState}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/** Every real PortSize (the three diameters — 14 / 25 / 36px). */
export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {SIZE_FIELD.options!.map((option) => (
        <Port key={option.value} state="wired" size={option.value as PortSize}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/** Every real PortTextLayout (top/bot/right/left/right-offset/left-offset). */
export const AllTextLayouts: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: 24 }}>
      {LAYOUT_FIELD.options!.map((option) => (
        <Port key={option.value} state="default" textLayout={option.value as PortTextLayout}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/** Every real TextSize rung (md/lg/xl). */
export const AllTextSizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {TEXT_SIZE_FIELD.options!.map((option) => (
        <Port key={option.value} state="wired" textSize={option.value as TextSize}>
          {option.label}
        </Port>
      ))}
    </div>
  ),
};

/**
 * The closest real analog to "hidden": `Port` has no `visible` prop today
 * (docs/T0-SPEC.md §9) — omitting `children` is the one real way to get
 * the bare dot with nothing else painted.
 */
export const NoLabel: Story = {
  args: { children: undefined },
};
```

Six named exports, exactly: `Primary` (carries the play function), `AllStates`,
`AllSizes`, `AllTextLayouts`, `AllTextSizes`, `NoLabel`.

`apps/storybook/package.json`'s `"dependencies"` gains:

```json
"@bbox-ui/schema": "workspace:*"
```

---

## 5. The three-host decorator — spike wins, unchanged

The spike's config is the final config. It is not modified by any T0 lane
(see §0). For completeness, this is what is already committed and already
proven (screenshots inspected, play function sabotage-tested):

- `apps/storybook/.storybook/preview.tsx` declares a Storybook global named
  `host` with a toolbar dropdown (`dom` / `reactflow` / `tldraw`,
  `dynamicTitle: true`, `initialGlobals: { host: "dom" }`) and one decorator
  (`withHost`) that reads `context.globals.host`, looks it up in a
  `HOSTS = { dom: DomHost, reactflow: ReactFlowHost, tldraw: TldrawHost }`
  map, and wraps the `Story` in it with `key={hostName}` (forcing a full
  remount on switch, so no stale Editor/ReactFlow instance survives a host
  change).
- The three host components live in `demos/story-hosts/src/` (package
  `@bbox-ui/story-hosts`) — never in `packages/bbox-ui`, per the
  component-proposal's Section 5 rule, which the spike deliberately tested.
- `TldrawHost.tsx`'s one non-obvious piece of wiring: the story's content
  rides a plain `React.Context` (`StoryContentContext`), not a persisted
  shape prop — a custom `ShapeUtil.component()` is a normal function
  component in the SAME React tree `<Tldraw>` renders, so `useContext`
  reaches straight through. Only `{w, h}` is real, persisted shape state.

No fallback is specified because the spike did not fail on tldraw (or on any
host) — screenshots for `dom`, `reactflow`, and `tldraw` were all inspected
and none was blank. If a T0 implementer finds this config broken against a
newer `tldraw`/`storybook` version, that is a regression to fix in place, not
a reason to redesign the mechanism — file a `docs/bugs/` record per this
repo's convention (`CLAUDE.md`) rather than reinventing this section.

---

## 6. The product inspector

**Package/location:** a new, separate demo — `demos/port-inspector/` (Lane I)
— not `apps/playground` (the existing tldraw-editor product surface, whose
`@bbox-ui/inspector` `StylePanel` is a different, tldraw-coupled, many-field
system for Block/paint-overrides that has nothing to do with `Port`). Keeping
this new and separate avoids any file conflict with other in-flight
`apps/playground` work and keeps T0 honestly scoped to Port alone.

**Reused as-is:** `PORT_FIELDS` from `@bbox-ui/core` and `readFields`/`MIXED`
from `@bbox-ui/schema` — the exact same array and reading function §2–§3
define, zero forking.

**Written new:** `demos/port-inspector/src/PortInspectorPanel.tsx`, a
from-scratch minimal panel (no reuse of `packages/inspector`'s `Inspector`
component — that component is Editor-coupled and designed for a ~70-row,
10-group, override-aware model that does not apply to a 5-field
presentational component). It renders one row per `FieldReading`: a
segmented button row for `kind: "segments"`, a text input for
`kind: "text"`, and a `Mixed` badge (plus a blanked control) whenever
`reading.value === MIXED`.

**How it differs from Storybook's Controls, concretely:**

| | Storybook Controls | `PortInspectorPanel` |
|---|---|---|
| Subject count | exactly 1 (the current story's `args`) | N (`subjects: PortSubject[]`) |
| Disagreement | impossible — one subject can't disagree with itself | shows `Mixed` the instant 2+ selected subjects differ on a field |
| Write | `updateArgs` rewrites the one story's args | writing a field applies it to every *selected* subject at once |
| Overridden-vs-inherited | N/A in either surface | **out of scope for T0** — that concept belongs to `packages/inspector`'s paint-override system (a different, tldraw-only mechanism); `Port` has no override layer, so this row type is not built |

`demos/port-inspector/src/PortInspectorPanel.tsx` (full):

```tsx
import type { CSSProperties } from "react";
import { MIXED, readFields } from "@bbox-ui/schema";
import { PORT_FIELDS } from "@bbox-ui/core";

export interface PortSubject {
  id: string;
  props: Record<string, unknown>;
}

export interface PortInspectorPanelProps {
  subjects: PortSubject[];
  onChange: (fieldId: string, value: string) => void;
}

/**
 * The "product inspector" half of T0's loop: the SAME `PORT_FIELDS` array
 * Storybook's Controls addon reads (via `toArgTypes`), read here with
 * `readFields` instead — proving the thing Controls structurally cannot
 * show: N subjects at once, with a row reading "Mixed" the instant they
 * disagree.
 */
export function PortInspectorPanel({ subjects, onChange }: PortInspectorPanelProps) {
  const readings = readFields(
    PORT_FIELDS,
    subjects.map((subject) => subject.props),
  );

  return (
    <div data-slot="port-inspector" style={panelStyle}>
      <div data-slot="port-inspector-header" style={headerStyle}>
        {subjects.length === 0
          ? "No port selected"
          : `${subjects.length} port${subjects.length > 1 ? "s" : ""} selected`}
      </div>
      {readings.map((reading) => {
        const isMixed = reading.value === MIXED;
        return (
          <div
            key={reading.field.id}
            data-slot="port-inspector-row"
            data-field={reading.field.id}
            data-mixed={isMixed}
            style={rowStyle}
          >
            <span style={labelStyle}>{reading.field.label}</span>
            {reading.field.kind === "segments" ? (
              <div style={segmentsStyle}>
                {reading.field.options?.map((option) => {
                  const active = !isMixed && reading.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-selected={active}
                      onClick={() => onChange(reading.field.id, option.value)}
                      style={segmentButtonStyle(active)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                value={isMixed ? "" : String(reading.value)}
                placeholder={isMixed ? "Mixed" : undefined}
                onChange={(event) => onChange(reading.field.id, event.target.value)}
                style={textInputStyle}
              />
            )}
            {isMixed && (
              <span data-slot="port-inspector-mixed" style={mixedBadgeStyle}>
                Mixed
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 260,
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  fontFamily: "sans-serif",
  fontSize: 13,
};
const headerStyle: CSSProperties = { fontWeight: 600, color: "#666" };
const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const labelStyle: CSSProperties = { fontWeight: 500 };
const segmentsStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap" };
const textInputStyle: CSSProperties = { padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 };
const mixedBadgeStyle: CSSProperties = { fontSize: 11, color: "#b45309" };

function segmentButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: 4,
    border: selected ? "1px solid #111" : "1px solid #ccc",
    background: selected ? "#111" : "white",
    color: selected ? "white" : "#111",
    cursor: "pointer",
  };
}
```

`demos/port-inspector/src/App.tsx` (full — 2 real Ports, a selection
checkbox each, the panel wired to write to every selected subject at once):

```tsx
import { useState } from "react";
import { Port, type PortProps } from "@bbox-ui/core";
import { PortInspectorPanel, type PortSubject } from "./PortInspectorPanel";

interface PortInstance {
  id: string;
  selected: boolean;
  props: Record<string, unknown>;
}

const INITIAL: PortInstance[] = [
  {
    id: "a",
    selected: true,
    props: { state: "empty", size: "md", textLayout: "right", textSize: "md", children: "Port A" },
  },
  {
    id: "b",
    selected: true,
    props: { state: "wired", size: "md", textLayout: "right", textSize: "md", children: "Port B" },
  },
];

export default function App() {
  const [ports, setPorts] = useState<PortInstance[]>(INITIAL);
  const selected: PortSubject[] = ports
    .filter((port) => port.selected)
    .map((port) => ({ id: port.id, props: port.props }));

  function toggleSelected(id: string) {
    setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  }

  function applyToSelected(fieldId: string, value: string) {
    setPorts((prev) =>
      prev.map((p) => (p.selected ? { ...p, props: { ...p.props, [fieldId]: value } } : p)),
    );
  }

  return (
    <div data-slot="port-inspector-demo" style={{ display: "flex", gap: 32, padding: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {ports.map((port) => (
          <label
            key={port.id}
            data-slot="port-instance"
            data-port-id={port.id}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <input type="checkbox" checked={port.selected} onChange={() => toggleSelected(port.id)} />
            <Port {...(port.props as PortProps)}>{String(port.props.children)}</Port>
          </label>
        ))}
      </div>
      <PortInspectorPanel subjects={selected} onChange={applyToSelected} />
    </div>
  );
}
```

(The `port.props as PortProps` cast is deliberate and confined to this demo
file — `PortInstance.props` is intentionally a loose bag so
`PortInspectorPanel`/`readFields` can treat it generically; production code
driven by real selections would carry a real, narrower type per host.)

Remaining files for this lane — `package.json`, `vite.config.ts`,
`tsconfig.json`, `index.html`, `src/main.tsx`, `src/index.css` — copy the
exact shape `demos/reactflow/` already uses (React + `@tailwindcss/vite`,
`@import "tailwindcss"; @import "@bbox-ui/core/theme.css";`), on port `5421`
with `--strictPort`:

`demos/port-inspector/package.json`:

```json
{
  "name": "demo-port-inspector",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "T0: PORT_FIELDS driving a hand-rolled product-side inspector panel — multi-select and mixed values, the thing Storybook's Controls addon cannot show.",
  "scripts": {
    "dev": "vite --port 5421 --strictPort",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@bbox-ui/core": "workspace:*",
    "@bbox-ui/schema": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

`demos/port-inspector/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5421, strictPort: true },
});
```

`demos/port-inspector/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`demos/port-inspector/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>bbox-ui — Port inspector demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`demos/port-inspector/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`demos/port-inspector/src/index.css`:

```css
@import "tailwindcss";
@import "@bbox-ui/core/theme.css";
```

`pnpm-workspace.yaml` gains one line under `packages:` (Lane I is the sole
owner of this edit; no other lane touches this file, so it does not need its
own "plumbing" lane):

```yaml
  - demos/port-inspector
```

---

## 7. Publish

**Mechanism:** GitHub Pages, `build_type: workflow` (GitHub's official
Actions-based Pages flow — `actions/upload-pages-artifact` +
`actions/deploy-pages`), building `apps/storybook`'s static output. Recon
confirmed: repo is public (`zacharyyamaoka/bbox-ui`), `gh` is authenticated
with `repo`+`workflow` scopes and `viewerCanAdminister: true`, and Pages is
currently **not** configured (`gh api repos/.../pages` → 404) — nothing to
undo, this is a clean first setup.

**Reconciling "publish it" with "don't merge without being asked"**
(standing git-workflow policy): the workflow triggers on `push: branches:
[main]` **and** `workflow_dispatch`. `build_type: workflow` Pages deploys
whatever artifact the triggering run uploads, regardless of which ref ran
it — so the first publish can be triggered with `workflow_dispatch` directly
on `claude/port-t0`, with **no merge to `main` required**. Merging to `main`
later just means future pushes redeploy automatically; that merge decision
is still Zach's, unchanged by this lane landing.

`.github/workflows/pages.yml` (full):

```yaml
name: Deploy Storybook to Pages

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.5.3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter bbox-storybook run build-storybook
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/storybook/storybook-static

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**One-time repo action (not a file — run once, with the already-authenticated
`gh`):**

```bash
gh api --method POST repos/zacharyyamaoka/bbox-ui/pages -f build_type=workflow
```

Idempotent in effect: a second call 422s ("Pages already enabled") — treat
that as success, not a failure.

**Then, to actually publish without merging:**

```bash
gh workflow run pages.yml --ref claude/port-t0
```

**Flag for Zach, no browser click needed by default:** if the `gh api` call
above is refused (an org policy blocking Pages, an unexpected permission
gap), the fallback needs one browser click and must be named as such in the
handoff: *Settings → Pages → Build and deployment → Source: GitHub Actions*,
on `https://github.com/zacharyyamaoka/bbox-ui/settings/pages`. Do not attempt
to script around a refusal — surface it.

---

## 8. Definition of done

Every command must exit 0; every observation must hold. Run in this order.

1. `pnpm --filter @bbox-ui/schema run typecheck` — exit 0.
2. `pnpm --filter @bbox-ui/schema run test` — exit 0 (`field.test.ts` + `storybook.test.ts`).
3. `pnpm --filter @bbox-ui/core run typecheck` — exit 0 (now includes `port.fields.ts`).
4. `pnpm --filter @bbox-ui/core run test` — exit 0; existing `layout.test.ts`/`blockLayout.test.ts` still pass unchanged, alongside new `port.fields.test.ts`.
5. `pnpm --filter bbox-storybook run typecheck` — exit 0.
6. `pnpm --filter @bbox-ui/story-hosts run typecheck` — exit 0 (unchanged from the spike).
7. `pnpm --filter demo-port-inspector run typecheck` — exit 0.
8. `pnpm run build` (root) — exit 0. Observation: `git status --porcelain registry.json public/r` is **empty** — T0 touches neither (§9).
9. `pnpm run test` (root, `-r`) — exit 0 across every package, `tests/test_report_weight.py`-equivalent guards notwithstanding (there are none in this repo) and including the untouched `registrySnapshot.test.ts`.
10. `pnpm --filter bbox-storybook run storybook` — serves on `:5420`. Observation: `curl -sI http://127.0.0.1:5420` returns `200`.
11. `node apps/storybook/scripts/verify-hosts.mjs` — exit 0. Observations: for each of `dom`/`reactflow`/`tldraw`, a `[data-slot="port-dot"]` paints with `data-state` matching the story's `state` arg; changing that arg (the same value Controls writes on every edit) repaints the same element without a reload; the `tldraw` run shows real chrome (`.tl-container`/`.tlui-toolbar`), the `reactflow` run shows a real `.react-flow` canvas — neither is a blank stub.
12. `pnpm --filter demo-port-inspector run dev` — serves on `:5421`.
13. `node demos/port-inspector/scripts/verify-inspector.mjs` — exit 0. Observations: two subjects with differing `state` selected together render the state row as `Mixed` (`data-mixed="true"`); editing that row writes the new value to **both** selected subjects' dots; a single selection never shows `Mixed` on any field. **This, together with #11, is the "Storybook Controls and the demo inspector do the identical thing to the port's state prop, in all three hosts" proof** — #11 proves the arg-driven path across all three hosts, #13 proves the multi-subject path Controls cannot represent, and both drive the identical `Port`/`PORT_FIELDS` code, not parallel reimplementations.
14. `pnpm --filter bbox-storybook run build-storybook` — exit 0; `apps/storybook/storybook-static/iframe.html` exists.
15. `gh api --method POST repos/zacharyyamaoka/bbox-ui/pages -f build_type=workflow` — exit 0, or a 422 meaning it's already enabled.
16. `gh workflow run pages.yml --ref claude/port-t0` then `gh run watch` — completes with success. Observation: `curl -sI https://zacharyyamaoka.github.io/bbox-ui/` returns `200`.
17. All servers/headless Chrome instances started for steps 10–13 and 16 are stopped; `ss -ltnp | grep -E "5420|5421"` returns nothing.

---

## 9. Explicit non-goals

- **`Block`, `TextBox`, `Glyph`** — no other primitive is touched. `Port` only.
- **Presets** — no saved-configuration/variant-preset system.
- **Edges / cables** — no connection, wiring, or edge-drawing work.
- **CodeField integration** — unrelated to this tracer bullet.
- **`polarity`, a numeric `diameter` override, `hitRadius`, a `visible`
  boolean** — none exist on the real `Port` component (`port.tsx`) today.
  These were the component-proposal's Section 3 gallery sketch of a future,
  richer Port. `port.fields.ts` describes the component that exists; adding
  these would require changing `port.tsx` itself, which is out of scope.
  The `NoLabel` story stands in for the closest real edge case to "hidden."
- **shadcn registry distribution of the new packages** — `registry.json` and
  `public/r/**` are **not** edited. `@bbox-ui/schema` and `port.fields.ts`
  are consumed today only via the pnpm workspace, not via `shadcn add`.
  Registry-shippability of the schema layer (how a `FieldSpec` array
  referencing `@bbox-ui/schema` would work for an external, non-monorepo
  consumer) is a real open design question for a later task, not this one.
- **`packages/inspector`** — SystemSketch's tldraw-only styling-lab inspector
  is not read, imported, extended, or renamed, despite the coincidental
  `FieldSpec` name collision (see §0).
- **`apps/playground`** — not modified. The product inspector is a new,
  separate, minimal demo (`demos/port-inspector`), not a retrofit of the
  existing `@bbox-ui/inspector`-based `StylePanel`.
- **"Overridden vs. inherited" reading** — `bbox-ui` components have no
  override/paint layer; the product inspector shows only "the value(s)" or
  `Mixed`, nothing else.
- **`demos/reactflow`, `demos/tldraw`, `demos/scene`, `demos/compare`,
  `demos/compare-view`** — untouched.
- **Merging to `main`** — the publish workflow is triggered via
  `workflow_dispatch` on the feature branch (§7); merging is a separate,
  later, human decision.
- **A numeric `diameter`/`hitRadius` control kind, a `color`/`swatches`/`tiles`
  control kind in `packages/schema`** — `FieldKind` is exactly
  `"segments" | "number" | "toggle" | "text"`; `Port`'s five fields only
  exercise `"segments"` and `"text"`. `"number"`/`"toggle"` are declared now
  (so `toArgTypes`'s mapping table is complete and doesn't need a follow-up
  edit for the next component) but nothing in T0 uses them — that is
  expected, not a gap.
