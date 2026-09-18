import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { Badge } from "../components/badge";
import { Port } from "../components/port";
import { TraceBody } from "../components/trace";
import { CodeEditor } from "../components/codeEditor";
import { LabeledPort } from "../components/labeledPort";
import { BlockPort } from "../components/blockPort";
import { PortEdge, type PortEdgeItem } from "../components/portEdge";
import { TraceTerminal } from "../components/traceTerminal";
import { Button } from "../components/button";
import { Toggle } from "../components/toggle";
import { EditableText } from "../components/editableText";
import { Text } from "../components/text";
import { FoldingChevron } from "../components/foldingChevron";
import { ValueCapsule } from "../presets/value/value";
import { BBOX_SKINS, BBOX_SKIN_LABELS, bboxSkinAttrs, type BboxSkin } from "../skin/skin";
import { SketchAtEdge } from "../skin/SketchAtEdge";
import { SKETCH_TWIN_ATTR } from "../skin/sketchAtEdge";

/**
 * Styles/** — the skin system (src/skin/**, ported from packages/bbox-ui,
 * frozen v1) brought to this app's own components, across all five
 * tranches of the port (Tranche 2: block/badge/port/trace/codeEditor;
 * Tranche 3: composites; Tranche 4: shadcn primitives; Tranche 5:
 * presets/value). `.storybook/preview.tsx`'s toolbar "Skin" global
 * switches every story in this file (and every other story in the app)
 * live — these stories exist to show the language at a glance, not to be
 * the only place it is visible.
 *
 * COVERAGE — "every painting component" made measurable, not a claim.
 *
 *   Component     | Paints                          | Reads
 *   ------------- | -------------------------------- | ------------------------------------------------
 *   Block         | border, radius, surface, shadow  | stroke(-width), radius, surface, shadow, fg, font
 *   Badge         | radius, (outline variant) border | radius(-pill), line-override, ink (via SketchOutline)
 *   Port          | box-shadow rings                 | dot-rings, ink (via SketchOutline's drawn ring)
 *   Trace         | SVG stroke                        | crisp, outline (the drawn/crisp path pair)
 *   CodeEditor    | border, radius, background, font  | stroke(-width), radius, surface, fg, font-mono
 *   LabeledPort   | (label text) font-family          | font-sans
 *   PortEdge      | edge line, card overlay, group    | stroke, stroke-width, radius, line-override, outline
 *                 | outline border/radius             |
 *   BlockMembers  | card overlay border/radius        | radius, stroke-width
 *   TraceTerminal | SVG stroke (the ring)              | line-override, outline (the drawn/crisp ring pair)
 *   Button        | radius, (outline variant) border  | radius, line-override
 *   Toggle        | radius, (outline variant) border  | radius, line-override
 *   Tooltip       | radius                            | radius (NOT DOM-verified — see below)
 *   DropdownMenu  | radius, divider background        | radius, stroke (NOT DOM-verified — see below)
 *   EditableText  | (text) font-family, `font:"sans"`  | font-sans
 *   Text          | (text) font-family                | font-sans
 *   FoldingChevron| radius                            | radius
 *
 *   Bar, Collapsible, BlockPort, TraceBadge, WireLayer, ValueCapsule
 *                 | NOTHING of their own — layout/positioning wrappers
 *                 | around already-wired children. See skin.test.ts's own
 *                 | "coverage (S4)" describe block for the grepped proof
 *                 | (and, for ValueCapsule specifically, why its
 *                 | border/background literal is a permanent suppression,
 *                 | not a paint a skin could ever drive).
 *
 * WHY Tooltip and DropdownMenu are NOT in `AllComponents`/`NoSkinRegression`
 * below despite being wired: both render their real content through a Base
 * UI `Portal` (`document.body` by default), which escapes the `data-bbox-
 * skin` attribute this file stamps on each column's own DOM subtree — a
 * live per-skin DOM comparison would need `tooltip.tsx`/`dropdown-menu.tsx`
 * to accept a portal `container` override neither exposes today, which is
 * new scope past "wire the token". Their radius/stroke wiring is instead
 * checked at the SOURCE level (skin.test.ts: the exact byte-identical
 * fallback literal is present, verbatim, in each file) rather than against
 * live `getComputedStyle` output. Said plainly rather than silently
 * skipped.
 */

const meta = {
  title: "Styles",
  tags: ["area:styles", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SKIN_COLUMN_LABEL: Record<BboxSkin, string> = BBOX_SKIN_LABELS;

/** One straight SVG path between two fixed points — enough to demonstrate
 * Trace's crisp/sketch pair without pulling in the routing engine
 * (trace.routing.ts), which is orthogonal to what this file is showing. */
function straightPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/**
 * Path commands in ONE PASS of a `d` string — `M`/`L`/`C`/`Q`/`Z`, case-
 * insensitive, counted only up to the second `M` (the start of the next
 * pass, if any).
 *
 * TWO pitfalls this specifically avoids, both measured live against this
 * exact story, both false-negative-proof (a broken build reads as fixed)
 * or false-positive-proof (a fixed build reads as broken) if skipped:
 *
 *  1. Counting only `L`: `sketchPath.ts`'s own `smoothThrough` ALWAYS
 *     closes an open subpath (`close: false`, what `sketchPathData` always
 *     passes) with exactly one trailing `L`, regardless of how many
 *     interior `Q`s precede it — so a correctly jittered 18-point pass and
 *     a broken 2-point one both have exactly ONE `L`. Counting `L` alone
 *     is an invariant, not a signal; it is what produced a false
 *     "still broken" reading against a build that was actually fixed
 *     (measured live: a working sketch path read 2 `L`s across its two
 *     passes and 18 `Q`s — the `Q`s are where the fix shows up).
 *  2. Counting every command ACROSS BOTH PASSES: `sketchPathData` draws
 *     `passes = 2` by default, so even a STILL-BROKEN two-point path
 *     doubles to `M...L...M...L` — 4 commands — which is already MORE
 *     than the crisp path's 2, passing a whole-string count vacuously
 *     (the exact "extra element exists is not a difference" failure mode
 *     `sketchPath.test.ts`'s own header warns about, caught there by
 *     mutation testing and reproduced here on purpose before fixing it).
 *     Only ONE pass, compared against the crisp path's own count, proves
 *     a pass actually grew interior points it didn't have before.
 */
function firstPassSegmentCount(d: string): number {
  const firstPass = d.match(/M[^M]*/)?.[0] ?? d;
  return (firstPass.match(/[MLCQZ]/gi) ?? []).length;
}

/* ==================================================================== */
/* AllComponents — the matrix: every painting component x the 3 skins.   */
/* ==================================================================== */

function ComponentRow({ name, children }: { name: string; children: (skin: BboxSkin) => React.ReactNode }) {
  return (
    <div data-testid={`row-${name}`} style={{ display: "grid", gridTemplateColumns: "120px repeat(3, 220px)", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{name}</span>
      {BBOX_SKINS.map((skin) => {
        const cell = (
          <div key={skin} {...bboxSkinAttrs(skin)} data-testid={`cell-${name}-${skin}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 72 }}>
            {children(skin)}
          </div>
        );
        // WHY only the "sketch" cell wraps in <SketchAtEdge>
        // (docs/peps/0001-sketch-skin-at-the-boundary.md M8): "default" and
        // "plain" are pure CSS — the token layer alone accounts for every
        // difference between them and no-skin-set. "sketch" is the one
        // skin with a GEOMETRY half, and the core no longer draws it —
        // without this wrapper `data-bbox-skin="sketch"` alone produces
        // zero measurable difference for a component like Port, whose
        // entire crisp-visible sketch mark used to be its now-deleted
        // in-core ring. `display: contents` (SketchAtEdge's own wrapper
        // style) is a documented CSS Grid exception: an element with it
        // is removed from the box tree and its children participate in
        // the grid as if it were not there, so this adds no extra column.
        return skin === "sketch" ? <SketchAtEdge key={skin}>{cell}</SketchAtEdge> : cell;
      })}
    </div>
  );
}

export const AllComponents: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 32 }}>
      <div style={{ display: "grid", gridTemplateColumns: "120px repeat(3, 220px)", gap: 16 }}>
        <span />
        {BBOX_SKINS.map((skin) => (
          <span key={skin} style={{ fontSize: 12, fontWeight: 600 }}>{SKIN_COLUMN_LABEL[skin]}</span>
        ))}
      </div>

      <ComponentRow name="Block">
        {() => <Block header="Header" body="Body" width={180} height={90} />}
      </ComponentRow>

      <ComponentRow name="Badge">
        {() => (
          <div style={{ display: "flex", gap: 8 }}>
            <Badge>Default</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge shape="pill">Pill</Badge>
          </div>
        )}
      </ComponentRow>

      <ComponentRow name="Port">
        {() => (
          <div style={{ display: "flex", gap: 16 }}>
            <Port state="empty" />
            <Port state="wired" />
            <Port state="received" />
          </div>
        )}
      </ComponentRow>

      <ComponentRow name="Trace">
        {() => (
          <svg width={160} height={40} style={{ overflow: "visible" }}>
            <TraceBody id="all-components-trace" path={straightPath(4, 20, 156, 20)} length={152} variant="data" />
          </svg>
        )}
      </ComponentRow>

      <ComponentRow name="CodeEditor">
        {() => (
          <div style={{ width: 180 }}>
            <CodeEditor value="port.value" onWrite={() => {}} multiline={false} />
          </div>
        )}
      </ComponentRow>

      {/* Tranche 3 — composites */}
      <ComponentRow name="LabeledPort">
        {() => <LabeledPort edge="left" state="wired">value</LabeledPort>}
      </ComponentRow>

      <ComponentRow name="PortEdge">
        {() => (
          <PortEdge
            edge="left"
            items={[
              { id: "a", label: "a", state: "empty" },
              { id: "b", label: "b", state: "wired" },
            ]}
            showCard
            size={{ width: 140, height: 100 }}
          />
        )}
      </ComponentRow>

      <ComponentRow name="BlockMembers">
        {() => <Block width={200} height={140} members={[{ id: "m1", content: "Member" }]} showCards />}
      </ComponentRow>

      <ComponentRow name="TraceTerminal">
        {() => (
          <svg width={40} height={40} style={{ overflow: "visible" }}>
            <TraceTerminal x={20} y={20} dir="right" />
          </svg>
        )}
      </ComponentRow>

      {/* Tranche 4 — shadcn primitives */}
      <ComponentRow name="Button">
        {() => <Button variant="outline">Outline</Button>}
      </ComponentRow>

      <ComponentRow name="Toggle">
        {() => <Toggle variant="outline">On</Toggle>}
      </ComponentRow>

      <ComponentRow name="EditableText">
        {() => <EditableText size="md">value</EditableText>}
      </ComponentRow>

      <ComponentRow name="Text">
        {() => <Text>label</Text>}
      </ComponentRow>

      <ComponentRow name="FoldingChevron">
        {() => <FoldingChevron open={false} onClick={() => {}} />}
      </ComponentRow>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // S2 — a measurable difference per component, not just on one. Compare
    // the "default"/"no-skin-equivalent" column against "sketch" for each
    // row: at least one of {border-radius, border-color, background,
    // box-shadow, font-family, the drawn outline's display} must change.
    // PER-ROW selector for the one element that carries this component's
    // OWN paint (never a child's — Trace's marker, say, or a Block nested
    // inside a composite row, would otherwise let an unrelated descendant's
    // difference paper over this row's own read never firing).
    const ROW_SELECTOR: Record<string, string> = {
      Block: '[data-slot="block"]',
      Badge: '[data-slot="badge"]',
      Port: '[data-slot="port-dot"]',
      Trace: `[data-slot="trace-line"]:not([${SKETCH_TWIN_ATTR}])`,
      CodeEditor: ".bbox-code-editor",
      LabeledPort: '[data-slot="port-label-display"]',
      PortEdge: '[data-slot="port-edge"]',
      BlockMembers: '[data-slot="block-member-card"]',
      TraceTerminal: '[data-slot="trace-terminal-ring"]',
      Button: '[data-slot="button"]',
      Toggle: '[data-slot="toggle"]',
      EditableText: '[data-slot="editable-text"]',
      Text: '[data-slot="text"]',
      FoldingChevron: '[data-slot="folding-chevron"]',
    };
    // The sketch column's boundary pass runs in a layout effect; wait for
    // ITS OWN twin (Port's) before measuring, since Port is the one row
    // with no other skin-driven difference to fall back on if the pass
    // hasn't drawn yet.
    await waitFor(() => {
      const cell = canvasElement.querySelector(`[data-testid="cell-Port-sketch"]`)!;
      expect(cell.querySelectorAll(`[${SKETCH_TWIN_ATTR}]`).length).toBeGreaterThan(0);
    });
    for (const [name, selector] of Object.entries(ROW_SELECTOR)) {
      const defaultCell = canvasElement.querySelector(`[data-testid="cell-${name}-default"]`);
      const sketchCell = canvasElement.querySelector(`[data-testid="cell-${name}-sketch"]`);
      if (!(defaultCell instanceof HTMLElement) || !(sketchCell instanceof HTMLElement)) {
        throw new Error(`missing cell for ${name}`);
      }
      const paintable = defaultCell.querySelector<HTMLElement | SVGElement>(selector);
      const paintableSketch = sketchCell.querySelector<HTMLElement | SVGElement>(selector);
      if (!paintable || !paintableSketch) throw new Error(`no paintable element found for ${name}`);
      const a = getComputedStyle(paintable);
      const b = getComputedStyle(paintableSketch);
      // WHY this now checks for the BOUNDARY's twin, not
      // `[data-slot="sketch-outline"]`/`[data-slot="trace-terminal-ring-
      // sketch"]` (docs/peps/0001-sketch-skin-at-the-boundary.md M8): the
      // core renders neither any more. `sketchCell` is wrapped in
      // `<SketchAtEdge>` (see `ComponentRow`), so a twin sibling/child now
      // exists wherever the core used to render its own drawn outline.
      const drawnB = sketchCell.querySelector(`[${SKETCH_TWIN_ATTR}]`);
      const outlineDiffers = drawnB != null;
      // Trace/TraceTerminal have none of border-radius/background/box-shadow
      // (their "paintable" is an SVG element, where those properties are
      // meaningless) — what changes for them is `display` (the crisp/
      // sketch pair) or `stroke` (TraceTerminal's line-override).
      const strokeOf = (style: CSSStyleDeclaration) => (style as CSSStyleDeclaration & { stroke?: string }).stroke;
      const differs =
        a.borderRadius !== b.borderRadius ||
        a.borderColor !== b.borderColor ||
        a.backgroundColor !== b.backgroundColor ||
        a.boxShadow !== b.boxShadow ||
        a.display !== b.display ||
        a.fontFamily !== b.fontFamily ||
        strokeOf(a) !== strokeOf(b) ||
        outlineDiffers;
      await expect(differs, `${name}: expected a measurable difference between default and sketch`).toBe(true);
    }
  },
};

/* ==================================================================== */
/* Sketch — the hand-drawn skin on real compositions.                    */
/* ==================================================================== */

function WiredScene() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32, padding: 24 }}>
      <Block header={<Badge variant="secondary">Source</Badge>} body={<Port state="wired" />} width={140} height={100} />
      <svg width={100} height={24} style={{ overflow: "visible" }}>
        <TraceBody id="sketch-scene-trace" path={straightPath(0, 12, 100, 12)} length={100} variant="data" animated />
      </svg>
      <Block header={<Badge variant="secondary">Sink</Badge>} body={<Port state="received" />} width={140} height={100} />
    </div>
  );
}

/**
 * WiredCompositeScene — Tranche 3-4's own visual-check surface (the task's
 * "look at the sketch skin on a wired scene ... reads as one coherent
 * hand-drawn language or as five components each sketched slightly
 * differently"). Every component this pass wired, on one board: a real
 * `PortEdge` rail (grouped, card overlay + group outline) via `BlockPort`,
 * a `TraceTerminal` pair, and the shadcn primitives (`Button`/`Toggle`
 * outline variants, `FoldingChevron`, `EditableText`, `Text`).
 */
function WiredCompositeScene() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <BlockPort
          id="wired-scene-block"
          view="port"
          edges={{
            left: {
              items: [
                { id: "p1", label: "p1", state: "wired" },
                { id: "p2", label: "p2", state: "empty" },
              ],
            },
          }}
        >
          <Block header={<Text>Panel</Text>} body={<EditableText size="sm">value</EditableText>} width={160} height={110} />
        </BlockPort>
        <svg width={60} height={40} style={{ overflow: "visible" }}>
          <TraceTerminal x={12} y={20} dir="right" />
          <TraceTerminal x={48} y={20} dir="left" showDirection={false} />
        </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <FoldingChevron open={open} onClick={() => setOpen((v) => !v)} />
        <Button variant="outline">Run</Button>
        <Toggle variant="outline">On</Toggle>
      </div>
    </div>
  );
}

function TraceGallery() {
  const variants = ["data", "async", "delayed"] as const;
  return (
    <div style={{ display: "flex", gap: 24, padding: 24 }}>
      {variants.map((variant) => (
        <div key={variant} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <svg width={140} height={32} style={{ overflow: "visible" }}>
            <TraceBody id={`sketch-gallery-${variant}`} path={straightPath(4, 16, 136, 16)} length={132} variant={variant} />
          </svg>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{variant}</span>
        </div>
      ))}
    </div>
  );
}

export const Sketch: Story = {
  render: () => (
    // WHY <SketchAtEdge> wraps here too (docs/peps/0001-sketch-skin-at-the-
    // boundary.md M8): `bboxSkinAttrs("sketch")` alone is now only the
    // token half (fill, font, radius, stroke width). Every drawn outline
    // this story asserts on comes from the boundary pass, not from the
    // components underneath, which import no skin at all any more.
    <SketchAtEdge>
      <div {...bboxSkinAttrs("sketch")} style={{ display: "flex", flexDirection: "column", gap: 32, padding: 32 }}>
        <WiredScene />
        <Block header={<Badge>Function</Badge>} body={<CodeEditor value="return value * 2" onWrite={() => {}} multiline={false} />} width={280} height={110} />
        <TraceGallery />
        <WiredCompositeScene />
      </div>
    </SketchAtEdge>
  ),
  play: async ({ canvasElement }) => {
    // The pass runs in a layout effect; wait for its output rather than
    // assuming a frame has already elapsed.
    await waitFor(() => {
      expect(canvasElement.querySelectorAll(`[${SKETCH_TWIN_ATTR}]`).length).toBeGreaterThan(0);
    });

    // Every drawn twin in the scene is actually visible — not just present
    // with `display: none`. `[${SKETCH_TWIN_ATTR}]` covers all three
    // twin shapes at once (trace-line paths, TraceTerminal ring paths,
    // Block/Badge/PortEdge-group/Port box-or-dot <svg>s).
    const outlines = canvasElement.querySelectorAll(`[${SKETCH_TWIN_ATTR}]`);
    await expect(outlines.length).toBeGreaterThan(0);
    for (const el of outlines) {
      await expect(getComputedStyle(el).display, "a sketch-skinned scene must show every drawn outline").not.toBe("none");
    }
    // Every trace-line's crisp twin is hidden, its sketch twin shown.
    // Paired by DOM ADJACENCY (the mechanism's own identity, `findTwinFor`
    // in sketchAtEdge.ts) rather than by a blanket `[${SKETCH_TWIN_ATTR}]`
    // query: that query also matches TraceTerminal's ring twins, which
    // live in an unrelated `<g>` and would silently misalign the pairing.
    const crisp = [
      ...canvasElement.querySelectorAll<SVGPathElement>('path[data-slot="trace-line"]'),
    ].filter((p) => !p.hasAttribute(SKETCH_TWIN_ATTR));
    const sketched = crisp
      .map((p) => p.nextElementSibling)
      .filter((el): el is Element => el !== null && el.hasAttribute(SKETCH_TWIN_ATTR));
    await expect(crisp.length).toBeGreaterThan(0);
    await expect(sketched.length).toBe(crisp.length);
    for (const el of crisp) await expect(getComputedStyle(el).display).toBe("none");
    for (const el of sketched) await expect(getComputedStyle(el).display).not.toBe("none");

    // T1, checked where it actually matters — the RENDERED DOM, not just
    // the function in isolation (sketchPath.test.ts proves the function;
    // this proves the picture). Each sketch twin is paired with its crisp
    // sibling by DOM order (asserted equal-length just above, same `<g
    // data-slot="trace">` per pair) — its `d` must carry strictly more
    // path commands in its first pass than the crisp path (see
    // `firstPassSegmentCount`'s own note on why counting only `L`, or
    // counting across both passes, are both unsafe).
    for (let i = 0; i < crisp.length; i++) {
      const crispD = crisp[i].getAttribute("d") ?? "";
      const sketchD = sketched[i].getAttribute("d") ?? "";
      await expect(
        firstPassSegmentCount(sketchD),
        `trace-line[${i}]: sketch d ("${sketchD.slice(0, 40)}...") must have strictly more path commands than crisp d ("${crispD}")`,
      ).toBeGreaterThan(firstPassSegmentCount(crispD));
    }

    // `WiredCompositeScene`'s own PortEdge group outline (a `SketchOutline`
    // rect) and TraceTerminal ring — the drawn twin must show, the crisp
    // circle's stroke must be blanked.
    const terminalRing = canvasElement.querySelector('[data-slot="trace-terminal-ring"]');
    if (!terminalRing) throw new Error("missing trace-terminal-ring");
    // Sketch's `--bbox-skin-line-override: transparent` (skin.css) — the
    // browser reports a resolved transparent colour, not the keyword —
    // which is exactly "blanked", the same contract Badge's `line-override`
    // proves.
    await expect(getComputedStyle(terminalRing).stroke, "TraceTerminal's crisp ring stroke must be blanked in sketch").toBe("rgba(0, 0, 0, 0)");
  },
};

/* ==================================================================== */
/* SideBySide — one composition, three skins, identical geometry (S3).   */
/* ==================================================================== */

function GeometryComposition() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <Block header={<Badge variant="secondary">Panel</Badge>} body={<div style={{ display: "flex", gap: 12 }}><Port state="empty" /><Port state="wired" /><Port state="received" /></div>} width={220} height={120} />
      {/* A composition using the Tranche 3-4 components this port wired:
          BlockPort mounts a REAL PortEdge rail (LabeledPort dots, the
          skin's stroke/radius on the rail itself) on a real Block; the
          FoldingChevron and outline Button sit beside it. Excluded
          components (BlockPort itself) are exercised here for free by
          composing the wired ones underneath them. */}
      <BlockPort id="sbs-blockport" view="port" edges={{ left: { items: [{ id: "x", label: "x", state: "wired" }] } }}>
        <Block width={160} height={80} />
      </BlockPort>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <FoldingChevron open={false} onClick={() => {}} />
        <Button variant="outline">Go</Button>
      </div>
      {/* Tranche 5 — presets/value. Not a NEW token read (see this file's
          own coverage table and skin.test.ts's S4 note: its border/
          background overrides are a permanent, skin-independent
          suppression) — this proves T6 by composition instead: the pill
          radius (`valueCapsuleRadiusPx`) must equal exactly half the
          rendered height in EVERY skin, because it deliberately wins over
          `Block`'s own `--bbox-skin-radius` every time. */}
      <ValueCapsule id="sbs-value" value="tol" width={160} height={48} />
    </div>
  );
}

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40, padding: 32 }}>
      {BBOX_SKINS.map((skin) => (
        <div key={skin} {...bboxSkinAttrs(skin)} data-testid={`sbs-${skin}`} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{SKIN_COLUMN_LABEL[skin]}</span>
          <GeometryComposition />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // S3 — the geometry invariant. A skin paints; it must never move
    // anything. Every port-dot centre and the block rect itself must be
    // identical (±1px) across all three skins for this ONE composition.
    const columns = BBOX_SKINS.map((skin) => {
      const col = canvasElement.querySelector(`[data-testid="sbs-${skin}"]`);
      if (!(col instanceof HTMLElement)) throw new Error(`missing column for ${skin}`);
      return col;
    });

    const TOLERANCE_PX = 1;
    const relRect = (container: HTMLElement, el: Element) => {
      const c = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
    };

    // The block rect, relative to its own column (so the columns' own
    // flex gap doesn't count as "movement").
    const blockRects = columns.map((col) => {
      const block = col.querySelector('[data-slot="block"]');
      if (!block) throw new Error("missing block");
      return relRect(col, block);
    });
    const [refBlock, ...restBlocks] = blockRects;
    for (const rect of restBlocks) {
      await expect(Math.abs(rect.left - refBlock.left)).toBeLessThanOrEqual(TOLERANCE_PX);
      await expect(Math.abs(rect.top - refBlock.top)).toBeLessThanOrEqual(TOLERANCE_PX);
      await expect(Math.abs(rect.width - refBlock.width)).toBeLessThanOrEqual(TOLERANCE_PX);
      await expect(Math.abs(rect.height - refBlock.height)).toBeLessThanOrEqual(TOLERANCE_PX);
    }

    // Every port dot's centre, relative to its own column — 3 bare `Port`s
    // plus the one `BlockPort`/`PortEdge`/`LabeledPort` rail dot.
    const portCentresPerColumn = columns.map((col) => {
      const dots = [...col.querySelectorAll('[data-slot="port-dot"]')];
      if (dots.length !== 4) throw new Error(`expected 4 port dots, found ${dots.length}`);
      return dots.map((dot) => {
        const c = col.getBoundingClientRect();
        const r = dot.getBoundingClientRect();
        return { cx: r.left + r.width / 2 - c.left, cy: r.top + r.height / 2 - c.top };
      });
    });
    const [refPorts, ...restPorts] = portCentresPerColumn;
    for (const ports of restPorts) {
      for (let i = 0; i < refPorts.length; i++) {
        await expect(Math.abs(ports[i].cx - refPorts[i].cx), `port ${i} cx`).toBeLessThanOrEqual(TOLERANCE_PX);
        await expect(Math.abs(ports[i].cy - refPorts[i].cy), `port ${i} cy`).toBeLessThanOrEqual(TOLERANCE_PX);
      }
    }

    // The FoldingChevron and outline Button — Tranche 4 primitives — keep
    // their own rect identical across skins too (radius/border-colour are
    // paint, never geometry).
    for (const selector of ['[data-slot="folding-chevron"]', '[data-slot="button"]']) {
      const rects = columns.map((col) => {
        const el = col.querySelector(selector);
        if (!el) throw new Error(`missing ${selector}`);
        return relRect(col, el);
      });
      const [ref, ...rest] = rects;
      for (const rect of rest) {
        await expect(Math.abs(rect.left - ref.left), `${selector} left`).toBeLessThanOrEqual(TOLERANCE_PX);
        await expect(Math.abs(rect.top - ref.top), `${selector} top`).toBeLessThanOrEqual(TOLERANCE_PX);
        await expect(Math.abs(rect.width - ref.width), `${selector} width`).toBeLessThanOrEqual(TOLERANCE_PX);
        await expect(Math.abs(rect.height - ref.height), `${selector} height`).toBeLessThanOrEqual(TOLERANCE_PX);
      }
    }

    // T6 — the Value capsule's own radius-equals-half-height contract,
    // proved in EVERY skin, not just the default one ValuePreset.stories.
    // tsx's own `PillGeometry` story checks (see this file's own header on
    // why `ValueCapsule` itself reads no new token: its `borderRadius`
    // literal is deliberately the thing that must keep winning).
    for (const col of columns) {
      // The ValueCapsule's own Block root — 3rd `[data-slot="block"]` in DOM
      // order (the header/body Block, the plain BlockPort demo's Block,
      // then ValueCapsule's own).
      const block = col.querySelectorAll('[data-slot="block"]')[2];
      if (!block) throw new Error("missing ValueCapsule block");
      const rect = block.getBoundingClientRect();
      const corners = [
        getComputedStyle(block).borderTopLeftRadius,
        getComputedStyle(block).borderTopRightRadius,
        getComputedStyle(block).borderBottomLeftRadius,
        getComputedStyle(block).borderBottomRightRadius,
      ].map((v) => Number.parseFloat(v));
      for (const radius of corners) {
        await expect(Math.abs(radius - rect.height / 2), `ValueCapsule radius vs height/2 (${col.dataset.testid})`).toBeLessThanOrEqual(1);
      }
    }
  },
};

/* ==================================================================== */
/* NoSkinRegression — S1, checked against a LIVE reference, not a        */
/* hardcoded snapshot (a snapshot of e.g. `oklch(1 0 0 / 0.1)` would only */
/* hold in whatever colour scheme the test happened to run under).       */
/* ==================================================================== */

/** Block's chrome before this port, reproduced with the ORIGINAL Tailwind
 * utility classes this port replaced (block.tsx's own history — see the
 * className comment there). Rendered side by side with a real `<Block>`
 * with no skin attribute anywhere in scope, so the comparison is a live
 * computed-style equality, not a copied number that can go stale. */
function BlockReferenceBox() {
  return <div data-testid="block-reference" className="rounded-lg border border-border bg-card shadow-sm" style={{ width: 180, height: 90 }} />;
}

/** Badge's chrome before this port: `rounded-md`. */
function BadgeReferenceBox() {
  return <span data-testid="badge-reference" className="rounded-md" style={{ width: 40, height: 20, display: "inline-block" }} />;
}

/**
 * Tranche 3-4 reference elements — same recipe as Block/Badge's own above:
 * a plain element wired to the EXACT pre-token CSS expression (a literal
 * `var(--radius-lg)`/`var(--color-input)`/etc, never a copied pixel or
 * colour value that could go stale under a different theme), so the
 * comparison is live computed style vs. live computed style, not a
 * hardcoded snapshot.
 */
function RadiusReferenceBox({ testId, radiusVar }: { testId: string; radiusVar: string }) {
  return <span data-testid={testId} style={{ display: "inline-block", width: 24, height: 24, borderRadius: `var(${radiusVar})` }} />;
}
function OutlineBorderReferenceBox({ testId }: { testId: string }) {
  return <span data-testid={testId} style={{ display: "inline-block", width: 24, height: 24, border: "1px solid var(--color-input)" }} />;
}
function StrokeLineReferenceBox({ testId }: { testId: string }) {
  return <div data-testid={testId} style={{ width: 24, height: 1, background: "var(--border)" }} />;
}
/** PortEdge's own track radius was a plain literal `6` (`borderRadius: 6`,
 * no Tailwind class, no CSS var) before this port — so ITS reference is
 * the same bare literal, not a var alias to the thing under test. */
function LiteralRadiusReferenceBox({ testId, px }: { testId: string; px: number }) {
  return <span data-testid={testId} style={{ display: "inline-block", width: 24, height: 24, borderRadius: px }} />;
}
/** LabeledPort/Text's own font — `inherit` — is the ambient body font, so
 * the reference is simply an unstyled sibling span. */
function InheritFontReferenceBox({ testId }: { testId: string }) {
  return <span data-testid={testId}>x</span>;
}
/** EditableText's own font choice, `font="sans"` — the exact literal
 * `EDITABLE_TEXT_FONT_STACKS.sans` (editableText.layout.ts) fell back to
 * before this port, reproduced here rather than imported so the test
 * fails loudly if the two ever drift instead of silently importing the
 * "same" constant on both sides of the comparison. */
function SansFontReferenceBox({ testId }: { testId: string }) {
  return <span data-testid={testId} style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' }}>x</span>;
}

export const NoSkinRegression: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 32 }}>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Block header="Header" body="Body" width={180} height={90} />
        <BlockReferenceBox />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Badge>Badge</Badge>
        <BadgeReferenceBox />
      </div>

      {/* Tranche 3 */}
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <LabeledPort edge="left" state="wired">value</LabeledPort>
        <InheritFontReferenceBox testId="labeled-port-reference" />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <PortEdge edge="left" items={[{ id: "a", label: "a", state: "empty" }]} size={{ width: 100, height: 60 }} />
        <LiteralRadiusReferenceBox testId="port-edge-reference" px={6} />
        <StrokeLineReferenceBox testId="port-edge-line-reference" />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Block width={140} height={80} members={[{ id: "m1", content: "Member" }]} showCards />
        <RadiusReferenceBox testId="block-members-reference" radiusVar="--radius-lg" />
      </div>

      {/* Tranche 4 */}
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Button variant="outline">Outline</Button>
        <RadiusReferenceBox testId="button-radius-reference" radiusVar="--radius-lg" />
        <OutlineBorderReferenceBox testId="button-border-reference" />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Toggle variant="outline">On</Toggle>
        <RadiusReferenceBox testId="toggle-radius-reference" radiusVar="--radius-lg" />
        <OutlineBorderReferenceBox testId="toggle-border-reference" />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <EditableText size="md">value</EditableText>
        <SansFontReferenceBox testId="editable-text-reference" />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Text>label</Text>
        <InheritFontReferenceBox testId="text-reference" />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <FoldingChevron open={false} onClick={() => {}} />
        <RadiusReferenceBox testId="folding-chevron-reference" radiusVar="--radius-md" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // S1 — no skin set anywhere on the page -> every painting component's
    // computed border/background/radius/shadow/font is byte-identical to a
    // reference element built from the ORIGINAL (pre-port) expression.
    const block = canvasElement.querySelector('[data-slot="block"]');
    const blockRef = canvasElement.querySelector('[data-testid="block-reference"]');
    if (!block || !blockRef) throw new Error("missing block or its reference");
    const b = getComputedStyle(block);
    const r = getComputedStyle(blockRef);
    await expect(b.borderRadius, "Block border-radius vs pre-port rounded-lg").toBe(r.borderRadius);
    await expect(b.borderColor, "Block border-color vs pre-port border-border").toBe(r.borderColor);
    await expect(b.borderWidth, "Block border-width vs pre-port border").toBe(r.borderWidth);
    await expect(b.backgroundColor, "Block background vs pre-port bg-card").toBe(r.backgroundColor);
    await expect(b.boxShadow, "Block box-shadow vs pre-port shadow-sm").toBe(r.boxShadow);

    const badge = canvasElement.querySelector('[data-slot="badge"]');
    const badgeRef = canvasElement.querySelector('[data-testid="badge-reference"]');
    if (!badge || !badgeRef) throw new Error("missing badge or its reference");
    await expect(getComputedStyle(badge).borderRadius, "Badge border-radius vs pre-port rounded-md").toBe(getComputedStyle(badgeRef).borderRadius);

    const byTestId = (id: string) => {
      const el = canvasElement.querySelector(`[data-testid="${id}"]`);
      if (!el) throw new Error(`missing reference ${id}`);
      return getComputedStyle(el);
    };

    const labeledPortText = canvasElement.querySelector('[data-slot="port-label-display"]');
    if (!labeledPortText) throw new Error("missing port-label-display");
    await expect(getComputedStyle(labeledPortText).fontFamily, "LabeledPort font-family vs pre-port inherit").toBe(byTestId("labeled-port-reference").fontFamily);

    const portEdgeRoot = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!portEdgeRoot) throw new Error("missing port-edge");
    await expect(getComputedStyle(portEdgeRoot).borderRadius, "PortEdge track border-radius vs pre-port literal 6px").toBe(byTestId("port-edge-reference").borderRadius);

    const portEdgeLine = canvasElement.querySelector('[data-slot="port-edge-center-line"]');
    if (!portEdgeLine) throw new Error("missing port-edge-center-line");
    await expect(getComputedStyle(portEdgeLine).backgroundColor, "PortEdge centre-line background vs pre-port var(--border)").toBe(byTestId("port-edge-line-reference").backgroundColor);

    const blockMemberCard = canvasElement.querySelector('[data-slot="block-member-card"]');
    if (!blockMemberCard) throw new Error("missing block-member-card");
    await expect(getComputedStyle(blockMemberCard).borderRadius, "BlockMembers card-overlay border-radius vs pre-port rounded-lg").toBe(byTestId("block-members-reference").borderRadius);

    const buttonOutline = canvasElement.querySelector('[data-slot="button"]');
    if (!buttonOutline) throw new Error("missing button");
    await expect(getComputedStyle(buttonOutline).borderRadius, "Button border-radius vs pre-port rounded-lg").toBe(byTestId("button-radius-reference").borderRadius);
    await expect(getComputedStyle(buttonOutline).borderColor, "Button outline border-color vs pre-port border-input").toBe(byTestId("button-border-reference").borderColor);

    const toggleOutline = canvasElement.querySelector('[data-slot="toggle"]');
    if (!toggleOutline) throw new Error("missing toggle");
    await expect(getComputedStyle(toggleOutline).borderRadius, "Toggle border-radius vs pre-port rounded-lg").toBe(byTestId("toggle-radius-reference").borderRadius);
    await expect(getComputedStyle(toggleOutline).borderColor, "Toggle outline border-color vs pre-port border-input").toBe(byTestId("toggle-border-reference").borderColor);

    const editableTextRoot = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!editableTextRoot) throw new Error("missing editable-text");
    await expect(getComputedStyle(editableTextRoot).fontFamily, "EditableText font-family vs pre-port sans stack").toBe(byTestId("editable-text-reference").fontFamily);

    const textEl = canvasElement.querySelector('[data-slot="text"]');
    if (!textEl) throw new Error("missing text");
    await expect(getComputedStyle(textEl).fontFamily, "Text font-family vs pre-port inherit").toBe(byTestId("text-reference").fontFamily);

    const chevron = canvasElement.querySelector('[data-slot="folding-chevron"]');
    if (!chevron) throw new Error("missing folding-chevron");
    await expect(getComputedStyle(chevron).borderRadius, "FoldingChevron border-radius vs pre-port rounded-md").toBe(byTestId("folding-chevron-reference").borderRadius);
  },
};
