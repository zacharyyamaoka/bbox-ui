# `src/chrome/` — one folder per editor component

Each folder here is ONE editor component, named for **what the thing is** —
never for where it sits on screen. `ARCHITECTURE.md` (repo root) is the
normative record; the names come from Zach's `MOC - bbox-ui Components`
(Chrome section).

## Since B-SHELL-P1: the windows are the shell's, this folder is the host

The chrome's WINDOWS were lifted out of this folder into the engine-free shell,
`apps/storybook-basics/src/shell/` (`@trunk/shell/*`; design note
`HOST-PORT.md` there), so the no-host runner (`apps/bbox-no-host`) and the
React Flow host mount the same ones. Each talks to tldraw only through
`HostPort`, which `tldrawHostPort.ts` here implements.

| Window (in `@trunk/shell/`) | Its host half here | What the host half supplies |
|---|---|---|
| `shellChromeBar.tsx` | `TitleBar/chromeBar.tsx` | the file session, Settings, Compare, site/legacy rows, tldraw's Edit/View/Export/Preferences rows |
| `shellToolDock.tsx` | `Toolbar/dock.tsx` | the catalogue and families, `selectDockTool` (the port's `setTool`), the A-key cycle, the `Toolbar` slot seat |
| `shellStatusStrip.tsx` | `statusStrip.tsx` | grid, dev, help, the zoom menu |
| `shellPanelRail.tsx` | `panels.tsx` | the frames (`frames.ts`), the problems (`problems.ts`), the Inspector, the rail's top |
| `shellSelectionPill.tsx` | `ContextualPopupMenu/floatingToolbar.tsx` | the content clusters, the overlay inset, the dock obstacle, interface scale |

`overlay.tsx` is the slot adapter: it mounts `BboxShell` in tldraw's
`InFrontOfTheCanvas`, over tldraw's own canvas, and seats the windows. The
dock is the one window seated elsewhere — tldraw's `Toolbar` slot, inside a
`HostPortScope` — because that is where its box is measured.

| Folder | What it is | Files |
|---|---|---|
| `ContextualPopupMenu/` | the selection pill's content | `floatingToolbar.tsx`, `selectionClusters.tsx`, `arrangeActions.ts`, `selectionActions.ts` |
| `CompareView/` | the Compare view (reads the port's scene) | `compareView.tsx` |
| `DevMenu/` | dev panel, quick switcher, recorder, variant pill | `devtools.tsx`, `variantSwitch.tsx` |
| `FocusLens/` | the propagation focus lens (reads the port's scene) | `focusLens.tsx`, `focusVisibility.ts` |
| `ShareMenu/` | app settings and the preferences behind them | `appSettings.tsx`, `interfaceScaleHost.tsx`, `preferences.ts` |
| `FileMenu/` | the File group, board actions, tldraw's stock menus | `stockMenus.ts`, `fileActions.ts` |
| `TitleBar/` | the top bar's host half: file session, settings | `chromeBar.tsx` |
| `Toolbar/` | the tool dock's host half | `dock.tsx` |
| `ZoomMenu/` | the zoom read-out's dropdown | `zoomMenu.tsx` |

**The folder is the unit.** Outside a folder, import the folder
(`./chrome/FileMenu`) and let its `index.ts` say what is public; inside it,
import files by name. That is what keeps a later rename or a split of the
internals invisible to everyone else.

## What is deliberately NOT a component folder

These sit flat at the root of `chrome/`, each for a stated reason. None of
them is "not done yet" — moving one under a component folder would state
something untrue about the code.

- **`tldrawHostPort.ts`** — the `HostPort` over tldraw: every window's only
  way into the engine. Not a component; the adapter all of them share.
- **`portScene.ts`** — the port's cached scene as a hook, for the host readers
  (`problems.ts`, the focus lens, Compare). Its own module so the node `unit`
  project can load `problems.ts` without loading tldraw.
- **`overlay.tsx`** — the slot adapter and screen-space placement machinery
  (`placeCornerCluster`, the one `InFrontOfTheCanvas` slot), not a component.
  `ARCHITECTURE.md` reserves interaction geometry for the host.
- **`panels.tsx`**, **`problems.ts`**, **`statusStrip.tsx`**, **`frames.ts`** —
  the panel cluster's host half. `frames.ts` is the Frames surface's model,
  `problems.ts` the Problems surface's; `panels.tsx` hands both to the shell's
  rail.
- **`families.tsx`** — the tool-family rows, read by `Toolbar/`, `DevMenu/`
  and `ShareMenu/` alike. Shared by three components, owned by none.
- **`legacyApp.ts`**, **`sites.ts`**, **`siteStatus.ts`** — doors out of the
  app: burger rows the host supplies to the shell's bar. Not components, and
  owned by a peer lane (EXT-SWITCHER).
