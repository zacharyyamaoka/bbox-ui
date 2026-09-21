// src/validationLevel.smoke.test.tsx — RULING 3's acceptance, in the running app.
//
// Zach, ruling 3: "have the connection validation setting in the settings panel
// so you can switch between what level of linting you want from whiteboard,
// where anything goes to like evalid code, etc."
//
// WHY this suite exists at all, stated plainly because it is the whole point:
// the previous wave built the level — four rungs, a 221-line unit test, a
// story — and shipped it with ZERO callers. A person who chose a level saw one
// sentence change in a dialog and nothing whatsoever on the board. So every
// case below drives the REAL Settings dialog with a real click, then measures
// the REAL board: how many `ss-wire` records exist, how many rows the Problems
// panel paints. Nothing here calls `lintSceneAtLevel` or
// `validateConnectionAtLevel` directly — the trunk's own
// `scene/validationLevel.test.ts` already grades those, and a second copy of
// that grading would once again prove the mechanism works while saying nothing
// about whether anything uses it.
//
// EVERY CASE IS A DIFFERENTIAL, for the same reason: a test that passes at one
// level proves nothing. Each one performs the IDENTICAL user action at two
// levels and asserts the two outcomes DIFFER.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { EDGE_POLICY_STORAGE_KEY } from "@trunk/components/edgePolicy";
import type { ValidationLevel } from "@trunk/scene/validationLevel";

import { resetValidationLevelCache } from "./chrome/ShareMenu/validationLevelHost";
import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { clickRow, openBurger } from "./testing/menus";

let app: MountedApp | null = null;

// The level is a MODULE store on purpose (see validationLevelHost.ts), which
// means it outlives a React unmount — so a suite that mounts twice would judge
// the second mount against the first one's cached record unless both the stored
// bytes and the cache are cleared. This is the seam the host exports for it.
beforeEach(() => {
  window.localStorage.removeItem(EDGE_POLICY_STORAGE_KEY);
  resetValidationLevelCache();
});

afterEach(() => {
  app?.unmount();
  app = null;
  window.localStorage.removeItem(EDGE_POLICY_STORAGE_KEY);
  resetValidationLevelCache();
});

const outPort = (type: string) => ({ left: [], right: [{ id: "out", declaration: `out: ${type}` }], top: [], bottom: [] });
const inPort = (type: string) => ({ left: [{ id: "in", declaration: `in: ${type}` }], right: [], top: [], bottom: [] });

function block(name: string, x: number, y: number, ports: unknown): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports } } as never);
  return id;
}

/** The painted dot, not a model lookup — the thing a person actually presses.
 *  Same selector `wiring.smoke.test.tsx` drives. */
async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(() => {
    const wrap = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"]`);
    return wrap?.querySelector<HTMLElement>(`[data-port-id="${portId}"] [data-slot="port-dot"]`) ?? null;
  }, { what: `${id}/${portId} dot` });
}

function wires() {
  return app!.editor.getCurrentPageShapes().filter((shape) => shape.type === WIRE_SHAPE_TYPE);
}

const settingsView = () => document.querySelector<HTMLElement>('[data-testid="ss-settings"][data-slot="settings-view"]');

/**
 * Choose a level the way a person does: burger ▸ Settings ▸ Connections ▸ the
 * rung's button, then Escape.
 *
 * WHY through the dialog rather than by writing the store: the store is what
 * this lane ADDED, and a test that drove it directly would be grading its own
 * plumbing. The dialog is the only surface the ruling actually names, and
 * `aria-pressed` on the chosen button is the control confirming it took —
 * derived from the nine stored switches, never from the click.
 */
async function chooseLevel(level: ValidationLevel): Promise<void> {
  await clickRow(await openBurger(app!), "Settings");
  const view = await waitFor(() => settingsView(), { what: "the Settings surface" });
  const connections = await waitFor(
    () => Array.from(view.querySelectorAll<HTMLElement>('[data-slot="settings-nav"] button')).find((button) => /Connections/.test(button.textContent ?? "")) ?? null,
    { what: "the Connections category" },
  );
  await userEvent.click(connections);
  const rung = await waitFor(
    () => settingsView()?.querySelector<HTMLElement>(`[data-slot="edge-policy-preset"][data-preset-id="${level}"]`) ?? null,
    { what: `the ${level} rung` },
  );
  await userEvent.click(rung);
  await waitFor(
    () => (settingsView()?.querySelector(`[data-slot="edge-policy-preset"][data-preset-id="${level}"]`)?.getAttribute("aria-pressed") === "true" ? true : null),
    { what: `${level} reads as the chosen rung` },
  );
  await userEvent.keyboard("{Escape}");
  await waitFor(() => !settingsView(), { what: "Settings closed" });
}

describe("Ruling 3 — the validation level governs the board, not just a sentence in a dialog", () => {
  it("the SAME drag between the SAME two dots is drawn at whiteboard and refused at strict — and strict still draws a matching pair", async () => {
    app = await mountApp();
    // `Pose` out of one block, `Image` into another: a cable the board can
    // paint but the running program could not carry. Declared in the ONE
    // declaration line each port has (ruling 8) — there is no type field.
    const producer = block("producer", 100, 100, outPort("Pose"));
    const mismatched = block("mismatched", 520, 100, inPort("Image"));
    const matching = block("matching", 520, 360, inPort("Pose"));

    await chooseLevel("whiteboard");
    await userEvent.dragAndDrop(await dotOf(producer, "out"), await dotOf(mismatched, "in"));
    await waitFor(() => (wires().length === 1 ? true : null), { what: "whiteboard draws the mismatched cable" });

    // Clear the board of wires so the strict attempt is judged on its own
    // merits — leaving the first one up would let `duplicate-edge` refuse the
    // retry and the case would pass for the wrong reason.
    app.editor.deleteShapes(wires().map((wire) => wire.id));
    await waitFor(() => (wires().length === 0 ? true : null), { what: "the board is clear again" });

    await chooseLevel("strict");
    await userEvent.dragAndDrop(await dotOf(producer, "out"), await dotOf(mismatched, "in"));
    // A refusal is silent today (wireGesture.commit says so, and says whose
    // job surfacing it is), so the assertion is the board itself: nothing
    // landed. Given a settle window so this cannot pass merely by being fast.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(wires(), "strict must refuse the cable whiteboard drew").toHaveLength(0);

    // The POSITIVE control, and the reason this case proves the level is being
    // read rather than that strict refuses everything: the same gesture over
    // two ports that DO agree still lands, at the same strict level.
    await userEvent.dragAndDrop(await dotOf(producer, "out"), await dotOf(matching, "in"));
    await waitFor(() => (wires().length === 1 ? true : null), { what: "strict still draws Pose → Pose" });
  });

  it("the Problems panel is SHORTER at whiteboard than at the default level, over one unchanged board", async () => {
    app = await mountApp();
    const producer = block("producer", 100, 100, outPort("Pose"));
    const consumer = block("consumer", 520, 100, inPort("Pose"));
    // Authored past the gate on purpose — `createWire` is what the app's own
    // paste/import paths use, and the point here is the AT-REST linter, not
    // the gate. Two cables over one port pair is `duplicate-edge`, a rule
    // `guided` runs and `whiteboard` does not.
    const { createWire } = await import("./shapes/wire/createWire");
    createWire(app.editor, { from: { nodeId: producer, portId: "out" }, to: { nodeId: consumer, portId: "in" } });
    createWire(app.editor, { from: { nodeId: producer, portId: "out" }, to: { nodeId: consumer, portId: "in" } });

    const problemsItem = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-problems"]'), { what: "the Problems status item" });
    await userEvent.click(problemsItem);
    const panel = () => app!.root.querySelector<HTMLElement>('[data-testid="ss-problems-panel"]');
    const rows = () => Array.from(app!.root.querySelectorAll('[data-slot="problems-panel-item"]')).length;

    // The shipped default is `guided` — the rung a person who has never opened
    // Settings is on — and it reports the duplicate.
    await waitFor(() => (panel() && rows() > 0 ? true : null), { what: "the default level marks the duplicate up" });
    const atDefault = rows();
    expect(panel()!.textContent, "the default level names the rule it refused on").toMatch(/duplicate/i);

    await chooseLevel("whiteboard");

    // Same board, same two wires, nothing deleted: only the level moved.
    await waitFor(() => (panel() && rows() === 0 ? true : null), { what: "whiteboard flags nothing" });
    expect(rows(), "whiteboard must be strictly shorter than the default").toBeLessThan(atDefault);
    expect(panel()!.textContent).toMatch(/No problems/i);
    expect(app.editor.getCurrentPageShapes().filter((shape) => shape.type === WIRE_SHAPE_TYPE), "the board itself is untouched — only the judgement of it changed").toHaveLength(2);
  });
});
