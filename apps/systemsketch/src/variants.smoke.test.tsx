// src/variants.smoke.test.tsx — acceptance for lane `app-variant-switch`
// (docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md, "AFTER BOTH LAND").
// Written and committed BEFORE the switch exists, so the implementation that
// follows cannot quietly shape what it is graded on.
//
// Zach's standing rule ("prototype switch in app", 2026-09-09): a prototype
// is never gated behind a URL flag — a temporary drop-down in the app's
// bottom-right corner switches variants live and REMEMBERS the choice. The
// variants are the `ports` lane's five port styles and the `regions` lane's
// region drawings (five, plus the three Zach picked out of the babble
// gallery on 2026-09-19); the switch writes the two contract attributes on
// `<html>` (`data-bbox-port-variant` / `data-bbox-region-variant`) and the two
// storage keys `bbox.portVariant` / `bbox.regionVariant`.
//
// What is graded, every claim MEASURED (`getBoundingClientRect`, computed
// style, the editor's own geometry) — never DOM presence alone:
//   (a) where the switch sits: bottom-right, beside the zoom cluster, clear of
//       the canvas centre and of the dock, hit-testable; v1/v1 by default;
//       every option is one of the table's ids, titled from the variant tables.
//   (b) port v3 is applied LIVE (attribute, storage, the dot's measured box)
//       and survives a reload.
//   (c) region v2's header rule appears under the corner card, measured.
//   (d) for EVERY region drawing, the APP's arm rows (`regionLayoutOf` — what
//       tldraw hit-tests and the reconcile writes into `props.h`) match the
//       COMPONENT's rows (what the trunk's `Region` paints) — header heights
//       26-32px by variant — and the frame hugs its rows with no dead band.
//
// THREE DEFAULT-ONLY LINES MOVED, 2026-09-22, lane `trace-defaults` —
// declared here because this file was committed ahead of its implementation
// and a silent edit to it is the thing that rule exists to prevent. Zach:
// "Please also lets do ports v2 as the default ones … and for regions make
// v9 the default one." So (a)'s "v1/v1 by default" now reads the app's
// defaults (`APP_DEFAULT_PORT_VARIANT` / `APP_DEFAULT_REGION_VARIANT`,
// stamped on <html> like any pick), (b)'s resting dot box is that default's,
// and (c) — whose claim is "v2 draws a rule v1 does not" — now PICKS v1
// before asserting its "no rule" precondition, since v9 (the new resting
// drawing) draws one. No other assertion moved.
//
// "Reload" in a browser test cannot navigate the page away from the runner,
// so it is simulated by what a reload actually does to this app: the React
// tree goes away, the `<html>` attributes go with the old document, and
// `localStorage` survives.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { REGION_PAD_BOTTOM_PX } from "@trunk/components/region.layout";
import { PORT_VARIANTS, PORT_VARIANT_IDS } from "@trunk/skin/portVariants";
import { REGION_VARIANTS, REGION_VARIANT_IDS, type RegionVariantId } from "@trunk/skin/regionVariants";

import { APP_DEFAULT_PORT_VARIANT, APP_DEFAULT_REGION_VARIANT } from "./chrome/DevMenu/variantSwitch";
import { createCornerBlock, regionLayoutOf, type RegionKind, type RegionShape } from "./shapes/region";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

const PORT_STORAGE_KEY = "bbox.portVariant";
const REGION_STORAGE_KEY = "bbox.regionVariant";

let app: MountedApp | null = null;

/** Storage is shared by every test file this browser context runs, so no
 *  test may start from — or leave behind — a remembered choice. */
function forgetVariants() {
  window.localStorage.removeItem(PORT_STORAGE_KEY);
  window.localStorage.removeItem(REGION_STORAGE_KEY);
  delete document.documentElement.dataset.bboxPortVariant;
  delete document.documentElement.dataset.bboxRegionVariant;
}

beforeEach(forgetVariants);
afterEach(() => {
  app?.unmount();
  app = null;
  forgetVariants();
});

const PORTS_OUT = { left: [], right: [{ id: "out", declaration: "out: Pose" }], top: [], bottom: [] };

function block(name: string, x: number, y: number, ports: unknown): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports } } as never);
  return id;
}

async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(
    () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-port-id="${portId}"] [data-slot="port-dot"]`),
    { what: `${id}/${portId} dot` },
  );
}

/** A Branch exactly as the dock's Branch row mints one — `if`/`else` at 160
 *  and a real corner block — but placed programmatically: the thing under
 *  test is the switch, not the tool gesture (`fixes.smoke.test.tsx` owns
 *  that). */
function branch(x: number, y: number): { id: TLShapeId; cornerId: TLShapeId } {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: REGION_SHAPE_TYPE,
    x,
    y,
    props: {
      kind: "branch",
      name: "Branch",
      w: 520,
      arms: [
        { id: "if", title: "if", open: true, h: 160 },
        { id: "else", title: "else", open: true, h: 160 },
      ],
    },
  } as never);
  const cornerId = createCornerBlock(app!.editor, id, "branch");
  if (!cornerId) throw new Error("a branch always has a corner block");
  return { id, cornerId };
}

/** Any region kind, minted the way its dock row does. WHY this exists beside
 *  `branch`: Zach, 2026-09-19 — "Please implement this for all region corners,
 *  and the branch does implement a region corner". The junction rule belongs
 *  to REGIONS, not to Branch, and only running every kind proves the predicate
 *  (`isRegionCornerBlock`, which keys off the parent's type and its
 *  `cornerBlockId`) is genuinely kind-blind rather than accidentally right.
 *  The kinds are the schema's own union — "for" | "while" | "branch" | "plain"
 *  — so a kind added later fails HERE rather than shipping a round corner. */
function regionOfKind(kind: RegionKind, name: string, x: number, y: number): { id: TLShapeId; cornerId: TLShapeId } {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: REGION_SHAPE_TYPE,
    x,
    y,
    props: {
      kind,
      name,
      w: 520,
      arms: [{ id: "body", title: "body", open: true, h: 200 }],
    },
  } as never);
  const cornerId = createCornerBlock(app!.editor, id, kind);
  if (!cornerId) throw new Error(`a ${kind} region always has a corner block`);
  return { id, cornerId };
}

function trigger(which: "port" | "region"): HTMLElement | null {
  return app!.root.querySelector<HTMLElement>(`[data-testid="ss-variant-${which}"]`);
}

/** Pick a variant the way Zach does: open the menu, click the row — then
 *  put the menu away, whether or not the pick already closed it, so the next
 *  pick starts from a closed menu rather than toggling a half-closed one. */
async function pick(which: "port" | "region", id: string) {
  const button = await waitFor(() => trigger(which), { what: `the ${which} trigger` });
  await userEvent.click(button);
  const row = await waitFor(() => document.querySelector<HTMLElement>(`[data-testid="ss-variant-${which}-${id}"]`), {
    what: `the ${which} ${id} row`,
  });
  await userEvent.click(row);
  await waitFor(() => (trigger(which)?.getAttribute("data-value") === id ? true : null), { what: `${which} trigger to read ${id}` });
  if (document.querySelector(`[data-testid^="ss-variant-${which}-v"]`)) await userEvent.keyboard("{Escape}");
  await waitFor(() => (document.querySelector(`[data-testid^="ss-variant-${which}-v"]`) ? null : true), { what: `the ${which} menu to close` });
}

function regionOf(id: TLShapeId): RegionShape {
  return app!.editor.getShape(id) as unknown as RegionShape;
}

function frameOf(id: TLShapeId): HTMLElement | null {
  return app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="region-frame"]`);
}

/**
 * The claim this lane owes the regions lane, as one measurement: the rows the
 * APP computes and the rows the COMPONENT paints are the same rows.
 *
 * Measured in the frame's PADDING box, because that is the coordinate system
 * `region.tsx` positions its arm rows in (they are absolute children of the
 * bordered frame) — so a row's top relative to it IS the component's own
 * `rowTop`, with no border arithmetic smuggled into the tolerance.
 */
function rowsMismatch(id: TLShapeId, variant: RegionVariantId): string | null {
  const frame = frameOf(id);
  if (!frame) return "no frame";
  const layout = regionLayoutOf(app!.editor, regionOf(id));
  const frameRect = frame.getBoundingClientRect();
  const paddingTop = frameRect.top + frame.clientTop;
  const problems: string[] = [];
  for (const arm of layout.arms) {
    const header = frame.querySelector<HTMLElement>(`[data-arm-id="${arm.id}"] [data-slot="region-arm-header"]`);
    if (!header) return `no ${arm.id} header`;
    const rect = header.getBoundingClientRect();
    const appHeader = arm.bodyTop - arm.headerTop;
    if (Math.abs(rect.height - REGION_VARIANTS[variant].arms.headerPx) > 0.5) problems.push(`${arm.id}: painted header ${rect.height} ≠ ${variant}'s ${REGION_VARIANTS[variant].arms.headerPx}`);
    if (Math.abs(rect.height - appHeader) > 0.5) problems.push(`${arm.id}: painted header ${rect.height} ≠ app's ${appHeader}`);
    if (Math.abs(rect.top - paddingTop - arm.headerTop) > 0.5) problems.push(`${arm.id}: painted row top ${(rect.top - paddingTop).toFixed(1)} ≠ app's ${arm.headerTop}`);
  }
  return problems.length ? problems.join("; ") : null;
}

describe("app-variant-switch (a) — a bottom-right pill beside the zoom cluster", () => {
  it("sits beside the status strip, clear of the canvas centre and the dock, takes clicks, and starts at v1/v1 with every option one of the five", async () => {
    app = await mountApp();
    const pill = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-variant-switch"]'), { what: "the variant switch" });
    const strip = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="status-strip"]'), { what: "the status strip" });
    const dock = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="tool-dock"]'), { what: "the dock" });
    const pillRect = pill.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();

    // Beside the zoom cluster: immediately LEFT of it, on the same row.
    expect(pillRect.right, "the pill ends where the strip begins").toBeLessThanOrEqual(stripRect.left + 0.5);
    expect(stripRect.left - pillRect.right, "…with at most a 16px gap").toBeLessThanOrEqual(16);
    expect(Math.min(pillRect.bottom, stripRect.bottom) - Math.max(pillRect.top, stripRect.top), "same row as the strip").toBeGreaterThan(0);
    // Bottom-right quadrant, and small.
    expect(pillRect.left).toBeGreaterThan(window.innerWidth / 2);
    expect(pillRect.top).toBeGreaterThan(window.innerHeight * 0.75);
    expect(pillRect.height, "one small pill, not a panel").toBeLessThanOrEqual(40);

    // Never over the canvas centre, never over the dock.
    const canvasRect = canvasOf(app.root).getBoundingClientRect();
    const cx = canvasRect.left + canvasRect.width / 2;
    const cy = canvasRect.top + canvasRect.height / 2;
    expect(cx >= pillRect.left && cx <= pillRect.right && cy >= pillRect.top && cy <= pillRect.bottom, "the pill covers the canvas centre").toBe(false);
    const overlapsDock = pillRect.left < dockRect.right && pillRect.right > dockRect.left && pillRect.top < dockRect.bottom && pillRect.bottom > dockRect.top;
    expect(overlapsDock, "the pill overlaps the dock").toBe(false);

    // It takes clicks: the overlay it lives in is `pointer-events: none`.
    expect(getComputedStyle(pill).pointerEvents).toBe("auto");
    const hit = document.elementFromPoint(pillRect.left + pillRect.width / 2, pillRect.top + pillRect.height / 2);
    expect(hit && pill.contains(hit), "the pill's centre hit-tests to the pill").toBe(true);

    // Defaults: nothing stored → the app's defaults, v2/v9 since 2026-09-22,
    // STAMPED on <html> (only v1 is the absent attribute, and each variant's
    // CSS is keyed on the attribute — see `APP_DEFAULT_PORT_VARIANT`).
    expect(trigger("port")?.getAttribute("data-value")).toBe(APP_DEFAULT_PORT_VARIANT);
    expect(trigger("region")?.getAttribute("data-value")).toBe(APP_DEFAULT_REGION_VARIANT);
    expect(APP_DEFAULT_PORT_VARIANT).toBe("v2");
    expect(APP_DEFAULT_REGION_VARIANT).toBe("v9");
    expect(document.documentElement.dataset.bboxPortVariant).toBe(APP_DEFAULT_PORT_VARIANT);
    expect(document.documentElement.dataset.bboxRegionVariant).toBe(APP_DEFAULT_REGION_VARIANT);

    // Each menu offers exactly the table's ids, titled from the variant
    // tables. COUNT DERIVED, NOT SPELLED (2026-09-19): the two tables no
    // longer have the same length — regions gained v6/v7/v8 — and a literal
    // 5 here would have failed for the right reason but told the wrong
    // story. Reading the length off the table the menu is built from makes
    // this strictly stronger: it can never pass while the menu is short.
    for (const which of ["port", "region"] as const) {
      const ids = which === "port" ? PORT_VARIANT_IDS : REGION_VARIANT_IDS;
      await userEvent.click(trigger(which)!);
      const rows = await waitFor(() => {
        const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="ss-variant-${which}-v"]`));
        return found.length === ids.length ? found : null;
      }, { what: `${ids.length} ${which} rows` });
      expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(ids.map((id) => `ss-variant-${which}-${id}`));
      rows.forEach((row, index) => {
        // The two tables are indexed separately so each keeps its own id
        // union — `ids[index]` is the widened union of both and can no
        // longer index either table now that they differ in length.
        const title = which === "port" ? PORT_VARIANTS[PORT_VARIANT_IDS[index]].title : REGION_VARIANTS[REGION_VARIANT_IDS[index]].title;
        expect(row.textContent ?? "", `${which} ${ids[index]} row names its title`).toContain(title);
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => (document.querySelector(`[data-testid^="ss-variant-${which}-v"]`) ? null : true), { what: `${which} menu closed` });
    }
  });
});

describe("app-variant-switch (b) — the port style switches live and is remembered", () => {
  it("port v3: the attribute, the stored key and the dot's measured box all follow the pick, and all survive a reload", async () => {
    app = await mountApp();
    const first = block("estimate()", 200, 220, PORTS_OUT);
    const dot = await dotOf(first, "out");
    expect(dot.getBoundingClientRect().width, "the default's dot box").toBeCloseTo(PORT_VARIANTS[APP_DEFAULT_PORT_VARIANT].dot.diameter, 0);

    await pick("port", "v3");
    expect(document.documentElement.dataset.bboxPortVariant).toBe("v3");
    expect(window.localStorage.getItem(PORT_STORAGE_KEY)).toBe("v3");
    await waitFor(async () => {
      const width = (await dotOf(first, "out")).getBoundingClientRect().width;
      return Math.abs(width - PORT_VARIANTS.v3.dot.diameter) <= 0.5 ? true : null;
    }, { what: `the dot to measure v3's ${PORT_VARIANTS.v3.dot.diameter}px live` });

    // Reload: the tree and the document's attributes go; storage stays.
    app.unmount();
    app = null;
    delete document.documentElement.dataset.bboxPortVariant;
    expect(window.localStorage.getItem(PORT_STORAGE_KEY)).toBe("v3");

    app = await mountApp();
    await waitFor(() => (document.documentElement.dataset.bboxPortVariant === "v3" ? true : null), { what: "the attribute restored from storage" });
    expect(trigger("port")?.getAttribute("data-value")).toBe("v3");
    const again = block("estimate()", 200, 220, PORTS_OUT);
    await waitFor(async () => {
      const width = (await dotOf(again, "out")).getBoundingClientRect().width;
      return Math.abs(width - PORT_VARIANTS.v3.dot.diameter) <= 0.5 ? true : null;
    }, { what: `the reloaded dot to measure v3's ${PORT_VARIANTS.v3.dot.diameter}px` });
  });
});

describe("app-variant-switch (c) — region v2 draws its header rule", () => {
  it("region v2: the rule under the corner card appears — full frame width, on the card's bottom edge — and the app's rows still match the component's", async () => {
    app = await mountApp();
    const { id, cornerId } = branch(160, 140);
    const frame = await waitFor(() => frameOf(id), { what: "the branch frame" });
    const rule = await waitFor(() => frame.querySelector<HTMLElement>(':scope > [data-slot="region-header-rule"]'), { what: "the header rule element" });
    // v9 — the resting drawing since 2026-09-22 — draws a rule of its own,
    // so the "v1 has none" precondition is taken ON v1, picked by name.
    await pick("region", "v1");
    await waitFor(() => (getComputedStyle(rule).display === "none" ? true : null), { what: "no rule in v1" });
    expect(getComputedStyle(rule).display, "no rule in v1").toBe("none");

    await pick("region", "v2");
    expect(document.documentElement.dataset.bboxRegionVariant).toBe("v2");
    expect(window.localStorage.getItem(REGION_STORAGE_KEY)).toBe("v2");

    await waitFor(() => (getComputedStyle(rule).display !== "none" ? true : null), { what: "the rule to be drawn" });
    const card = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="block"]`), { what: "the corner card" });
    const ruleRect = rule.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    expect(ruleRect.height, "a hairline").toBeGreaterThanOrEqual(0.5);
    expect(ruleRect.height).toBeLessThanOrEqual(2);
    expect(Math.abs(ruleRect.width - frame.clientWidth), "the rule spans the frame").toBeLessThanOrEqual(1);
    expect(ruleRect.width, "and runs well past the card").toBeGreaterThan(cardRect.width + 100);
    expect(Math.abs(ruleRect.bottom - cardRect.bottom), `the rule is the card's own bottom edge (${ruleRect.bottom} vs ${cardRect.bottom})`).toBeLessThanOrEqual(1.5);

    await waitFor(() => (rowsMismatch(id, "v2") === null ? true : null), { what: `rows to match: ${rowsMismatch(id, "v2")}` });
  });
});

/** A loop minted the way PRODUCTION mints one — `arms: []`, because a loop's
 *  body is the frame itself (`LoopTool.ts`'s `FOR_LOOP_PRESET`). Deliberately
 *  NOT `regionOfKind`, which gives every kind one `body` arm for the corner-
 *  junction sweep: that difference is exactly what this suite has to tell
 *  apart. */
function productionLoop(kind: "for" | "while", name: string, x: number, y: number): { id: TLShapeId; cornerId: TLShapeId } {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: REGION_SHAPE_TYPE,
    x,
    y,
    props: { kind, name, w: 520, arms: [] },
  } as never);
  const cornerId = createCornerBlock(app!.editor, id, kind);
  if (!cornerId) throw new Error(`a ${kind} region always has a corner block`);
  return { id, cornerId };
}

/** Every horizontal hairline actually PAINTED inside a region's frame: the
 *  header rule when it is displayed, plus each arm header carrying a non-zero
 *  top border. Measured off computed style rather than asserted by presence —
 *  the header-rule element is always in the DOM and hides via `display`, and
 *  `v3`/`v4`/`v5` zero the arm divider's WIDTH rather than removing it. */
function insideLinesOf(frame: HTMLElement): string[] {
  const lines: string[] = [];
  const rule = frame.querySelector<HTMLElement>(':scope > [data-slot="region-header-rule"]');
  if (rule && getComputedStyle(rule).display !== "none") lines.push("header-rule");
  for (const header of frame.querySelectorAll<HTMLElement>('[data-slot="region-arm-header"]')) {
    if (Number.parseFloat(getComputedStyle(header).borderTopWidth || "0") > 0.01) lines.push(`arm-divider:${header.textContent?.trim() ?? "?"}`);
  }
  return lines;
}

describe("app-variant-switch (e) — for/while draw NO line inside the frame", () => {
  // Zach, 2026-09-20, looking at v9: "FOr loop and while loops like this no
  // inside lines" (shown against an empty For Loop frame), then "Branch like
  // this.." against a Branch that KEEPS its rules. v2/v9/v10 are the three
  // variants that turn `--bbox-region-header-rule-display` on, so they are the
  // only ones that could ever have got this wrong.
  for (const variant of ["v2", "v9", "v10"] as const) {
    it(`${variant}: a for and a while region paint nothing inside their frames, while a branch keeps its header rule`, async () => {
      app = await mountApp();
      const forLoop = productionLoop("for", "For Loop", 160, 140);
      const whileLoop = productionLoop("while", "While Loop", 760, 140);
      // The belt: a loop carrying an arm anyway must STILL paint no rule.
      const armedLoop = regionOfKind("for", "For Loop (carries an arm)", 160, 640);
      const br = branch(760, 640);

      const forFrame = await waitFor(() => frameOf(forLoop.id), { what: "the for frame" });
      const whileFrame = await waitFor(() => frameOf(whileLoop.id), { what: "the while frame" });
      const armedFrame = await waitFor(() => frameOf(armedLoop.id), { what: "the armed-loop frame" });
      const branchFrame = await waitFor(() => frameOf(br.id), { what: "the branch frame" });

      await pick("region", variant);
      expect(document.documentElement.dataset.bboxRegionVariant).toBe(variant);

      // The branch proves the variant really is drawing rules right now, so a
      // green loop assertion cannot be the feature being switched off wholesale.
      await waitFor(() => (insideLinesOf(branchFrame).includes("header-rule") ? true : null), {
        what: `the branch's header rule under ${variant} (got: ${insideLinesOf(branchFrame).join(", ") || "nothing"})`,
      });

      expect(insideLinesOf(forFrame), `${variant}: a for loop draws no inside line`).toEqual([]);
      expect(insideLinesOf(whileFrame), `${variant}: a while loop draws no inside line`).toEqual([]);
      expect(insideLinesOf(armedFrame), `${variant}: a loop holding an arm still draws no header rule`).not.toContain("header-rule");

      // And the rule that IS drawn is a real, full-width line — otherwise
      // "the branch keeps it" would pass on a 0px element.
      const rule = branchFrame.querySelector<HTMLElement>(':scope > [data-slot="region-header-rule"]')!;
      const ruleRect = rule.getBoundingClientRect();
      expect(ruleRect.height, `${variant}: the branch rule is a real hairline`).toBeGreaterThanOrEqual(0.5);
      expect(Math.abs(ruleRect.width - branchFrame.clientWidth), `${variant}: and spans the branch frame`).toBeLessThanOrEqual(1);
    });
  }
});

describe("app-variant-switch (d) — the app's region geometry follows the drawing", () => {
  it("for every region drawing the app's arm rows equal the component's (26-32px headers), the frame hugs its rows, and the record agrees with the paint", async () => {
    app = await mountApp();
    const { id } = branch(160, 140);
    await waitFor(() => frameOf(id), { what: "the branch frame" });

    for (const variant of REGION_VARIANT_IDS) {
      await pick("region", variant);
      await waitFor(() => (rowsMismatch(id, variant) === null ? true : null), {
        what: `${variant}: app rows vs painted rows — ${rowsMismatch(id, variant)}`,
      });

      const frame = frameOf(id)!;
      const frameRect = frame.getBoundingClientRect();
      const lastArm = frame.querySelector<HTMLElement>('[data-arm-id="else"]')!;
      // No dead band: the frame ends one bottom pad under its last row —
      // a stale `props.h` from the previous drawing would leave the header
      // difference, times two arms, hanging under `else`. In `region.tsx`'s
      // own convention the frame's (border-box) height is `lastRow.bottom +
      // REGION_PAD_BOTTOM_PX` with rows counted from the PADDING box, hence
      // the one `clientTop`.
      const pad = frameRect.bottom - (lastArm.getBoundingClientRect().bottom - frame.clientTop);
      expect(Math.abs(pad - REGION_PAD_BOTTOM_PX), `${variant}: the frame hugs its rows (pad ${pad})`).toBeLessThanOrEqual(1);
      // The record IS the drawing: tldraw scales gestures against `props.h`.
      expect(Math.abs(regionOf(id).props.h - regionLayoutOf(app.editor, regionOf(id)).height), `${variant}: props.h is the layout's height`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(regionOf(id).props.h - frameRect.height), `${variant}: props.h is the painted frame's height`).toBeLessThanOrEqual(1);

      // And the geometry tldraw hit-tests: one label band per arm header,
      // each the drawing's own header height.
      const geometry = app.editor.getShapeGeometry(id) as unknown as { children: { isLabel?: boolean; bounds: { h: number } }[] };
      const bands = geometry.children.filter((child) => child.isLabel).map((child) => child.bounds.h);
      const armBands = bands.slice(1);
      expect(armBands, `${variant}: tldraw's arm header bands`).toEqual([REGION_VARIANTS[variant].arms.headerPx, REGION_VARIANTS[variant].arms.headerPx]);
    }
    // The loop above ends on the table's LAST id — derived for the same
    // reason as the row count just above, not because the assertion got
    // softer: it still pins the exact remembered value.
    expect(window.localStorage.getItem(REGION_STORAGE_KEY)).toBe(REGION_VARIANT_IDS[REGION_VARIANT_IDS.length - 1]);
  });
});

/* ------------------------------------------------------------------ */
/* The junctions the corner card makes with the frame are straight      */
/* ------------------------------------------------------------------ */

/**
 * Zach, 2026-09-19, annotating THIS app (`Pasted image 20260919180659.png`):
 * "I don't like how the edges where it meets the region are still curve. they
 * shuld be straight!" — against the DOM render he had already approved
 * (`…115424.png`), where the corner card's top-RIGHT and bottom-LEFT are
 * square because those are the two junctions: the card's top edge continues
 * as the frame's top rule, its left edge as the frame's left rule.
 *
 * WHY this case has to live in the APP and cannot be left to the trunk's own
 * `RegionVariants.stories.tsx`: here the corner card is a real `ss-block`
 * CHILD SHAPE, rendered by tldraw in its own subtree rather than inside the
 * `Region` element. The trunk publishes the radii
 * (`REGION_CORNER_BLOCK_STYLE`) but cannot reach across that boundary to
 * apply them — so "the trunk is green" proved nothing about what was on
 * screen, and for one release the card shipped rounded on all four corners
 * with every trunk test passing. This is the only place that failure is
 * visible.
 *
 * Measured off computed style, per drawing, because the shared corner and the
 * free corner both follow the variant's tokens (v2 and v4 are 8px, not 10;
 * v2 squares the free corner for its header rule) — a hardcoded 10px would
 * pass v1 and lie about the rest.
 */
describe("app-variant-switch (e) — the corner card's junctions with the frame are square", () => {
  // The fourth kind is deliberately absent from the table above: a plain
  // region is a bare scope and `cornerBlockPropsFor` returns null for it on
  // purpose ("an empty card in the corner would claim there is a contract and
  // then show none"). Asserting that here is what stops a future reader from
  // "fixing" the omission by minting an empty card — and it is why "all region
  // corners" means branch / for / while.
  it("a plain region has no corner card to square", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({
      id,
      type: REGION_SHAPE_TYPE,
      x: 160,
      y: 140,
      props: { kind: "plain", name: "Region", w: 520, arms: [{ id: "body", title: "body", open: true, h: 200 }] },
    } as never);
    await waitFor(() => frameOf(id), { what: "the plain frame" });
    expect(createCornerBlock(app.editor, id, "plain"), "a plain region mints no corner block").toBeNull();
  });

  it.each([
    ["branch", () => branch(160, 140)],
    ["for", () => regionOfKind("for", "For Loop", 160, 140)],
    ["while", () => regionOfKind("while", "While", 160, 140)],
  ] as const)("in every region drawing a %s card's top-right and bottom-left are 0px, while the shared and free corners follow the frame", async (kind, make) => {
    app = await mountApp();
    const { id, cornerId } = make();
    await waitFor(() => frameOf(id), { what: `the ${kind} frame` });

    const cardOf = () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${cornerId}"] [data-slot="block"]`);
    await waitFor(cardOf, { what: "the corner card" });

    for (const variant of REGION_VARIANT_IDS) {
      await pick("region", variant);
      const spec = REGION_VARIANTS[variant];
      // WHY the settle condition is the SPEC's radius and no longer
      // `shared !== "0px"`: that guard meant "the tokens have landed", using
      // round-ness as a proxy for them — and `v10` (Zach's 2026-09-20 sketch)
      // is square by design, so the proxy would never come true and this
      // would time out rather than fail. Waiting for the declared value is
      // the same wait made exact.
      const wantSquare = spec.frame.radius === "0px";
      await waitFor(() => {
        const card = getComputedStyle(cardOf()!);
        const shared = getComputedStyle(frameOf(id)!).borderTopLeftRadius;
        if ((shared === "0px") !== wantSquare) return null;
        return card.borderTopRightRadius === "0px" &&
          card.borderBottomLeftRadius === "0px" &&
          card.borderTopLeftRadius === shared
          ? true
          : null;
      }, { what: `${variant}: the card to wear the region corner radii` });

      const card = getComputedStyle(cardOf()!);
      const shared = getComputedStyle(frameOf(id)!).borderTopLeftRadius;
      expect(card.borderTopRightRadius, `${variant}: the card's top edge leaves the frame's top rule straight`).toBe("0px");
      expect(card.borderBottomLeftRadius, `${variant}: the card's left edge leaves the frame's left rule straight`).toBe("0px");
      expect(card.borderTopLeftRadius, `${variant}: the shared top-left curves with the frame`).toBe(shared);
      // Stricter than the `not.toBe("0px")` this replaces: a round drawing
      // must still be round AND a square one must actually be square, both
      // read from `regionVariants.ts`'s own `frame.radius` — which until now
      // was prose nothing verified.
      if (wantSquare) expect(shared, `${variant}: this drawing declares square corners`).toBe("0px");
      else expect(shared, `${variant}: the frame's own top-left is still round`).not.toBe("0px");
      // Declared, not named: `v2` and `v10` square the card's one free corner
      // so a full-width header rule leaves it cleanly. `v9` is ruled and keeps
      // the curve, because that is what Zach's DESIRED screenshot draws.
      expect(card.borderBottomRightRadius, `${variant}: the free bottom-right corner`).toBe(
        spec.corner.freeCorner === "square" ? "0px" : shared,
      );
    }

    // Scoped to the CORNER: an ordinary block on the same board keeps all
    // four of its own corners, so this can never be read as "blocks are
    // square now".
    const loose = block("loose", 700, 140, PORTS_OUT);
    const looseCard = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${loose}"] [data-slot="block"]`), { what: "a free-standing card" });
    const style = getComputedStyle(looseCard);
    for (const corner of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"] as const) {
      expect(style[corner], `a free-standing card keeps its ${corner}`).not.toBe("0px");
    }
  });
});
