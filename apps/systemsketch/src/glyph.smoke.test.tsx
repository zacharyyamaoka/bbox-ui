// src/glyph.smoke.test.tsx — P-036 / P-043's acceptance, against the real
// mounted app.
//
// The backlog items this answers:
//   P-036  "Glyph picker — a Notion-style icon menu with the full Lucide
//          library, Emoji / Icons / Upload tabs, a filter bar, shuffle,
//          Remove, and paste-a-link."
//   P-043  "Click a glyph and the Glyph Menu opens — ONE picker, every
//          trigger."
//
// Their own `proofMissing` notes are what this file is written against, and
// they are both statements about REACHABILITY, not about a component:
// `packages/glyph-picker` already held all of P-036's behaviour, and
// `grep -rnE "glyph-picker|GlyphPicker|Glyph\b" apps/systemsketch/src`
// answered 0 hits. So every assertion here starts from a real press on the
// running app and ends on the shape record or the painted board — never on
// the presence of a control, and never on a story.
//
// The one-picker claim (P-043) is asserted the only way it can be asserted
// from outside: open from the canvas, open from the inspector, and check that
// the SAME panel markers appear, that only ever one is on the page, and that
// a pick made through either door lands in the same `props.glyph`.
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

function placeBlock(name: string, glyph: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, glyph, view: "port", w: 220, h: 140, ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

function propsOf(id: TLShapeId): BlockShape["props"] {
  return (app!.editor.getShape(id) as BlockShape).props;
}

/** The block's painted face — `BlockPort` stamps the shape id as
 *  `data-block-id` (shapes/block/BlockFace.tsx). */
function faceOf(id: TLShapeId): HTMLElement {
  const face = app!.root.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (!face) throw new Error(`no painted face for ${id}`);
  return face;
}

/** The glyph slot painted inside that block's header — the canvas TRIGGER. */
function glyphOn(id: TLShapeId): HTMLElement | null {
  return faceOf(id).querySelector<HTMLElement>('[data-slot="glyph-picker-trigger"]');
}

/** Every open picker panel on the page. Plural on purpose: "there is exactly
 *  one" is the assertion, so the query must be able to find two. */
function panels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="glyph-picker-panel"]'));
}

async function openPanel(trigger: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(trigger);
  return waitFor(() => panels()[0] ?? null, { what: "the glyph picker panel" });
}

/** Filter to one name, then press that cell. The grid is windowed, so
 *  narrowing first is what puts the cell in the DOM at all. */
async function pickLucide(panel: HTMLElement, kebab: string): Promise<void> {
  const filter = await waitFor(() => panel.querySelector<HTMLInputElement>('[data-testid="glyph-picker-filter"]'), {
    what: "the picker's filter bar",
  });
  await userEvent.fill(filter, kebab);
  const cell = await waitFor(() => panel.querySelector<HTMLElement>(`[data-testid="glyph-picker-cell-lucide-${kebab}"]`), {
    what: `the ${kebab} cell`,
  });
  await userEvent.click(cell);
}

/** Open the right rail on the Inspector the way a person does — two real
 *  presses. Copied from src/inspector.smoke.test.tsx, whose own comment
 *  carries the measurement for why there is no Inspector launcher. */
async function openInspector(): Promise<HTMLElement> {
  const launcher = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-frames"]'), {
    what: "the Frames launcher in the status strip",
  });
  await userEvent.click(launcher);
  const tab = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-inspector"]'), {
    what: "the Inspector surface switch",
  });
  await userEvent.click(tab);
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="inspector"]'), {
    what: "the inspector panel",
  });
}

describe("P-036/P-043 — the glyph picker, reachable", () => {
  it("a stored lucide name paints a real icon on the board, not an empty slot", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", "lucide:rocket", 300, 300);
    const slot = await waitFor(() => faceOf(id).querySelector<HTMLElement>('[data-slot="glyph"]'), { what: "the glyph slot" });

    // THIS is the assertion that the trunk port kept the resolver seam
    // joined, and it is the one that would have caught the easiest way to
    // get the port wrong.
    //
    // `Glyph` does not import lucide-react — it asks a React CONTEXT how to
    // draw a `lucide:` name, and with no provider it paints nothing and
    // stamps `data-unresolved`, explicitly not an error (components/glyph.tsx;
    // `shapes/wire/edgeDropCatalog.ts:130` is this app recording exactly that
    // state). The provider is mounted by the picker's own default trigger
    // (`LucideGlyphResolver`, glyphPicker.tsx's `defaultTrigger`) — so a
    // picker is both the writer and the reader of its own glyph.
    //
    // A React context is IDENTITY-based. The trunk copy of
    // `resolveLucideName.ts` had to be retargeted from `@bbox-ui/core`'s
    // `GlyphResolverProvider` to `../../components/glyph`'s; leave that one
    // import pointing at v1 and everything still compiles, still renders,
    // still passes every other test here — and every icon on the board is a
    // blank square, because the frozen v1 provider and the trunk `Glyph` are
    // two different contexts. Only the drawn SVG can tell the difference.
    await waitFor(() => slot.querySelector("svg"), { what: "the resolved lucide svg" });
    expect(slot.getAttribute("data-content-kind")).toBe("lucide");
    expect(slot.hasAttribute("data-unresolved")).toBe(false);
  });

  it("pressing the glyph on the canvas opens the picker and picking writes the board", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", "", 300, 300);
    const trigger = await waitFor(() => glyphOn(id), { what: "the block's glyph trigger" });
    // The empty slot is a real, pressable affordance — P-043's premise.
    expect(trigger.getAttribute("data-empty")).toBe("true");

    const panel = await openPanel(trigger);
    // P-036's menu, enumerated: three tabs, a filter, shuffle, Remove.
    for (const testId of [
      "glyph-picker-tab-emoji",
      "glyph-picker-tab-icons",
      "glyph-picker-tab-upload",
      "glyph-picker-filter",
      "glyph-picker-shuffle",
      "glyph-picker-remove",
    ]) {
      expect(panel.querySelector(`[data-testid="${testId}"]`), testId).not.toBeNull();
    }

    await pickLucide(panel, "rocket");

    // THE DOCUMENT changed…
    await waitFor(() => propsOf(id).glyph === "lucide:rocket", { what: "glyph on the shape record" });
    // …and so did the BOARD.
    const slot = await waitFor(() => faceOf(id).querySelector<HTMLElement>('[data-slot="glyph"] svg'), { what: "the icon on the block face" });
    expect(slot).not.toBeNull();
  });

  it("pressing the glyph picks, it does not drag the block", async () => {
    // WHY this is a test and not an implementation detail: for `ss-block`,
    // `contentOwnsPress` gives the whole `[data-slot="block-header"]` to
    // tldraw — the header IS the drag handle. An icon put in that header is a
    // drag surface unless it wears `POINTER_OWNED_CLASS`, and the symptom of
    // getting that wrong is not an exception, it is a picker that never
    // opens and a block that slid instead.
    app = await mountApp();
    const id = placeBlock("estimate()", "", 300, 300);
    const before = app.editor.getShape(id)!;
    const trigger = await waitFor(() => glyphOn(id), { what: "the block's glyph trigger" });
    await openPanel(trigger);
    const after = app.editor.getShape(id)!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });

  it("Remove clears the icon from the record and the board", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", "lucide:rocket", 300, 300);
    const trigger = await waitFor(() => glyphOn(id), { what: "the block's glyph trigger" });
    const panel = await openPanel(trigger);
    await userEvent.click(panel.querySelector<HTMLElement>('[data-testid="glyph-picker-remove"]')!);

    await waitFor(() => propsOf(id).glyph === "", { what: "the glyph cleared on the shape record" });
    const slot = await waitFor(() => faceOf(id).querySelector<HTMLElement>('[data-slot="glyph"]'), { what: "the glyph slot" });
    expect(slot.getAttribute("data-content-kind")).toBe("none");
  });

  it("ONE picker, every trigger — the inspector's row opens the same surface and writes the same prop", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", "", 300, 300);
    app.editor.select(id);

    // Door 1: the canvas. Open it, read its identity, close it.
    const canvasPanel = await openPanel((await waitFor(() => glyphOn(id), { what: "the canvas trigger" }))!);
    expect(canvasPanel.getAttribute("aria-label")).toBe("Glyph picker");
    expect(panels()).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => (panels().length === 0 ? true : null), { what: "the picker closed" });

    // Door 2: the right-hand inspector.
    const inspector = await openInspector();
    const row = await waitFor(() => inspector.querySelector<HTMLElement>('[data-testid="ss-inspector-glyph"]'), {
      what: "the inspector's Icon row",
    });
    const inspectorPanel = await openPanel(row);

    // Same component: same panel markers, and never two at once. If a second
    // picker were ever added beside this one, this is the assertion it breaks.
    expect(inspectorPanel.getAttribute("aria-label")).toBe("Glyph picker");
    expect(inspectorPanel.className).toBe(canvasPanel.className);
    expect(panels()).toHaveLength(1);

    // Same VALUE: a pick made in the inspector lands on the same prop the
    // canvas trigger writes, and repaints the canvas.
    await pickLucide(inspectorPanel, "anchor");
    await waitFor(() => propsOf(id).glyph === "lucide:anchor", { what: "glyph on the shape record" });
    await waitFor(() => faceOf(id).querySelector('[data-slot="glyph"] svg'), { what: "the icon on the block face" });
    // And the canvas trigger now reflects it — one value, two doors.
    await waitFor(() => (glyphOn(id)?.getAttribute("data-empty") === null ? true : null), {
      what: "the canvas trigger no longer empty",
    });
  });
});
