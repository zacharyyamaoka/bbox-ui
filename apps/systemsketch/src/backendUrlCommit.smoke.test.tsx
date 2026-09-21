// src/backendUrlCommit.smoke.test.tsx — P-030 ("WYSIWYG text commit — nothing
// you type is ever lost") on the ONE surface in this app that could lose it:
// the Backend popover's pyblocks URL field.
//
// WHY this file exists beside src/textEditing.smoke.test.tsx, which already
// grades P-030: that file's header used to record, as a measured finding,
// that "no exit route in this app carries text at all" — every text surface
// writing through per keystroke. That was true of the FOUR shape/inspector
// surfaces it enumerated and false of the app, because it missed a fifth:
// `src/backend/BackendSettings.tsx`'s URL field buffers in a `useState` draft
// and used to commit only from React's `onBlur` and from Enter. Closing the
// popover removes the focused field from the DOM, and the browser fires no
// `blur` React can see for an element that is being removed — the exact
// hazard `@trunk/components/codeEditorGesture`'s header is written about.
//
// Reproduced in this file before it was fixed: type a URL, press Escape while
// the field still has focus, and `localStorage` kept the OLD url while the
// reopened field showed the new one. The field and the store disagreed about
// what the person typed.
//
// The last two cases are the guard rails. A fix that commits on EVERY exit is
// wrong twice over if it also (a) writes text the setting refuses, or (b)
// turns an exit that is MEANT to cancel into a commit — and this app has a
// real cancel semantic next door, on the port-label rename.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BACKEND_SETTING_STORAGE_KEY, DEFAULT_PYBLOCKS_URL } from "@trunk/backend/backendSetting";

import { PORT_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

const TYPED = "http://127.0.0.1:9999";

let app: MountedApp | null = null;
let restoreFetch: (() => void) | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  restoreFetch?.();
  restoreFetch = null;
  window.localStorage.removeItem(BACKEND_SETTING_STORAGE_KEY);
});

/**
 * No pyblocks server is running on either URL in this file, and the health
 * poll is not what is under test — so `/api/*` is answered locally rather
 * than left to a 15 s connection refusal per poll. Everything else still
 * reaches the real network (the harness's own page assets).
 */
function stubBackendRoutes() {
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/")) return new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
    return real(input as RequestInfo, init);
  }) as typeof window.fetch;
  restoreFetch = () => {
    window.fetch = real;
  };
}

/** What the viewer's browser actually stored — the only copy that survives a
 *  reload, and therefore the oracle for "was it committed". */
function storedSetting(): { kind?: string; url?: string } | null {
  const raw = window.localStorage.getItem(BACKEND_SETTING_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { kind?: string; url?: string });
}

const backendTrigger = () =>
  waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-backend-trigger"]'), { what: "the Backend control" });

const urlField = () =>
  waitFor(() => document.querySelector<HTMLInputElement>('[data-testid="ss-backend-url"]'), { what: "the pyblocks URL field" });

/** Open the popover and put the setting on pyblocks, through the real
 *  control — never a direct localStorage poke, because the commit path is
 *  the thing under test. */
async function openOnPyblocks(): Promise<HTMLInputElement> {
  await userEvent.click(await backendTrigger());
  const select = await waitFor(() => document.querySelector<HTMLSelectElement>('[data-testid="ss-backend-kind"]'), {
    what: "the Backend select",
  });
  await userEvent.selectOptions(select, "pyblocks");
  await waitFor(() => storedSetting()?.kind === "pyblocks", { what: "the setting stored as pyblocks" });
  return await urlField();
}

/** Type into the field the way a person does — select-all, then characters —
 *  and leave the caret exactly where it ends up. No blur, no Enter. */
async function retype(field: HTMLInputElement, text: string) {
  await userEvent.click(field);
  await userEvent.keyboard("{Control>}a{/Control}");
  await userEvent.keyboard(text);
  await waitFor(() => field.value === text, { what: `the field reads ${text}` });
  // The case only means anything if the field is STILL the focused element
  // when it is removed — otherwise this measures the easy exit, the one the
  // person had already left.
  expect(field.ownerDocument.activeElement, "the field must still hold focus").toBe(field);
}

describe("P-030 — the Backend URL field commits on every exit, including the ones that fire no blur", () => {
  it("Escape closes the popover under the focused field, and the store holds what was typed", async () => {
    stubBackendRoutes();
    app = await mountApp();
    const field = await openOnPyblocks();
    expect(storedSetting()?.url).toBe(DEFAULT_PYBLOCKS_URL);

    await retype(field, TYPED);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !field.isConnected, { what: "the popover closed under the field" });

    expect(storedSetting()).toEqual({ kind: "pyblocks", url: TYPED });

    // …and the field and the store now agree, which is the half a person
    // actually notices: before the fix the reopened field showed the new URL
    // while the store still held the old one.
    await userEvent.click(await backendTrigger());
    expect((await urlField()).value).toBe(TYPED);
  });

  it("the whole panel is torn down mid-edit while the field still holds focus", async () => {
    stubBackendRoutes();
    app = await mountApp();
    const field = await openOnPyblocks();
    await retype(field, TYPED);

    // The route with no blur at all to lean on: React removes the tree from
    // under a focused input. Nothing but an unmount commit can reach this.
    app.unmount();
    app = null;
    await waitFor(() => !field.isConnected, { what: "the app came down" });

    expect(storedSetting()).toEqual({ kind: "pyblocks", url: TYPED });
  });

  it("text the setting REFUSES is still refused on the unmount route — the store keeps the URL it had", async () => {
    stubBackendRoutes();
    app = await mountApp();
    const field = await openOnPyblocks();
    await retype(field, "not a url");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !field.isConnected, { what: "the popover closed under the field" });

    // `normalizePyblocksUrl` refuses it, so the committed setting is the one
    // that was already there — a commit route is not a licence to store
    // something the parser rejected.
    expect(storedSetting()).toEqual({ kind: "pyblocks", url: DEFAULT_PYBLOCKS_URL });
  });

  it("choosing Backend: none with an uncommitted draft in the field does NOT resurrect pyblocks", async () => {
    stubBackendRoutes();
    app = await mountApp();
    const field = await openOnPyblocks();
    await retype(field, TYPED);

    // Switching the kind is what removes the URL field from the DOM, so the
    // unmount commit fires with `none` as the person's last word. The commit
    // must lose that race on purpose.
    const select = await waitFor(() => document.querySelector<HTMLSelectElement>('[data-testid="ss-backend-kind"]'), {
      what: "the Backend select",
    });
    await userEvent.selectOptions(select, "none");
    await waitFor(() => !field.isConnected, { what: "the URL field left with the pyblocks branch" });

    expect(storedSetting()).toEqual({ kind: "none" });
  });

  it("the exit that is MEANT to cancel still cancels: Escape on a port rename puts the declaration back", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({ id, type: PORT_SHAPE_TYPE, x: 220, y: 180, props: { declaration: "gain_x: float", direction: "in" } } as never);
    const label = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`),
      { what: "the resting port label" },
    );
    await userEvent.dblClick(label);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the rename session opened" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("wrecked");
    await waitFor(() => (app!.editor.getShape(id) as { props: { declaration: string } }).props.declaration === "wrecked", {
      what: "the live write reached the store",
    });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "the rename session closed" });

    expect((app.editor.getShape(id) as { props: { declaration: string } }).props.declaration).toBe("gain_x: float");
  });
});
