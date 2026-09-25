/**
 * The selection pill's appearance vocabulary, and how it binds to tldraw.
 *
 * THE ROUND. Zach, 2026-09-24, on the bar that shipped before this:
 *
 *   "Generally I like a very compact tool bar, 1 for dealing with the inside,
 *    1 for dealling with the stroke, etc.."
 *   "Here you also have color and fill type differently in old system sketch
 *    we had thoose in drop down menu"
 *   "I also don't like the opacity slider on the tool bar ... that is
 *    something that relates to the fill and stroke."
 *   "I would still keep the shape selection its self as a seperate tab
 *    though ... shape selector, inside, edge, text"
 *
 * So the bar is FOUR triggers — shape · inside · edge · text — and each one
 * owns every control that changes the thing it names. The old bar had one
 * trigger per tldraw STYLE (colour, fill, dash, size, font, align), which is
 * a faithful mirror of tldraw's model and a poor answer to "what do I press
 * to change the inside of this box".
 *
 * WHY this file exists at all, rather than more rows in `arrangeActions.ts`:
 * the trunk already ships the renderer this design needs
 * (`@trunk/editor/controlStrip` + `controlPanel` + `controlRegistry`) — a
 * port of the archived app's appearance kit, with stacked popover sections,
 * five layouts and a custom-size binding, which nothing in this app mounted.
 * The old `StyleRowControl` was a second, simpler implementation of the same
 * idea, and it is what made the line-style menu print the word "dashed"
 * instead of drawing a dashed line: the glyph existed in the trunk and the
 * bar never called it. This file is the adapter that was missing, not a new
 * renderer.
 *
 * The composition rule is unchanged and still tldraw's: what appears is
 * driven by `editor.getSharedStyles()`, never by a switch on shape type.
 * `composeControls` drops any item with no candidate, so a selection that has
 * no fill simply has no Inside trigger.
 */
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  type Editor,
  type StyleProp,
} from "tldraw";

import {
  createControlRegistry,
  type BoundControl,
  type ControlBinding,
  type ControlDefinition,
  type ControlOption,
  type ControlRecipe,
} from "@trunk/editor/controlRegistry";
import type { ControlValue } from "@trunk/editor/controlValue";

import {
  CUSTOM_FONT_PX_MAX,
  CUSTOM_FONT_PX_MIN,
  applyCustomFontPx,
  resetCustomFontScale,
  rungPxByValue,
  selectionOnPresetRungs,
  sharedFontPx,
} from "../../appearance/customFontSize";
import {
  applyEdgeColor,
  applyFillColor,
  sharedEdgeColor,
  sharedEdgeFollowsFill,
  setEdgeFollowsFill,
} from "../../appearance/paintLink";
import {
  STROKE_WIDTH_PX,
  STROKE_WIDTH_RUNGS,
  applyStrokeWidth,
  pinStrokeWidth,
  sharedStrokeWidth,
  strokeWidthPxFor,
  type StrokeWidthRung,
} from "../../appearance/strokeMeta";
import { DIFF_MARK_LABELS, DiffMarkStyle } from "../../shapes/shared/diffMark";
import {
  selectionOpacityPercent,
  setSelectionOpacityPercent,
  setStyle,
  swatchColorFor,
} from "./arrangeActions";

export type AppearanceKind =
  | "geo"
  | "fillColor"
  | "fillStyle"
  | "edgeColor"
  | "edgeLink"
  | "dash"
  | "strokeWidth"
  | "size"
  | "font"
  | "align"
  | "diff";

/** tldraw's enums are raw; these are what a person reads. */
const SIZE_LABELS: Record<string, string> = { s: "Small", m: "Medium", l: "Large", xl: "Extra large" };
const FILL_LABELS: Record<string, string> = {
  none: "No fill",
  semi: "Transparent",
  solid: "Solid",
  pattern: "Hatched",
  fill: "Filled",
  "lined-fill": "Lined",
};
const DASH_LABELS: Record<string, string> = {
  draw: "Hand-drawn",
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  none: "None",
};
const FONT_LABELS: Record<string, string> = {
  draw: "Hand-drawn",
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
};
const ALIGN_LABELS: Record<string, string> = { start: "Left", middle: "Centre", end: "Right" };
const WIDTH_LABELS: Record<string, string> = { thin: "Thin", medium: "Medium", thick: "Thick" };

function valuesOf(style: StyleProp<string>): readonly string[] {
  return (style as unknown as { values: readonly string[] }).values ?? [];
}

function options(style: StyleProp<string>, labels?: Record<string, string>): ControlOption[] {
  return valuesOf(style).map((value) => ({ value, label: labels?.[value] ?? value }));
}

/**
 * The vocabulary, declared once.
 *
 * Note which controls carry a `trigger` and which do not matter: only the
 * three that the recipe puts on the BAR are ever read for a trigger shape
 * (`geo`, `fillColor`, `edgeColor`, `size`); the rest are only ever reached
 * as stacked sections inside one of those panels, where `layout` is what
 * decides how they draw.
 */
function definitions(editor: Editor): Record<AppearanceKind, ControlDefinition<AppearanceKind>> {
  return {
    geo: {
      kind: "geo",
      label: "Shape",
      options: options(GeoShapeGeoStyle as unknown as StyleProp<string>),
      layout: "library",
      trigger: "icon",
      // The OPTIONS each draw themselves — twenty shapes, drawn not named.
      // The TRIGGER draws the family, because the geo is already on the
      // canvas at full size and a 24px copy of it says nothing new.
      glyph: "geo",
      triggerGlyph: "geoFamily",
    },
    // The Inside trigger. Its own options are the palette; the fill treatment
    // rides above it as a mode section, which is exactly the archived app's
    // `color.modeControl = fillControl` (appearanceModel.ts:309-317) and what
    // Zach means by "we had thoose in drop down menu".
    fillColor: {
      kind: "fillColor",
      label: "Inside",
      options: options(DefaultColorStyle, undefined),
      layout: "swatches",
      trigger: "value",
      // The OPTIONS are colour swatches; the TRIGGER is the painted result.
      glyph: "swatch",
      triggerGlyph: "insideFace",
      columns: 7,
    },
    fillStyle: {
      kind: "fillStyle",
      label: "Fill",
      options: options(DefaultFillStyle, FILL_LABELS),
      layout: "chips",
      trigger: "icon",
      glyph: "fill",
    },
    edgeColor: {
      kind: "edgeColor",
      label: "Edge",
      options: options(DefaultColorStyle, undefined),
      layout: "swatches",
      trigger: "value",
      glyph: "swatch",
      triggerGlyph: "edgeFace",
      columns: 7,
    },
    // Two chips, not a switch, because the state has to be READABLE at a
    // glance and a switch's off position says nothing about what it would do.
    // Picking "Follows fill" is also the only way back after the link broke.
    edgeLink: {
      kind: "edgeLink",
      label: "Edge colour",
      options: [
        { value: "follow", label: "Follows fill" },
        { value: "custom", label: "Set separately" },
      ],
      layout: "chips",
      trigger: "icon",
      glyph: "link",
    },
    dash: {
      kind: "dash",
      label: "Line style",
      options: options(DefaultDashStyle, DASH_LABELS),
      layout: "chips",
      trigger: "icon",
      glyph: "dash",
    },
    strokeWidth: {
      kind: "strokeWidth",
      label: "Thickness",
      options: STROKE_WIDTH_RUNGS.map((value) => ({ value, label: WIDTH_LABELS[value] ?? value })),
      layout: "row",
      trigger: "icon",
      glyph: "strokeWidth",
    },
    // The Text trigger. `size` is the BASE control and not a mode section for
    // a mechanical reason: `ControlPanel` renders the Custom-px cell only for
    // the control it was handed, so a size control demoted to a section would
    // silently lose its custom field — which is ask A3.
    size: {
      kind: "size",
      label: "Text size",
      options: options(DefaultSizeStyle, SIZE_LABELS),
      layout: "list",
      trigger: "icon",
      // The size OPTIONS have no drawn preview — each row carries its name and
      // its real px, which is what a type ladder is read by. Only the trigger
      // draws, and it draws "Aa" at the selection's own face.
      triggerGlyph: "typeFace",
    },
    font: {
      kind: "font",
      label: "Typeface",
      options: options(DefaultFontStyle, FONT_LABELS),
      layout: "list",
      trigger: "icon",
      glyph: "font",
    },
    align: {
      kind: "align",
      label: "Align",
      // tldraw's enum carries `start-legacy` / `middle-legacy` / `end-legacy`
      // alongside the three real values — a migration artefact for boards made
      // before its text layout changed. Offering six cells where three exist
      // measured as a row of six identical-looking icons in the running app.
      // Filtered by NAME rather than by index, so a future reordering of the
      // enum cannot silently re-admit them.
      options: options(DefaultHorizontalAlignStyle, ALIGN_LABELS).filter(
        (option) => !option.value.endsWith("-legacy"),
      ),
      layout: "row",
      trigger: "icon",
      glyph: "align",
    },
    // P-035's own style, and the one control here that is NOT tldraw's. It
    // keeps its own trigger rather than joining a face, because a diff mark
    // is not an appearance choice — it is a claim about what changed, and
    // burying it under "Inside" would say it was decoration.
    diff: {
      kind: "diff",
      label: "Diff",
      options: options(DiffMarkStyle as unknown as StyleProp<string>, DIFF_MARK_LABELS),
      layout: "list",
      trigger: "icon",
      glyph: "diff",
    },
  };
}

/**
 * Four triggers, in the order Zach named them:
 *
 *   "shape selector, inside, edge, text"
 *
 * Each group is separated by the pill's hairline. `composeControls` elides a
 * group whose every item went unbound, so a text selection (no fill, no dash)
 * shows Text alone with no empty gaps where the other two would have been.
 */
export const TWO_FACES_RECIPE: ControlRecipe<AppearanceKind> = {
  id: "two-faces",
  groups: [
    { id: "shape", items: ["geo"] },
    { id: "paint", items: ["fillColor", "edgeColor"] },
    { id: "type", items: ["size"] },
    // LAST, because it is the only control the three above can never share a
    // selection with — so it never shifts one of their triggers sideways.
    { id: "app", items: ["diff"] },
  ],
};

function sharedValue(editor: Editor, style: StyleProp<string>): ControlValue<string> | null {
  const current = editor.getSharedStyles().get(style);
  if (current === undefined) return null;
  return current.type === "shared" ? { type: "shared", value: current.value } : { type: "mixed" };
}

function toControlValue(shared: string | "mixed" | null): ControlValue<string> | null {
  if (shared === null) return null;
  return shared === "mixed" ? { type: "mixed" } : { type: "shared", value: shared };
}

/**
 * One opacity, shown inside BOTH paint panels.
 *
 * WHY one and not two: Zach's ask is that opacity "relates to the fill and
 * stroke" and should not sit loose on the bar — which this satisfies. A
 * genuine fill-opacity/stroke-opacity SPLIT is a different, larger change:
 * tldraw persists one shape-wide `opacity`, so two independent values would
 * have to ride shape metadata and would not round-trip into a stock `.tldr`.
 * Showing the one real value in both places is honest; inventing two that
 * secretly write one would not be. Named here so the next person does not
 * have to rediscover the constraint.
 */
function opacityBinding(editor: Editor) {
  return {
    label: "Opacity",
    value: selectionOpacityPercent(editor) / 100,
    min: 0,
    max: 1,
    step: 0.01,
    format: (value: number) => `${Math.round(value * 100)}%`,
    apply: (value: number, opts?: { continuous?: boolean }) => {
      setSelectionOpacityPercent(editor, Math.round(value * 100), opts);
    },
  };
}

export interface AppearanceBundle {
  composition: ReturnType<ReturnType<typeof createControlRegistry<AppearanceKind>>["composeControls"]>;
  /** What each face paints, read from the same selection the controls bind to. */
  faces: {
    inside: () => { hex?: string; fillStyle?: string; opacity?: number };
    edge: () => { hex?: string; widthPx?: number; dash?: string; opacity?: number };
    type: () => { px: number | null; fontFamily?: string };
  };
}

const FONT_STACKS: Record<string, string> = {
  draw: "'tldraw_draw', sans-serif",
  sans: "'tldraw_sans', sans-serif",
  serif: "'tldraw_serif', serif",
  mono: "'tldraw_mono', monospace",
};

/**
 * Bind the whole vocabulary to the live selection.
 *
 * Called from a `useValue` so it re-runs whenever the selection or any
 * selected shape's styles change. Returns `null` when nothing on the
 * selection can be styled at all, which is the pill's own "render nothing"
 * signal.
 */
export function buildAppearance(editor: Editor): AppearanceBundle | null {
  const registry = createControlRegistry<AppearanceKind>(definitions(editor));
  const { bindControl, composeControls } = registry;

  const styleBinding = (
    id: string,
    style: StyleProp<string>,
    extra?: Partial<ControlBinding>,
  ): ControlBinding | null => {
    const value = sharedValue(editor, style);
    if (value === null) return null;
    return {
      id,
      value,
      onSelect: (next) => {
        if (next !== undefined) setStyle(editor, style, next);
      },
      ...extra,
    };
  };

  const candidates: BoundControl<AppearanceKind>[] = [];

  // ── shape ───────────────────────────────────────────────────────────────
  const geo = styleBinding("geo", GeoShapeGeoStyle as unknown as StyleProp<string>);
  if (geo) candidates.push(bindControl("geo", geo));

  // ── inside: fill treatment stacked above the palette, opacity beneath ────
  const fillStyleBinding = styleBinding("fill-style", DefaultFillStyle);
  const fillColorValue = sharedValue(editor, DefaultColorStyle);
  if (fillColorValue !== null && fillStyleBinding !== null) {
    candidates.push(
      bindControl("fillColor", {
        id: "inside",
        value: fillColorValue,
        // Setting the FILL carries every linked shape's edge along — it never
        // breaks a link. That asymmetry is the whole of ask A8: "make it
        // green" must not silently orphan the outline.
        onSelect: (next) => {
          if (next !== undefined) applyFillColor(editor, next);
        },
        modeControl: bindControl("fillStyle", fillStyleBinding),
        modePlacement: "above",
        continuous: opacityBinding(editor),
      }),
    );
  }

  // ── edge: link → thickness → line style, then the palette ───────────────
  const dashBinding = styleBinding("dash", DefaultDashStyle);
  if (dashBinding !== null) {
    const widthShared = sharedStrokeWidth(editor);
    const link = sharedEdgeFollowsFill(editor);

    // WHY built innermost-first: `stackModes` walks OUT from the base control
    // and unshifts, so the chain's outermost link renders NEAREST the base.
    // Reading order in the panel is therefore thickness → line style → link →
    // palette, which puts the link row beside the swatches it governs.
    let inner: BoundControl<AppearanceKind> | undefined;
    if (widthShared !== null) {
      inner = bindControl("strokeWidth", {
        id: "stroke-width",
        value: toControlValue(widthShared),
        onSelect: (next) => {
          if (next !== undefined) applyStrokeWidth(editor, next as StrokeWidthRung);
        },
        rungPxByValue: Object.fromEntries(
          STROKE_WIDTH_RUNGS.map((rung) => [rung, STROKE_WIDTH_PX[rung]]),
        ),
      });
    }
    inner = bindControl("dash", {
      ...dashBinding,
      modeControl: inner,
      modePlacement: inner ? "above" : undefined,
    });
    if (link !== null) {
      inner = bindControl("edgeLink", {
        id: "edge-link",
        value:
          link === "mixed"
            ? { type: "mixed" }
            : { type: "shared", value: link ? "follow" : "custom" },
        onSelect: (next) => {
          if (next !== undefined) setEdgeFollowsFill(editor, next === "follow");
        },
        modeControl: inner,
        modePlacement: "above",
      });
    }

    candidates.push(
      bindControl("edgeColor", {
        id: "edge",
        value: toControlValue(sharedEdgeColor(editor)),
        // Setting the EDGE is the explicit act that breaks the link.
        onSelect: (next) => {
          if (next !== undefined) applyEdgeColor(editor, next);
        },
        modeControl: inner,
        modePlacement: "above",
        continuous: opacityBinding(editor),
      }),
    );
  }

  // ── the app's own diff mark ─────────────────────────────────────────────
  const diff = styleBinding("diff", DiffMarkStyle as unknown as StyleProp<string>);
  if (diff) candidates.push(bindControl("diff", diff));

  // ── text: typeface and align stacked above size + custom px ─────────────
  const sizeValue = sharedValue(editor, DefaultSizeStyle);
  if (sizeValue !== null) {
    const fontBinding = styleBinding("font", DefaultFontStyle);
    const alignBinding = styleBinding("align", DefaultHorizontalAlignStyle);
    let textStack: BoundControl<AppearanceKind> | undefined;
    if (fontBinding) textStack = bindControl("font", fontBinding);
    if (alignBinding) {
      textStack = bindControl("align", {
        ...alignBinding,
        modeControl: textStack,
        modePlacement: textStack ? "above" : undefined,
      });
    }

    const shared = sharedFontPx(editor);
    candidates.push(
      bindControl("size", {
        id: "text",
        value: sizeValue,
        // Picking a rung must drop any custom scale AND pin the painted
        // stroke width first — `size` drives both in stock tldraw, and this
        // round exists because it did.
        onSelect: (next) => {
          if (next === undefined) return;
          pinStrokeWidth(editor);
          resetCustomFontScale(editor);
          setStyle(editor, DefaultSizeStyle, next);
        },
        rungPxByValue: rungPxByValue(editor),
        customSize: {
          sharedPx: shared,
          onPresetRungs: selectionOnPresetRungs(editor),
          applyPx: (px) => applyCustomFontPx(editor, px),
          minPx: CUSTOM_FONT_PX_MIN,
          maxPx: CUSTOM_FONT_PX_MAX,
        },
        modeControl: textStack,
        modePlacement: textStack ? "above" : undefined,
      }),
    );
  }

  if (candidates.length === 0) return null;

  const composition = composeControls(TWO_FACES_RECIPE, candidates);
  if (composition.groups.length === 0) return null;

  const firstSelected = () => {
    const [id] = editor.getSelectedShapeIds();
    return id ? editor.getShape(id) : undefined;
  };

  return {
    composition,
    faces: {
      inside: () => {
        const fill = sharedValue(editor, DefaultFillStyle);
        const colour = sharedValue(editor, DefaultColorStyle);
        return {
          hex: colour?.type === "shared" ? (swatchColorFor(editor, colour.value) ?? undefined) : undefined,
          fillStyle: fill?.type === "shared" ? fill.value : undefined,
          opacity: selectionOpacityPercent(editor) / 100,
        };
      },
      edge: () => {
        const colour = sharedEdgeColor(editor);
        const dash = sharedValue(editor, DefaultDashStyle);
        const shape = firstSelected();
        return {
          hex: colour !== null && colour !== "mixed" ? (swatchColorFor(editor, colour) ?? undefined) : undefined,
          widthPx: shape ? strokeWidthPxFor(editor, shape) : undefined,
          dash: dash?.type === "shared" ? dash.value : undefined,
          opacity: selectionOpacityPercent(editor) / 100,
        };
      },
      type: () => {
        const px = sharedFontPx(editor);
        const font = sharedValue(editor, DefaultFontStyle);
        return {
          px: typeof px === "number" ? px : null,
          fontFamily: font?.type === "shared" ? FONT_STACKS[font.value] : undefined,
        };
      },
    },
  };
}
