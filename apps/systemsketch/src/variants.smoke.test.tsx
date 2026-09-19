// src/variants.smoke.test.tsx — acceptance for lane `app-variant-switch`
// (docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md, "AFTER BOTH LAND").
// Written and committed BEFORE the switch exists, so the implementation that
// follows cannot quietly shape what it is graded on.
//
// Zach's standing rule ("prototype switch in app", 2026-09-09): a prototype
// is never gated behind a URL flag — a temporary drop-down in the app's
// bottom-right corner switches variants live and REMEMBERS the choice. The
// variants are the `ports` lane's five port styles and the `regions` lane's
// five region drawings; the switch writes the two contract attributes on
// `<html>` (`data-bbox-port-variant` / `data-bbox-region-variant`) and the two
// storage keys `bbox.portVariant` / `bbox.regionVariant`.
//
// What is graded, every claim MEASURED (`getBoundingClientRect`, computed
// style, the editor's own geometry) — never DOM presence alone:
//   (a) where the switch sits: bottom-right, beside the zoom cluster, clear of
//       the canvas centre and of the dock, hit-testable; v1/v1 by default;
//       every option is one of the five, titled from the variant tables.
//   (b) port v3 is applied LIVE (attribute, storage, the dot's measured box)
//       and survives a reload.
//   (c) region v2's header rule appears under the corner card, measured.
//   (d) for EVERY region drawing, the APP's arm rows (`regionLayoutOf` — what
//       tldraw hit-tests and the reconcile writes into `props.h`) match the
//       COMPONENT's rows (what the trunk's `Region` paints) — header heights
//       26-32px by variant — and the frame hugs its rows with no dead band.
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

import { createCornerBlock, regionLayoutOf, type RegionShape } from "./shapes/region";
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

const PORTS_OUT = { left: [], right: [{ id: "out", name: "out", type: "Pose" }], top: [], bottom: [] };

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

    // Defaults: nothing stored → v1/v1, and v1 is the ABSENT attribute
    // (both variant tables resolve a missing attribute to v1).
    expect(trigger("port")?.getAttribute("data-value")).toBe("v1");
    expect(trigger("region")?.getAttribute("data-value")).toBe("v1");
    expect(document.documentElement.dataset.bboxPortVariant ?? "v1").toBe("v1");
    expect(document.documentElement.dataset.bboxRegionVariant ?? "v1").toBe("v1");

    // Each menu offers exactly the five, titled from the variant tables.
    for (const which of ["port", "region"] as const) {
      await userEvent.click(trigger(which)!);
      const rows = await waitFor(() => {
        const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="ss-variant-${which}-v"]`));
        return found.length === 5 ? found : null;
      }, { what: `five ${which} rows` });
      expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(
        (which === "port" ? PORT_VARIANT_IDS : REGION_VARIANT_IDS).map((id) => `ss-variant-${which}-${id}`),
      );
      rows.forEach((row, index) => {
        const id = (which === "port" ? PORT_VARIANT_IDS : REGION_VARIANT_IDS)[index];
        const title = which === "port" ? PORT_VARIANTS[id].title : REGION_VARIANTS[id].title;
        expect(row.textContent ?? "", `${which} ${id} row names its title`).toContain(title);
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
    expect(dot.getBoundingClientRect().width, "v1's dot box by default").toBeCloseTo(PORT_VARIANTS.v1.dot.diameter, 0);

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
    expect(window.localStorage.getItem(REGION_STORAGE_KEY)).toBe("v5");
  });
});
