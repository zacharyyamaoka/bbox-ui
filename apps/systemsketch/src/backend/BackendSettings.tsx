// src/backend/BackendSettings.tsx — the `Backend` setting, and the whole
// pyblocks surface of this app hanging off it.
//
// One component, mounted once, in the stock slot tldraw keeps for a host's
// own top-right panel (`components.SharePanel`; `src/App.tsx` switches
// `StylePanel` off, so the seat is free). It owns four things:
//
//   1. the setting — `none | pyblocks @ url`, remembered per viewer;
//   2. health — one `/api/health` on change and every 15 s, as a pill;
//   3. the scene-event bridge, which runs WHATEVER the setting says, because
//      the seam is the whiteboard's and not the backend's;
//   4. the consumer and the `Open Python file…` menu, which run only when
//      health says the routes are there.
//
// WHY `none` is the default and renders nothing at all — Zach: "System
// sketch should be able to be used with no real backend, then its truly like
// a whiteboard." At `none` the only thing on screen is the Backend control
// itself, reading `none`, mentioning nothing else; no pill, no menu, no
// status line, no fetch. `src/backend/backend.test.ts` grades that rule as a
// function and `tests/pyblocks_backend_smoke.mjs` grades it as a DOM.
//
// WHY the control is a closed disclosure rather than an always-open row: the
// select's own second option is the word `pyblocks`, and the promise above is
// that a whiteboard shows nothing of it. Closed, the trigger reads
// `Backend: none` and the popup does not exist — which is both the honest
// reading of the promise and a smaller piece of chrome over the board.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "tldraw";

import { StatusDot } from "@trunk/components/chromeBar";
import { FieldGesture } from "@trunk/components/codeEditorGesture";
import { Popover, PopoverContent, PopoverTrigger } from "@trunk/components/popover";
import {
  DEFAULT_PYBLOCKS_URL,
  NO_BACKEND,
  normalizePyblocksUrl,
  type BackendSetting,
} from "@trunk/backend/backendSetting";
import type { PyblocksEventsEcho, PyblocksHealthResult } from "@trunk/backend/pyblocksClient";
import { createSceneEventSeam, type SceneEventSeam } from "@trunk/scene/sceneEvents";

import { OpenPythonMenu, type OpenedPyblocksBoard } from "./OpenPython";
import {
  attachPyblocksConsumer,
  backendClientFor,
  echoSummary,
  pyblocksSurfaces,
  readStoredSetting,
  writeStoredSetting,
} from "./pyblocksConsumer";
import { useSceneEventBridge } from "./useSceneEventBridge";

/** `/api/health` is cheap and local; 15 s is the plan's own figure (§3.3)
 *  and is short enough that starting the server while the app is open shows
 *  up before the person goes looking for a reload. */
const HEALTH_POLL_MS = 15_000;

/** `localStorage`, or nothing at all. Never dereferenced directly —
 *  `readStoredSetting`/`writeStoredSetting` do the try/catch. */
function viewerStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The pill's own words: `ok · scene · events`, naming only the capabilities
 *  the server actually claimed. */
function healthLabel(health: PyblocksHealthResult | null): string {
  if (health === null) return "checking…";
  if (!health.ok) return health.reason;
  const parts = ["ok"];
  if (health.capabilities.scene) parts.push("scene");
  if (health.capabilities.events) parts.push("events");
  return parts.join(" · ");
}

/**
 * The pyblocks URL field, as its own component so it has an UNMOUNT of its
 * own to commit from — P-030, "nothing you type is ever lost", on the exit
 * route the browser does not report.
 *
 * WHY a `FieldGesture` (`@trunk/components/codeEditorGesture`) rather than a
 * third hand-rolled commit call: that class already IS this app's answer to
 * the hazard, and its header states it — "no `blur` fires for a focused
 * element removed from the DOM, so a naive commit-on-blur field silently
 * drops whatever was typed the instant its panel unmounts." `CodeEditor`
 * drives it from its own unmount effect (codeEditor.tsx:515) and that is why
 * the port declaration and the code cell were already safe. This field was
 * not: it buffered in `urlDraft` and committed only from React's `onBlur` and
 * from Enter, so Escape-with-the-caret-still-in-the-field left the store
 * holding the OLD url while the reopened field showed the new one. Measured
 * in real Chromium; `src/backendUrlCommit.smoke.test.tsx` is the gate.
 *
 * WHY `exit` mode and not the `live` mode `CodeEditor` uses: a live write
 * here re-mints the backend client and restarts the 15 s health poll on
 * every keystroke, and `normalizePyblocksUrl` refuses every half-typed
 * prefix on the way (`h`, `ht`, `http:/`…), so the field would paint an
 * error per character. `exit` exists for exactly that — "a write that is
 * genuinely expensive" — and it is still loss-free, because unmount is
 * itself an end boundary.
 *
 * WHY the component owns only the gesture and not the draft: the draft has a
 * second reader — the `kind` select reads it to build the setting when the
 * person switches to pyblocks without ever touching the URL — so it stays in
 * the panel and this component stays presentational plus one lifecycle.
 */
function BackendUrlField({
  value,
  onDraft,
  onCommit,
}: {
  value: string;
  onDraft: (text: string) => void;
  /** MUST be referentially stable, and MUST read the current setting at CALL
   *  time rather than closing over it — the unmount commit fires from a
   *  render this component never saw. See `commitUrl`'s guard. */
  onCommit: (text: string) => void;
}) {
  const gestureRef = useRef<FieldGesture | null>(null);
  if (gestureRef.current === null) {
    gestureRef.current = new FieldGesture({ write: (text) => onCommit(text) }, "exit");
  }
  const gesture = gestureRef.current;

  // The last line of the contract: every OTHER exit route already calls
  // `commit()`, and `FieldGesture.commit()` is idempotent, so a real blur
  // followed by this cleanup writes once. Same shape as `CodeEditor`'s.
  useLayoutEffect(() => () => gesture.commit(), [gesture]);

  return (
    <input
      data-testid="ss-backend-url"
      className="w-52 rounded-md border border-border bg-background px-1.5 py-1 font-mono"
      value={value}
      onFocus={(event) => gesture.focus(event.currentTarget.value)}
      onChange={(event) => {
        onDraft(event.target.value);
        gesture.change(event.target.value);
      }}
      onBlur={() => gesture.commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") gesture.commit();
      }}
    />
  );
}

export function PyblocksBackendPanel() {
  const { addToast } = useToasts();
  const storage = useMemo(viewerStorage, []);

  const [setting, setSetting] = useState<BackendSetting>(() => readStoredSetting(viewerStorage()));
  const [urlDraft, setUrlDraft] = useState(() => (setting.kind === "pyblocks" ? setting.url : DEFAULT_PYBLOCKS_URL));
  const [urlError, setUrlError] = useState<string | null>(null);
  const [health, setHealth] = useState<PyblocksHealthResult | null>(null);
  const [echo, setEcho] = useState<PyblocksEventsEcho | null>(null);
  const [board, setBoard] = useState<OpenedPyblocksBoard | null>(null);
  const [open, setOpen] = useState(false);

  /**
   * ONE seam per app instance, created lazily so a re-render cannot mint a
   * second one (`history.ts`'s own rule: "No module-level state: each app
   * instance owns its own"). It exists whatever the setting says — the
   * whiteboard emits, and a consumer is optional.
   */
  const seamRef = useRef<SceneEventSeam | null>(null);
  if (seamRef.current === null) seamRef.current = createSceneEventSeam();
  const seam = seamRef.current;

  /**
   * The live setting, readable from a callback that outlives the render it
   * was created in. Assigned during RENDER on purpose, not from an effect:
   * the one caller that needs it is the URL field's unmount commit, and in
   * React's commit phase a child's cleanup runs BEFORE the parent's effects
   * — so an effect-assigned ref would still read `pyblocks` at the exact
   * moment the person has just chosen `none`.
   */
  const settingRef = useRef(setting);
  settingRef.current = setting;

  const client = useMemo(() => backendClientFor(setting), [setting]);
  const surfaces = pyblocksSurfaces(setting, health);

  // The bridge is UNCONDITIONAL. A board with no backend still derives its
  // events and publishes them into a seam nobody is listening on, which is
  // the behaviour Zach described and the thing a later consumer plugs into
  // without the whiteboard changing.
  const bridge = useSceneEventBridge(seam, useCallback(() => board?.documentUri, [board]));

  const commitSetting = useCallback(
    (next: BackendSetting) => {
      setSetting(next);
      writeStoredSetting(storage, next);
      setEcho(null);
      if (next.kind === "none") setBoard(null);
    },
    [storage],
  );

  const commitUrl = useCallback(
    (text: string) => {
      // WHY the kind is re-read here and not closed over: this now runs from
      // the field's UNMOUNT as well as from blur and Enter, and one way the
      // field unmounts is the person choosing `Backend: none`. Committing a
      // url then would resurrect pyblocks a keystroke after it was switched
      // off — the setting the person chose last must win.
      // `src/backendUrlCommit.smoke.test.tsx` holds this case.
      if (settingRef.current.kind !== "pyblocks") return;
      const url = normalizePyblocksUrl(text);
      if (url === null) {
        // Refused while it is still a SETTING, with the field still in front
        // of the person — `backendSetting.ts`'s own reasoning for checking
        // the protocol at parse time rather than at the fetch.
        setUrlError("Not a http(s) URL");
        return;
      }
      setUrlError(null);
      setUrlDraft(url);
      commitSetting({ kind: "pyblocks", url });
    },
    [commitSetting],
  );

  /* -- health: on change, then every 15 s ------------------------------ */
  useEffect(() => {
    if (!client) {
      setHealth(null);
      return;
    }
    let alive = true;
    setHealth(null);
    const poll = async () => {
      const next = await client.health();
      if (alive) setHealth(next);
    };
    void poll();
    const timer = setInterval(() => void poll(), HEALTH_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client]);

  /* -- the consumer: attached only while the routes are there ---------- */
  useEffect(() => {
    if (!client || !surfaces.consumer) return;
    const detach = attachPyblocksConsumer(seam, client, {
      onEcho: setEcho,
      onError: (message) =>
        addToast({ severity: "warning", title: "pyblocks did not accept the last edits", description: message }),
    });
    // Detaching takes `seam.size` back to 0 — the board goes on emitting.
    return detach;
  }, [addToast, client, seam, surfaces.consumer]);

  const notices = board ? [...board.problems, ...board.diagnostics.map((one) => `${one.severity}: ${one.message}`)] : [];

  return (
    <div data-testid="ss-backend" className="pointer-events-auto flex flex-col items-end gap-1 p-2 text-xs">
      <div className="flex items-center gap-1.5">
        {/* The surface is live as soon as a consumer is attached, but it only
            takes up room once there is an echo to read — an empty bordered box
            beside the board says "something goes here" and nothing else. */}
        {surfaces.statusLine && echo ? (
          <span
            data-testid="ss-backend-status"
            data-pyblocks="status"
            title="The last echo from pyblocks. `applied` is 0 by tonight's contract — the write path is follow-up F1."
            className="rounded-md border border-border bg-card px-2 py-1 text-card-foreground tabular-nums"
          >
            {echoSummary(echo)}
          </span>
        ) : null}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            data-testid="ss-backend-trigger"
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-card-foreground shadow-sm"
          >
            {surfaces.healthPill ? (
              <StatusDot tone={health === null ? "pending" : health.ok ? "ok" : "error"} label={healthLabel(health)} />
            ) : null}
            <span>Backend: {setting.kind}</span>
          </PopoverTrigger>
          <PopoverContent data-testid="ss-backend-popover" align="end" autoFocus={false} className="w-80 text-xs">
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Backend</span>
              <select
                data-testid="ss-backend-kind"
                className="rounded-md border border-border bg-background px-1.5 py-1"
                value={setting.kind}
                onChange={(event) =>
                  commitSetting(
                    event.target.value === "pyblocks"
                      ? { kind: "pyblocks", url: normalizePyblocksUrl(urlDraft) ?? DEFAULT_PYBLOCKS_URL }
                      : NO_BACKEND,
                  )
                }
              >
                <option value="none">none</option>
                <option value="pyblocks">pyblocks</option>
              </select>
            </label>

            {setting.kind === "pyblocks" ? (
              <>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">URL</span>
                  <BackendUrlField value={urlDraft} onDraft={setUrlDraft} onCommit={commitUrl} />
                </label>
                {urlError ? <span className="text-destructive">{urlError}</span> : null}
                <span
                  data-testid="ss-backend-health"
                  data-pyblocks="health"
                  data-ok={health === null ? "pending" : String(health.ok)}
                  className="rounded-md border border-border bg-muted px-1.5 py-1 break-words"
                >
                  {healthLabel(health)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                No backend. This is a whiteboard: nothing is analysed, nothing is sent anywhere.
              </span>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {board && setting.kind === "pyblocks" ? (
        <span
          data-testid="ss-backend-title"
          data-pyblocks="board"
          title={board.documentUri}
          className="rounded-md border border-border bg-card px-2 py-1 text-card-foreground"
        >
          {board.title}
        </span>
      ) : null}

      {surfaces.menuItem && client ? (
        <OpenPythonMenu
          client={client}
          onOpened={(opened) => {
            setBoard(opened);
            for (const problem of opened.problems) {
              addToast({ severity: "warning", title: "Opened with problems", description: problem });
            }
            for (const diagnostic of opened.diagnostics) {
              addToast({
                severity: diagnostic.severity === "error" ? "error" : "info",
                title: "pyblocks diagnostic",
                description: diagnostic.message,
              });
            }
          }}
          onError={(message) => addToast({ severity: "error", title: "Could not open that Python file", description: message })}
          // A board pyblocks just sent is not an edit the person made:
          // rebasing here is what stops the open being published straight
          // back at pyblocks as a few dozen `node-added` events.
          onBoardApplied={bridge.rebase}
        />
      ) : null}

      {notices.length > 0 && setting.kind === "pyblocks" ? (
        <ul
          data-testid="ss-backend-problems"
          data-pyblocks="problems"
          className="flex w-64 flex-col gap-0.5 rounded-md border border-border bg-card p-1.5 text-card-foreground"
        >
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
