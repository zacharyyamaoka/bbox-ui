# The ask — 2026-09-19 afternoon: chrome, settings, real files (verbatim)

Source: `/home/bam/zach_brain/Projects/SystemSketch/PROJECT - System Sketch.md` §"More feedback".
Screenshots are the spec — `Read` them: `/home/bam/zach_brain/Pasted image 20260919<stamp>.png`.

> Please make a note that all of the feedback regarding the chrome should be made in bbox-ui
> editor-components, not in system sketch, system sketch should just be kinda like importing these
> stock menus and doing a light bit of configuration: (`135024` — the title field in edit mode:
> "Untitled board" selected in a bordered input, and UNDER it the hint "Press Enter to rename,
> Escape to cancel"; the field has moved up to make room.)
> I don't like how this textbox moves up when I click it and the hint displays beneath it. please
> don't show the control hints.
>
> Please further build out our burger menu. right now its looking too thin! (`135410` — today's
> burger: New board / Open .tldr… / Save .tldr… only.)
> Undo redo should be hidden (`135512` — the undo/redo pill beside the title). We don't need to show that.
> also for file navigation please give the build in [sic — unfinished; read as: give the built-in
> (native OS) file dialog as an option, which the next paragraphs confirm].
> Please add the setting page. We want the option whether we see settings as a [sic — unfinished;
> read as: a dialog or a full page — see dispatcher reading]. You can reference the one in old system sketch.
> Important is the file tab at the start with then new, new window, open, open recent, etc I use
> those a lot.. (`135314` — the OLD app's burger: File ▸ {New Ctrl+N, New window Ctrl+⇧+N, Open…
> Ctrl+O, Open recent ▸ {CAD Exporter, series_a_pose_pipeline_v7, …}, Save Ctrl+S, Save As… Ctrl+⇧+S,
> Export to tldraw…, Rename F2, Copy Absolute Path, Show in Files, Move to Trash…}; Settings; Edit ▸;
> View ▸; Export ▸; Insert embed… Ctrl+I; Upload media… Ctrl+U; Preferences ▸; Language ▸;
> Keyboard shortcuts.)
> also we need to be able to save real files to the system so I can start working on this: Please
> copy over the code from system sketch for the file navigator here. its working good enough for
> now (in settings you can have a toggle whether for file navigation to use native or our app one)
> (`135724` — the OLD app's "LOCAL WORKSPACE · Open a document" dialog: Places {SystemSketch
> /home/bam/SystemSketch, Home /home/bam}, Recent {…}; a path breadcrumb "bam / SystemSketch" with
> ← back, "+ Folder", Filter; a Name ↑ / Size / Modified table of folders and .tldr/.systemsketch
> files; Cancel / Open in new window / Open.)
> Figma burger menu reference: (`135146` — Back to files; Actions… Ctrl+K; File ▸ Edit ▸ View ▸
> Object ▸ Text ▸ Arrange ▸ Vector ▸; Plugins ▸ Widgets ▸ Preferences ▸ Libraries; AI balance ▸
> Help and account ▸.)
> Of course as always please be using stock shadcn as much as possible and [sic — unfinished].

## Dispatcher's reading (reversible defaults; Zach can overrule each)

- **The rule, binding for every lane** (now in `.claude/feedback.md`): how a menu, dialog, panel or
  field LOOKS or BEHAVES lands in the trunk — `apps/storybook-basics/src/components/*` (menu kit)
  or `src/editor/*` (editor kit) — with a story. `apps/systemsketch` only imports, configures
  (which items, which callbacks) and wires to tldraw and the file host.
- **Stock shadcn**: new primitives (dialog, switch, radio-group, select, label, …) are copied
  verbatim from stock shadcn (the Base UI flavour the trunk already uses for dropdown-menu/popover),
  each with the header comment the trunk's `tooltip.tsx` / `dropdown-menu.tsx` carry. No bespoke
  primitives where shadcn has one.
- **Rename field**: no hint text under the field, and entering edit mode does not move or resize
  anything (the field occupies exactly the box the title did). Errors may still show — as a tooltip
  or inline without shifting layout. "Control hints" generally: drop helper/hint text under chrome
  controls across the menu kit.
- **Undo/redo pill**: removed from the app's chrome bar (Edit ▸ Undo / Redo in the burger, and
  Ctrl+Z / Ctrl+⇧+Z keep working).
- **Burger**: File first, exactly the old app's File submenu and order (New, New window, Open…,
  Open recent ▸, Save, Save As…, Export to tldraw…, Rename, Copy Absolute Path, Show in Files,
  Move to Trash…) with the shortcuts shown; then Settings; Edit ▸, View ▸, Export ▸, Preferences ▸,
  Keyboard shortcuts; plus the existing "Switch to old SystemSketch". Rows whose feature does not
  exist yet are omitted, not shown disabled (Language, Insert embed, Upload media unless trivially
  supported by stock tldraw). Figma's structure (grouped submenus, separators) is the look reference.
- **Settings**: ported from the old app's `SystemSketchSettingsDialog`
  (`/home/bam/systemsketch/src/settings/InterfaceSettings.tsx`) — left nav of categories, right
  pane — keeping only categories with real settings now: General (file navigation: native | app;
  settings presentation), Appearance (theme), About. The unfinished "settings as a …" is read as
  **dialog (default, like the old app) or full page**, as a setting.
- **Real files**: port the old app's file host (`/home/bam/systemsketch/scripts/workspace_store.py`
  + the `/api/workspace/*` routes of `scripts/server.py`) stdlib-only into bbox-ui, served by the
  dock launcher's Stable server (`scripts/launch_systemsketch.py`) and by a dev host the vite dev
  server proxies to; port the navigator UI (`/home/bam/systemsketch/src/workspace/LocalWorkspace.tsx`
  navigator dialog + `workspaceClient.ts` / `workspaceModel.ts`) as a trunk component with a client
  interface. The new app's file format is `.tldr`; a `.systemsketch` file (the old envelope) is
  listed and hands off to the old app. Workspace root: `~/SystemSketch`, the same folder as the old
  app — never overwrite a file the old app owns without the conflict check the store already does.
  **Native** mode uses Chrome's File System Access API (showOpenFilePicker / showSaveFilePicker)
  with no server. The toggle lives in Settings.
- **New window**: opens the app in a second window (the old app used `window.open`;
  `LocalWorkspace.tsx:718`).
