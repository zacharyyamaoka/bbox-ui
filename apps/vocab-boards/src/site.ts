/**
 * `src/site.json` becomes typed data, and 705 flat CARDS.
 *
 * WHY the import is untyped and cast at this one seam, exactly like
 * `boards.ts`: `resolveJsonModule` is off for this package (see tsconfig.json —
 * `boards.json` is ~780 KB of literal-typed nodes and turns `tsc` into minutes).
 * The hand-written shapes below are the contract that matters, and
 * `docs/build_vocab_site_data.py` is the thing on the other side of it — read
 * that script, not a model's memory, when a field is unclear.
 */
// @ts-expect-error -- resolveJsonModule is deliberately off; see tsconfig.json
import raw from "./site.json";
import { BOARD_BY_ID } from "./boards";
import { layout } from "./layout";

/**
 * A board's real pixel size, memoised.
 *
 * WHY memoised and not computed for all 705 up front: `layout()` is the same
 * pure maths the renderer runs, and the gallery needs a size only for the
 * handful of boards near the viewport. Doing all 705 at module scope would
 * block the first paint for numbers most visits never use. WHY `layout()` at
 * all rather than measuring the DOM: the placeholder has to be the board's REAL
 * size BEFORE React Flow mounts, or the scrollbar lies and every card jumps
 * when its board swaps in.
 */
const SIZE_CACHE = new Map<string, { w: number; h: number }>();

export function boardSize(boardId: string): { w: number; h: number } {
  const hit = SIZE_CACHE.get(boardId);
  if (hit) return hit;
  const entry = BOARD_BY_ID.get(boardId);
  const box = entry ? layout(entry.spec) : null;
  const size = box ? { w: box.W, h: box.H } : { w: 0, h: 0 };
  SIZE_CACHE.set(boardId, size);
  return size;
}

export interface Identity {
  flow?: string;
  node_shape?: string;
  port_style?: string;
  wire_style?: string;
  has_exec_wire?: string;
  one_line?: string;
}

export interface Construct {
  construct: string;
  has: string;
  mark: string;
  named_thing: string;
  doc_url: string;
  quote: string;
}

export interface Vocab {
  key: string;
  name: string;
  hero: string;
  identity: Identity;
  docs: string[];
  constructs: Construct[];
}

/** One vendor citation: the tool's own name for the thing, its documentation
 *  page, the verbatim sentence, and the screenshot of that page. */
export interface Evidence {
  vocab: string;
  name: string;
  url: string;
  quote: string;
  named_thing: string;
  img: string;
}

export interface Bucket {
  name: string;
  members: string[];
  memberNames: string[];
  mechanism: string;
  evidence: Evidence[];
  boards: string[];
}

export interface Example {
  caption: string;
  code: string;
}

export interface Scenario {
  id: string;
  section: string;
  section_id: string;
  title: string;
  kind: string;
  flavour: string;
  canonical: string;
  ports: string;
  note: string;
  examples: Example[];
  buckets: Bucket[];
  none: string[];
  noneNote: string;
}

export interface Site {
  generated: string;
  vocabOrder: string[];
  vocabName: Record<string, string>;
  sectionOrder: string[];
  sectionShort: Record<string, string>;
  vocabs: Vocab[];
  scenarios: Scenario[];
  agreement: { together: Record<string, number>; appears: Record<string, number> };
  narrative: { lede?: string; tail?: string };
  stats: {
    scenarios: number;
    examples: number;
    vocabs: number;
    buckets: number;
    boards: number;
    perScenario: number;
  };
}

export const SITE = raw as unknown as Site;

export const SCENARIO_BY_ID = new Map(SITE.scenarios.map((s) => [s.id, s]));
export const VOCAB_BY_KEY = new Map(SITE.vocabs.map((v) => [v.key, v]));

/** Scenarios in section order, which is the order the prev/next arrows walk. */
export const SCENARIOS_IN_ORDER: Scenario[] = [...SITE.scenarios].sort((a, b) => {
  const d = SITE.sectionOrder.indexOf(a.section_id) - SITE.sectionOrder.indexOf(b.section_id);
  return d || SITE.scenarios.indexOf(a) - SITE.scenarios.indexOf(b);
});

/** Every `kind` in the corpus, in first-appearance order (it is a small closed
 *  set the data owns; hard-coding a list here would go stale silently). */
export const KINDS: string[] = (() => {
  const seen: string[] = [];
  for (const s of SCENARIOS_IN_ORDER) if (!seen.includes(s.kind)) seen.push(s.kind);
  return seen;
})();

/**
 * The gallery's grain: one card per (scenario x mechanism x example) — the same
 * grain as the reference viewer's 202 examples, and exactly one card per board.
 */
export interface Card {
  boardId: string;
  scenario: Scenario;
  bucket: Bucket;
  bucketIndex: number;
  exampleIndex: number;
  /** The board's own one-line caption, authored in the spec. */
  cap: string;
  /** Captions the renderer deliberately does not draw — printed, never dropped. */
  dropped: { node: string; tag: string }[];
  /** Everything `q` matches against, lowercased once at build time. */
  haystack: string;
}

const SHAPES_WITHOUT_TAG_ROOM = new Set(["pill", "badge", "terminal", "note", "diamond"]);

/**
 * Node captions the board deliberately does not draw.
 *
 * `_size` reserves vertical room for a `tag` only on box / round / tb nodes, so
 * a caption on a pill, badge, terminal, note or diamond would be painted over
 * whatever sits below it. Rather than clip authored text the renderer skips it
 * and the page prints it — the complete value, still attached to its node
 * (feedback_truthful_property_rendering: abbreviate visibly, never hide).
 *
 * This is `boards.ts`'s `droppedTags` re-stated against the layout model rather
 * than the raw spec, so it reads the same `shape` the renderer actually used.
 */
function droppedTagsOf(boardId: string): { node: string; tag: string }[] {
  const entry = BOARD_BY_ID.get(boardId);
  if (!entry) return [];
  return entry.spec.nodes
    .filter((n) => n.tag && SHAPES_WITHOUT_TAG_ROOM.has(n.shape ?? "box"))
    .map((n) => ({ node: n.t ?? n.id, tag: n.tag as string }));
}

export const CARDS: Card[] = (() => {
  const out: Card[] = [];
  for (const scenario of SCENARIOS_IN_ORDER) {
    scenario.buckets.forEach((bucket, bucketIndex) => {
      bucket.boards.forEach((boardId, exampleIndex) => {
        const entry = BOARD_BY_ID.get(boardId);
        if (!entry) return;
        const cap = entry.spec.cap ?? "";
        out.push({
          boardId,
          scenario,
          bucket,
          bucketIndex,
          exampleIndex,
          cap,
          dropped: droppedTagsOf(boardId),
          // The searchable field set, stated once so the filter and the
          // `title=` on the search box can never drift apart.
          haystack: [
            boardId,
            scenario.id,
            scenario.title,
            scenario.kind,
            bucket.name,
            ...bucket.memberNames,
            cap,
          ]
            .join(" ")
            .toLowerCase(),
        });
      });
    });
  }
  return out;
})();

export const CARD_BY_BOARD_ID = new Map(CARDS.map((c) => [c.boardId, c]));

/** What the search box promises, in the words the `title=` tooltip uses. */
export const SEARCHED_FIELDS =
  "Search the board id, the scenario id and title, the kind, the mechanism name, the vocabularies that share it, and the board's own caption";

/**
 * A mechanism that is a REFUSAL — the tools in it draw nothing at all for this
 * construct, and the three boards show what they do instead.
 *
 * WHY this reads the mechanism's authored NAME rather than a flag: there is no
 * flag. `docs/build_vocab_site_data.py` passes `name` straight through from
 * buckets.json, and the authors marked a refusal by opening the name with one
 * of these words — "Not drawn — it moved off-canvas", "Refused — every value
 * rides a cable". The prefixes below are the complete measured set (14 of 235
 * buckets, 2026-09-23); a new spelling shows up as a bucket missing from the
 * count, not as a wrong one, because the match is anchored at the start.
 */
const REFUSAL_PREFIX = /^(not drawn|nothing drawn|no drawing|refusal|refused)\b/i;

export function isRefusal(bucket: Bucket): boolean {
  return REFUSAL_PREFIX.test(bucket.name.trim());
}
