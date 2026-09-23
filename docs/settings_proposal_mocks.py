#!/usr/bin/env python3
"""The five Settings-panel proposal mocks — real HTML/CSS/JS, one module.

SPIKE / PROPOSAL ONLY. Nothing here is imported by the app; it exists so the
2026-09-22 proposal report can ship five mocks Zach can actually CLICK, and so
the same markup can be screenshotted at 1280x800 and 1366x720 in both themes.
The shipping panel (`apps/storybook-basics/src/editor/settingsView.tsx`) is
untouched by this round.

Every colour is the app's OWN token, copied literally out of
`apps/storybook-basics/src/globals.css` (stock shadcn new-york / neutral), so a
mock cannot flatter itself with a palette the app does not have.

The CONTENT is the real settings, read out of
`apps/storybook-basics/src/editor/settingsCategories.tsx` — the same titles,
descriptions, groups and control kinds. A mock showing invented settings would
prove nothing about whether the layout survives the real ones (Connections is
nine switches with two-line descriptions; that is the stress case).
"""
from __future__ import annotations

import json

# ── tokens ─────────────────────────────────────────────────────────────────
# Verbatim from apps/storybook-basics/src/globals.css `:root` and its
# `@media (prefers-color-scheme: dark)` override.
LIGHT = {
    "background": "oklch(1 0 0)", "foreground": "oklch(0.145 0 0)",
    "card": "oklch(1 0 0)", "card-foreground": "oklch(0.145 0 0)",
    "popover": "oklch(1 0 0)", "popover-foreground": "oklch(0.145 0 0)",
    "primary": "oklch(0.205 0 0)", "primary-foreground": "oklch(0.985 0 0)",
    "secondary": "oklch(0.97 0 0)", "secondary-foreground": "oklch(0.205 0 0)",
    "muted": "oklch(0.97 0 0)", "muted-foreground": "oklch(0.556 0 0)",
    "accent": "oklch(0.97 0 0)", "accent-foreground": "oklch(0.205 0 0)",
    "border": "oklch(0.922 0 0)", "input": "oklch(0.922 0 0)", "ring": "oklch(0.708 0 0)",
}
DARK = {
    "background": "oklch(0.145 0 0)", "foreground": "oklch(0.985 0 0)",
    "card": "oklch(0.205 0 0)", "card-foreground": "oklch(0.985 0 0)",
    "popover": "oklch(0.205 0 0)", "popover-foreground": "oklch(0.985 0 0)",
    "primary": "oklch(0.922 0 0)", "primary-foreground": "oklch(0.205 0 0)",
    "secondary": "oklch(0.269 0 0)", "secondary-foreground": "oklch(0.985 0 0)",
    "muted": "oklch(0.269 0 0)", "muted-foreground": "oklch(0.708 0 0)",
    "accent": "oklch(0.269 0 0)", "accent-foreground": "oklch(0.985 0 0)",
    "border": "oklch(1 0 0 / 10%)", "input": "oklch(1 0 0 / 15%)", "ring": "oklch(0.556 0 0)",
}


def _vars(d: dict) -> str:
    return "".join(f"--{k}:{v};" for k, v in d.items())


# ── lucide icon paths (stroke, 24x24) ──────────────────────────────────────
# The exact lucide-react icons a category would import. `SettingsCategory`
# ALREADY takes `icon?: ReactNode` (settingsView.tsx:183) and
# SettingsViewStockParts.stories.tsx already passes <SlidersHorizontal/>,
# <Palette/>, <Info/> — the shipping categories simply never pass one.
ICONS = {
    "SlidersHorizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    "Palette": '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    "MousePointer2": '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
    "Cable": '<path d="M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1"/><path d="M19 15V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V9"/><path d="M21 21v-2h-4"/><path d="M3 5h4V3"/><path d="M7 5a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1V3"/>',
    "Keyboard": '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
    "Info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "Search": '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    "X": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "ChevronDown": '<path d="m6 9 6 6 6-6"/>',
}


def icon(name: str, size: int = 16) -> str:
    return (
        f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
        f'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true">{ICONS[name]}</svg>'
    )


# ── the REAL settings, read out of settingsCategories.tsx ──────────────────
# Titles, descriptions, groups and control kinds are the shipping ones. The
# "Mouse and scrolling" branch shown is `directWheelZoom === false`, which is
# the branch in Zach's own screenshot (8 sections).
CATEGORIES = [
    {
        "id": "general", "label": "General", "icon": "SlidersHorizontal", "navGroup": "Options",
        "sections": [
            {"id": "file-navigation", "title": "File navigation",
             "desc": "Which dialog Open… and Save As… use.", "kind": "radio",
             "options": [["app", "SystemSketch file browser", "Places, Recent, folders and a filter — over the boards in your workspace."],
                         ["native", "System file dialog", "Your browser's own Open and Save dialogs. No recent list, no rename, no Show in Files."]],
             "value": "app"},
            {"id": "settings-presentation", "title": "Settings presentation",
             "desc": "Where this window opens.", "kind": "radio",
             "options": [["dialog", "Dialog", "A centred panel over the board."],
                         ["page", "Page", "The whole window, like a preferences screen."]],
             "value": "dialog"},
            {"id": "allow-any-path", "title": "Allow opening files anywhere",
             "desc": "Lets a board link, Save As, or Rename reach any path on this computer — not just your workspace folder. On by default, since boards routinely come from an agent worktree or another drive.",
             "kind": "switch", "value": True},
        ],
    },
    {
        "id": "appearance", "label": "Appearance", "icon": "Palette", "navGroup": "Options",
        "sections": [
            {"id": "interface-scale", "title": "Interface scale",
             "desc": "Make menus, panels and the toolbar easier to see on high-resolution displays. This changes the app interface only — canvas zoom and board files stay unchanged.",
             "kind": "slider", "value": 100, "min": 80, "max": 160, "step": 5, "suffix": "%",
             "minLabel": "A", "maxLabel": "A", "presets": [80, 100, 125, 150], "resetTo": 100,
             "resetLabel": "Reset to 100%", "commit": "exit"},
            {"id": "zoom-buttons", "title": "Show zoom −/+ buttons",
             "desc": "The zoom percentage stays available when these step buttons are hidden.",
             "kind": "switch", "value": True},
            {"id": "appearance-storage", "title": "Saved on this computer", "kind": "note",
             "desc": "Appearance is a per-viewer preference, never board content — everyone who opens a board keeps their own."},
        ],
    },
    {
        "id": "pointer", "label": "Mouse and scrolling", "icon": "MousePointer2", "navGroup": "Options",
        "sections": [
            {"id": "paste-under-cursor", "title": "Copy/paste under cursor", "group": "Pointer",
             "groupDesc": "Where a paste or duplicate lands.",
             "desc": "On: paste and duplicate land at the pointer. Off: they land at the viewport centre.",
             "kind": "switch", "value": False},
            {"id": "direct-wheel-zoom", "title": "What the scroll wheel does", "group": "Wheel behaviour",
             "groupDesc": "Pick the convention you already have muscle memory for. Everything below follows it.",
             "kind": "radio", "value": "pan",
             "options": [["pan", "Scroll pans, Ctrl/Cmd + scroll zooms", "The stock whiteboard contract — Excalidraw, tldraw, Miro."],
                         ["zoom", "Scroll zooms directly", "Figma-ish, and every CAD tool. Ctrl/Cmd + scroll then pans."]]},
            {"id": "wheel-binding-wheelDown", "title": "Scroll wheel down", "group": "Wheel gestures",
             "groupDesc": "What each wheel gesture does. Leaving a row on its stock command lets the canvas handle it natively.",
             "kind": "select", "value": "Pan down",
             "options": [["Pan down", "Pan down", ""], ["Pan up", "Pan up", ""], ["Zoom in", "Zoom in", ""], ["Zoom out", "Zoom out", ""], ["Nothing", "Nothing", ""]]},
            {"id": "wheel-binding-wheelUp", "title": "Scroll wheel up", "group": "Wheel gestures",
             "kind": "select", "value": "Pan up",
             "options": [["Pan down", "Pan down", ""], ["Pan up", "Pan up", ""], ["Zoom in", "Zoom in", ""], ["Zoom out", "Zoom out", ""], ["Nothing", "Nothing", ""]]},
            {"id": "wheel-binding-ctrlWheelDown", "title": "Ctrl + scroll wheel down", "group": "Wheel gestures",
             "kind": "select", "value": "Zoom out",
             "options": [["Pan down", "Pan down", ""], ["Pan up", "Pan up", ""], ["Zoom in", "Zoom in", ""], ["Zoom out", "Zoom out", ""], ["Nothing", "Nothing", ""]]},
            {"id": "wheel-binding-ctrlWheelUp", "title": "Ctrl + scroll wheel up", "group": "Wheel gestures",
             "kind": "select", "value": "Zoom in",
             "options": [["Pan down", "Pan down", ""], ["Pan up", "Pan up", ""], ["Zoom in", "Zoom in", ""], ["Zoom out", "Zoom out", ""], ["Nothing", "Nothing", ""]]},
            {"id": "pan-speed", "title": "Scroll speed", "group": "Sensitivity",
             "groupDesc": "How far one wheel notch moves the board. 100% matches the standard feel.",
             "kind": "slider", "value": 100, "min": 25, "max": 400, "step": 5, "suffix": "%",
             "exactEntry": True, "resetTo": 100, "resetLabel": "Reset to 100%"},
            {"id": "zoom-speed", "title": "Zoom speed", "group": "Sensitivity",
             "kind": "slider", "value": 100, "min": 25, "max": 400, "step": 5, "suffix": "%",
             "exactEntry": True, "resetTo": 100, "resetLabel": "Reset to 100%"},
        ],
    },
    {
        "id": "connections", "label": "Connections", "icon": "Cable", "navGroup": "Options",
        "sections": [
            {"id": "edge-policy-preset", "title": "Validation level",
             "desc": "How much the board checks your work — what it will let you wire, and how much it marks up at rest. Slide it all the way down for a plain whiteboard, or all the way up so only edges that could exist in the running program are drawable at all.",
             "kind": "presets", "value": "Structural",
             "options": [["Whiteboard", "Whiteboard", ""], ["Loose", "Loose", ""], ["Structural", "Structural", ""], ["Strict", "Strict", ""]],
             "count": "5/8"},
            {"id": "allowSamePolarity", "title": "Wire two outputs, or two inputs", "group": "Direction",
             "groupDesc": "Which way data is allowed to run, and whether it may come back around.",
             "desc": "Off, a cable must join something that emits to something that receives — the arrowhead follows from the ports, not from which way you dragged. Currently refused: output → output.",
             "kind": "switch", "value": False},
            {"id": "allowCycles", "title": "Close a feedback loop", "group": "Direction",
             "desc": "Off, a cable may not land on anything already upstream of where it started. Use a Loop region for deliberate feedback. Currently refused: A → B → A.",
             "kind": "switch", "value": False},
            {"id": "allowSelfConnection", "title": "Wire a Block to itself", "group": "Direction",
             "desc": "A cable that leaves a Block's outlet and turns straight back into its own inlet. Currently refused: A → A.",
             "kind": "switch", "value": False},
            {"id": "allowCrossBoundary", "title": "Wire straight through a Block's wall", "group": "Boundaries",
             "groupDesc": "Whether a Block is a black box — reachable only through the ports it shows you.",
             "desc": "Off, a Block inside a box can only reach the outside through that box's own ports, so the picture on screen is the whole contract. Currently allowed.",
             "kind": "switch", "value": True},
            {"id": "allowHiddenPorts", "title": "Wire a hidden port", "group": "Boundaries",
             "desc": "A port hidden in the current view keeps its identity and its anchor, but is normally not a landing target. Currently refused: a port you cannot see.",
             "kind": "switch", "value": False},
            {"id": "allowFanIn", "title": "Several cables into one input", "group": "How many cables meet at one port",
             "groupDesc": "One value read by two consumers is ordinary. Two producers writing one input is a question the picture cannot answer.",
             "desc": "Off, an input takes a single producer. Branch and Loop regions still choose between arms — that is not fan-in. Currently refused: A → C, B → C.",
             "kind": "switch", "value": False},
            {"id": "allowFanOut", "title": "Several cables out of one output", "group": "How many cables meet at one port",
             "desc": "Off, an output feeds exactly one consumer, which forces an explicit copy or tee wherever a value is used twice. Currently allowed.",
             "kind": "switch", "value": True},
            {"id": "allowDuplicates", "title": "A second copy of the same cable", "group": "How many cables meet at one port",
             "desc": "Two cables joining the exact same pair of ports. There is nothing on screen that tells them apart. Currently refused: A.out → B.in, twice.",
             "kind": "switch", "value": False},
            {"id": "type-matching", "title": "Data types", "group": "Data types",
             "desc": "Ports carry free text today — Pose, bytes, or nothing. Case and surrounding space are ignored, and any, object and * meet anything.",
             "kind": "radio", "value": "lenient",
             "options": [["off", "Off", "Types are documentation. Any port may meet any other."],
                         ["lenient", "Lenient", "Declared types must agree. A port with no type is a wildcard."],
                         ["strict", "Strict", "Both ends must declare a type, and the two must agree."]]},
            {"id": "connections-storage", "title": "Saved on this computer", "kind": "note",
             "desc": "This governs what you can draw from now on. Cables already on a board are never re-judged, so tightening the policy cannot break a board someone else authored."},
        ],
    },
    {
        "id": "hotkeys", "label": "Hotkeys and aliases", "icon": "Keyboard", "navGroup": "Options",
        "sections": [
            {"id": "hotkeys", "title": "Keyboard shortcuts", "group": "Hotkeys",
             "desc": "The keys this app binds. They are fixed — rebinding is not available yet.",
             "kind": "hotkeys",
             "rows": [["Open…", "⌘O"], ["Save", "⌘S"], ["Save As…", "⇧⌘S"],
                      ["Undo", "⌘Z"], ["Redo", "⇧⌘Z"], ["Select tool", "V"], ["Settings", "⌘,"]]},
            {"id": "tool-aliases", "title": "Tool aliases", "group": "Aliases",
             "desc": "Give any searchable tool the names you use. An alias like @datatype opens Text without changing the tool's canonical name.",
             "kind": "aliases",
             "rows": [["Text", "@datatype"], ["Block", "@node, @box"], ["Trace", "@wire"]]},
            {"id": "aliases-storage", "title": "Saved on this computer", "kind": "note",
             "desc": "Aliases are personal vocabulary, not board content — they enrich search for you only."},
        ],
    },
    {
        "id": "about", "label": "About", "icon": "Info", "navGroup": "App",
        "sections": [
            {"id": "version", "title": "SystemSketch", "kind": "note",
             "desc": "bbox-ui components on stock tldraw. Host-supplied category — the shell renders whatever block the app passes."},
        ],
    },
]

DATA_JSON = json.dumps(CATEGORIES, ensure_ascii=False)
ICONS_JSON = json.dumps({k: v for k, v in ICONS.items()}, ensure_ascii=False)


# ── mock CSS ───────────────────────────────────────────────────────────────
MOCK_CSS = """
.mk, .mk *, .mk *::before, .mk *::after { box-sizing: border-box; }
.mk {
  """ + _vars(DARK) + """
  --radius: 0.625rem;
  font: 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
}
.mk[data-theme="light"] { """ + _vars(LIGHT) + """ }

/* the "board" the dialog sits over, so the modal reads as a modal */
.mk-stage {
  position: relative; overflow: hidden; border-radius: 12px;
  background:
    radial-gradient(circle at 18% 22%, color-mix(in oklab, var(--foreground) 6%, transparent) 0 1.4px, transparent 1.5px) 0 0/26px 26px,
    var(--background);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.mk-stage::before {
  content: ""; position: absolute; inset: 0; background: rgba(0,0,0,.55);
}
.mk[data-theme="light"] .mk-stage::before { background: rgba(0,0,0,.32); }

/* ── the dialog popup ───────────────────────────────────────────────── */
.mk-popup {
  position: relative; display: flex; flex-direction: column;
  background: var(--popover); color: var(--popover-foreground);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent),
              0 24px 60px -12px rgba(0,0,0,.55);
  border-radius: 12px; overflow: hidden; min-height: 0;
}
.mk-head {
  display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.mk-head h4 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.mk-head .sp { flex: 1; }
.mk-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 8px; border: 0; cursor: pointer;
  background: transparent; color: var(--muted-foreground);
}
.mk-x:hover { background: var(--accent); color: var(--accent-foreground); }
.mk-body { display: flex; flex: 1 1 auto; min-height: 0; }

/* ── nav ────────────────────────────────────────────────────────────── */
.mk-nav {
  flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--border); background: var(--background);
}
.mk-navscroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px; }
.mk-navgroup {
  font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  color: var(--muted-foreground); padding: 10px 8px 4px;
}
.mk-navgroup:first-child { padding-top: 2px; }
.mk-navbtn {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  padding: 7px 8px; border-radius: 8px; border: 0; background: transparent; cursor: pointer;
  color: var(--muted-foreground); font: inherit; font-size: 13.5px; line-height: 1.35;
  transition: background .1s, color .1s;
}
.mk-navbtn .ic { flex: 0 0 auto; opacity: .95; }
.mk-navbtn:hover { background: var(--accent); color: var(--accent-foreground); }
.mk-navbtn[aria-current="page"] {
  background: var(--secondary); color: var(--secondary-foreground); font-weight: 500;
}
.mk-navtext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── the search box (P2, P4, P5) ────────────────────────────────────── */
.mk-searchwrap { flex: 0 0 auto; padding: 10px 10px 6px; }
.mk-search {
  display: flex; align-items: center; gap: 7px; width: 100%;
  border: 1px solid var(--input); border-radius: 8px; padding: 0 9px; height: 32px;
  background: color-mix(in oklab, var(--foreground) 4%, transparent);
}
.mk-search .ic { color: var(--muted-foreground); flex: 0 0 auto; }
.mk-search input {
  border: 0; outline: 0; background: transparent; color: var(--foreground);
  font: inherit; font-size: 13px; width: 100%; min-width: 0; padding: 0;
}
.mk-search input::placeholder { color: var(--muted-foreground); }
.mk-search:focus-within { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 40%, transparent); }

/* ── content pane ───────────────────────────────────────────────────── */
.mk-pane {
  flex: 1 1 auto; min-width: 0; min-height: 0;
  overflow-y: auto; overflow-x: hidden;   /* <- the x-clamp: complaint #1 */
  padding: 18px 20px 28px;
  scroll-behavior: smooth;
}
/* Obsidian's scrollbar: thin, quiet, no arrows, no layout gutter. */
.mk-pane, .mk-navscroll { scrollbar-width: thin; scrollbar-color: color-mix(in oklab, var(--foreground) 22%, transparent) transparent; }
.mk-pane::-webkit-scrollbar, .mk-navscroll::-webkit-scrollbar { width: 10px; height: 0; }
.mk-pane::-webkit-scrollbar-track, .mk-navscroll::-webkit-scrollbar-track { background: transparent; }
.mk-pane::-webkit-scrollbar-thumb, .mk-navscroll::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--foreground) 18%, transparent);
  border-radius: 999px; border: 3px solid transparent; background-clip: content-box;
}
.mk-pane:hover::-webkit-scrollbar-thumb, .mk-navscroll:hover::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--foreground) 32%, transparent); background-clip: content-box;
}
.mk-measure { max-width: 780px; }

/* ── group heading ──────────────────────────────────────────────────── */
.mk-grp { margin: 26px 0 10px; }
.mk-grp:first-child { margin-top: 0; }
.mk-grp h5 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
.mk-grp p { margin: 3px 0 0; font-size: 13px; color: var(--muted-foreground); }

/* ── THE ROW — Field orientation="horizontal" + FieldContent ─────────── */
.mk-row {
  display: flex; flex-direction: row; align-items: flex-start; gap: 16px;
  padding: 13px 0;
}
.mk-row + .mk-row { border-top: 1px solid var(--border); }
.mk-rowmain { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mk-rowtitle { font-size: 13.5px; font-weight: 500; }
.mk-rowdesc { font-size: 12.5px; line-height: 1.5; color: var(--muted-foreground); margin: 0; }
.mk-rowctl { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding-top: 1px; }

/* card-stack variant (P3) */
.mk-card {
  border: 1px solid var(--border); border-radius: 12px; background: var(--card);
  padding: 2px 14px; margin: 0;
}
.mk-card .mk-row:first-child { padding-top: 12px; }
.mk-card .mk-row:last-child { padding-bottom: 12px; }

/* a full-width row: radios and wide controls stack UNDER the name */
.mk-row.wide { flex-direction: column; gap: 10px; }
.mk-row.wide .mk-rowctl { width: 100%; padding-top: 0; }

/* ── controls ───────────────────────────────────────────────────────── */
.mk-sw {
  position: relative; width: 34px; height: 20px; border-radius: 999px; border: 0;
  background: var(--input); cursor: pointer; padding: 0; transition: background .13s;
  flex: 0 0 auto;
}
.mk-sw::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 999px; background: var(--background); transition: transform .13s;
  box-shadow: 0 1px 2px rgba(0,0,0,.3);
}
.mk[data-theme="light"] .mk-sw::after { background: #fff; }
.mk-sw[aria-checked="true"] { background: var(--primary); }
.mk-sw[aria-checked="true"]::after { transform: translateX(14px); }
.mk-sw:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

.mk-sel {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 9px;
  border: 1px solid var(--input); border-radius: 8px; background: var(--background);
  color: var(--foreground); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.mk-sel:hover { background: var(--accent); }
.mk-sel .ic { color: var(--muted-foreground); }
.mk-sel:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

.mk-radios { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.mk-radio {
  display: flex; align-items: flex-start; gap: 12px; width: 100%; text-align: left;
  border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
  background: transparent; cursor: pointer; color: inherit; font: inherit;
}
.mk-radio:hover { background: color-mix(in oklab, var(--foreground) 4%, transparent); }
.mk-radio[aria-checked="true"] {
  border-color: color-mix(in oklab, var(--primary) 45%, var(--border));
  background: color-mix(in oklab, var(--primary) 7%, transparent);
}
/* block, not inline: as spans the label and the description butt together
   with no space ("…scroll zoomsThe stock whiteboard contract…") and the
   description's margin-top silently does nothing. */
.mk-radio .t { display: block; font-size: 13.5px; font-weight: 500; }
.mk-radio .d { display: block; font-size: 12.5px; color: var(--muted-foreground); margin-top: 3px; line-height: 1.45; }
.mk-radio .rc { display: block; flex: 1 1 auto; min-width: 0; }
.mk-dot {
  flex: 0 0 auto; width: 16px; height: 16px; border-radius: 999px; margin-top: 2px;
  border: 1px solid color-mix(in oklab, var(--foreground) 35%, transparent);
  display: grid; place-items: center;
}
.mk-radio[aria-checked="true"] .mk-dot { border-color: var(--primary); background: var(--primary); }
.mk-radio[aria-checked="true"] .mk-dot::after {
  content: ""; width: 6px; height: 6px; border-radius: 999px; background: var(--primary-foreground);
}

.mk-sliderwrap { display: flex; flex-direction: column; gap: 9px; width: 100%; }
.mk-sliderrow { display: flex; align-items: center; gap: 11px; }
.mk-track {
  position: relative; flex: 1 1 auto; min-width: 60px; height: 4px; border-radius: 999px;
  background: var(--input); cursor: pointer;
}
.mk-fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: var(--primary); }
.mk-thumb {
  position: absolute; top: 50%; width: 15px; height: 15px; border-radius: 999px;
  background: var(--background); border: 2px solid var(--primary); transform: translate(-50%, -50%);
  box-shadow: 0 1px 3px rgba(0,0,0,.3);
}
.mk[data-theme="light"] .mk-thumb { background: #fff; }
.mk-out { flex: 0 0 auto; min-width: 46px; text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; }
.mk-num {
  flex: 0 0 auto; width: 62px; height: 30px; text-align: center; font: inherit; font-size: 13px;
  font-variant-numeric: tabular-nums; border: 1px solid var(--input); border-radius: 8px;
  background: var(--background); color: var(--foreground);
}
.mk-cap { flex: 0 0 auto; font-size: 11px; color: var(--muted-foreground); }
.mk-cap.big { font-size: 15px; }
.mk-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.mk-chip {
  height: 26px; padding: 0 9px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--muted-foreground); cursor: pointer;
  font: inherit; font-size: 12.5px; font-variant-numeric: tabular-nums;
}
.mk-chip:hover { background: var(--accent); color: var(--accent-foreground); }
.mk-chip[aria-pressed="true"] { background: var(--secondary); color: var(--secondary-foreground); font-weight: 500; }
.mk-btn {
  height: 27px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; color: var(--foreground); cursor: pointer; font: inherit; font-size: 12.5px;
}
.mk-btn:hover:not(:disabled) { background: var(--accent); }
.mk-btn:disabled { opacity: .45; cursor: default; }

.mk-note { font-size: 12.5px; color: var(--muted-foreground); line-height: 1.5; margin: 0; }
.mk-kv { display: flex; flex-direction: column; gap: 5px; width: 100%; }
.mk-kvrow { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; font-size: 13px; }
.mk-kvrow dd, .mk-kvrow dt { margin: 0; min-width: 0; }
.mk-kvrow dd {
  flex: 0 0 auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; color: var(--muted-foreground);
  background: color-mix(in oklab, var(--foreground) 7%, transparent);
  border-radius: 5px; padding: 2px 6px;
}
.mk-alias { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.mk-alias .n { width: 70px; flex: 0 0 auto; }
.mk-alias .v {
  flex: 1 1 auto; min-width: 0; height: 30px; border: 1px solid var(--input); border-radius: 8px;
  background: var(--background); color: var(--foreground); font: inherit; font-size: 12.5px; padding: 0 9px;
}
.mk-presetrow { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; width: 100%; }
.mk-presetrow .count { margin-left: auto; font-size: 12.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }

/* ── P5 scroll-spy: category headers inside one pane ─────────────────── */
.mk-cathead {
  display: flex; align-items: center; gap: 9px; margin: 34px 0 4px;
  padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.mk-cathead:first-child { margin-top: 0; }
.mk-cathead h5 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.015em; }
.mk-cathead .ic { color: var(--muted-foreground); }

/* ── P4 rail (icon-collapsed nav) ────────────────────────────────────── */
.mk-nav.rail .mk-navtext, .mk-nav.rail .mk-navgroup, .mk-nav.rail .mk-searchwrap { display: none; }
.mk-nav.rail { width: 52px !important; }
.mk-nav.rail .mk-navbtn { justify-content: center; padding: 8px 0; }
.mk-railtoggle {
  flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px;
  border-top: 1px solid var(--border);
}
.mk-railtoggle button {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px;
  border: 0; background: transparent; color: var(--muted-foreground); cursor: pointer;
  font: inherit; font-size: 12.5px;
}
.mk-railtoggle button:hover { background: var(--accent); color: var(--accent-foreground); }

/* ── no-results ─────────────────────────────────────────────────────── */
.mk-empty { padding: 30px 4px; color: var(--muted-foreground); font-size: 13px; }
.mk-hit { background: color-mix(in oklab, #fde68a 55%, transparent); color: #1a1205; border-radius: 3px; }

/* ── the in-report frame around each mock ───────────────────────────── */
.mockframe { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #0a0b0e; }
.mockbar {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-bottom: 1px solid var(--line); background: #121419; font-size: 12px; color: var(--dim);
}
.mockbar .sp { flex: 1; }
.mockbar button {
  border: 1px solid var(--line2); background: #171a21; color: var(--fg);
  border-radius: 7px; padding: 4px 9px; font: inherit; font-size: 11.5px; cursor: pointer;
}
.mockbar button[aria-pressed="true"] { background: #2b3242; border-color: #46506a; }
.mockbar .live {
  display: inline-flex; align-items: center; gap: 6px; color: #7ee787; font-weight: 600;
  font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
}
.mockbar .live::before { content: ""; width: 7px; height: 7px; border-radius: 99px; background: #7ee787; }
"""


# ── shared row renderers (JS) ──────────────────────────────────────────────
MOCK_JS = r"""
(function(){
  var DATA = __DATA__;
  var ICONS = __ICONS__;

  function ic(name, size){
    size = size || 16;
    return '<svg class="ic" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" '+
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
      (ICONS[name]||'')+'</svg>';
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  // Per-mock mutable copy, so clicking in one mock never moves another.
  function freshState(){
    var st = {};
    DATA.forEach(function(cat){ cat.sections.forEach(function(s){
      st[cat.id+'/'+s.id] = (typeof s.value === 'object') ? JSON.parse(JSON.stringify(s.value)) : s.value;
    }); });
    return st;
  }

  // ── one setting row ────────────────────────────────────────────────
  // `wide` kinds put the control UNDER the name, because a radio stack or a
  // slider+presets is not a right-aligned affordance in Obsidian either —
  // its own "Appearance > theme" row does exactly this. Everything narrow
  // (switch, select) is right-aligned, which is the convention Zach pointed at.
  var WIDE = {radio:1, slider:1, presets:1, hotkeys:1, aliases:1};

  function ctlHTML(cat, s, st){
    var key = cat.id+'/'+s.id, v = st[key];
    if (s.kind === 'switch')
      return '<button class="mk-sw" role="switch" aria-checked="'+(v?'true':'false')+
             '" data-act="switch" data-key="'+key+'" aria-label="'+esc(s.title)+'"></button>';
    if (s.kind === 'select')
      return '<button class="mk-sel" data-act="select" data-key="'+key+'">'+esc(v)+ic('ChevronDown',14)+'</button>';
    if (s.kind === 'radio'){
      return '<div class="mk-radios" role="radiogroup" aria-label="'+esc(s.title)+'">'+
        s.options.map(function(o){
          var on = o[0] === v;
          return '<button class="mk-radio" role="radio" aria-checked="'+(on?'true':'false')+
            '" data-act="radio" data-key="'+key+'" data-val="'+esc(o[0])+'">'+
            '<span class="rc"><span class="t">'+esc(o[1])+'</span>'+
            (o[2] ? '<span class="d">'+esc(o[2])+'</span>' : '')+'</span>'+
            '<span class="mk-dot"></span></button>';
        }).join('')+'</div>';
    }
    if (s.kind === 'presets'){
      return '<div class="mk-presetrow">'+
        s.options.map(function(o){
          return '<button class="mk-chip" data-act="preset" data-key="'+key+'" data-val="'+esc(o[0])+
                 '" aria-pressed="'+(o[0]===v?'true':'false')+'">'+esc(o[1])+'</button>';
        }).join('')+'<span class="count">'+esc(s.count||'')+'</span></div>';
    }
    if (s.kind === 'slider'){
      var pct = (v - s.min) / (s.max - s.min) * 100;
      return '<div class="mk-sliderwrap"><div class="mk-sliderrow">'+
        (s.minLabel ? '<span class="mk-cap">'+esc(s.minLabel)+'</span>' : '')+
        '<span class="mk-track" data-act="track" data-key="'+key+'" data-min="'+s.min+'" data-max="'+s.max+
          '" data-step="'+s.step+'" role="slider" aria-valuenow="'+v+'" aria-valuemin="'+s.min+
          '" aria-valuemax="'+s.max+'" aria-label="'+esc(s.title)+'" tabindex="0">'+
          '<span class="mk-fill" style="right:'+(100-pct)+'%"></span>'+
          '<span class="mk-thumb" style="left:'+pct+'%"></span></span>'+
        (s.maxLabel ? '<span class="mk-cap big">'+esc(s.maxLabel)+'</span>' : '')+
        (s.exactEntry ? '<input class="mk-num" data-act="num" data-key="'+key+'" value="'+v+'" inputmode="numeric">' : '')+
        '<output class="mk-out">'+v+(s.suffix||'')+'</output></div>'+
        (s.presets ? '<div class="mk-chips">'+s.presets.map(function(p){
            return '<button class="mk-chip" data-act="sliderpreset" data-key="'+key+'" data-val="'+p+
                   '" aria-pressed="'+(p===v?'true':'false')+'">'+p+(s.suffix||'')+'</button>';
          }).join('')+'</div>' : '')+
        (s.resetTo !== undefined ? '<div><button class="mk-btn" data-act="reset" data-key="'+key+
           '" data-val="'+s.resetTo+'"'+(v===s.resetTo?' disabled':'')+'>'+esc(s.resetLabel)+'</button></div>' : '')+
        '</div>';
    }
    if (s.kind === 'hotkeys')
      return '<dl class="mk-kv">'+s.rows.map(function(r){
        return '<div class="mk-kvrow"><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>'; }).join('')+'</dl>';
    if (s.kind === 'aliases')
      return '<div class="mk-kv">'+s.rows.map(function(r){
        return '<div class="mk-alias"><span class="n">'+esc(r[0])+
               '</span><input class="v" value="'+esc(r[1])+'"></div>'; }).join('')+'</div>';
    return '';
  }

  function rowHTML(cat, s, st, q){
    if (s.kind === 'note')
      return '<div class="mk-row" data-sec="'+s.id+'" data-text="'+esc((s.title+' '+(s.desc||'')).toLowerCase())+'">'+
        '<div class="mk-rowmain"><div class="mk-rowtitle">'+hl(s.title,q)+'</div>'+
        '<p class="mk-note">'+hl(s.desc||'',q)+'</p></div></div>';
    var wide = WIDE[s.kind];
    return '<div class="mk-row'+(wide?' wide':'')+'" data-sec="'+s.id+
      '" data-text="'+esc((s.title+' '+(s.desc||'')).toLowerCase())+'">'+
      '<div class="mk-rowmain"><div class="mk-rowtitle">'+hl(s.title,q)+'</div>'+
      (s.desc ? '<p class="mk-rowdesc">'+hl(s.desc,q)+'</p>' : '')+'</div>'+
      '<div class="mk-rowctl">'+ctlHTML(cat, s, st)+'</div></div>';
  }

  function hl(text, q){
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0,i))+'<mark class="mk-hit">'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length));
  }

  // Sections of one category, grouped, optionally as cards (P3).
  function sectionsHTML(cat, st, q, cards){
    var out = [], i = 0;
    while (i < cat.sections.length){
      var s = cat.sections[i];
      var g = s.group;
      if (!g){ out.push(cards ? '<div class="mk-card">'+rowHTML(cat,s,st,q)+'</div>' : rowHTML(cat,s,st,q)); i++; continue; }
      var run = [];
      var opener = s;
      while (i < cat.sections.length && cat.sections[i].group === g){ run.push(cat.sections[i]); i++; }
      var head = '<div class="mk-grp"><h5>'+esc(g)+'</h5>'+
        (opener.groupDesc ? '<p>'+esc(opener.groupDesc)+'</p>' : '')+'</div>';
      var body = run.map(function(x){ return rowHTML(cat,x,st,q); }).join('');
      out.push(head + (cards ? '<div class="mk-card">'+body+'</div>' : body));
    }
    return out.join('');
  }

  function matches(cat, q){
    if (!q) return cat.sections;
    return cat.sections.filter(function(s){
      return (s.title+' '+(s.desc||'')+' '+(s.group||'')).toLowerCase().indexOf(q) >= 0; });
  }

  // ── render one mock ────────────────────────────────────────────────
  function render(root){
    var id = root.dataset.mock;
    var st = root._st || (root._st = freshState());
    var active = root._cat || (root._cat = root.dataset.cat || 'pointer');
    var q = (root._q || '').trim().toLowerCase();
    var cards = (id === 'p3');
    var spy = (id === 'p5');
    // The spy pane starts scrolled to the TOP, so before the first scroll
    // event the highlighted row must be the FIRST category — not whatever
    // `active` happens to default to, which highlighted "Mouse and scrolling"
    // while the pane was showing General.
    if (spy && !root._spy) root._spy = DATA[0].id;
    var rail = (id === 'p4' && root._rail);
    var search = (id === 'p2' || id === 'p4' || id === 'p5');

    // nav
    var navGroups = [], seen = {};
    DATA.forEach(function(c){ if (!seen[c.navGroup]){ seen[c.navGroup] = []; navGroups.push(c.navGroup); } seen[c.navGroup].push(c); });
    var navHTML = navGroups.map(function(g){
      var rows = seen[g].filter(function(c){ return !q || matches(c,q).length; });
      if (!rows.length) return '';
      return '<div class="mk-navgroup">'+esc(g)+'</div>'+rows.map(function(c){
        var on = spy ? (c.id === (root._spy || active)) : (c.id === active);
        var n = q ? matches(c,q).length : 0;
        return '<button class="mk-navbtn" data-act="cat" data-cat="'+c.id+'"'+(on?' aria-current="page"':'')+
          ' title="'+esc(c.label)+'">'+ic(c.icon)+'<span class="mk-navtext">'+esc(c.label)+
          (q ? ' <span style="opacity:.6">('+n+')</span>' : '')+'</span></button>';
      }).join('');
    }).join('');

    // content
    var paneHTML;
    if (spy){
      paneHTML = DATA.map(function(c){
        var secs = matches(c, q);
        if (!secs.length) return '';
        var sub = {id:c.id, sections:secs};
        return '<section data-cat="'+c.id+'"><div class="mk-cathead">'+ic(c.icon,18)+'<h5>'+esc(c.label)+'</h5></div>'+
               sectionsHTML(sub, st, q, false)+'</section>';
      }).join('') || '<div class="mk-empty">No setting matches “'+esc(q)+'”.</div>';
    } else {
      var cat = DATA.filter(function(c){ return c.id === active; })[0] || DATA[0];
      var secs = matches(cat, q);
      paneHTML = secs.length
        ? sectionsHTML({id:cat.id, sections:secs}, st, q, cards)
        : '<div class="mk-empty">No setting in '+esc(cat.label)+' matches “'+esc(q)+'”.</div>';
    }

    var searchHTML = search
      ? '<div class="mk-searchwrap"><label class="mk-search">'+ic('Search',14)+
        '<input type="search" placeholder="Search settings…" data-act="q" value="'+esc(root._q||'')+'"></label></div>'
      : '';

    // `root` IS the .mk-popup element — data-mock is stamped on it.
    root.innerHTML =
      '<div class="mk-head"><h4>Settings</h4><span class="sp"></span>'+
        '<button class="mk-x" aria-label="Close">'+ic('X',16)+'</button></div>'+
      '<div class="mk-body">'+
        '<nav class="mk-nav'+(rail?' rail':'')+'" style="width:'+(root.dataset.navw||'224')+'px">'+
          searchHTML+
          '<div class="mk-navscroll">'+navHTML+'</div>'+
          (id === 'p4' ? '<div class="mk-railtoggle"><button data-act="rail">'+ic('SlidersHorizontal',14)+
            '<span class="mk-navtext">'+(rail?'Expand':'Collapse')+'</span></button></div>' : '')+
        '</nav>'+
        '<div class="mk-pane"><div class="mk-measure">'+paneHTML+'</div></div>'+
      '</div>';

    if (root._scrollTop != null){ root.querySelector('.mk-pane').scrollTop = root._scrollTop; root._scrollTop = null; }
    if (spy) wireSpy(root);
    var qi = root.querySelector('input[data-act="q"]');
    if (qi && root._focusQ){ qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); root._focusQ = false; }
  }

  function wireSpy(root){
    var pane = root.querySelector('.mk-pane');
    pane.onscroll = function(){
      var best = null, bestD = 1e9, top = pane.getBoundingClientRect().top + 70;
      Array.prototype.forEach.call(pane.querySelectorAll('section[data-cat]'), function(sec){
        var d = Math.abs(sec.getBoundingClientRect().top - top);
        if (sec.getBoundingClientRect().top - top < 40 && d < bestD){ bestD = d; best = sec.dataset.cat; }
      });
      if (best && best !== root._spy){
        root._spy = best;
        Array.prototype.forEach.call(root.querySelectorAll('.mk-navbtn'), function(b){
          if (b.dataset.cat === best) b.setAttribute('aria-current','page');
          else b.removeAttribute('aria-current'); });
      }
    };
  }

  function setSlider(root, key, raw){
    var t = root.querySelector('[data-act="track"][data-key="'+key+'"]');
    if (!t) return;
    var min = +t.dataset.min, max = +t.dataset.max, step = +t.dataset.step;
    var v = Math.min(max, Math.max(min, Math.round(raw/step)*step));
    root._st[key] = v;
    root._scrollTop = root.querySelector('.mk-pane').scrollTop;
    render(root);
  }

  function wire(root){
    root.addEventListener('click', function(e){
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act, key = el.dataset.key;
      var pane = root.querySelector('.mk-pane');
      if (act === 'cat'){
        if (root.dataset.mock === 'p5'){
          var sec = pane.querySelector('section[data-cat="'+el.dataset.cat+'"]');
          if (sec) pane.scrollTo({top: sec.offsetTop - 8, behavior:'smooth'});
          return;
        }
        root._cat = el.dataset.cat; root._scrollTop = 0; render(root); return;
      }
      if (act === 'rail'){ root._rail = !root._rail; root._scrollTop = pane.scrollTop; render(root); return; }
      if (act === 'switch'){ root._st[key] = !root._st[key]; }
      else if (act === 'radio' || act === 'preset'){ root._st[key] = el.dataset.val; }
      else if (act === 'sliderpreset' || act === 'reset'){ root._st[key] = +el.dataset.val; }
      else if (act === 'select'){
        var opts = null;
        DATA.forEach(function(c){ c.sections.forEach(function(s){
          if (c.id+'/'+s.id === key) opts = s.options.map(function(o){ return o[0]; }); }); });
        if (opts){ var i = opts.indexOf(root._st[key]); root._st[key] = opts[(i+1) % opts.length]; }
      } else return;
      root._scrollTop = pane.scrollTop;
      render(root);
    });

    root.addEventListener('input', function(e){
      var el = e.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'q'){
        root._q = el.value; root._focusQ = true; root._scrollTop = 0; render(root);
      }
    });
    root.addEventListener('change', function(e){
      var el = e.target.closest('[data-act="num"]');
      if (!el) return;
      var n = parseFloat(el.value);
      if (isFinite(n)) setSlider(root, el.dataset.key, n);
    });

    // Slider drag — pointer events on the track.
    root.addEventListener('pointerdown', function(e){
      var t = e.target.closest('[data-act="track"]');
      if (!t) return;
      var key = t.dataset.key, min = +t.dataset.min, max = +t.dataset.max;
      function at(ev){
        var r = t.getBoundingClientRect();
        var f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        setSlider(root, key, min + f * (max - min));
      }
      at(e);
      function move(ev){ at(ev); }
      function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      e.preventDefault();
    });

    render(root);
  }

  window.__mkInit = function(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-mock]'), function(root){
      if (root._wired) return; root._wired = true; wire(root);
    });
    // theme + size toggles on each mock's own toolbar
    Array.prototype.forEach.call(document.querySelectorAll('.mockbar [data-theme-set]'), function(b){
      b.addEventListener('click', function(){
        var frame = b.closest('.mockframe');
        var mk = frame.querySelector('.mk');
        mk.dataset.theme = b.dataset.themeSet;
        Array.prototype.forEach.call(frame.querySelectorAll('[data-theme-set]'), function(x){
          x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
  };
  if (document.readyState !== 'loading') window.__mkInit(); else document.addEventListener('DOMContentLoaded', window.__mkInit);
})();
""".replace("__DATA__", DATA_JSON).replace("__ICONS__", ICONS_JSON)


# ── the five proposals ─────────────────────────────────────────────────────
PROPOSALS = [
    {
        "id": "p1", "rank": "P1", "name": "Obsidian Clone",
        "lane": "stock",
        "tag": "stock shadcn composition",
        "navw": 224,
        "one": "Obsidian's own shape, built entirely from parts already in the repo: a 224px icon nav, a 1040×720 window, and the setting row finally laid out as name+description left / control right.",
        "width": "w-[min(1040px,calc(100vw-4rem))]",
        "height": "h-[min(720px,calc(100vh-4rem))]",
        "nav": "224px fixed. One lucide icon per row (<code>SettingsCategory.icon</code>, a prop that <em>already exists</em>), two small-caps group headings — <b>Options</b> for the five, <b>App</b> for About — mirroring Obsidian's Options / Core plugins / Community plugins. No search.",
        "search": "No",
        "scroll": "Two independent scrollers, both vertical only: the nav's own list and the content pane. Nothing scrolls horizontally because the pane is <code>overflow-x-hidden</code> and every row is a flex column that can shrink — the 80px exact-entry box and 56px readout sit in a <code>min-w-0</code> row, so they compress rather than push.",
        "scrollbar": "Base UI <code>ScrollArea</code> — 10px wide, overlaid on the content (zero layout gutter), thumb <code>bg-border</code>, brightening on hover. That is Obsidian's exact treatment.",
        "row": "<code>Field orientation=\"horizontal\"</code> + <code>FieldContent</code>: title and description take the flexible left column, the control is a <code>shrink-0</code> right column. Radio stacks, sliders and the alias editor set <code>orientation=\"vertical\"</code> instead and sit under the name — Obsidian does the same for its own multi-line controls.",
        "shortwin": "At 1366×720 the height rule resolves to <code>720 − 64 = 656px</code>, so the window shrinks rather than clipping; only the content pane loses rows and it already scrolls.",
        "stock": [
            ("Dialog", "<code>DialogPortal</code>, <code>DialogOverlay</code>, <code>DialogClose</code> + <code>Dialog.Popup</code>", "vendored", "components/dialog.tsx"),
            ("ScrollArea", "<code>ScrollArea</code>, <code>ScrollBar</code>", "MISSING from the trunk", "copy from apps/docs — see the trap below"),
            ("Field", "<code>Field</code>, <code>FieldContent</code>, <code>FieldTitle</code>, <code>FieldDescription</code>", "vendored + already imported", "components/field.tsx"),
            ("Button", "<code>Button</code>", "vendored", "components/button.tsx"),
            ("Separator", "<code>Separator</code>", "vendored", "components/separator.tsx"),
            ("controls", "<code>Switch</code>, <code>RadioGroup</code>, <code>Select</code>, <code>Slider</code>, <code>Input</code>", "vendored, unchanged", "—"),
        ],
        "cost": "Two files edited (<code>settingsView.tsx</code>, <code>settingsCategories.tsx</code>) + one file added (<code>components/scroll-area.tsx</code>). <b>Zero new npm dependencies</b> — <code>@base-ui/react@1.8.0</code> already ships <code>scroll-area</code>. No migration: the props, the data shape and the DOM contract are unchanged.",
        "risk": "Lowest. Every acceptance assertion in <code>SettingsView.stories.tsx</code> and <code>SettingsViewStockParts.stories.tsx</code> keeps passing — the nav stays stock <code>Button</code>s with <code>aria-current=\"page\"</code>, in declaration order.",
    },
    {
        "id": "p2", "rank": "P2", "name": "Clone + Search",
        "lane": "stock",
        "tag": "stock shadcn composition",
        "navw": 232,
        "one": "P1 exactly, plus the one thing Obsidian's screenshot has that P1 doesn't: a “Search settings…” box that filters rows in place and puts a live match count beside every category.",
        "width": "w-[min(1040px,calc(100vw-4rem))]",
        "height": "h-[min(720px,calc(100vh-4rem))]",
        "nav": "232px. Identical to P1, plus a search input pinned above the list (Obsidian's own position) and a match count on each category while a query is live. A category with zero matches drops out of the nav entirely.",
        "search": "Yes — filters rows in place, matches highlighted",
        "scroll": "Same two scrollers as P1. The search box is <em>outside</em> the nav's scroller, so it never scrolls away.",
        "scrollbar": "Same as P1 — Base UI <code>ScrollArea</code>, 10px, overlaid.",
        "row": "Same as P1. A matched substring is wrapped in a <code>&lt;mark&gt;</code>, which is what makes a 31-setting panel searchable rather than browsable.",
        "shortwin": "Same rule as P1. Search actively helps here: at 1366×720 the Connections category is 11 rows and ~3 screens; typing <code>fan</code> cuts it to two.",
        "stock": [
            ("everything in P1", "—", "—", "—"),
            ("InputGroup", "<code>InputGroup</code>, <code>InputGroupInput</code>, <code>InputGroupAddon</code>", "vendored", "components/input-group.tsx"),
            ("(alternative)", "<code>Command</code>, <code>CommandInput</code>, <code>CommandList</code>, <code>CommandItem</code>", "vendored", "components/command.tsx — for a ⌘K palette instead of an in-place filter"),
        ],
        "cost": "P1's cost plus ~40 lines of filter logic in <code>settingsView.tsx</code> and one new optional prop (<code>searchable?: boolean</code>). Zero new deps, zero new files beyond P1's.",
        "risk": "Low. The filter is pure and derived; with an empty query the tree is byte-identical to P1's, so every existing story passes untouched.",
    },
    {
        "id": "p3", "rank": "P3", "name": "Card Stack",
        "lane": "stock",
        "tag": "stock shadcn composition",
        "navw": 224,
        "one": "P1's nav and window, but the right pane is Obsidian's <em>actual</em> right pane: each group is a bordered card of hairline-separated rows, with the group heading sitting outside and above it.",
        "width": "w-[min(1040px,calc(100vw-4rem))]",
        "height": "h-[min(720px,calc(100vh-4rem))]",
        "nav": "Identical to P1.",
        "search": "No (composes with P2's if both are picked)",
        "scroll": "Same as P1. Cards are block-level and never establish their own scroller — a card that scrolled would hide rows behind a second, nested scrollbar, which is the failure Obsidian avoids by keeping exactly one.",
        "scrollbar": "Same as P1.",
        "row": "Same <code>Field orientation=\"horizontal\"</code> row, but wrapped: <code>FieldSet</code> + <code>FieldLegend</code> for the heading, then a <code>rounded-xl border bg-card</code> wrapper around a <code>FieldGroup</code>, rows divided by a hairline. This is the highest-fidelity match to the Obsidian screenshot of the five.",
        "shortwin": "Same as P1. The cards cost ~14px of vertical padding per group; at 1366×720 that is roughly one extra row of scrolling in Connections.",
        "stock": [
            ("everything in P1", "—", "—", "—"),
            ("FieldSet", "<code>FieldSet</code>, <code>FieldLegend</code>", "vendored", "components/field.tsx"),
            ("FieldGroup", "<code>FieldGroup</code>", "vendored", "components/field.tsx"),
            ("FieldSeparator", "<code>FieldSeparator</code>", "vendored", "components/field.tsx"),
        ],
        "cost": "P1's cost plus ~25 lines of grouping markup. <b><code>Card</code> is deliberately NOT installed</b> — the visual is one <code>border</code> + <code>bg-card</code> class pair, and <code>npx shadcn add card</code> would buy a <code>CardHeader</code>/<code>CardContent</code> API this layout never calls.",
        "risk": "Low, with one real consequence: the group heading moves from an <code>&lt;h3 data-slot=\"settings-group\"&gt;</code> to a <code>&lt;legend&gt;</code>. The <code>data-slot</code> and <code>data-group</code> attributes the DOM contract names must be carried over onto the legend, or <code>SettingsView.stories.tsx</code> goes red.",
    },
    {
        "id": "p4", "rank": "P4", "name": "Sidebar Kit",
        "lane": "custom",
        "tag": "heavier stock install — an app shell inside a dialog",
        "navw": 240,
        "one": "The nav stops being hand-arranged <code>Button</code>s and becomes shadcn's real <code>Sidebar</code> composition — which buys grouped sections, a search slot and collapse-to-icon for free, so short and narrow windows solve themselves.",
        "width": "w-[min(1100px,calc(100vw-4rem))]",
        "height": "h-[min(740px,calc(100vh-3rem))]",
        "nav": "240px expanded, 52px collapsed to icons only (press <b>Collapse</b> in the mock). <code>SidebarGroup</code>+<code>SidebarGroupLabel</code> give the Options/App headings, <code>SidebarMenuButton</code> gives the row with its icon, active tint and tooltip-when-collapsed — none of it hand-styled.",
        "search": "Yes — <code>SidebarInput</code>, the stock slot for exactly this",
        "scroll": "<code>SidebarContent</code> scrolls the nav; the content pane scrolls separately. Both vertical only.",
        "scrollbar": "Same <code>ScrollArea</code> treatment on the content pane; the sidebar's own overflow is handled by <code>SidebarContent</code>.",
        "row": "Same as P1 — the sidebar changes the nav, not the row.",
        "shortwin": "This is the proposal's whole point. At 1366×720 the nav can collapse to 52px and hand ~190px back to the content, and the collapse state persists. P1–P3 would have to hand-tune a breakpoint to do the same.",
        "stock": [
            ("Sidebar", "<code>SidebarProvider</code>, <code>Sidebar</code>, <code>SidebarContent</code>, <code>SidebarGroup</code>, <code>SidebarGroupLabel</code>, <code>SidebarMenu</code>, <code>SidebarMenuItem</code>, <code>SidebarMenuButton</code>, <code>SidebarInput</code>, <code>SidebarRail</code>", "MISSING from the trunk", "<code>npx shadcn add sidebar</code>"),
            ("its dependencies", "<code>Sheet</code>, <code>Skeleton</code>, <code>Tooltip</code>, <code>Separator</code>, <code>Input</code>, <code>Button</code>, <code>useIsMobile</code>", "3 of 7 missing", "sheet.tsx, skeleton.tsx, hooks/use-mobile.ts come with it"),
            ("everything in P1", "—", "—", "—"),
        ],
        "cost": "P1's cost plus <code>npx shadcn add sidebar</code>: <b>4 new files</b> (<code>sidebar.tsx</code> ~730 lines, <code>sheet.tsx</code>, <code>skeleton.tsx</code>, <code>hooks/use-mobile.ts</code>). Still <b>zero new npm dependencies</b> — all Base UI. But <code>sidebar.tsx</code> persists its state to a <b>cookie</b> and assumes a page-level shell; inside a dialog that wants auditing or replacing with the app's own per-viewer <code>localStorage</code>.",
        "risk": "Highest install weight of the five, and the one place where “don't reinvent the wheel” and “don't take on a wheel you don't need” actually conflict. 730 lines to replace ~20 lines of <code>Button</code> nav is a bad trade <em>unless</em> collapse-to-icon is genuinely wanted.",
    },
    {
        "id": "p5", "rank": "P5", "name": "One Pane, Scroll-Spy",
        "lane": "custom",
        "tag": "custom — no stock part does scroll-spy",
        "navw": 232,
        "one": "Drop the category switch entirely: every setting lives in one continuous scroll, the nav highlights whatever you are looking at, and clicking a category scrolls to it. VS Code and macOS System Settings both work this way.",
        "width": "w-[min(1040px,calc(100vw-4rem))]",
        "height": "h-[min(720px,calc(100vh-4rem))]",
        "nav": "232px, icons and groups as P1, plus search. The difference is what the highlight <em>means</em>: not “the category you chose” but “the category you are currently reading”.",
        "search": "Yes — and it searches all 31 settings at once, which is only possible because they are all mounted",
        "scroll": "<b>One</b> content scroller for the whole panel, plus the nav's own. Scroll it in the mock and watch the nav follow.",
        "scrollbar": "Same <code>ScrollArea</code>; the thumb is now a genuine progress indicator for the whole settings surface rather than for one category.",
        "row": "Same as P1, with a category header (<code>icon + h5 + hairline</code>) opening each block.",
        "shortwin": "Degrades best of the five — there is no “wrong category” state to be stuck in at any window size; you scroll. The cost is that the content pane is ~5× taller, so the thumb is small.",
        "stock": [
            ("everything in P1 + P2", "—", "—", "—"),
            ("the scroll-spy itself", "— <b>no stock part</b>", "custom", "~30 lines: an <code>IntersectionObserver</code> over the section headers + <code>scrollIntoView</code>"),
        ],
        "cost": "P1+P2's cost plus ~30 lines of observer. Zero new deps, zero new files. <b>All 31 settings mount at once</b> instead of ~8 — measured on the current tree the whole panel is plain DOM with no canvas, so that is cheap, but it is a real change in mount cost.",
        "risk": "Real and worth naming: <code>aria-current=\"page\"</code> stops meaning “the open category” and starts meaning “the category under the scroll position”. <code>SettingsViewStockParts.stories.tsx</code> asserts that Enter on a focused nav button opens that category — that assertion has to be restated as “scrolls to”, which is an acceptance change, not a refactor. Also the least like Obsidian of the five, which is the reference Zach named.",
    },
]


def mock_html(p: dict) -> str:
    """The live, clickable mock for one proposal, plus its toolbar."""
    return f"""
<div class="mockframe">
  <div class="mockbar">
    <span class="live">live &middot; click it</span>
    <span>{p['rank']} &middot; {p['name']}</span>
    <span class="sp"></span>
    <button data-theme-set="dark" aria-pressed="true">Dark</button>
    <button data-theme-set="light" aria-pressed="false">Light</button>
  </div>
  <div class="mk" data-theme="dark">
    <div class="mk-stage" style="padding:22px;min-height:560px">
      <div class="mk-popup" data-mock="{p['id']}" data-navw="{p['navw']}"
           style="width:100%;max-width:1040px;height:516px"></div>
    </div>
  </div>
</div>"""


def standalone(p: dict, theme: str, w: int, h: int, cat: str = "pointer") -> str:
    """A full page holding ONE mock at a real window size — what gets
    screenshotted, so the capture shows how the modal sits in that window."""
    # The proposal's own width/height rule, resolved for this viewport.
    max_w = 1100 if p["id"] == "p4" else 1040
    gut_w, gut_h = 64, (48 if p["id"] == "p4" else 64)
    max_h = 740 if p["id"] == "p4" else 720
    pw = min(max_w, w - gut_w)
    ph = min(max_h, h - gut_h)
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>html,body{{margin:0;height:100%}}
body{{background:{'#0e0f12' if theme == 'dark' else '#f6f7f9'}}}
{MOCK_CSS}
.mk-stage{{border-radius:0;border:0;height:100vh;width:100vw}}</style></head>
<body><div class="mk" data-theme="{theme}">
<div class="mk-stage">
  <div class="mk-popup" data-mock="{p['id']}" data-navw="{p['navw']}" data-cat="{cat}"
       style="width:{pw}px;height:{ph}px"></div>
</div></div>
<script>{MOCK_JS}</script></body></html>"""
