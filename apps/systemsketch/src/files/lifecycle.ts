// src/files/lifecycle.ts — the browser-exit half of "his files are never
// damaged": a window that is going away must not take an unwritten edit with
// it.
//
// Ported from the archived app's own guard, read on disk at
// `/home/bam/systemsketch/src/workspace/workspaceLifecycle.ts:1-68`. The plan
// named it and no lane carried it over — see the note this repo's
// `@trunk/files/workspaceClient` header already carries: "`flushWorkspaceDocument`
// (the pagehide keepalive write) … this app guards unsaved edits with
// `beforeunload` instead" (docs/CHROME-FILES-SETTINGS-PLAN.md §3).
//
// WHY this exists at all, and why it is not optional: a file-backed launch
// turns this app's IndexedDB persistence OFF (`launchConfig.ts`'s
// `persistenceKeyForSearch` — the file on disk IS the persistence). So an edit
// still sitting inside the 600 ms autosave debounce when the window closes is
// not merely late, it is GONE, with nothing anywhere to recover it from. That
// is the plan's 25 %-weighted criterion ("a lost board is unrecoverable, a
// missing feature is not") failing in the one way it must not.
//
// WHY three signals rather than just `beforeunload`:
//   - `visibilitychange` → hidden is the EARLIEST reliable exit signal and the
//     only one a backgrounded or killed tab is guaranteed to give. The save it
//     starts is an ordinary, observable one.
//   - `beforeunload` retries that save AND asks the browser to keep the window
//     open while work is unwritten. `preventDefault()` is the modern contract;
//     legacy Chromium still reads `returnValue`, and some EventTarget
//     implementations expose it read-only — hence the try/catch, the donor's
//     own (workspaceLifecycle.ts:36-44).
//   - `pagehide` is the last word, after the navigation has actually won.
//
// WHY the donor's separate `finalFlush` keepalive write is NOT ported: it
// needs the `flushWorkspaceDocument` beacon this rebuild deliberately left
// behind, and a beacon we do not have would be a comforting no-op. `pagehide`
// here fires the same ordinary flush — best effort, and honest about it.
//
// WHY the disposer does NOT flush on the way out, where the donor's does: this
// app mounts its document session once and unmounts it only when the page is
// already being torn down, so an unmount-time write would be a second,
// invisible writer racing the one `beforeunload` started. It would also let an
// acceptance case pass on the teardown instead of on the guard it measures.

export interface UnsavedWorkGuardOptions {
  windowTarget: Pick<Window, "addEventListener" | "removeEventListener">;
  documentTarget: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  /** True while this window owes the disk something it has not written yet. */
  hasUnsavedWork(): boolean;
  /** Start an ordinary save now. Called at most once per exit signal. */
  flush(): void;
}

/** Install the guard; the returned function removes every listener. */
export function installUnsavedWorkGuard({
  windowTarget,
  documentTarget,
  hasUnsavedWork,
  flush,
}: UnsavedWorkGuardOptions): () => void {
  const flushIfDirty = () => {
    if (hasUnsavedWork()) flush();
  };

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedWork()) return;
    flush();
    event.preventDefault();
    try {
      event.returnValue = true;
    } catch {
      // `preventDefault` above remains the authoritative signal.
    }
  };

  const onVisibilityChange = () => {
    if (documentTarget.visibilityState === "hidden") flushIfDirty();
  };

  windowTarget.addEventListener("beforeunload", onBeforeUnload);
  windowTarget.addEventListener("pagehide", flushIfDirty);
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    windowTarget.removeEventListener("beforeunload", onBeforeUnload);
    windowTarget.removeEventListener("pagehide", flushIfDirty);
    documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
