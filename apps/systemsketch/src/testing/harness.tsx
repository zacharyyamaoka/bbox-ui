// src/testing/harness.tsx — what every smoke test mounts and how it waits.
// Part of the committed acceptance harness (docs/SYSTEMSKETCH-REBUILD-PLAN.md
// §5); off-limits to builders. It fixes the App's TEST CONTRACT:
//
//   <App persistenceKey={null} onEditorReady={(editor) => …} />
//
//   - `persistenceKey: null` → no IndexedDB persistence, so a test never
//     inherits a previous test's board and never writes one (the archive's
//     rule: "Never point a test at Zach's real board — the app autosaves
//     into it", /home/bam/systemsketch/CLAUDE.md).
//   - `onEditorReady` fires once from the app's own `onMount`, AFTER the
//     app's own mount-time installs, with the live `Editor`.
//   - The root element carries `data-testid="systemsketch-app"`.
//
// Mounting is plain `react-dom/client` — no testing-library, no extra
// dependency; `waitFor` is the four-line poll every host story in the trunk
// already writes by hand.
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "tldraw";

import { App } from "../App";

export interface MountedApp {
  editor: Editor;
  root: HTMLElement;
  unmount(): void;
}

export async function waitFor<T>(probe: () => T | null | undefined | false, options: { timeout?: number; what?: string } = {}): Promise<T> {
  const timeout = options.timeout ?? 10_000;
  const started = performance.now();
  for (;;) {
    let value: T | null | undefined | false;
    let error: unknown = null;
    try {
      value = probe();
    } catch (caught) {
      error = caught;
      value = null;
    }
    if (value) return value;
    if (performance.now() - started > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms${options.what ? ` — ${options.what}` : ""}${error ? `: ${String(error)}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Mount the real App full-viewport and resolve once tldraw's editor exists. */
export async function mountApp(): Promise<MountedApp> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;";
  document.body.appendChild(host);
  let reactRoot: Root | null = createRoot(host);
  let editor: Editor | null = null;
  reactRoot.render(<App persistenceKey={null} onEditorReady={(ready) => (editor = ready)} />);
  const ready = await waitFor(() => editor, { what: "onEditorReady never fired" });
  const root = await waitFor(() => host.querySelector<HTMLElement>('[data-testid="systemsketch-app"]'), { what: "the app root" });
  await waitFor(() => host.querySelector(".tl-canvas"), { what: "tldraw's canvas" });
  // Deterministic viewport: zoom 1, origin 0, no camera animation — the
  // trunk's own bench posture (hosts/tldrawHost.tsx:587-590).
  ready.user.updateUserPreferences({ animationSpeed: 0 });
  ready.setCamera({ x: 0, y: 0, z: 1 });
  return {
    editor: ready,
    root,
    unmount() {
      reactRoot?.unmount();
      reactRoot = null;
      host.remove();
    },
  };
}

/** The canvas element real input is aimed at. */
export function canvasOf(root: HTMLElement): HTMLElement {
  const canvas = root.querySelector<HTMLElement>(".tl-canvas");
  if (!canvas) throw new Error("no .tl-canvas");
  return canvas;
}

/** Centre of a rendered element in viewport px — spatial claims are measured, never presence-asserted. */
export function centreOf(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * FALLBACK ONLY (docs/SYSTEMSKETCH-REBUILD-PLAN.md §9): drive tldraw's own
 * input pipeline directly when Playwright input cannot reach the canvas in
 * this environment. A lane that uses this instead of `userEvent` says why
 * in a comment beside the call. Screen point in viewport px.
 */
export function dispatchPointerTap(editor: Editor, screen: { x: number; y: number }) {
  const base = {
    type: "pointer" as const,
    target: "canvas" as const,
    point: { x: screen.x, y: screen.y, z: 0.5 },
    pointerId: 1,
    button: 0,
    isPen: false,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    accelKey: false,
  };
  editor.dispatch({ ...base, name: "pointer_down" });
  editor.dispatch({ ...base, name: "pointer_up" });
}
