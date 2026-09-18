import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Badge } from "../components/badge";
import { Block } from "../components/block";
import type { Diagnostic } from "../components/diagnostic";
import { CodeEditor, type CodeEditorDiagnostic } from "../components/codeEditor";
import { EditableText } from "../components/editableText";
import { LabeledPort } from "../components/labeledPort";
import { Port } from "../components/port";
import { PortEdge, type PortEdgeItem } from "../components/portEdge";
import { TraceBody } from "../components/trace";
import { ValueCapsule } from "../presets/value/value";

/**
 * src/stories/Diagnostics.stories.tsx — the `diagnostics` axis
 * (docs/INVALID-STATES-PLAN.md), one gallery per marked component, modelled
 * on `BlockLayouts.stories.tsx`'s Gallery/Specimen/Caption idiom: several
 * variants visible at once rather than one variant per story, which is how
 * Zach actually reviews this kit.
 *
 * WHY `diagnostics` is a LIST with a stable `id`, not the scalar
 * docs/INVALID-STATES-PLAN.md §1 first drafted: see ./diagnostic.tsx's own
 * header. Every specimen below builds its list with `mark(...)` so the
 * `id` never has to be typed twice.
 */

let markSeq = 0;
function mark(severity: Diagnostic["severity"], message: string, code?: string): Diagnostic[] {
  markSeq += 1;
  return [{ id: `d${markSeq}`, severity, message, code }];
}

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: 200 }}>{children}</span>;
}

function Specimen({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }} data-testid="specimen">
      {children}
      <Caption>{caption}</Caption>
    </div>
  );
}

function Gallery({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>{children}</div>;
}

const meta = {
  title: "Diagnostics",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Port — the halo alone, state ring untouched                         */
/* ------------------------------------------------------------------ */

export const PortGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="none">
        <Port state="empty" />
      </Specimen>
      <Specimen caption="error — danger halo">
        <Port state="empty" diagnostics={mark("error", "Type mismatch: expected number, got string", "TS2322")} />
      </Specimen>
      <Specimen caption="warning — amber halo">
        <Port state="empty" diagnostics={mark("warning", "Unused port")} />
      </Specimen>
      <Specimen caption="info — nothing (§5's board-scale calm rule)">
        <Port state="empty" diagnostics={mark("info", "This port is a preview")} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const dots = canvasElement.querySelectorAll('[data-slot="port-dot"]');
    const [none, error, warning, info] = Array.from(dots) as HTMLElement[];
    const shadowOf = (el: HTMLElement) => getComputedStyle(el).boxShadow;

    // Error/warning ADD a layer on top of the plain dot's own box-shadow —
    // never replace it (channel discipline: "state ring/fill untouched").
    await expect(shadowOf(error).startsWith(shadowOf(none))).toBe(true);
    await expect(shadowOf(error)).not.toBe(shadowOf(none));
    await expect(shadowOf(warning).startsWith(shadowOf(none))).toBe(true);
    await expect(shadowOf(warning)).not.toBe(shadowOf(none));
    // `info` paints NOTHING extra on a Port dot (§5's own table) — the
    // resting box-shadow is byte-identical to the unmarked dot.
    await expect(shadowOf(info)).toBe(shadowOf(none));
  },
};

/**
 * §3's channel discipline, made checkable rather than asserted: a port
 * that is simultaneously `state="wired"` AND carries an error keeps its
 * wired ring/core exactly as painted — the diagnostic axis only ADDS a
 * halo, it never recolours what `state` already owns.
 */
export const WiredAndError: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="wired, no diagnostic">
        <Port state="wired" />
      </Specimen>
      <Specimen caption="wired AND error — both marks at once">
        <Port state="wired" diagnostics={mark("error", "Two producers wired into one port")} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const dots = canvasElement.querySelectorAll('[data-slot="port-dot"]');
    const [wiredOnly, wiredAndError] = Array.from(dots) as HTMLElement[];
    const cores = canvasElement.querySelectorAll('[data-slot="port-dot-core"]');
    const [coreWiredOnly, coreWiredAndError] = Array.from(cores) as HTMLElement[];

    // The core (wired's own lit-core paint) is untouched, colour for colour.
    await expect(getComputedStyle(coreWiredAndError).background).toBe(getComputedStyle(coreWiredOnly).background);
    // The diagnostic halo is a pure ADDITION — the wired dot's own box-shadow
    // stays a strict prefix of the marked dot's.
    const wiredShadow = getComputedStyle(wiredOnly).boxShadow;
    const markedShadow = getComputedStyle(wiredAndError).boxShadow;
    await expect(markedShadow.startsWith(wiredShadow)).toBe(true);
    await expect(markedShadow.length).toBeGreaterThan(wiredShadow.length);
    await expect(wiredAndError.dataset.diagnostic).toBe("error");
    await expect(wiredAndError.dataset.state).toBe("wired");
  },
};

/* ------------------------------------------------------------------ */
/* LabeledPort — dot halo + wavy/dotted underline under the label text */
/* ------------------------------------------------------------------ */

export const LabeledPortGallery: Story = {
  render: () => (
    <Gallery>
      {/* Each dot is wrapped in a fixed-width box: the label is an OVERLAY
          extending OUTWARD from the dot's own layout box (labeledPort.tsx's
          own B4 note), so its real width never reserves flex space on its
          own — without a reserved width here, the label of one specimen
          visually overlaps the next. */}
      <div style={{ width: 130 }}>
        <Specimen caption="none">
          <LabeledPort edge="left" direction="input" state="wired">
            amount
          </LabeledPort>
        </Specimen>
      </div>
      <div style={{ width: 130 }}>
        <Specimen caption="error — halo + wavy underline">
          <LabeledPort edge="left" direction="input" state="wired" diagnostics={mark("error", "Undefined variable")}>
            amount
          </LabeledPort>
        </Specimen>
      </div>
      <div style={{ width: 130 }}>
        <Specimen caption="warning — amber halo + wavy underline">
          <LabeledPort edge="left" direction="input" state="wired" diagnostics={mark("warning", "Shadows an outer name")}>
            amount
          </LabeledPort>
        </Specimen>
      </div>
      <div style={{ width: 130 }}>
        <Specimen caption="info — dotted underline, no halo">
          <LabeledPort edge="left" direction="input" state="wired" diagnostics={mark("info", "Inferred as number")}>
            amount
          </LabeledPort>
        </Specimen>
      </div>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const labels = canvasElement.querySelectorAll('[data-slot="port-label-display"]');
    const [none, error, warning, info] = Array.from(labels) as HTMLElement[];
    const decoration = (el: HTMLElement) => getComputedStyle(el).textDecorationLine;
    const style = (el: HTMLElement) => getComputedStyle(el).textDecorationStyle;

    await expect(decoration(none)).toBe("none");
    await expect(decoration(error)).toBe("underline");
    await expect(style(error)).toBe("wavy");
    await expect(decoration(warning)).toBe("underline");
    await expect(style(warning)).toBe("wavy");
    await expect(decoration(info)).toBe("underline");
    await expect(style(info)).toBe("dotted");

    // The dot halo composes the SAME way Port's own gallery proved above —
    // spot-check just the error case here rather than repeat that whole
    // assertion.
    const dots = canvasElement.querySelectorAll('[data-slot="port-dot"]');
    const [dotNone, dotError] = Array.from(dots) as HTMLElement[];
    const shadowOf = (el: HTMLElement) => getComputedStyle(el).boxShadow;
    await expect(shadowOf(dotError).startsWith(shadowOf(dotNone))).toBe(true);
  },
};

/* ------------------------------------------------------------------ */
/* Block — glow (error only by default) + corner flag (error/warning)  */
/* ------------------------------------------------------------------ */

export const BlockGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="none">
        <Block width={160} height={90} header="Resize" body="node" />
      </Specimen>
      <Specimen caption="error — glow + flag">
        <Block width={160} height={90} header="Resize" body="node" diagnostics={mark("error", "Missing required input", "Ruff(F407)")} />
      </Specimen>
      <Specimen caption="warning — flag only, no glow ('must not shout')">
        <Block width={160} height={90} header="Resize" body="node" diagnostics={mark("warning", "Deprecated block type")} />
      </Specimen>
      <Specimen caption="info — nothing at all">
        <Block width={160} height={90} header="Resize" body="node" diagnostics={mark("info", "Auto-generated block")} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const blocks = canvasElement.querySelectorAll('[data-slot="block"]');
    const [none, error, warning, info] = Array.from(blocks) as HTMLElement[];
    const shadowOf = (el: HTMLElement) => getComputedStyle(el).boxShadow;
    // The flag is a CHILD of the block's own root (see block.tsx's
    // `block-diagnostic-flag` wrapper) — search WITHIN this specimen's
    // block, not its parent, so two blocks sharing an ancestor row never
    // cross-match each other's flag.
    const flagOf = (el: HTMLElement) => el.querySelector('[data-slot="diagnostic-flag"]') ?? null;

    // error: glow present (boxShadow grew past the resting shadow) + flag.
    await expect(shadowOf(error)).not.toBe(shadowOf(none));
    await expect(flagOf(error)).not.toBeNull();
    await expect(flagOf(error)?.getAttribute("data-severity")).toBe("error");

    // warning: NO glow (byte-identical resting shadow to "none") but the
    // flag IS present — the two channels move independently.
    await expect(shadowOf(warning)).toBe(shadowOf(none));
    await expect(flagOf(warning)).not.toBeNull();
    await expect(flagOf(warning)?.getAttribute("data-severity")).toBe("warning");

    // info: nothing — no glow, no flag.
    await expect(shadowOf(info)).toBe(shadowOf(none));
    await expect(flagOf(info)).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* Trace — translucent backdrop under the wire, stroke stays itself    */
/* ------------------------------------------------------------------ */

const TRACE_PATH = "M 10 50 L 220 50";
const TRACE_POINTS = [
  { x: 10, y: 50 },
  { x: 220, y: 50 },
];

function TraceSpecimen({ id, diagnostics }: { id: string; diagnostics?: Diagnostic[] }) {
  return (
    <svg width={230} height={70} style={{ display: "block" }}>
      <TraceBody id={id} path={TRACE_PATH} points={TRACE_POINTS} variant="data" diagnostics={diagnostics} />
    </svg>
  );
}

export const TraceGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="none">
        <TraceSpecimen id="trace-none" />
      </Specimen>
      <Specimen caption="error — danger backdrop">
        <TraceSpecimen id="trace-error" diagnostics={mark("error", "Cycle detected")} />
      </Specimen>
      <Specimen caption="warning — amber backdrop">
        <TraceSpecimen id="trace-warning" diagnostics={mark("warning", "Crosses a fold boundary")} />
      </Specimen>
      <Specimen caption="info — nothing">
        <TraceSpecimen id="trace-info" diagnostics={mark("info", "Async edge")} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const groups = canvasElement.querySelectorAll('[data-slot="trace"]');
    const [none, error, warning, info] = Array.from(groups) as SVGGElement[];
    const backdropOf = (g: SVGGElement) => g.querySelector('[data-slot="trace-diagnostic-backdrop"]');

    await expect(backdropOf(none)).toBeNull();
    await expect(backdropOf(error)).not.toBeNull();
    await expect(backdropOf(warning)).not.toBeNull();
    await expect(backdropOf(info)).toBeNull();

    // The visible stroke keeps its OWN colour regardless of the backdrop —
    // channel discipline: the diagnostic axis paints a NEW layer, it never
    // recolours the line.
    const lineOf = (g: SVGGElement) => g.querySelector('[data-slot="trace-line"][data-trace-segment="whole"]:not([data-sketch])');
    const strokeNone = getComputedStyle(lineOf(none)!).stroke;
    const strokeError = getComputedStyle(lineOf(error)!).stroke;
    await expect(strokeError).toBe(strokeNone);
  },
};

/* ------------------------------------------------------------------ */
/* CodeEditor — positional squiggles, @codemirror/lint                 */
/* ------------------------------------------------------------------ */

const CODE_SAMPLE = "total = price * qty + shiping_fee";
// "price" (8..13) is fine; "shiping_fee" (26..37) is a typo (error);
// "qty" (16..19) is unused (warning); the whole line gets an info note.
const CODE_DIAGNOSTICS: CodeEditorDiagnostic[] = [
  { from: 26, to: 37, severity: "error", message: "Undefined name — did you mean 'shipping_fee'?" },
  { from: 16, to: 19, severity: "warning", message: "Unused after this point" },
];

export const CodeEditorGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="one field, two positional marks — an error squiggle and a warning squiggle, independently ranged (never a max-severity merge: that's the one component in this axis that stays a list of RANGES, not a list of findings about one element)">
        <CodeEditor value={CODE_SAMPLE} onWrite={() => {}} columns={36} diagnostics={CODE_DIAGNOSTICS} />
      </Specimen>
      <Specimen caption="no diagnostics">
        <CodeEditor value={CODE_SAMPLE} onWrite={() => {}} columns={36} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const editors = canvasElement.querySelectorAll('[data-slot="code-editor"]');
    const [marked, plain] = Array.from(editors) as HTMLElement[];
    // The stock @codemirror/lint marks land as `.cm-lintRange-*` spans.
    await expect(marked.querySelector(".cm-lintRange-error")).not.toBeNull();
    await expect(marked.querySelector(".cm-lintRange-warning")).not.toBeNull();
    await expect(marked.querySelector(".cm-lintRange-info")).toBeNull();
    // A field-wide error also sets the existing `ariaInvalid` (§5's own
    // words) — checked as the real DOM attribute, not inferred.
    await expect(marked.getAttribute("aria-invalid")).toBe("true");
    await expect(plain.querySelector(".cm-lintRange-error")).toBeNull();
    await expect(plain.getAttribute("aria-invalid")).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* EditableText — wavy/dotted underline on the rest span               */
/* ------------------------------------------------------------------ */

export const EditableTextGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="none">
        <EditableText sizePx={16}>Block Title</EditableText>
      </Specimen>
      <Specimen caption="error — wavy">
        <EditableText sizePx={16} diagnostics={mark("error", "Duplicate name")}>
          Block Title
        </EditableText>
      </Specimen>
      <Specimen caption="warning — amber wavy">
        <EditableText sizePx={16} diagnostics={mark("warning", "Long name may clip")}>
          Block Title
        </EditableText>
      </Specimen>
      <Specimen caption="info — dotted">
        <EditableText sizePx={16} diagnostics={mark("info", "Renamed from 'Untitled'")}>
          Block Title
        </EditableText>
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const spans = canvasElement.querySelectorAll('[data-slot="editable-text-content"]');
    const [none, error, warning, info] = Array.from(spans) as HTMLElement[];
    const style = (el: HTMLElement) => getComputedStyle(el).textDecorationStyle;
    const line = (el: HTMLElement) => getComputedStyle(el).textDecorationLine;

    await expect(line(none)).toBe("none");
    await expect(style(error)).toBe("wavy");
    await expect(style(warning)).toBe("wavy");
    await expect(style(info)).toBe("dotted");
  },
};

/* ------------------------------------------------------------------ */
/* Badge — the new warning variant, beside the existing two            */
/* ------------------------------------------------------------------ */

export const BadgeGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption='error — variant="destructive" (existed already)'>
        <Badge variant="destructive">error</Badge>
      </Specimen>
      <Specimen caption='warning — new variant="warning", amber bg, dark text'>
        <Badge variant="warning">warning</Badge>
      </Specimen>
      <Specimen caption='info — variant="secondary" (existed already)'>
        <Badge variant="secondary">info</Badge>
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warningBadge = await canvas.findByText("warning");
    const style = getComputedStyle(warningBadge);
    // Dark text on the amber bg, both real computed colours — not just
    // "the class exists".
    await expect(style.color).not.toBe(style.backgroundColor);
    await expect(warningBadge.dataset.slot).toBe("badge");
  },
};

/* ------------------------------------------------------------------ */
/* ValueCapsule — glow only, no flag; warning ALSO earns the glow here */
/* because there is no other channel (§5's own words for this row)     */
/* ------------------------------------------------------------------ */

export const ValueCapsuleGallery: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="none">
        <ValueCapsule value="42" onWrite={() => {}} />
      </Specimen>
      <Specimen caption="error — pill glow + squiggle across the expression">
        <ValueCapsule value="totl_price" onWrite={() => {}} diagnostics={mark("error", "Undefined name")} />
      </Specimen>
      <Specimen caption="warning — amber glow (no flag to carry it instead)">
        <ValueCapsule value="0.999999" onWrite={() => {}} diagnostics={mark("warning", "Precision loss likely")} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const blocks = canvasElement.querySelectorAll('[data-slot="block"]');
    const [none, error, warning] = Array.from(blocks) as HTMLElement[];
    const shadowOf = (el: HTMLElement) => getComputedStyle(el).boxShadow;

    await expect(shadowOf(error)).not.toBe(shadowOf(none));
    await expect(shadowOf(warning)).not.toBe(shadowOf(none));
    // No flag anywhere in this preset — "a capsule is too small".
    await expect(canvasElement.querySelector('[data-slot="diagnostic-flag"]')).toBeNull();
    // The squiggle rides the capsule's own CodeEditor.
    await expect(error.querySelector(".cm-lintRange-error")).not.toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* The board with problems — a marked port inside a marked block with  */
/* a marked cable, so the calm-at-rest question is answerable by       */
/* looking, per the brief.                                             */
/* ------------------------------------------------------------------ */

const BOARD_ITEMS: PortEdgeItem[] = [
  { id: "in-a", label: "threshold", state: "wired", diagnostics: mark("error", "Two edges wired into one port") },
  { id: "in-b", label: "mode", state: "valueSet" },
];

export const BoardWithProblems: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <Caption>
        One board, three producers of the same three marks: a wired port with two producers (error), a block whose
        output type disagrees with a downstream reader (warning), and a delayed cable that crosses a fold (error) — the
        question this specimen answers is whether the rest of the board still reads calmly beside them.
      </Caption>
      <div style={{ display: "flex", gap: 48, alignItems: "center" }}>
        <Block
          width={200}
          height={140}
          header="Threshold Filter"
          diagnostics={mark("warning", "Output type disagrees with 'Accumulator'")}
          body={<PortEdge edge="left" items={BOARD_ITEMS} size={{ width: 160, height: 100 }} />}
        />
        <svg width={140} height={70} style={{ display: "block" }}>
          <TraceBody
            id="board-with-problems-cable"
            path="M 10 35 L 130 35"
            points={[{ x: 10, y: 35 }, { x: 130, y: 35 }]}
            variant="data"
            diagnostics={mark("error", "Crosses a collapsed fold")}
          />
        </svg>
        <Block width={160} height={90} header="Accumulator" body="sum" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Every producer's mark actually landed — the composition test that
    // makes "does the board still read calmly" answerable by looking
    // rather than merely asserted.
    await expect(canvasElement.querySelector('[data-slot="port-dot"][data-diagnostic="error"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-slot="block-diagnostic-flag"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-slot="trace-diagnostic-backdrop"]')).not.toBeNull();
    // The unmarked "Accumulator" block stays completely quiet — no flag,
    // no glow — which is the calm half of the claim.
    const blocks = canvasElement.querySelectorAll('[data-slot="block"]');
    const accumulator = blocks[blocks.length - 1] as HTMLElement;
    await expect(accumulator.querySelector('[data-slot="block-diagnostic-flag"]')).toBeNull();
  },
};
