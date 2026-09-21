# `src/chrome/` — one folder per editor component

Each folder here is ONE editor component, named for **what the thing is** —
never for where it sits on screen. `ARCHITECTURE.md` (repo root) is the
normative record; the names come from Zach's `MOC - bbox-ui Components`
(Chrome section).

| Folder | What it is | Files |
|---|---|---|
| `ContextualPopupMenu/` | the selection pill that follows a selection | `floatingToolbar.tsx`, `selectionClusters.tsx`, `arrangeActions.ts`, `selectionActions.ts` |
| `DevMenu/` | dev panel, quick switcher, recorder, variant pill | `devtools.tsx`, `variantSwitch.tsx` |
| `ShareMenu/` | app settings and the preferences behind them | `appSettings.tsx`, `interfaceScaleHost.tsx`, `preferences.ts` |
| `FileMenu/` | the File group, board actions, tldraw's stock menus | `stockMenus.ts`, `fileActions.ts` |
| `TitleBar/` | the top bar: app menu, file navigator, board title | `chromeBar.tsx` |
| `Toolbar/` | the tool dock | `dock.tsx` |
| `ZoomMenu/` | the zoom read-out and its dropdown | `zoomMenu.tsx` |

**The folder is the unit.** Outside a folder, import the folder
(`./chrome/FileMenu`) and let its `index.ts` say what is public; inside it,
import files by name. That is what keeps a later rename or a split of the
internals invisible to everyone else.

## What is deliberately NOT a component folder

These sit flat at the root of `chrome/`, each for a stated reason. None of
them is "not done yet" — moving one under a component folder would state
something untrue about the code.

- **`overlay.tsx`** — screen-space placement machinery (`placeCornerCluster`,
  the one `InFrontOfTheCanvas` slot), not a component. `ARCHITECTURE.md`
  reserves interaction geometry for the host.
- **`panels.tsx`**, **`problems.ts`**, **`statusStrip.tsx`**, **`frames.ts`** —
  the panel cluster. `panels.tsx` is a panel HOST rather than a panel, and
  `problems.ts` + `statusStrip.tsx` look like a chrome component the MOC does
  not list yet. `frames.ts` is the Frames PANEL's model — `panels.tsx` is its
  only consumer and `TitleBar/chromeBar.tsx` never mentions it — so it stays
  beside the panel it feeds. Name that component in the MOC and this whole
  cluster becomes one folder.
- **`families.tsx`** — the tool-family rows, read by `Toolbar/`, `DevMenu/`
  and `ShareMenu/` alike. Shared by three components, owned by none.
- **`legacyApp.ts`** — the one door back to the archived SystemSketch, a menu
  row consumed by both `TitleBar/` and `files/session.tsx`. Not a component,
  and not owned by one.
