// src/skin/portVariants.ts — the port's VISUAL VARIANT registry: five
// circular, on-the-edge port styles, selectable by one attribute on
// `<html>` (`<html data-bbox-port-variant="v3">`) or by an explicit
// `variant` prop, defaulting to `v1`.
//
// Zach, 2026-09-19 (docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md):
// "the ports look way too big right now and the port text size also seems
// too big … generally it looks very unprofessional … I want the port text
// to be 'small' by default … one proposal should be based on the original
// SystemSketch source code, one on langflow … I only want to see proposals
// that explore circular ports … proposals where the ports are on the edge,
// not where they are inset."
//
// WHAT A VARIANT DECIDES — and only this: the dot's box diameter, the two
// rings painted OUTSIDE that box (the card-coloured `gap`, then the `ring`),
// which PAINT GRAMMAR maps the value state (empty · valueSet · wired ·
// received) onto those three circles, the label/type typography, and the
// hover / selected / producers-circle treatments. It never decides WHERE a
// dot sits: every variant is centred ON the block wall, half outside, by
// `BlockPort`'s rail geometry — the one rule that is not a proposal (the
// anti-example is `115744`, square handles inset inside the node body).
//
// WHY every variant keeps the SAME text rung (`xs`, 12px): "small by
// default" is the one thing Zach ruled outright, and the next rung up
// (`sm`, 18px) is exactly the size he called too big. So the five vary
// what a reviewer actually compares at that size — dot scale (11 → 16px
// painted), fill grammar, colour source (state vs. type), typeface and
// weight — and the text never jumps when he flips between them.
//
// WHY CSS custom properties AND a typed table, not one or the other: the
// components need NUMBERS (a label is placed from the dot's box, the sketch
// skin's boundary pass reads `data-bbox-ring-expand`), so this table is the
// source of truth and every port root publishes its resolved variant as
// inline `--bbox-port-*` properties. `portVariants.css` carries the SAME
// values under `[data-bbox-port-variant]` blocks for CSS-only consumers
// (the regions lane's frame inset, a host's chrome) and holds the
// hover/selected/producers rules that read them. `PortVariants.stories.tsx`'s
// `CssMirrorAgrees` pins the two together, the way `skin.test.ts` pins
// skin.css to skin.ts.
//
// WHY a MutationObserver-backed hook rather than React context: the ASK's
// contract is "CSS custom properties + data attributes, no React context
// needed — so the app switch and the Storybook global are three lines
// each". A host stamps the attribute; every mounted port re-resolves on its
// own. `useSyncExternalStore` makes that a real subscription, not a
// read-once-at-mount.
//
// PROVENANCE — every number below was read from a file on disk or a source
// fetched on 2026-09-19 (paths are the ones this lane read; the langflow
// clone is a shallow `git clone` of langflow-ai/langflow into the session
// scratchpad, cited by its repo-relative path):
//
//   v1  React Flow's own handle SCALE — `@xyflow/react/dist/style.css:250-251`
//       (`width: 6px; height: 6px`), `:274-278` (`.react-flow__handle-left
//       { left: 0; transform: translate(-50%, -50%) }` — centred ON the
//       edge) — drawn in THIS trunk's three-circle state grammar
//       (`port.tsx` STATE_TOKENS; `DP - Port.md` "Anatomy": outline,
//       background, centre) so every value state stays readable and the
//       colour still comes from STATE, per the 2026-09-10 ruling recorded
//       in `systemsketch/src/bboxUi/core/port.tsx:58-64`.
//   v2  the original SystemSketch live port —
//       `systemsketch/src/blocks/ui/block-canvas.css:1099-1132` ("The 12px
//       pyblocks dot: hollow while unwired, neutral-filled when it owns a
//       default, type-filled once a cable lands. The surface gap and
//       type-coloured outer ring…": 12px disc, `0 0 0 2px surface`, `0 0 0
//       3px var(--port-color)`), its palette `systemsketch/src/blocks/ui/
//       portPalette.ts:23-40`, the monospace signature row
//       `block-canvas.css:1035-1052` (`.BlockNode-portName` /
//       `.BlockNode-portType`, ui-monospace, type muted), and the count pill
//       `block-canvas.css:1453-1478` (`.Port-count`: surface-active fill,
//       muted 600 text, riding OUTSIDE the dot). Scaled ×2/3 with the text
//       (18px → 12px): disc 12 → 8, gap 2 → 1, ring 1 → 1.
//   v3  langflow — `src/frontend/src/CustomNodes/GenericNode/components/
//       handleRenderComponent/index.tsx`: `:128-131` a 10px `rounded-full`
//       disc whose background IS the type colour, `:110-113` a resting
//       `0 0 0 3px <datatype-X-foreground>` pale ring, `:114-123` a neon
//       glow only while hovered/open, `:24-32` a 32px transparent hit target
//       (our 40px halo); the colour names `src/frontend/src/utils/
//       styleUtils.ts:171-215` (`nodeColorsName`) → `src/frontend/src/style/
//       index.css:162-202` (`--datatype-*` light HSL pairs); unknown types
//       fall to gray (`src/frontend/src/CustomNodes/helpers/
//       get-node-output-colors-name.ts:12`). Label weight: `NodeInputField/
//       index.tsx:181` `text-sm font-medium`.
//   v4  React Flow UI (the shadcn registry for React Flow, reference #6 in
//       `/home/bam/pyblocks/reports/media/react-flow-references.md`) —
//       `https://ui.reactflow.dev/registry/base-handle.json` (fetched
//       2026-09-19): `BaseHandle` is `h-[11px] w-[11px] rounded-full border
//       border-slate-300 bg-slate-100`; `labeled-handle.json`: the label is
//       `text-foreground px-3`; `database-schema-node.json`: rows are
//       `text-xs`. A connected handle takes the stock React Flow ink
//       (`style.css:36` `--xy-handle-background-color-default: #1a192b`).
//   v5  Zach's own `DP - Port.md` ("three stacked circles — outline,
//       background, centre … every state in the visual grammar is some
//       combination of those three") drawn literally: a hairline outline, a
//       card background, and a centre that is ALWAYS present — muted until
//       something attaches — so the one centre attach point he asked for
//       ("edges should always leave from the center of the port") is
//       visible before any cable exists.

import { useSyncExternalStore, type CSSProperties } from "react";

import { PORT_DIAMETERS, PORT_TEXT_SIZES, type PortTextSize } from "../components/port.layout";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** WHY the array is the source and the type is derived: same reason as
 *  `BBOX_SKINS` — a total `Record<PortVariantId, …>` below becomes a compile
 *  error until a sixth variant says what it paints. */
export const PORT_VARIANT_IDS = ["v1", "v2", "v3", "v4", "v5"] as const;
export type PortVariantId = (typeof PORT_VARIANT_IDS)[number];

export const DEFAULT_PORT_VARIANT_ID: PortVariantId = "v1";

/** The attribute a host stamps on `<html>`. Dataset spelling:
 *  `document.documentElement.dataset.bboxPortVariant`. */
export const PORT_VARIANT_ATTR = "data-bbox-port-variant";

/**
 * Which paint grammar maps the value state onto the three circles — ring,
 * disc, core. One per source, because the sources genuinely disagree about
 * what a port's colour MEANS (state here, type in SystemSketch-original and
 * langflow) and a bag of independent enums would let two of them combine
 * into a sixth look nobody proposed. `port.tsx`'s `portGrammarPaint` is the
 * one switch over it.
 */
export type PortGrammar = "trunk" | "systemsketch" | "langflow" | "pearl" | "reticle";

/** The resting disc, named for the reader of the table — the grammar decides
 *  the actual colour per state. */
export type PortDotFill = "hollow" | "typeOnWire" | "type" | "pearl" | "centre";

export interface PortVariantDot {
  /** The `[data-slot="port-dot"]` box, px — what `getBoundingClientRect` reads. */
  diameter: number;
  /** The card-coloured punch-out ring between disc and ring, px (0 allowed). */
  gap: number;
  /** The outer ring's stroke, px. */
  ring: number;
  fill: PortDotFill;
  grammar: PortGrammar;
}

export interface PortVariant {
  id: PortVariantId;
  title: string;
  /** One line naming the source this variant was read from. */
  basedOn: string;
  dot: PortVariantDot;
  /** The label's text rung (`PORT_TEXT_SIZES`). */
  text: PortTextSize;
  label: { weight: 400 | 500 | 600; font: "sans" | "mono" };
  /** The secondary run — the type — beside the label. */
  type: { size: PortTextSize; opacity: number };
  /** Real CSS `:hover` on the dot — scale factor, an extra soft outline
   *  (px, 0 = none) and whether it glows in the type colour (langflow). */
  hover: { scale: number; ring: number; glow: boolean };
  /** Host-set `selected` — an outline of this width, this far past the ring. */
  selected: { ring: number; offset: number };
  /** The producers count circle riding the dot — `ink` (solid, card text) or
   *  `soft` (the original SystemSketch pill's muted chip). */
  producers: { diameter: number; fontPx: number; style: "ink" | "soft" };
}

/* ------------------------------------------------------------------ */
/* The five                                                            */
/* ------------------------------------------------------------------ */

export const PORT_VARIANTS: Record<PortVariantId, PortVariant> = {
  // The DEFAULT. React Flow's 6px handle box (style.css:250-251) with a 1px
  // card gap and a 1.5px state ring: 11px painted beside 12px text — the
  // same ~0.9 dot:text ratio the DOM render Zach called "desired" (`115249`)
  // has at 24px, one rung down. Hollow; the ring is the state colour; wired
  // lights a centre. Nothing about the grammar changed — only the scale.
  v1: {
    id: "v1",
    title: "Fine ring",
    basedOn: "React Flow's 6px handle scale (xyflow style.css:250) in this trunk's own state-coloured three-circle grammar",
    dot: { diameter: PORT_DIAMETERS.xs, gap: 1, ring: 1.5, fill: "hollow", grammar: "trunk" },
    text: "xs",
    label: { weight: 400, font: "sans" },
    type: { size: "xs", opacity: 0.55 },
    hover: { scale: 1.35, ring: 3, glow: false },
    selected: { ring: 2, offset: 2 },
    producers: { diameter: 14, fontPx: 9, style: "ink" },
  },
  // The original SystemSketch port, by value, scaled with its text: an 8px
  // card disc, a 1px surface gap, a 1px ring in the TYPE's colour (12px
  // painted — the original's 18px footprint × 2/3); a default value fills it
  // muted, a cable fills it with the type colour. Monospace `name Type`
  // signature row; the count is the original's soft chip.
  v2: {
    id: "v2",
    title: "SystemSketch original",
    basedOn: "systemsketch block-canvas.css:1099-1132 (type ring, fills on wire) + portPalette.ts + the mono signature row, ×2/3",
    dot: { diameter: PORT_DIAMETERS.sm, gap: 1, ring: 1, fill: "typeOnWire", grammar: "systemsketch" },
    text: "xs",
    label: { weight: 400, font: "mono" },
    type: { size: "xs", opacity: 0.6 },
    hover: { scale: 1.25, ring: 3, glow: false },
    selected: { ring: 2, offset: 2 },
    producers: { diameter: 14, fontPx: 9, style: "soft" },
  },
  // langflow: a 10px disc FILLED with the type colour inside a 3px pale ring
  // of the same hue (16px painted), identical at rest whether or not a cable
  // is attached — langflow lets the cable say "wired". Hover glows.
  v3: {
    id: "v3",
    title: "Langflow",
    basedOn: "langflow handleRenderComponent/index.tsx:110-143 — 10px type-coloured disc, 3px pale ring, neon hover",
    dot: { diameter: 10, gap: 0, ring: 3, fill: "type", grammar: "langflow" },
    text: "xs",
    label: { weight: 500, font: "sans" },
    type: { size: "xs", opacity: 0.5 },
    hover: { scale: 1.15, ring: 0, glow: true },
    selected: { ring: 2, offset: 2 },
    producers: { diameter: 14, fontPx: 9, style: "ink" },
  },
  // React Flow UI's BaseHandle: an 11px pearl — light fill, 1px light
  // border — that turns React Flow's stock ink (#1a192b → `--foreground`)
  // once connected. The quietest of the five: empty ports nearly disappear
  // into the card, wired ones are the only dark marks on the wall.
  v4: {
    id: "v4",
    title: "React Flow UI pearl",
    basedOn: "ui.reactflow.dev BaseHandle (11px, border-slate-300, bg-slate-100) + stock xyflow ink when wired",
    dot: { diameter: 9, gap: 0, ring: 1, fill: "pearl", grammar: "pearl" },
    text: "xs",
    label: { weight: 400, font: "sans" },
    type: { size: "xs", opacity: 0.5 },
    hover: { scale: 1.3, ring: 3, glow: false },
    selected: { ring: 2, offset: 2 },
    producers: { diameter: 14, fontPx: 9, style: "ink" },
  },
  // Reticle: DP - Port's three circles drawn literally — hairline outline,
  // card background, and a centre that is ALWAYS drawn (muted until
  // something attaches, lit when wired). The largest box of the five (14px
  // painted) but the lightest ink: a 1px ring.
  v5: {
    id: "v5",
    title: "Reticle",
    basedOn: "DP - Port.md 'three stacked circles — outline, background, centre', the centre always drawn",
    dot: { diameter: PORT_DIAMETERS.md, gap: 0, ring: 1, fill: "centre", grammar: "reticle" },
    text: "xs",
    label: { weight: 400, font: "sans" },
    type: { size: "xs", opacity: 0.55 },
    hover: { scale: 1.2, ring: 3, glow: false },
    selected: { ring: 2, offset: 2 },
    producers: { diameter: 14, fontPx: 9, style: "ink" },
  },
};

/** One line per variant for a picker (the `app-variant-switch` lane's
 *  dropdown and a Storybook toolbar read this, not the titles). */
export const PORT_VARIANT_LABELS: Record<PortVariantId, string> = {
  v1: "v1 · Fine ring (default)",
  v2: "v2 · SystemSketch original",
  v3: "v3 · Langflow",
  v4: "v4 · React Flow UI pearl",
  v5: "v5 · Reticle",
};

/* ------------------------------------------------------------------ */
/* Derived geometry                                                    */
/* ------------------------------------------------------------------ */

/** How far the painted rings reach past the dot's box on each side. */
export function portVariantRingOverhangPx(variant: PortVariant): number {
  return variant.dot.gap + variant.dot.ring;
}

/** The painted outer diameter, px — box + both rings on both sides. */
export function portVariantOuterPx(variant: PortVariant): number {
  return variant.dot.diameter + 2 * portVariantRingOverhangPx(variant);
}

/** The painted OUTER radius of a dot at the variant's OWN diameter, px —
 *  `portVariantOuterPx / 2`, for a host whose dots are never sized apart
 *  from their variant (the app's blocks), so it needs no DOM to know it. */
export function portVariantRingRadiusPx(variant: PortVariant): number {
  return portVariantOuterPx(variant) / 2;
}

/**
 * The painted OUTER radius of one rendered `[data-slot="port-dot"]`, px, in
 * the dot's own LAYOUT space — where a wire has to stop to touch it (Zach,
 * 2026-09-22: "make the trace end exactly at the port"; the pull-back is
 * `trace.tsx`'s `traceRingGapPx`).
 *
 * WHY read off the element and not off the table alone: a caller may size a
 * dot (`diameter="md"` on a function port, an exact number) independently of
 * its variant, and only the rendered box knows. The rings are `box-shadow`
 * layers entirely OUTSIDE that box, so the box alone would stop a wire one
 * ring short; the ring widths come from the variant the dot says it painted
 * (`data-bbox-port-variant`, stamped by `port.tsx` on every dot).
 *
 * WHY `offsetWidth` and not `getBoundingClientRect`: the hover rule scales
 * the dot with a CSS `transform` (portVariants.css), which a bounding rect
 * includes and layout width does not — a wire must not jump because the
 * pointer happens to be over its dot. It is also UNSCALED by any ancestor
 * transform, so a canvas host projects it exactly like its anchors.
 */
export function portDotRingRadiusPx(dot: Element): number {
  const raw = dot.getAttribute(PORT_VARIANT_ATTR);
  const variant = PORT_VARIANTS[isPortVariantId(raw) ? raw : readPortVariantId()];
  const box = dot instanceof HTMLElement ? dot.offsetWidth : variant.dot.diameter;
  return box / 2 + portVariantRingOverhangPx(variant);
}

/**
 * The two numbers `port.tsx` publishes for the sketch skin's boundary pass
 * (`data-bbox-ring-expand` / `data-bbox-ring-pen`) — the SAME arithmetic
 * `port.tsx` used with its fixed constants (`SURFACE*2 + STATE*3`, `STATE`),
 * now over the variant's own rings.
 */
export function portVariantRingExpansion(variant: PortVariant): { expand: number; pen: number } {
  return { expand: variant.dot.gap * 2 + variant.dot.ring * 3, pen: variant.dot.ring };
}

/**
 * Where the producers circle's CENTRE sits relative to the dot's centre,
 * px, for a badge riding the side away from the label (`side`). It sits
 * just outside the painted ring on a 55° ray up-and-outward, overlapping
 * the ring by 2px like a notification badge.
 *
 * WHY that ray: the cables it counts arrive HORIZONTALLY at the dot's
 * centre (one attach point, elbow routing ends on the wall's normal), so a
 * badge straight outward would sit on them and one straight up would crowd
 * the port above; 55° up-outward clears both, and the original SystemSketch
 * pill made the same call ("Float over the incoming wire instead of
 * covering it", `block-canvas.css:1455-1457`). WHY overlap rather than
 * float free: a count that does not touch its dot reads as a label for the
 * row, not a fact about this port.
 */
export function portProducersOffsetPx(variant: PortVariant, side: "left" | "right"): { dx: number; dy: number } {
  const ringRadius = variant.dot.diameter / 2 + portVariantRingOverhangPx(variant);
  const reach = ringRadius + variant.producers.diameter / 2 - 2;
  const angle = (55 * Math.PI) / 180;
  const dx = Math.cos(angle) * reach;
  return { dx: side === "left" ? -dx : dx, dy: -Math.sin(angle) * reach };
}

/* ------------------------------------------------------------------ */
/* Type colour — only the two by-type grammars read it                 */
/* ------------------------------------------------------------------ */

/** A type's two paints: the full-strength `disc` and a pale `tint` of it. */
export interface PortTypePaint {
  disc: string;
  tint: string;
}

/**
 * The ORIGINAL SystemSketch palette by value (`systemsketch/src/blocks/ui/
 * portPalette.ts:23-40`, `portColorFamily` + `FAMILY_HEX`). Unknown types
 * are the original's own `any` amber — which is why the old boards read
 * orange.
 */
export function systemSketchTypeColor(type: string | undefined): string {
  const normalized = (type ?? "").trim().toLowerCase();
  if (normalized === "image") return "#c060e0";
  if (normalized === "text" || normalized === "str" || normalized === "string") return "#4caf50";
  if (normalized === "model") return "#2196f3";
  if (normalized === "number" || normalized === "int" || normalized === "float") return "#9e9e9e";
  if (normalized === "latent") return "#ff9800";
  return "#c08520";
}

/** langflow's light-theme `--datatype-*` pairs, `src/frontend/src/style/
 *  index.css:162-202`, transcribed (HSL components → `hsl()`). */
const LANGFLOW_DATATYPES = {
  pink: ["333.3 71.4% 50.6%", "325.7 77.8% 94.7%"],
  rose: ["346.8 77.2% 49.8%", "355.6 100% 94.7%"],
  yellow: ["40.6 96.1% 40.4%", "54.9 96.7% 88%"],
  blue: ["221.2 83.2% 53.3%", "214.3 94.6% 92.7%"],
  gray: ["215 13.8% 34.1%", "220 14.3% 95.9%"],
  lime: ["84.8 85.2% 34.5%", "79.6 89.1% 89.2%"],
  red: ["0 72.2% 50.6%", "0 93.3% 94.1%"],
  violet: ["262.1 83.3% 57.8%", "251.4 91.3% 95.5%"],
  emerald: ["161.4 93.5% 30.4%", "149.3 80.4% 90%"],
  fuchsia: ["293.4 69.5% 48.8%", "287 100% 95.5%"],
  purple: ["271.5 81.3% 55.9%", "268.7 100% 95.5%"],
  cyan: ["191.6 91.4% 36.5%", "185.1 95.9% 90.4%"],
  indigo: ["243.4 75.4% 58.6%", "226.5 100% 93.9%"],
  orange: ["20.5 90.2% 48.2%", "34.3 100% 91.8%"],
} as const satisfies Record<string, readonly [string, string]>;
type LangflowColor = keyof typeof LANGFLOW_DATATYPES;

/** The subset of langflow's `nodeColorsName` (`src/frontend/src/utils/
 *  styleUtils.ts:171-215`) whose colour has a `--datatype-*` pair above. */
const LANGFLOW_TYPE_COLORS: Record<string, LangflowColor> = {
  str: "indigo",
  Text: "indigo",
  Message: "indigo",
  number: "purple",
  Data: "red",
  JSON: "red",
  Document: "lime",
  Prompt: "violet",
  Embeddings: "emerald",
  BaseLanguageModel: "fuchsia",
  unknown: "gray",
};

/**
 * WHY a hash for names langflow never heard of — ours, not langflow's:
 * langflow paints every unmapped type gray (`get-node-output-colors-name.
 * ts:12`, `nodeColorsName[type] ?? nodeColorsName.unknown`), so a robotics
 * board (Pose, Twist, bool…) would render all-gray and the proposal's whole
 * point — colour BY type — would be invisible. Python's primitive names are
 * mapped onto langflow's own keys first (`int`/`float` → its `number`); the
 * rest hash stably into langflow's own palette, gray excluded.
 */
const LANGFLOW_HASH_PALETTE: LangflowColor[] = ["blue", "emerald", "orange", "pink", "cyan", "violet", "lime", "rose", "fuchsia", "yellow"];

export function langflowTypePaint(type: string | undefined): PortTypePaint {
  const raw = (type ?? "").trim();
  const lower = raw.toLowerCase();
  let color: LangflowColor | undefined = LANGFLOW_TYPE_COLORS[raw];
  if (!color && (lower === "int" || lower === "float" || lower === "number")) color = "purple";
  if (!color && (lower === "str" || lower === "string" || lower === "text")) color = "indigo";
  if (!color && raw === "") color = "gray";
  if (!color) {
    let hash = 0;
    for (const ch of raw) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    color = LANGFLOW_HASH_PALETTE[hash % LANGFLOW_HASH_PALETTE.length];
  }
  const [disc, tint] = LANGFLOW_DATATYPES[color];
  return { disc: `hsl(${disc})`, tint: `hsl(${tint})` };
}

/**
 * The type paint a grammar uses, or `null` for the state-coloured ones. An
 * explicit `typeColor` (a host that knows better) wins; its tint is that
 * colour washed into the card, the same relation langflow's pairs have.
 */
export function portTypePaint(grammar: PortGrammar, dataType: string | undefined, typeColor: string | undefined): PortTypePaint | null {
  if (grammar !== "systemsketch" && grammar !== "langflow") return null;
  if (typeColor) return { disc: typeColor, tint: `color-mix(in srgb, ${typeColor} 18%, var(--card))` };
  if (grammar === "langflow") return langflowTypePaint(dataType);
  const disc = systemSketchTypeColor(dataType);
  return { disc, tint: `color-mix(in srgb, ${disc} 18%, var(--card))` };
}

/* ------------------------------------------------------------------ */
/* CSS custom properties — what a port root publishes inline           */
/* ------------------------------------------------------------------ */

/**
 * The property set, spelled once. `portVariants.css` declares the same
 * names per `[data-bbox-port-variant]`; the inline copy on each port root
 * is what makes a port self-sufficient for a consumer who never imports
 * that stylesheet (shadcn copies component source, not our globals).
 */
export function portVariantVars(variant: PortVariant): CSSProperties {
  return {
    "--bbox-port-dot-diameter": `${variant.dot.diameter}px`,
    "--bbox-port-dot-gap": `${variant.dot.gap}px`,
    "--bbox-port-dot-ring": `${variant.dot.ring}px`,
    "--bbox-port-ring-overhang": `${portVariantRingOverhangPx(variant)}px`,
    "--bbox-port-label-size": `${PORT_TEXT_SIZES[variant.text]}px`,
    "--bbox-port-label-weight": String(variant.label.weight),
    "--bbox-port-type-size": `${PORT_TEXT_SIZES[variant.type.size]}px`,
    "--bbox-port-type-opacity": String(variant.type.opacity),
    "--bbox-port-hover-scale": String(variant.hover.scale),
    "--bbox-port-hover-ring": `${variant.hover.ring}px`,
    "--bbox-port-selected-ring": `${variant.selected.ring}px`,
    "--bbox-port-selected-offset": `${variant.selected.offset}px`,
    "--bbox-port-producers-size": `${variant.producers.diameter}px`,
    "--bbox-port-producers-font": `${variant.producers.fontPx}px`,
  } as CSSProperties;
}

/** The label's font stack for a variant — through the skin's own tokens so
 *  the sketch skin still re-fonts every variant. */
export function portVariantLabelFont(variant: PortVariant): string {
  return variant.label.font === "mono"
    ? 'var(--bbox-skin-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace)'
    : "var(--bbox-skin-font-sans, inherit)";
}

/* ------------------------------------------------------------------ */
/* Resolution — the attribute, read live                               */
/* ------------------------------------------------------------------ */

export function isPortVariantId(value: unknown): value is PortVariantId {
  return typeof value === "string" && (PORT_VARIANT_IDS as readonly string[]).includes(value);
}

/**
 * The variant in force for the whole document: `<html data-bbox-port-
 * variant>`, or `v1`. An unknown value is NOT an error — it resolves to the
 * default, so a stale attribute from an older build can never blank every
 * port on the board. Safe under SSR (`layering.test.ts` renders `Port`
 * with `renderToStaticMarkup`): no `document`, no attribute, `v1`.
 */
export function readPortVariantId(): PortVariantId {
  if (typeof document === "undefined") return DEFAULT_PORT_VARIANT_ID;
  const raw = document.documentElement.dataset.bboxPortVariant;
  return isPortVariantId(raw) ? raw : DEFAULT_PORT_VARIANT_ID;
}

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

/** One shared observer on `<html>`'s attribute, alive only while a port is
 *  mounted — every mounted port shares it rather than each owning one. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (observer == null && typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    observer = new MutationObserver(() => {
      for (const l of listeners) l();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [PORT_VARIANT_ATTR] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer != null) {
      observer.disconnect();
      observer = null;
    }
  };
}

function serverSnapshot(): PortVariantId {
  return DEFAULT_PORT_VARIANT_ID;
}

/**
 * The variant this port renders: an explicit `override` (a gallery showing
 * all five at once, a host pinning one subtree) wins; otherwise the
 * document-wide attribute, subscribed so a switch re-renders every mounted
 * port without a remount.
 */
export function usePortVariant(override?: PortVariantId): PortVariant {
  const documentId = useSyncExternalStore(subscribe, readPortVariantId, serverSnapshot);
  return PORT_VARIANTS[override ?? documentId];
}
