import type { FieldSpec } from "@bbox-ui/schema";

/** One rendered row: a single field, or a pair that shares a declared group. */
export type FieldRow = FieldSpec | [FieldSpec, FieldSpec];

/**
 * Turns a field array into rows, pairing ONLY fields that declare the same
 * `group`.
 *
 * - A group's members render together at the position of the first one, in
 *   declaration order, even if the array separates them.
 * - A group of two is one row; four is two rows; an odd member is a row of
 *   its own after the pairs. A group never absorbs a neighbour outside it.
 * - Ungrouped fields are one row each — including two adjacent numbers.
 *   That case is the regression this replaced: adjacency used to be the
 *   rule, and it paired RowContainer's height with its gap.
 */
export function groupRows(fields: FieldSpec[]): FieldRow[] {
  const rows: FieldRow[] = [];
  const placed = new Set<string>();

  for (const field of fields) {
    if (placed.has(field.id)) continue;
    if (!field.group) {
      rows.push(field);
      placed.add(field.id);
      continue;
    }
    const members = fields.filter((f) => f.group === field.group && !placed.has(f.id));
    for (const m of members) placed.add(m.id);
    for (let i = 0; i + 1 < members.length; i += 2) rows.push([members[i]!, members[i + 1]!]);
    if (members.length % 2 === 1) rows.push(members[members.length - 1]!);
  }
  return rows;
}
