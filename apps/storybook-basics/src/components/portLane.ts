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
// canonicalisation. What makes the round trip (`formatPortLane` -> edit ->
// `reconcilePortLane`) exact is therefore not the absence of a grammar but
// the presence of ONE: the line codec below, whose encode is injective and
// whose decode is its exact left inverse. That property is the whole reason
// the no-op case is referentially idempotent (see the purity note on
// `reconcilePortLane` itself) — an earlier version of this header claimed
// "exact by construction" while the codec was not invertible, and it was
// silently rewriting labels (judge finding 1, 2026-09-22).
import type { PortEdgeItem } from "./portEdge";

/**
 * `commonLines` — a standard LCS table (suffix-built, `table[i][j]` = the
 * length of the longest common subsequence of `a[i..]`/`b[j..]`) plus a
 * forward optimal backtrack. The tie-break (`table[i+1][j] >= table[i][j+1]`
 * — prefer advancing `a` over `b` on a tie) is what makes a two-line swap
 * resolve the way a human expects, matching the donor exactly
 * (portLane.ts:62-86).
 *
 * PRIOR ART, named because "LCS" deserves its actual citation. This is the
 * textbook QUADRATIC-time, QUADRATIC-space dynamic program — not one of the
 * refinements — and the cleanest statement of exactly that baseline is the
 * opening of D. S. Hirschberg, "A linear space algorithm for computing
 * maximal common subsequences", Communications of the ACM 18(6):341-343,
 * 1975: "The problem of finding a longest common subsequence of two strings
 * has been solved in quadratic time and space." That sentence describes THIS
 * function; the paper then improves the space, which we deliberately do not
 * need (a port lane is tens of lines, not a genome). Its ancestor recurrence
 * is R. A. Wagner and M. J. Fischer, "The String-to-String Correction
 * Problem", Journal of the ACM 21(1):168-173, 1974.
 *
 * Both citations verified 2026-09-17 against dl.acm.org's own records
 * (doi 10.1145/360825.360861 and 10.1145/321796.321811) — venue, volume,
 * pages and year all confirmed there. The PAPERS' full texts were not read;
 * nothing here depends on them beyond the baseline they name, and the
 * implementation came from the donor, not from either paper.
 *
 * NOT prior art, and not claimed as any: the leftover-zipping in
 * `reconcilePortLane` below (step 2 — pair unmatched lines POSITIONALLY by
 * rank). That is this repo's own product rule for "a rename keeps its id",
 * invented here, with no algorithm behind it.
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

/**
 * The one-line-per-port ENCODE/DECODE pair — a codec, and the only reason
 * `formatPortLane` -> edit -> `reconcilePortLane` can be the IDENTITY on an
 * unedited document. Every caller that builds or reads lane TEXT shares it:
 * this file's own `formatPortLane`/`reconcilePortLane` and
 * `returnDividers.ts`'s `formatRailLane`/`reconcileRailLane`.
 *
 * The transport is line-oriented — one port per physical line, joined with
 * `\n` — so a label's own `\n` is IN-BAND and must be escaped, or one item
 * silently becomes two ports on the next open. (An embedded `\n` is
 * unreachable from the keyboard — `singleLineGuard`/multiline both filter it
 * — but reachable from story code, a paste, or a host import.)
 *
 * TWO marks, because ONE cannot work (judge finding 1, 2026-09-22). The
 * first version of this pair replaced `\n` with `␊` on the way out and `␊`
 * with `\n` on the way back: two substitutions that look symmetric and are
 * not inverses. A label that legitimately contained `␊` was emitted
 * UNCHANGED and then decoded to a different string, so opening the lane and
 * touching nothing rewrote the user's port; and `a\n␊b` and `a␊\nb` both
 * encoded to `a␊␊b`, which is the same fault stated as a collision. An
 * escape scheme has to escape its own escape marker. This one does:
 *
 *   `\n` -> `␊`      the newline mark — the glyph a human sees in the lane
 *   `␊`  -> `␛␊`     a LITERAL newline mark, escaped
 *   `␛`  -> `␛␛`     the escape mark itself, escaped
 *
 * so in encoded text a `␛` ALWAYS opens a two-character pair and a bare
 * `␊` ALWAYS means a newline. `decodeLaneLine` is one left-to-right pass
 * over exactly those three productions, which is what makes it an exact
 * LEFT INVERSE: `decodeLaneLine(encodeLaneLine(x)) === x` for every string
 * `x`, and `encodeLaneLine` is therefore injective. Both are proven by a
 * sweep over an alphabet that CONTAINS the two marks, not by examples —
 * `portLane.test.ts`, which is the test the old pair could never have
 * passed.
 *
 * Decode is also TOTAL, because the text it reads is not only encoder
 * output: a human can type `␛` straight into the lane. An unpaired mark
 * therefore decodes to itself rather than throwing.
 *
 * `encodeLaneLine` returns the label byte-identical whenever it contains
 * none of the three characters — which is every real port name — so no
 * stored data and nothing on screen changes for anything anyone has
 * actually typed.
 *
 * NOT prior art, and none claimed: this is the textbook "escape the escape
 * marker" rule (the same shape as a C string escape, or `\\` inside a regex
 * character class), derived here from the requirement rather than ported
 * from any implementation.
 */
export const LANE_NEWLINE_MARK = "␊";
export const LANE_ESCAPE_MARK = "␛";

// Built from the constants above rather than written out a second time as
// literals: the marks ARE the wire format, and a pattern that can drift from
// them is the "coordinated only by prose" failure this repo keeps paying
// for. A module-level /g/ regex is safe with `String.replace`, which resets
// `lastIndex` itself on every call.
const ENCODE_PATTERN = new RegExp(`[\\n${LANE_NEWLINE_MARK}${LANE_ESCAPE_MARK}]`, "g");
const DECODE_PATTERN = new RegExp(`${LANE_ESCAPE_MARK}([\\s\\S])|${LANE_NEWLINE_MARK}`, "g");

export function encodeLaneLine(line: string): string {
  return line.replace(ENCODE_PATTERN, (character) => (character === "\n" ? LANE_NEWLINE_MARK : LANE_ESCAPE_MARK + character));
}

/**
 * The exact left inverse of `encodeLaneLine`.
 *
 * ONE left-to-right pass, and that is load-bearing: two chained `replace`
 * calls (`␛␊` -> `␊`, then `␊` -> `\n`) would re-examine their own output
 * and turn an escaped LITERAL mark into a newline — the original bug wearing
 * a different shape. The alternation puts the escape pair FIRST so a `␛`
 * always consumes the character after it, and an unpaired trailing `␛`
 * matches neither branch and survives as itself.
 *
 * `reconcilePortLane` decodes every SURVIVING line through this before it is
 * compared against a port's own raw label or written back with
 * `withPortLaneLine` — that is the one place lane TEXT becomes port DATA.
 */
export function decodeLaneLine(line: string): string {
  return line.replace(DECODE_PATTERN, (_match, escaped: string | undefined) => (escaped === undefined ? "\n" : escaped));
}

/** The lane's document, in port order — one line per port, in the SAME
 *  order the caller's ports are flattened in (portEdge.tsx flattens
 *  `computeSlots`'s visual order, not necessarily `items`' raw array order,
 *  so a grouped family's members stay contiguous with the dots they sit
 *  beside). */
export function formatPortLane(ports: PortEdgeItem[]): string {
  return ports.map((p) => encodeLaneLine(portLaneLine(p))).join("\n");
}

/**
 * The line this port shows in the lane — its own `laneLine` when it declares
 * one, else its rail `label`.
 *
 * P-056. See `PortEdgeItem.laneLine`'s own doc for why a host may have two
 * different strings for one port; here the only thing that matters is that
 * the lane reads and writes ONE of them consistently, so the round trip
 * (`formatPortLane` -> edit -> `reconcilePortLane`) stays exact.
 */
export function portLaneLine(port: PortEdgeItem): string {
  return port.laneLine ?? port.label;
}

/**
 * Put an edited line back on the field it came from.
 *
 * WHY it writes `laneLine` when the item declared one, rather than always
 * writing `label`: `label` is the rail's own string, and on a host where the
 * two differ the rail's string is a PREFIX the host derives from the stored
 * line. Overwriting it with a whole declaration would paint `gain_y: int` on
 * a rail whose whole design ruling is that it must not — and would leave
 * `laneLine` reporting the stale line on the very next render, so the edit
 * would look like it had been rejected.
 */
function withPortLaneLine(port: PortEdgeItem, line: string): PortEdgeItem {
  return port.laneLine !== undefined ? { ...port, laneLine: line } : { ...port, label: line };
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
  // ENCODED on both sides of the diff (finding 1's fix): `text` is lane
  // TEXT — whatever `formatPortLane` last emitted, plus whatever was typed
  // on top of it — so it already carries the `␊` placeholder for any
  // embedded newline. `before` has to be encoded the same way, or a port
  // whose raw label contains a real `\n` never equals its own unedited line
  // and gets torn into a rename + a fresh mint instead of recognised as
  // unchanged.
  const before = ports.map((p) => encodeLaneLine(portLaneLine(p)));
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
  // DECODED here — the one place a survivor's text is turned back into a
  // real label — so a matched or renamed port's stored `label`/`laneLine`
  // gets its original `\n` back rather than the `␊` placeholder that lived
  // in the TEXT (finding 1's other half: encoding without a matching decode
  // would leave the placeholder symbol itself in the port's data).
  const result = after.map((rawLine, bi) => {
    const label = decodeLaneLine(rawLine);
    const source = keep.get(bi);
    if (!source) return mintItem(label);
    // Only actually EDIT the line when it changed — see the purity note.
    return portLaneLine(source) === label ? source : withPortLaneLine(source, label);
  });

  // Purity: if every resulting port is the SAME object, in the SAME order,
  // as `ports`, return `ports` itself rather than a structurally-equal
  // copy — the no-op case a live write policy hits on every keystroke that
  // doesn't touch THIS particular line.
  if (result.length === ports.length && result.every((p, i) => p === ports[i])) return ports;
  return result;
}
