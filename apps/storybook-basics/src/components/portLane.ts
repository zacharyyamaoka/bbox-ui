// src/components/portLane.ts — the multi-line port editor's identity
// reconcile: an LCS-based diff between the lane's before/after line lists
// that decides which port keeps its id across an edit. Adapted from
// SystemSketch's shipped default port editor
// (systemsketch/src/blocks/portLane.ts:102-176, imported at
// BlockInlineEditor.tsx:15 — NOT the other `reconcilePortLane` at
// blocks/babble/portTextShared.ts:186, a babble prototype with a different,
// exact-name-then-ordinal contract and zero importers outside babble/) —
// stripped of the seven concerns this app has no counterpart for:
// BlockShapeProps, header/effect ports, canonicalizeInputPortLinks,
// normalizeBlockPortRows, reconcileEffectPorts, portInHeader/isEffectPort,
// withBlockPortSection, and parsePortSignature/formatPortSignature's
// in_N/out_N id scheme + grammar (docs/PORT-EDGE-PLAN-PHASE4.md §1, D10).
//
// Contract, precisely (phase-4 doc §2 — every row there is this function's
// spec, one edit -> one result):
//   1. LCS over the two line lists, BYTE-IDENTICAL only — a line that
//      survives the diff keeps the SAME port object, by reference.
//   2. The leftover (unmatched) lines on each side are zipped POSITIONALLY
//      — by RANK among leftovers, never by content — which is what keeps
//      an in-place rename's id: the common case, not a special one.
//   3. Anything still unmatched mints a fresh port via the caller's own
//      `mintItem` (D9: id minting is host-owned and ids are opaque — this
//      module never invents one).
//
// D10: `label` IS the raw line — no grammar, no re-parse, no
// canonicalisation. The round trip (`formatPortLane` -> edit ->
// `reconcilePortLane`) is therefore exact by construction, which is also
// what makes the no-op case genuinely referentially idempotent (see the
// purity note on `reconcilePortLane` itself).
import type { PortEdgeItem } from "./portEdge";

/**
 * `commonLines` — a standard LCS table (suffix-built, `table[i][j]` = the
 * length of the longest common subsequence of `a[i..]`/`b[j..]`) plus a
 * forward optimal backtrack. The tie-break (`table[i+1][j] >= table[i][j+1]`
 * — prefer advancing `a` over `b` on a tie) is what makes a two-line swap
 * resolve the way a human expects, matching the donor exactly
 * (portLane.ts:62-86).
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function backtrackMatches(a: string[], b: string[], table: number[][]): { ai: number; bi: number }[] {
  const matches: { ai: number; bi: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matches.push({ ai: i, bi: j });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/** The lane's document, in port order — one line per port, in the SAME
 *  order the caller's ports are flattened in (portEdge.tsx flattens
 *  `computeSlots`'s visual order, not necessarily `items`' raw array order,
 *  so a grouped family's members stay contiguous with the dots they sit
 *  beside). A label containing a literal `\n` (unreachable from the
 *  keyboard — `singleLineGuard`/multiline both filter it — but reachable
 *  from story code or an import) is escaped to `␊` first: unescaped, one
 *  item would silently become two ports on the next open, since the
 *  join/split round trip has no other way to tell "one label with a
 *  newline" from "two labels". */
export function formatPortLane(ports: PortEdgeItem[]): string {
  return ports.map((p) => (p.label.includes("\n") ? p.label.replace(/\n/g, "␊") : p.label)).join("\n");
}

/**
 * Reconciles `ports` (in lane order) against the lane's edited `text`,
 * minting a fresh port via `mintItem` for every line that ends up
 * unmatched. Pure: matched ports are reused BY REFERENCE (`===`, not just
 * `deepEqual`), an edited line's port goes through `{...port}` once, and —
 * this is what a live "one call per keystroke" write policy needs — a
 * text that already spells `formatPortLane(ports)` returns the exact SAME
 * `ports` array back, so a host's `onItemsChange` never fires on a
 * genuine no-op.
 */
export function reconcilePortLane(ports: PortEdgeItem[], text: string, mintItem: (label: string) => PortEdgeItem): PortEdgeItem[] {
  const before = ports.map((p) => p.label);
  // `text === ""` short-circuits to zero lines — `"".split("\n")` would
  // otherwise produce `[""]`, one port with an empty label, not an empty
  // lane. Select-all + Delete must empty the edge.
  const after = text === "" ? [] : text.split("\n");

  const table = lcsTable(before, after);
  const matches = backtrackMatches(before, after, table);

  // Tier 1: the LCS matches — same port, by reference.
  const keep = new Map<number, PortEdgeItem>();
  const matchedBefore = new Set<number>();
  const matchedAfter = new Set<number>();
  for (const { ai, bi } of matches) {
    keep.set(bi, ports[ai]);
    matchedBefore.add(ai);
    matchedAfter.add(bi);
  }

  // Tier 2: the leftovers on each side, zipped by RANK — not content. This
  // is the tier that keeps an in-place rename's id (the donor's own
  // comment, portLane.ts:120-122): a renamed line is still "the Nth
  // leftover" on both sides.
  const spareBefore: number[] = [];
  for (let i = 0; i < before.length; i++) if (!matchedBefore.has(i)) spareBefore.push(i);
  const spareAfter: number[] = [];
  for (let j = 0; j < after.length; j++) if (!matchedAfter.has(j)) spareAfter.push(j);
  const pairCount = Math.min(spareBefore.length, spareAfter.length);
  for (let k = 0; k < pairCount; k++) {
    keep.set(spareAfter[k], ports[spareBefore[k]]);
  }

  // Tier 3: still unmatched -> a fresh port. One `mintItem` call per new
  // line, in order, so two new lines in one edit mint two distinct ids.
  const result = after.map((label, bi) => {
    const source = keep.get(bi);
    if (!source) return mintItem(label);
    // Only actually EDIT the label when it changed — see the purity note.
    return source.label === label ? source : { ...source, label };
  });

  // Purity: if every resulting port is the SAME object, in the SAME order,
  // as `ports`, return `ports` itself rather than a structurally-equal
  // copy — the no-op case a live write policy hits on every keystroke that
  // doesn't touch THIS particular line.
  if (result.length === ports.length && result.every((p, i) => p === ports[i])) return ports;
  return result;
}
