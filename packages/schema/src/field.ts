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

export type FieldKind = "segments" | "number" | "toggle" | "text" | "flags";

export type FieldValue = string | number | boolean;

export interface FieldOption {
  /** The literal prop value this option sets. */
  value: string;
  /** What a control (a segmented row, a select) prints for it. */
  label: string;
  /** `false` keeps this one option out of "randomise everything" while the
   *  field itself stays in: a Port state of `hidden` is a real, settable
   *  value, and also makes the instance vanish from the bench. */
  randomize?: boolean;
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
  /** Required when `kind === "segments"` or `"flags"`; the field's exhaustive
   *  value set, in display order. */
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  /**
   * Fields sharing a group are declared to belong together, and a panel may
   * render them on one row: Block's width and height, TextBox's four
   * paddings, Stack's gap and gutter.
   *
   * WHY this is declared and not inferred: the first panel to pair fields
   * did it by adjacency — any two consecutive numbers shared a row. That
   * put a container's height beside its gap, which are not a pair, and
   * would have put Pill's line opacity beside its fill opacity had they been
   * neighbours. Figma pairs X with Y because they are one value, not because
   * they are adjacent. A pairing is a fact about the fields, so it lives on
   * the fields. Absent means "own row", which stays the default.
   */
  group?: string;
  /**
   * `false` keeps a field out of "randomise everything". Default true.
   *
   * WHY: Randomize rolled Port's `reveal` to "on hover" and the port
   * vanished from the bench until the pointer found it; Zach, 2026-09-11:
   * "a disproportionate amount seem to disappear". The same goes for every
   * host-computed, never-persisted field (eligible, hinting, dragging,
   * producers): they are not properties a person sets, so a random value
   * for them is noise, not exploration. Declared on the field, next to the
   * hint that already says "never persisted", rather than inferred from it.
   */
  randomize?: boolean;
  /**
   * A field marked `cascades` inherits its value from the nearest ANCESTOR
   * instance whose component declares a field of the same `id`, and relays
   * that value on down to its own descendants in turn. Default false.
   *
   * WHY this lives on the field and not on the instance or the page: which
   * fields cascade (a Frame's `padding`, not a Button's `label`) is a fact
   * about the FIELD's meaning, decided once by whoever authors the
   * component's schema — same footing as `group`/`randomize` above. The
   * page assembling the ancestor chain into an `inherited` bag per subject
   * is a layout-time computation; this module only RESOLVES a bag someone
   * else built, exactly as it already resolves a `presets` array someone
   * else built (`resolve.ts`'s own module doc). Declaring it here also
   * means a non-cascading field costs nothing extra to resolve: `resolveField`
   * only looks at the inherited bag at all when this is true.
   */
  cascades?: boolean;
  /**
   * Fields sharing a `section` are declared to belong under the same
   * SUB-HEADER inside one panel — Figma's Position / Layout / Appearance /
   * Fill / Stroke. Absent means the component's own root section.
   *
   * WHY a second declaration beside `group` and not a reuse of it: `group`
   * answers "do these two share a LINE" (width beside height); `section`
   * answers "do these share a HEADING" (width, height, radius and
   * orientation all under Layout). They are independent — Block's
   * width/height are one group inside the Layout section — so one string
   * cannot carry both without meaning different things at different
   * nesting levels.
   *
   * WHY it is called `section` and not `header`, which was Zach's own word
   * (2026-09-12, "I think we need one for like 'header' which allows us to
   * group things under the same sub header"): in this panel "header"
   * already names two other things — the panel's own title bar, and the
   * Block's `header` REGION, which is itself one of the sections this
   * declaration produces. A Bar's fields would then have read
   * `header: "header"`. The word he reached for is the rendered artifact
   * (the sub-header); `section` is the thing being declared.
   *
   * WHY on the field and not a list on the component: same argument
   * `group` already won — a field's section is a fact about that field's
   * meaning, so a component that adds a field gets it placed without a
   * second edit somewhere else that can drift. Section ORDER comes from
   * first appearance in the field array, so declaration order is layout
   * order and there is no list to keep in sync.
   */
  section?: string;
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
