# Chrome, files and settings — the plan for Zach's 2026-09-19 feedback

The ask, verbatim and screenshot by screenshot: `docs/ASK-2026-09-19-CHROME-FILES-SETTINGS.md`.
This is how it gets built: what "good" means before any option is picked, which
stock part each piece is made of, what is already committed (contracts and
acceptance, red), and the seven lanes that turn it green.

> **The report, not this file, is what Zach reads.** This `.md` is the
> lane-readable input — an isolated worktree reads its brief from a commit —
> and `/home/bam/bbox-ui/reports/chrome-files-settings-2026-09-19.html` is the
> deliverable for him (`.claude/feedback.md`, 2026-09-17 × 3).

## 1. What he asked for, and what he will see

| # | Zach's words | What lands |
|---|---|---|
| 1 | "all of the feedback regarding the chrome should be made in bbox-ui editor-components, not in system sketch" | Every look/behaviour change below is a trunk component (`apps/storybook-basics/src/…`) with a story. `apps/systemsketch` gains configuration and wiring only. |
| 2 | "I don't like how this textbox moves up when I click it and the hint displays benith it. please don't show the control hints" | Renaming the board title edits **in the title's own box** — measured equal to ±1px — and the hint text is gone from the whole menu kit. An error still shows, out of flow, as a `role="alert"`. |
| 3 | "Please further build out our burger menu. right now its looking too thin!" + "Important is the file tab at the start with then new, new window, open, open recent, etc I use those a lot.." | The burger is File ▸ (the old app's ten rows, its order, its shortcuts) · Settings · Edit ▸ View ▸ Export ▸ · Preferences ▸ Keyboard shortcuts · Switch to old SystemSketch — Figma's grouping (separator per group). |
| 4 | "Undo redo should be hidden … We don't need to show that" | The undo/redo pill is removed. Undo/Redo live in Edit ▸ with their shortcuts, and Ctrl+Z / Ctrl+⇧+Z are untouched. |
| 5 | "Please add the setting page. We want the option wether we see settings as a [dialog or a page]. You can reference the one in old system sketch" | A Settings surface ported from the old app's shell (left nav, right pane), shown as a centred dialog (default) or as a full-window page — that choice is itself a setting, remembered per viewer. |
| 6 | "we need to be able to save real files to the system so I can start working on this: Please copy over the code from system sketch for the file navigator here. its working good enough for now (in settings you can have a toggle wether for file navigation to use native or our app one)" | Real `.tldr` files under `~/SystemSketch`, through the archive's own digest-fenced Python file host, browsed with the archive's own navigator dialog (ported to stock shadcn parts) — or, with the setting flipped, through the browser's native OS open/save dialogs. |

## 2. Criteria before options

Weighted for *this* situation — a working surface Zach wants to start using
today, in a repo whose one rule is that the trunk owns the design.

| Weight | Criterion | Why it is weighted that way |
|---|---|---|
| 30% | **Zero relearning.** The File menu, the navigator and the save semantics behave exactly like the app he has used for a year. | He said which rows he uses ("I use those a lot"), and every hour of relearning is an hour not spent on BAM. |
| 25% | **His files are never damaged.** No write without the revision fence; nothing the old app owns is overwritten; a board this build cannot read is never written back. | Both apps see `~/SystemSketch`. A lost board is unrecoverable; a missing feature is not. |
| 20% | **The next host inherits it** — the chrome lives in the trunk, configured by the app. | The 2026-09-19 feedback rule, and the measured cost of the last vendored copy diverging inside a day (`ARCHITECTURE.md:44-81`). |
| 15% | **Stock parts, not bespoke ones.** "as always please be using stock shadcn as much as possible". | Fewer lines we own; a consumer can `shadcn add` the same primitive. |
| 10% | **Buildable in parallel today** — disjoint write sets, acceptance committed first. | Seven lanes, one shared index, other sessions in the same tree. |

### The decisions those criteria settle

| Decision | Options | Call |
|---|---|---|
| Where the file bytes come from | (a) port the archive's Python store + routes; (b) write a fresh node host; (c) browser File System Access only | **(a)**. It already carries the atomic staged write, the digest fence, the cross-process lock and 34 of its own tests (*files never damaged*, *zero relearning*). (c) alone cannot list a folder, rename, reveal or trash — and Zach asked for the navigator as well. |
| Native vs app navigation | one of them / both | **Both, as a setting** — exactly what he asked. `app` is the default because the ported navigator is what he uses now. |
| What the native mode is | browser FSA pickers / a desktop chooser spawned by the host | **FSA pickers.** The archive already measured the other road and closed it: a GUI subprocess inside an HTTP handler made File ▸ Open depend on a second app, and when it wedged the request never returned (`/home/bam/systemsketch/tests/test_workspace_store.py:897-908`, a test that still runs here). |
| Where settings live | app-local component / trunk component fed by data | **Trunk, data-driven** (`SettingsView` + `categories`), so the app "just imports these stock menus and does a light bit of configuration". |
| Dialog or page | pick one / make it a setting | **A setting**, defaulting to `dialog` (the old app's shape). |
| What a plain launch opens | the most recent file (old app) / today's scratch board | **Today's scratch board** — the smallest change, and it does not orphan what is already in this browser's IndexedDB. Flagged for Zach below; one line to flip. |

## 3. The stock parts, element by element

Exact exported names. "Today" is what exists in this repo right now.

| Element | Today | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| Settings dialog / page shell | nothing (the old app's `SystemSketchSettingsDialog`, tldraw-coupled) | `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogClose` — stock shadcn `base-nova`, copied verbatim | Modal, focus-trapped, Escape closes; the SAME view renders centred or full-window (`data-presentation`) |
| A setting with two choices (file navigation, settings presentation) | nothing | `RadioGroup`, `RadioGroupItem` (stock `base-nova`) | One choice at a time, keyboard-navigable, each option keeps its own description; disabled options say why |
| A setting that is on/off | the old app's hand-rolled `role="switch"` button rows | `Switch` (stock `base-nova`) | `role="switch"` + `aria-checked` — the donor's own semantics, now stock |
| A setting from a list | nothing | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator` (stock `base-nova`) | Reserved for the first list-shaped setting; ships now so a lane never hand-rolls one |
| Field labels and descriptions | ad-hoc `<strong>/<small>` in the donor | `Label`, and `Field`, `FieldLabel`, `FieldDescription`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldSeparator` (stock `base-nova`) | Label/description/control association, so a screen reader reads a setting as one thing |
| Navigator text inputs (Filter, File name, New folder) | the donor's `SystemSketchUiInput` (wraps `TldrawUiInput`) | `Input` (stock `base-nova`) | Escape resets the draft without closing the dialog; Enter submits the navigator's action |
| Navigator file table | the donor's hand-styled `div` grid + `role="listbox"` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (stock `base-nova`) | Name ↑/↓ · Size · Modified headers, folders always first, second click reverses, Modified starts newest-first |
| Burger menu, its submenus, its separators, its checkbox rows | `DropdownMenu*` (trunk, existing) — but the burger renders no separators and no checkbox rows yet | `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent`, `DropdownMenuSeparator`, `DropdownMenuCheckboxItem`, `DropdownMenuShortcut` (trunk, existing exports) | One-press Escape; shortcut column as display data; a group boundary is a separator; a toggle row is a real `menuitemcheckbox` |
| The burger's CONTENT | `fileActionsFor()` in the app — three rows | **ours, new, in the trunk**: `buildAppMenu`, `FILE_MENU_ROWS`, `formatShortcut` (`components/appMenu.ts`) | The old app's File order and shortcut spellings; a row exists only if the host can honour it |
| Rename field | `InlineRename` (trunk, existing) | **unchanged part, changed behaviour**: `InlineRename` | Enter/Escape(+stopPropagation)/blur, the 400ms double-click guard, the unchanged-name cancel — all kept; the hint node and the layout shift go |
| File browser | the donor's `WorkspaceDialog` (2,232-line file, Radix, tldraw hooks) | **ours, ported** into `components/fileNavigator.tsx` over the stock parts above | Places/Recent rail, breadcrumb, ←, + Folder, Filter, sort, ↑/↓/Enter/Backspace, "Open in new window", the Replace prompt |
| Browser rows, sort, selection, breadcrumb, recents, untitled claims, autosave schedule | nothing | **ours, ported verbatim** from `/home/bam/systemsketch/src/workspace/workspaceModel.ts` into `files/workspaceModel.ts` (its own donor test suite ports with it) | Folders first; the MRU list; a claim reserves an Untitled name across windows; the 600 ms debounce with a 30 s ceiling |
| File host protocol client | nothing | **ours, ported** from `workspaceClient.ts` into `files/workspaceClient.ts` (`createHttpWorkspaceClient`) | Per-operation timeouts, `WorkspaceConflict` on 409, abort passthrough, "retry only transient failures" |
| File host | nothing | **ours, ported verbatim** from `scripts/workspace_store.py` + `server.py`'s `/api/workspace/*` into `scripts/systemsketch_files.py` (stdlib only) | Atomic staged+verified write, permission preservation, the digest fence, the cross-process `flock`, the idempotent replay, `gio trash` |
| Native open/save | nothing | **stock BROWSER API**: `window.showOpenFilePicker`, `window.showSaveFilePicker`, `FileSystemFileHandle.createWritable` — wrapped by `createNativeFileAccess` | Cancel = nothing chosen; the same SHA-256 fence as the host; a permission prompt before writing |
| Icons | `lucide-react` (trunk) | `lucide-react` named exports | Every `icon` prop stays a `ReactNode`; no string→asset registry |
| Bar, Toolbar, Breadcrumb, Button, Tooltip, ButtonGroup, Badge | trunk | **unchanged (stock seam)** | `ChromeBar`'s existing composition is untouched apart from the burger's renderer and the rename box |
| tldraw's Edit/View/Export/Preferences commands | `useActions()` exists, unused by our chrome | **unchanged (stock seam)**: `useActions`, `useCanUndo`, `useCanRedo`, `useTranslation`, `useDialogs`, `useToasts` | Every row runs tldraw's own action; no second implementation of undo, zoom, export or snap mode |
| tldraw's keyboard shortcuts dialog | stock, unreachable (`HelpMenu: null`) | **unchanged (stock seam)**: the `open-kbd-shortcuts` action | "Keyboard shortcuts" opens tldraw's own dialog |
| The dock's Stable server | `scripts/launch_systemsketch.py` | **unchanged (stock seam)** apart from mounting the file-host routes on the same origin | `--update` / `--open` / `--stop` behave exactly as now |

## 4. What is already committed (and red)

**Contracts as code** — every function throws `"<name>: not implemented (lane
<id>)"`; `pnpm typecheck` is green in both packages with them in place:

- trunk `src/components/appMenu.ts` · `appSettings.ts` · `settingsView.tsx` · `fileNavigator.tsx`; `chromeBar.tsx` gains two adds-only `MenuAction` fields (`checked`, `title`)
- trunk `src/files/workspaceClient.ts` (types + the four error classes are real) · `workspaceModel.ts` · `nativeFiles.ts` · `fakeWorkspaceClient.ts` (real, test support)
- app `src/files/launchConfig.ts` (real — the address-bar/file-host seam the tests drive) · `devFileHost.ts`
- `scripts/systemsketch_files.py` (constants and exceptions real, bodies owed)

**Acceptance, red by design, committed before any builder** (measured
2026-09-19 on this branch):

| Suite | Result now |
|---|---|
| trunk `pnpm exec vitest --project=unit` | **76 failed** in 6 new files, 1,214 passed (unchanged) |
| trunk `pnpm exec vitest --project=storybook` | **16 failed** in 4 new story files, 482 passed (unchanged) |
| app `pnpm test` | **25 failed** in 5 files (`files`, `settings`, `menus`, `legacy`, `devFileHost`), 128 passed (unchanged) |
| `python3 -m unittest discover -s scripts/tests -t scripts/tests` | **55 tests, all red** (34 ported store cases + 21 route/CLI/dock cases) |

The three failures worth quoting, because they are the ask measured:

```
the field vs the title it replaced: width 223.71875 vs 115.421875: expected 108.296875 to be less than or equal to 1
the field's root vs its input: height 48 vs 28: expected 20 to be less than or equal to 1   (the hint)
expected [ 'New board', 'Open .tldr…', …(2) ] to deeply equal [ 'File', 'Settings', 'Edit', …(5) ]
```

Two L4 acceptance cases asserted the opposite of what Zach now wants (an
undo/redo pill; the three-row burger) and were REPLACED in place, with the
amendment noted in each file's header — not deleted, and not weakened.

### Test safety rules these suites keep

- Every file-host test runs against a `mkdtemp` root. `src/testing/fileHost.globalSetup.ts` refuses to serve anything that is, contains or sits inside the real `~/SystemSketch`, and `--files-root` has no default in the CLI at all.
- Trash and Reveal go through an injected `Desktop`; the tests use `RecordingDesktop`, so nothing reaches the desktop Trash or opens a file manager.
- The window's address bar is a `memoryDocumentLocation`: a navigation is recorded, never performed — so no test can load the archived app on :4321 (which rewrites Zach's real boards on open).
- Ports: the host binds `0` (ephemeral); 4321/4322/4323/4325/4340/4341/5421 are never touched. A lane that runs Storybook sets `STORYBOOK_PORT` to a free port.

## 5. The lanes

```
stock-primitives ─┬─> files-kit ──────┐
                  └─> settings-kit ───┤
chrome-rename-burger ─────────────────┼─> app-wiring ─> dev-file-host
file-host ────────────────────────────┘
```

| Lane | Deps | What it makes green |
|---|---|---|
| `stock-primitives` | — | 8 verbatim shadcn `base-nova` copies + their stories; `stockPrimitives.test.ts` |
| `chrome-rename-burger` | — | `InlineRename` (no hint, no shift, `role="alert"` error), the burger's renderer (separators, checkbox rows), `buildAppMenu`/`formatShortcut`; `appMenu.test.ts`, `ChromeRename.stories.tsx`, `AppMenu.stories.tsx` |
| `files-kit` | stock-primitives | `workspaceModel.ts`, `workspaceClient.ts`, `nativeFiles.ts`, `fileNavigator.tsx`; three unit suites + `FileNavigator.stories.tsx` |
| `settings-kit` | stock-primitives | `appSettings.ts`, `settingsView.tsx`; `appSettings.test.ts`, `SettingsView.stories.tsx` |
| `file-host` | — | `scripts/systemsketch_files.py` + the launcher mount; both Python suites |
| `app-wiring` | the four above | the app's chrome: no pill, the built-out burger from tldraw's own actions, Settings mounted, the document session (open/save/save-as/new/new window/recents/rename/copy path/reveal/trash, autosave, conflicts) in both modes; `menus`/`legacy`/`settings`/`files` smoke suites |
| `dev-file-host` | file-host, app-wiring | `devFileHost.ts` + one line in `vite.config.ts` so `pnpm --filter systemsketch dev` reaches the same host the dock does; `devFileHost.test.ts` |

## 6. Deliberately not done (and why)

- **The external-change watcher** (the donor's 1.5 s `stat` poll, `nextSyncAction`, `canApplyExternalReload`). The digest fence already refuses to clobber; without the poll a conflict surfaces on the next save instead of the moment the other app writes. Cheap to add later — the donor's pure functions are still there to port.
- **"Allow opening files anywhere"** (the old Settings ▸ General switch). The fence is the files root (`$HOME`), which already covers every worktree under it.
- **`.systemsketch` reading/writing.** This app writes plain `.tldr`; a `.systemsketch` row in the navigator hands off to the archived app, which owns that envelope.
- **Insert embed / Upload media / Language.** tldraw ships the actions, but this app's `.tldr` round-trip does not carry assets (`fileActions.ts` deliberately does not port `extractAssets`), and a menu row that loses your image on reopen is worse than no row.
- **Colour scheme in Settings.** `<Tldraw colorScheme="system">` is set in `App.tsx` (another lane's file) and it is not established whether it pins the user preference; an unverified setting is worse than none.
- **Native mode's Open recent / Copy path / Show in Files / Move to Trash / Rename.** The File System Access API hands back opaque handles: no path, no listing, no trash. Those rows are absent in native mode rather than present and broken.

## 7. What needs Zach (each with the default taken on silence)

1. **Should a plain dock launch open your most recent file, like the old app, instead of the scratch board?** Recommendation: yes, eventually — it is what "every board is a file" means. Default taken now: no; a plain launch keeps today's scratch board, and File ▸ Open recent is one click away.
2. **Autosave, or only Ctrl+S?** Recommendation: autosave, as the old app did (600 ms debounce, 30 s ceiling, digest-fenced). Default taken: autosave on for a file-backed board; the scratch board keeps its browser persistence.
3. **Is sharing the archived app's lock folder right?** (`~/.local/share/systemsketch/runtime/locks/workspace`, so a save from either app excludes the other on the same file.) Recommendation: yes. Default taken: share it when it exists, else the new app's own state folder.
4. **`Ctrl+N` / `Ctrl+⇧+N` may be reserved by Chrome** even in `--app` mode; the rows and their hints match the old app either way, and the menu rows always work. Default taken: show the shortcuts, bind them, and report if Chrome eats them. NOT VERIFIED — no way to measure it headless.
