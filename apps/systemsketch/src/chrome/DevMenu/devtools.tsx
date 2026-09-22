// src/chrome/DevMenu/devtools.tsx — mounting the trunk's quick switcher, dev panel
// and recorder, none of which this app built.
//
// Lane `devtools-2026-09-19` built all three entirely in `@trunk` and
// mounted none of them, deliberately, so five agents could not collide on
// this app's one mount point (docs/WORK-ORDER-CONTINUE-2026-09-20.md §7.3).
// This file is the mount: it configures three stock surfaces with this
// app's real tools and this app's live editor state, and authors none of
// them — "system sketch should just be kinda like importing these stock
// menus and doing a light bit of configuration" (Zach, 2026-09-19).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor, useValue } from "tldraw";

import { DevPanel, type DevPanelSection } from "@trunk/editor/devPanel";
import { QuickSwitcher } from "@trunk/editor/quickSwitcher";
import {
  quickSwitcherKeyDecision,
  type QuickSwitcherItem,
  type QuickSwitcherMode,
} from "@trunk/editor/commandModel";
import type { TextSearchMatch, TextSourceUpdate } from "@trunk/editor/boardSearch";
import { readToolAliases } from "@trunk/editor/toolAliases";
import { RecordingControl, recordingStatusLabel } from "@trunk/editor/recordingControl";
import { RecordingViewer } from "@trunk/editor/recordingViewer";
import { createRecordingCore } from "@trunk/recording/recordingCore";
import { createBrowserRecordingEffects } from "@trunk/recording/recordingEffects";
import { createRecordingClient, type RecordingBundle } from "@trunk/recording/recordingClient";
import { useRecordingElapsed, useRecordingState } from "@trunk/recording/useRecording";

import { DRAW_TOOLS, GEO_VARIANTS, LINE_TOOLS, SIMPLE_TOOLS } from "../families";
import { SYSTEM_FAMILY_ITEMS } from "../../shapes/registry";
import {
  applyBoardTextUpdates,
  boardTextSources,
  revealBoardTextMatch,
  type BoardTextMeta,
} from "../../document/boardText";

/**
 * The browser's own storage, or `null` when even touching it throws —
 * `appSettings.tsx`'s own guard, repeated here rather than imported: reading
 * a tool's aliases is this file's only reason to touch storage, and it is
 * not worth a shared module for one four-line try/catch.
 */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Every tool this app has, as a `Go to` row — the SAME arrays the dock and
 * Settings' alias editor render (`chrome/ShareMenu/appSettings.tsx`'s `ALIAS_ITEMS`),
 * so a tool cannot appear on the toolbar and be missing from the switcher.
 * `run()` arms the real tool by its real id; nothing here invents a shorter
 * one, because the id is also what `editor.setCurrentTool` must recognise.
 *
 * WHY aliases are read fresh on every open rather than once at mount: the
 * Settings ▸ "Hotkeys and aliases" editor writes them to
 * `systemsketch.tool-aliases.v1` while this component stays mounted for the
 * whole session, and a nickname typed a minute ago should be searchable the
 * next time `S` is pressed, not only after a reload.
 */
function useToolSwitcherItems(editor: ReturnType<typeof useEditor>, open: boolean): QuickSwitcherItem[] {
  return useMemo(() => {
    const aliases = readToolAliases(viewerStorage());
    const tools = [...SIMPLE_TOOLS, ...SYSTEM_FAMILY_ITEMS, ...GEO_VARIANTS, ...LINE_TOOLS, ...DRAW_TOOLS];
    return tools.map((tool) => ({
      id: tool.id,
      label: tool.label,
      icon: tool.icon,
      group: "Tools",
      // WHY keywords, not a second search field: this is the alias
      // vocabulary's ONLY consumer today (`toolAliases.ts`'s own header —
      // nothing else in the app reads `systemsketch.tool-aliases.v1`), so
      // feeding a nickname into `keywords` is what closes the loop between
      // the Settings editor writing aliases and anything actually using
      // them to find a tool.
      keywords: aliases[tool.id],
      run: () => {
        editor.setCurrentTool(tool.id);
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, open]);
}

/** `S` opens it; typing or an open layer refuses it; Ctrl/Cmd+K always opens
 *  it on Go to and Ctrl/Cmd+F always opens it on Find. The policy is entirely
 *  `quickSwitcherKeyDecision`'s — this is the thin `window` listener the
 *  trunk's own story says a host needs (`QuickSwitcher.stories.tsx`, `Host`,
 *  ~line 71-121): read the decision, take the mode it names, and do nothing
 *  else.
 *
 *  WHY `preventDefault` matters more for Ctrl+F than for the other two: it is
 *  the one binding the BROWSER already owns. Without it Chrome's find bar
 *  opens on top of this dialog and searches the rendered DOM — which on a
 *  canvas is only the shapes currently painted into the viewport, on the
 *  current page. See the WHY in `commandModel.ts`'s own header. */
function useQuickSwitcherOpener(
  open: boolean,
  openAt: (mode: QuickSwitcherMode) => void,
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const decision = quickSwitcherKeyDecision(event, { open });
      if (!decision.open) return;
      event.preventDefault();
      event.stopPropagation();
      openAt(decision.mode);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, openAt]);
}

/** Nothing is searchable while the dialog is shut, and saying so with a
 *  FROZEN empty array is what keeps this out of the hot path: `useValue` only
 *  recomputes when a signal it READ has changed, and the closed branch reads
 *  none — so dragging a shape around a closed board re-derives nothing. */
const NO_SOURCES: ReturnType<typeof boardTextSources> = [];

/**
 * Every string on the board, as the trunk's Find half wants them — recomputed
 * only while the dialog is open, and then on every document change, so a
 * replacement's own write is reflected in the results it came from.
 */
function useBoardTextSources(editor: ReturnType<typeof useEditor>, open: boolean) {
  return useValue(
    "ss board text",
    () => (open ? boardTextSources(editor) : NO_SOURCES),
    [editor, open],
  );
}

export interface SystemSketchDevToolsProps {
  /** The `</>` launcher in the status strip drives this; it is not a
   *  `ChromePanel` (`statusStrip.tsx`'s own note) because it is a dialog,
   *  not a right-rail panel. */
  devPanelOpen: boolean;
  onDevPanelOpenChange(open: boolean): void;
}

export function SystemSketchDevTools({ devPanelOpen, onDevPanelOpenChange }: SystemSketchDevToolsProps) {
  const editor = useEditor();

  /* ---------------------------------------------------------------- */
  /* Quick switcher                                                    */
  /* ---------------------------------------------------------------- */

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherMode, setSwitcherMode] = useState<QuickSwitcherMode>("go-to");
  const openSwitcherAt = useCallback((mode: QuickSwitcherMode) => {
    setSwitcherMode(mode);
    setSwitcherOpen(true);
  }, []);
  useQuickSwitcherOpener(switcherOpen, openSwitcherAt);
  const items = useToolSwitcherItems(editor, switcherOpen);
  const searchSources = useBoardTextSources(editor, switcherOpen);

  const onSelectMatch = useCallback(
    (match: TextSearchMatch<BoardTextMeta>) => revealBoardTextMatch(editor, match),
    [editor],
  );
  // One match and every match go through the same write-back, because "one
  // batch per gesture" is the rule either way (`@trunk/scene/history.ts`).
  const onReplace = useCallback(
    (update: TextSourceUpdate<BoardTextMeta>) => applyBoardTextUpdates(editor, [update]),
    [editor],
  );
  const onReplaceAll = useCallback(
    (updates: TextSourceUpdate<BoardTextMeta>[]) => applyBoardTextUpdates(editor, updates),
    [editor],
  );

  /* ---------------------------------------------------------------- */
  /* Recording — installed once, for as long as this component lives   */
  /* ---------------------------------------------------------------- */

  // WHY `createBrowserRecordingEffects`/`createRecordingCore` are built once
  // over the live editor rather than per-render: the core owns a running
  // collector and a 60s timer (`recordingCore.ts`), and rebuilding it on
  // every render would drop an in-flight take the moment anything else in
  // this tree re-rendered.
  const recordingCore = useMemo(
    () => createRecordingCore(createBrowserRecordingEffects({ editor })),
    [editor],
  );
  const recordingState = useRecordingState(recordingCore);
  const elapsedMs = useRecordingElapsed(recordingState.takeStartedAt);
  const recordingClient = useMemo(() => createRecordingClient(), []);

  useEffect(() => {
    recordingCore.setChannel({
      channel: import.meta.env.MODE,
      build: import.meta.env.DEV ? "dev" : "prod",
      version: "0.1.0",
    });
    return recordingCore.install();
  }, [recordingCore]);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [bundle, setBundle] = useState<RecordingBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  /**
   * KNOWN AND EXPECTED (brief, `devtools.smoke.test.tsx`'s own lane note):
   * the Python `RecordingApi` and its `/api/recordings/*` dev proxy are a
   * separate lane's work and are not mounted yet, so this fetch fails today.
   * `recordingClient.readBundle` rejects rather than throwing synchronously,
   * so the `.catch` below is what keeps that an honest "not reachable"
   * message in the modal instead of an unhandled rejection — no fake bundle
   * stands in for it.
   */
  const onViewLast = useCallback(() => {
    setViewerOpen(true);
    setBundleLoading(true);
    setBundleError(null);
    recordingClient
      .readBundle(recordingState.last?.path)
      .then((result) => {
        setBundle(result);
        setBundleLoading(false);
      })
      .catch((cause: unknown) => {
        setBundle(null);
        setBundleLoading(false);
        setBundleError(cause instanceof Error ? cause.message : String(cause));
      });
  }, [recordingClient, recordingState.last]);

  /* ---------------------------------------------------------------- */
  /* Dev panel — live readings only, per row                           */
  /* ---------------------------------------------------------------- */

  const shapeCount = useValue("ss dev shape-count", () => editor.getCurrentPageShapeIds().size, [editor]);
  const selectedCount = useValue("ss dev selected-count", () => editor.getSelectedShapeIds().length, [editor]);
  const pageCount = useValue("ss dev page-count", () => editor.getPages().length, [editor]);
  const toolId = useValue("ss dev tool-id", () => editor.getCurrentToolId(), [editor]);
  const zoomPercent = useValue("ss dev zoom", () => Math.round(editor.getZoomLevel() * 100), [editor]);

  const sections: DevPanelSection[] = [
    {
      id: "board",
      title: "Board",
      caption: "This browser, live",
      rows: [
        { kind: "status", id: "shape-count", title: "Shapes on this page", status: `${shapeCount}` },
        { kind: "status", id: "tool", title: "Current tool", status: toolId },
        { kind: "status", id: "selection", title: "Selected shapes", status: `${selectedCount}` },
        { kind: "status", id: "pages", title: "Pages", status: `${pageCount}` },
        { kind: "status", id: "zoom", title: "Zoom", status: `${zoomPercent}%` },
        // `import.meta.env.MODE`, not invented copy — Vite's own reading of
        // how this bundle was built, the same fact `main.tsx` already
        // branches on for `window.editor`.
        { kind: "status", id: "build", title: "Build channel", status: import.meta.env.MODE },
      ],
    },
    {
      id: "recording",
      title: "Recording",
      // The control's own `header="none"` doc: "the panel's own section
      // already paints both halves" — this caption IS the live status line
      // the donor drew beside the RECORDING label, sourced from the same
      // `recordingStatusLabel` the control uses for its own status row, so
      // the two never say something different.
      caption: recordingStatusLabel(recordingState, elapsedMs),
      rows: [
        {
          kind: "slot",
          id: "recorder",
          content: (
            <RecordingControl
              state={recordingState}
              elapsedMs={elapsedMs}
              header="none"
              testIdPrefix="ss-recording"
              onStart={() => void recordingCore.start()}
              onStop={() => void recordingCore.stop()}
              onCopyLast={() => void recordingCore.copyLast()}
              onViewLast={onViewLast}
            />
          ),
        },
      ],
    },
  ];

  return (
    <>
      <QuickSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        items={items}
        initialMode={switcherMode}
        searchSources={searchSources}
        onSelectMatch={onSelectMatch}
        onReplace={onReplace}
        onReplaceAll={onReplaceAll}
      />
      <DevPanel
        open={devPanelOpen}
        onOpenChange={onDevPanelOpenChange}
        eyebrow="SystemSketch"
        title="Dev"
        sections={sections}
      />
      <RecordingViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        bundle={bundle}
        loading={bundleLoading}
        error={bundleError}
      />
    </>
  );
}
