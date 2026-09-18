import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Block } from "../components/block";
import { Badge } from "../components/badge";
import { Port } from "../components/port";
import { TraceBody } from "../components/trace";
import { CodeEditor } from "../components/codeEditor";
import { BBOX_SKINS, BBOX_SKIN_LABELS, bboxSkinAttrs, type BboxSkin } from "../skin/skin";

/**
 * Styles/** — the skin system (src/skin/**, ported from packages/bbox-ui,
 * frozen v1) brought to this app's own components (Tranche 2 of the port:
 * `block.tsx`, `badge.tsx`, `port.tsx`, `trace.tsx`, `codeEditor.css`).
 * `.storybook/preview.tsx`'s toolbar "Skin" global switches every story in
 * this file (and every other story in the app) live — these three exist to
 * show the language at a glance, not to be the only place it is visible.
 *
 * COVERAGE — "every painting component" made measurable, not a claim
 * (Tranche 2 only; Tranches 3-5 are not part of this pass — see the
 * handoff report for what's left):
 *
 *   Component    | Paints                          | Reads
 *   ------------ | -------------------------------- | ------------------------------------------------
 *   Block        | border, radius, surface, shadow  | stroke(-width), radius, surface, shadow, fg, font
 *   Badge        | radius, (outline variant) border | radius(-pill), line-override, ink (via SketchOutline)
 *   Port         | box-shadow rings                 | dot-rings, ink (via SketchOutline's drawn ring)
 *   Trace        | SVG stroke                        | crisp, outline (the drawn/crisp path pair)
 *   CodeEditor   | border, radius, background, font  | stroke(-width), radius, surface, fg, font-mono
 *
 *   Bar          | NOTHING of its own — a layout strip; the only lines are
 *                | Block's own header/footer dividers, already covered
 *                | above. See skin.test.ts's own "coverage (S4)" describe
 *                | block for the grepped proof.
 *
 * NOT YET PORTED (Tranches 3-5 — labeledPort, portEdge, blockPort,
 * blockMembers, traceBadge, traceTerminal, wireLayer, the shadcn
 * primitives, presets/value): these compose the components above, so they
 * already inherit `--bbox-skin-font`/`-fg` etc. through the Block/Badge/
 * Port/CodeEditor they wrap, but none of them has its OWN token call sites
 * yet (no drawn outline, no radius override). They are not claimed here.
 */

const meta = {
  title: "Styles",
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

/* ==================================================================== */
/* AllComponents — the matrix: every painting component x the 3 skins.   */
/* ==================================================================== */

function ComponentRow({ name, children }: { name: string; children: (skin: BboxSkin) => React.ReactNode }) {
  return (
    <div data-testid={`row-${name}`} style={{ display: "grid", gridTemplateColumns: "120px repeat(3, 220px)", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{name}</span>
      {BBOX_SKINS.map((skin) => (
        <div key={skin} {...bboxSkinAttrs(skin)} data-testid={`cell-${name}-${skin}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 72 }}>
          {children(skin)}
        </div>
      ))}
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
    </div>
  ),
  play: async ({ canvasElement }) => {
    // S2 — a measurable difference per component, not just on one. Compare
    // the "default"/"no-skin-equivalent" column against "sketch" for each
    // row: at least one of {border-radius, background, box-shadow, the
    // drawn outline's display} must change.
    const rows = ["Block", "Badge", "Port", "Trace", "CodeEditor"];
    for (const name of rows) {
      const defaultCell = canvasElement.querySelector(`[data-testid="cell-${name}-default"]`);
      const sketchCell = canvasElement.querySelector(`[data-testid="cell-${name}-sketch"]`);
      if (!(defaultCell instanceof HTMLElement) || !(sketchCell instanceof HTMLElement)) {
        throw new Error(`missing cell for ${name}`);
      }
      const paintable = defaultCell.querySelector<HTMLElement | SVGElement>(
        '[data-slot="block"], [data-slot="badge"], [data-slot="port-dot"], [data-slot="trace-line"]:not([data-sketch]), .bbox-code-editor',
      );
      const paintableSketch = sketchCell.querySelector<HTMLElement | SVGElement>(
        '[data-slot="block"], [data-slot="badge"], [data-slot="port-dot"], [data-slot="trace-line"]:not([data-sketch]), .bbox-code-editor',
      );
      if (!paintable || !paintableSketch) throw new Error(`no paintable element found for ${name}`);
      const a = getComputedStyle(paintable);
      const b = getComputedStyle(paintableSketch);
      const drawnA = defaultCell.querySelector('[data-slot="sketch-outline"]');
      const drawnB = sketchCell.querySelector('[data-slot="sketch-outline"]');
      const outlineDiffers = drawnA && drawnB ? getComputedStyle(drawnA).display !== getComputedStyle(drawnB).display : false;
      // Trace has none of border-radius/background/box-shadow (its
      // "paintable" is an SVG `<path>`, where those properties are
      // meaningless) — what changes for it is its own `display`, via
      // `CRISP_STYLE`/`SKETCH_STYLE` (trace.tsx): the crisp path goes
      // `inline` -> `none` the moment a skin's `--bbox-skin-crisp` flips.
      const differs =
        a.borderRadius !== b.borderRadius ||
        a.backgroundColor !== b.backgroundColor ||
        a.boxShadow !== b.boxShadow ||
        a.display !== b.display ||
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
    <div {...bboxSkinAttrs("sketch")} style={{ display: "flex", flexDirection: "column", gap: 32, padding: 32 }}>
      <WiredScene />
      <Block header={<Badge>Function</Badge>} body={<CodeEditor value="return value * 2" onWrite={() => {}} multiline={false} />} width={280} height={110} />
      <TraceGallery />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Every drawn outline in the scene is actually visible — not just
    // present with `display: none`.
    const outlines = canvasElement.querySelectorAll('[data-slot="sketch-outline"]');
    await expect(outlines.length).toBeGreaterThan(0);
    for (const el of outlines) {
      await expect(getComputedStyle(el).display, "a sketch-skinned scene must show every drawn outline").not.toBe("none");
    }
    // Every trace-line's crisp twin is hidden, its sketch twin shown.
    const crisp = canvasElement.querySelectorAll('[data-slot="trace-line"]:not([data-sketch])');
    const sketched = canvasElement.querySelectorAll('[data-slot="trace-line"][data-sketch]');
    await expect(crisp.length).toBeGreaterThan(0);
    await expect(sketched.length).toBe(crisp.length);
    for (const el of crisp) await expect(getComputedStyle(el).display).toBe("none");
    for (const el of sketched) await expect(getComputedStyle(el).display).not.toBe("none");
  },
};

/* ==================================================================== */
/* SideBySide — one composition, three skins, identical geometry (S3).   */
/* ==================================================================== */

function GeometryComposition() {
  return (
    <Block header={<Badge variant="secondary">Panel</Badge>} body={<div style={{ display: "flex", gap: 12 }}><Port state="empty" /><Port state="wired" /><Port state="received" /></div>} width={220} height={120} />
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

    // Every port dot's centre, relative to its own column.
    const portCentresPerColumn = columns.map((col) => {
      const dots = [...col.querySelectorAll('[data-slot="port-dot"]')];
      if (dots.length !== 3) throw new Error(`expected 3 port dots, found ${dots.length}`);
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
    </div>
  ),
  play: async ({ canvasElement }) => {
    // S1 — no skin set anywhere on the page -> every painting component's
    // computed border/background/radius/shadow is byte-identical to a
    // reference element built from the ORIGINAL (pre-port) classes.
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
  },
};
