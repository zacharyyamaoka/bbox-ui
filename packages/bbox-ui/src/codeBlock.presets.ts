/**
 * packages/bbox-ui/src/codeBlock.presets.ts
 *
 * `CODE_BLOCK_PRESETS` — one per `CodeBlockLook`, selected by `look`, each
 * governing the SAME six presentation fields. This is the whole answer to
 * "is a code field just a code block without line numbers?" (Zach,
 * 2026-09-14): yes — `field` and `block` are two value sets over one
 * component, the P2 "views are presets" pattern Block already uses for
 * Simple/Port/Expanded (`block.presets.ts`). An explicit prop (`lineNumbers`
 * on a `look="field"`) still wins over its look, exactly as an override
 * beats a preset everywhere else in the cascade (`@bbox-ui/schema`'s
 * `resolveField`).
 */
import {
  CODE_BLOCK_LOOK_LABELS,
  CODE_BLOCK_LOOKS,
  type CodeBlockLines,
  type CodeBlockLook,
  type CodeBlockOverflow,
} from "./codeBlock.layout";

/**
 * Structurally `@bbox-ui/schema`'s `PresetSpec`, restated here WITHOUT the
 * import. WHY: this file ships in the `code-block` registry item (shadcn
 * copies source verbatim, root CLAUDE.md), and a consumer's checkout has no
 * `@bbox-ui/schema` to resolve — even a type-only import fails their
 * typecheck. The panel still takes `CODE_BLOCK_PRESETS` as `PresetSpec[]`
 * unchanged, because the shapes are identical; `codeBlock.fields.test.ts`
 * runs the schema's own `assertDisjointPresets` over it to prove that.
 */
export interface CodeBlockPreset {
  id: string;
  label: string;
  selector: string;
  governs: string[];
  values: Record<string, string | number | boolean>;
}

export const CODE_BLOCK_LOOK_GOVERNS = [
  "lineNumbers",
  "lines",
  "overflow",
  "paddingTop",
  "paddingBot",
  "paddingLeft",
  "paddingRight",
] as const;

export interface CodeBlockLookValues {
  lineNumbers: boolean;
  lines: CodeBlockLines;
  overflow: CodeBlockOverflow;
  paddingTop: number;
  paddingBot: number;
  paddingLeft: number;
  paddingRight: number;
}

// WHY a total Record keyed by `CodeBlockLook`: a third look added to the
// vocabulary without values here is a compile error, not a preset built
// with `values: undefined` that throws the first time the panel reads it
// (pill.presets.ts learned this the hard way).
const LOOK_VALUES: Record<CodeBlockLook, CodeBlockLookValues> = {
  // The canvas Code block: SystemSketch's `code-block.css` pads the
  // scroller 10px top/bottom and the content 16px left/right.
  // A code editor scrolls a long line rather than folding it (the source
  // stays truthful to its own columns).
  block: { lineNumbers: true, lines: "multi", overflow: "scroll", paddingTop: 10, paddingBot: 10, paddingLeft: 16, paddingRight: 16 },
  // The one-line box "sized to sit where a plain <input> sat" — the old
  // `.bbox-code-field`'s own 4px 6px, and an input's clip at the edge.
  field: { lineNumbers: false, lines: "single", overflow: "clip", paddingTop: 4, paddingBot: 4, paddingLeft: 6, paddingRight: 6 },
};

export const CODE_BLOCK_PRESETS: CodeBlockPreset[] = CODE_BLOCK_LOOKS.map((look) => ({
  id: look,
  label: CODE_BLOCK_LOOK_LABELS[look],
  selector: "look",
  governs: [...CODE_BLOCK_LOOK_GOVERNS],
  values: { ...LOOK_VALUES[look] },
}));

/** The values a look carries — exported so `codeBlock.tsx` can resolve a
 * look without a schema round-trip, and so a test can pin the two against
 * each other. */
export function codeBlockLookValues(look: CodeBlockLook): CodeBlockLookValues {
  return LOOK_VALUES[look];
}
