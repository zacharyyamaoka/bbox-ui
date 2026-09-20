#!/usr/bin/env python3
"""Write a flight-recorder capture as a folder an agent can read.

PORTED from the archive, read on disk 2026-09-19:
``/home/bam/systemsketch/scripts/recording_store.py:1-1039`` — the writer, the
packet, the moment index, the ``playback.html`` viewer and the Chrome
screencast sidecar. Zach, 2026-09-19: *"Please copy the source code of the
recording exactly.. as there is alot going on there with the screen shots,
with the auto copy paste of the context, etc. etc."* Everything below the
constants is the donor's, function for function; the four changes are named
here and nowhere else, so a diff against the donor reads clean.

  1. ``DEFAULT_WORKSPACE_DIRNAME`` comes from ``systemsketch_files`` instead of
     the archive's ``workspace_store`` — the ported store is that module here,
     and the two MUST agree on the folder name or a recording lands beside the
     boards instead of inside the workspace.
  2. ``_state_search_roots`` learns this repo's layout (``apps/*/src``, and
     tldraw under pnpm's ``node_modules/.pnpm/``) and refuses to walk into a
     ``node_modules`` tree. The archive was a single-package checkout with
     ``src/`` at its root; an unguarded ``rglob`` over ``apps/`` here would
     walk 40k dependency files on every save.
  3. ``details.jsonl`` is written beside the lane files — the COMPLETE detail
     list, which the archive only ever had in memory. WHY: the archive's
     viewer was a page the writer generated (``playback_html``), so it could
     interpolate the full list directly. Zach asked for that viewer as a modal
     in the app instead (*"that should open the viewer in a modal in the
     app"*), which means reading it back off disk — and the per-lane files
     (``network.jsonl``, ``ui-hits.jsonl``, …) are a SUBSET by construction.
     Without this file the in-app viewer would silently show fewer details
     than the written page does, which is the worst of both.
  4. ``read_recording_bundle`` and ``RecordingApi`` are new, and are the only
     new behaviour: the read-back route the modal needs, and the mountable
     route object this repo uses instead of the archive's monolithic
     ``server.py`` handler (the same shape as ``systemsketch_files.py``'s
     ``WorkspaceApi``, ported from ``server.py``'s branches at :521-527,
     :599-600, :641-645 and :808-826).

``files_root`` is a REQUIRED parameter with no default, here and in the
archive. Nothing in this module may fall back to ``Path.home()``:
``/home/bam/SystemSketch`` holds real boards, and a test that guessed a root
would write into them.

    <files_root>/SystemSketch/recordings/<local time>-<note>/
        README.md            the packet — prose first, then absolute paths
        manifest.json        progressive-disclosure index and privacy boundary
        moments.json         high-signal events paired with their nearest frame
        header.json          where and when, viewport, camera, channel, counts
        timeline.jsonl       one JSON object per row; `t` is ms since start
        details.jsonl        every detail record (see change 3 above)
        store.full.jsonl     complete records for deterministic replay
        start.snapshot.json  the tldraw store at t=0 (rewound for a retroactive save)
        end.snapshot.json    the tldraw store at save time
        frames/f-<ms>.jpg    Chrome screencast frames named by ms since start
        frames.jsonl         one line per kept frame
        *.jsonl              workspace/network/UI/perf/error/action/host detail
        playback.html        the viewer: slow frames, fast lanes, one scrubber

Written the way boards and preview clones are: staged, fsynced, then renamed
into place, so a half-written folder never looks like a recording. Only the
standard library is used, because the Stable channel runs this from an
installed release without the checkout's environment.
"""


from __future__ import annotations

import html
import inspect
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import UTC, datetime
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from systemsketch_files import DEFAULT_WORKSPACE_DIRNAME, MAX_API_REQUEST_BYTES

RECORDINGS_DIRNAME = "recordings"
KEEP_LAST_RECORDINGS = 20
KEEP_FRAME_GAP_MS = 300
MAX_ROWS = 200_000
MAX_DETAILS = 100_000
MAX_STORE_DIFFS = 100_000
STATE_ID_PATTERN = re.compile(r"\bid\s*=\s*['\"]([a-z][a-z0-9_]*)['\"]")
# `static override id = BLOCK_TOOL_ID` — the id lives in a constant declared elsewhere.
STATE_ID_CONSTANT_USE = re.compile(r"\bid\s*=\s*([A-Z][A-Z0-9_]{2,})\b")
STATE_ID_CONSTANT_DEF = re.compile(r"\b([A-Z][A-Z0-9_]{2,})\s*=\s*['\"]([a-z][a-z0-9_]*)['\"]")
STATE_INDEX_TTL_S = 60.0

DETAIL_FILES = {
    "network": "network.jsonl",
    "workspace": "workspace.jsonl",
    "action": "actions.jsonl",
    "ui": "ui-hits.jsonl",
    "perf": "performance.jsonl",
}


class RecordingError(RuntimeError):
    """A recording could not be accepted or written."""


def recordings_dir(files_root: Path) -> Path:
    return files_root.resolve() / DEFAULT_WORKSPACE_DIRNAME / RECORDINGS_DIRNAME


def slugify(text: object, limit: int = 32) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return slug[:limit].rstrip("-")


def recording_stamp(header: dict) -> str:
    started = header.get("startedAt")
    try:
        moment = datetime.fromisoformat(str(started).replace("Z", "+00:00")).astimezone()
    except (TypeError, ValueError):
        moment = datetime.now().astimezone()
    stamp = moment.strftime("%Y-%m-%d_%H-%M-%S")
    slug = slugify(header.get("note")) or str(header.get("mode") or "recording")
    return f"{stamp}-{slug}"


def _require(payload: dict, key: str, kind: type) -> object:
    value = payload.get(key)
    if not isinstance(value, kind):
        raise RecordingError(f"recording payload needs `{key}` as {kind.__name__}")
    return value


def _atomic_bytes(path: Path, content: bytes) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _text(path: Path, content: str) -> None:
    _atomic_bytes(path, content.encode("utf-8"))


# --------------------------------------------------------------------------- #
# State → source map
# --------------------------------------------------------------------------- #

_state_index_cache: dict[str, tuple[float, dict[str, list[str]]]] = {}
_state_index_lock = threading.Lock()


def _state_search_roots(source_root: Path) -> list[tuple[Path, tuple[str, ...]]]:
    """Where an `id = '<state>'` declaration can live, in THIS repo's layout.

    Change 2 from the module docstring. The archive was one package with
    ``src/`` at its root and a flat ``node_modules``; this is a pnpm workspace,
    so the app sources are ``apps/*/src`` and tldraw's own tool classes sit
    under ``node_modules/.pnpm/tldraw@<version>/…``. A missing root is skipped
    by the caller, so listing all of them costs nothing.
    """
    roots: list[tuple[Path, tuple[str, ...]]] = [
        # The archive's own layout, kept so this module still works against it.
        (source_root / "src", (".ts", ".tsx")),
    ]
    apps = source_root / "apps"
    if apps.is_dir():
        for app in sorted(apps.iterdir()):
            if app.is_dir() and (app / "src").is_dir():
                roots.append((app / "src", (".ts", ".tsx")))
    for pattern, tail in (
        ("tldraw@*", ("node_modules", "tldraw", "dist-esm", "lib", "tools")),
        ("@tldraw+editor@*", ("node_modules", "@tldraw", "editor", "dist-esm", "lib", "editor", "tools")),
    ):
        for found in sorted((source_root / "node_modules" / ".pnpm").glob(pattern)):
            roots.append((found.joinpath(*tail), (".mjs",)))
    roots.append((source_root / "node_modules" / "tldraw" / "dist-esm" / "lib" / "tools", (".mjs",)))
    roots.append(
        (source_root / "node_modules" / "@tldraw" / "editor" / "dist-esm" / "lib" / "editor" / "tools", (".mjs",))
    )
    return roots


def state_index(source_root: Path) -> dict[str, list[str]]:
    """Every `id = '<state>'` declaration under the app and tldraw's tools.

    A state id such as `idle` is declared by many tools, so the index keeps
    every file per id and `state_sources` picks by the parent state. Cached for
    a minute per source root: the host is long-lived, and a state id changes
    about as often as a file is renamed.
    """
    key = str(source_root.resolve())
    now = time.monotonic()
    with _state_index_lock:
        cached = _state_index_cache.get(key)
        if cached and now - cached[0] < STATE_INDEX_TTL_S:
            return cached[1]
    index: dict[str, list[str]] = {}
    constant_values: dict[str, str] = {}
    constant_uses: list[tuple[str, str]] = []
    for root, suffixes in _state_search_roots(source_root):
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix not in suffixes or path.name.endswith((".test.ts", ".test.tsx")):
                continue
            # An `apps/<name>/src` root can contain a nested install; the
            # archive's single `src/` could not. Walking one costs ~40k files
            # per save and indexes a dependency's states as if they were ours.
            # The test is RELATIVE to the root being scanned: tldraw's own
            # tool roots legitimately sit under `node_modules/.pnpm/…`, so an
            # absolute `"node_modules" in path.parts` would silently empty the
            # base-tool half of the map (measured: `idle` resolved to None).
            if "node_modules" in path.relative_to(root).parts:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            relative = str(path.relative_to(source_root))
            for match in STATE_ID_PATTERN.finditer(text):
                index.setdefault(match.group(1), []).append(relative)
            for match in STATE_ID_CONSTANT_USE.finditer(text):
                constant_uses.append((match.group(1), relative))
            for match in STATE_ID_CONSTANT_DEF.finditer(text):
                constant_values.setdefault(match.group(1), match.group(2))
    for constant, relative in constant_uses:
        literal = constant_values.get(constant)
        if literal:
            index.setdefault(literal, []).append(relative)
    with _state_index_lock:
        _state_index_cache[key] = (now, index)
    return index


def states_seen(rows: list[dict]) -> list[tuple[str, str | None]]:
    """(state, parent state) pairs in first-seen order, e.g. ('idle', 'select')."""
    seen: list[tuple[str, str | None]] = []
    names: set[str] = set()
    for row in rows:
        if row.get("lane") != "state":
            continue
        for key in ("from", "to"):
            path = row.get(key)
            if not isinstance(path, str):
                continue
            segments = [segment for segment in path.split(".") if segment]
            for position, state in enumerate(segments):
                if state in names:
                    continue
                names.add(state)
                seen.append((state, segments[position - 1] if position else None))
    return seen


def _pick_source(candidates: list[str], parent: str | None) -> str | None:
    if not candidates:
        return None
    # The app's own definition first; then the shallowest file under the parent
    # tool (`select.idle` → SelectTool/childStates/Idle, not Crop's Idle); then
    # tldraw's base tools, which an app tool such as `block` inherits from.
    by_depth = sorted(candidates, key=lambda path: (path.count("/"), path))
    own = [path for path in by_depth if path.startswith("src/")]
    if own:
        return own[0]
    if parent:
        tool = f"/{parent.capitalize()}Tool/"
        in_tool = [path for path in by_depth if tool in path]
        if in_tool:
            return in_tool[0]
    base = [path for path in by_depth if "/@tldraw/editor/" in path]
    if base:
        return base[0]
    return by_depth[0]


def state_sources(rows: list[dict], source_root: Path) -> dict[str, str | None]:
    index = state_index(source_root)
    return {state: _pick_source(index.get(state, []), parent) for state, parent in states_seen(rows)}


# --------------------------------------------------------------------------- #
# The packet
# --------------------------------------------------------------------------- #

def _seconds(ms: object) -> str:
    try:
        return f"{float(ms) / 1000:.2f}"
    except (TypeError, ValueError):
        return "?"


def _row_summary(row: dict) -> str:
    if isinstance(row.get("summary"), str):
        return row["summary"]
    lane = row.get("lane")
    if lane == "console":
        return " ".join(str(value) for value in row.get("args", []))[:240]
    if lane == "state":
        return f"{row.get('from')} → {row.get('to')}"
    if lane == "menu":
        return "menus: " + (", ".join(row.get("open", [])) or "closed")
    if lane == "dom":
        return f"{row.get('event')} on {row.get('on', '?')}"
    return str(row.get("name") or lane or "event")


def build_moments(rows: list[dict], frames: list[dict], host_events: list[dict]) -> list[dict]:
    """A small seek index; raw lanes remain authoritative and complete."""
    moments: list[dict] = []

    def nearest_frame(t: float) -> str | None:
        if not frames:
            return None
        after = next((frame for frame in frames if float(frame.get("t", 0)) >= t), None)
        return str((after or frames[-1]).get("file"))

    for row in rows:
        lane = row.get("lane")
        level = row.get("level")
        interesting = False
        severity = "info"
        kind = str(row.get("name") or lane)
        if lane == "console" and level == "error":
            interesting, severity, kind = True, "error", "browser-error"
        elif lane == "network" and (level == "error" or int(row.get("status") or 0) >= 400):
            interesting, severity, kind = True, "error", "network-failure"
        elif lane == "workspace" and level == "error":
            interesting, severity, kind = True, "error", "workspace-failure"
        elif lane == "action":
            interesting, severity, kind = True, "error" if level == "error" else "info", "app-action"
        elif lane == "perf" and level == "warn":
            interesting, severity, kind = True, "warn", "performance-stall"
        elif lane == "menu" and row.get("open"):
            interesting, severity, kind = True, "info", "menu-opened"
        if not interesting:
            continue
        t = float(row.get("t") or 0)
        moments.append({
            "t": t,
            "severity": severity,
            "kind": kind,
            "lane": lane,
            "summary": _row_summary(row),
            "detail": row.get("detail"),
            "frame": nearest_frame(t),
        })

    for event in host_events:
        status = int(event.get("status") or 0)
        if status < 400 and event.get("level") != "error":
            continue
        t = float(event.get("t") or 0)
        moments.append({
            "t": t,
            "severity": "error",
            "kind": "host-error",
            "lane": "host",
            "summary": str(event.get("summary") or f"{event.get('method', '')} {event.get('path', '')} → {status}"),
            "frame": nearest_frame(t),
        })

    return sorted(moments, key=lambda item: (float(item["t"]), item["kind"]))[:500]


def _artifact(path: Path, root: Path, description: str, rows: int | None = None) -> dict:
    result = {
        "file": str(path.relative_to(root)),
        "bytes": path.stat().st_size,
        "description": description,
    }
    if rows is not None:
        result["rows"] = rows
    return result


def _script_json(value: object) -> str:
    """JSON safe inside a literal script block, including captured `</script>`."""
    return (
        json.dumps(value, ensure_ascii=False)
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def build_packet(
    header: dict,
    rows: list[dict],
    frames: list[dict],
    folder: Path,
    state_map: dict[str, str | None],
    *,
    moments: list[dict] | None = None,
    detail_counts: dict[str, int] | None = None,
) -> str:
    duration_s = float(header.get("durationMs") or 0) / 1000
    lanes: dict[str, int] = {}
    inputs: dict[str, int] = {}
    for row in rows:
        lane = str(row.get("lane"))
        lanes[lane] = lanes.get(lane, 0) + 1
        if lane == "input":
            name = str(row.get("name"))
            inputs[name] = inputs.get(name, 0) + 1
    transitions = [row for row in rows if row.get("lane") == "state"]
    console_rows = [row for row in rows if row.get("lane") == "console"]
    errors = [row for row in console_rows if row.get("level") == "error"]
    marks = [row for row in rows if row.get("lane") == "mark" and row.get("text") != "take started"]
    note = str(header.get("note") or "").strip()
    viewport = header.get("viewport") or {}
    mode_label = "the last %s s (retroactive)" % round(float(header.get("windowMs") or 0) / 1000) if header.get("mode") == "last" else "an explicit take"
    frames_source = header.get("framesSource", "none")
    frame_note = {
        "screencast": "Chrome screencast frames: what the window actually showed, UI chrome included, no mouse pointer (the input lane has it).",
        "canvas": "Canvas-only frames: tldraw's shape export at the start and end, no UI chrome — this page had no Chrome debugging port for a screencast.",
        "none": "No frames were captured for this recording; the text lanes carry the interaction.",
    }[frames_source if frames_source in ("screencast", "canvas") else "none"]
    moments = moments or []
    detail_counts = detail_counts or {}

    lines: list[str] = []
    lines.append(f"SystemSketch interaction recording — {header.get('startedAt')} · {duration_s:.1f} s · {mode_label}")
    lines.append(f"channel {header.get('channel', 'unknown')} · build {header.get('build', 'unknown')} · {header.get('url', '')}")
    lines.append(
        f"viewport {viewport.get('w', '?')}×{viewport.get('h', '?')} @{header.get('devicePixelRatio', '?')}x · "
        f"state path {header.get('pathAtStart')} → {header.get('pathAtEnd')} · {header.get('shapeCount', '?')} shapes at the end"
    )
    lines.append("")
    if note:
        lines.append("Note from the person recording:")
        lines.append(f"  {note}")
    if marks:
        if not note:
            lines.append("Marks during the recording:")
        for mark in marks:
            lines.append(f"  +{_seconds(mark.get('t'))}s  ✎ {mark.get('text')}")
    if note or marks:
        lines.append("")
    if errors:
        lines.append(f"Errors during the window ({len(errors)}):")
        for row in errors[:12]:
            lines.append(f"  +{_seconds(row.get('t'))}s  {' '.join(str(argument) for argument in row.get('args', []))[:200]}")
        lines.append("")
    if moments:
        lines.append(f"Indexed moments ({len(moments)}; the first {min(8, len(moments))}):")
        for moment in moments[:8]:
            lines.append(
                f"  +{_seconds(moment.get('t')):>7}s  {str(moment.get('severity', 'info')).upper():<5} "
                f"{moment.get('summary', moment.get('kind', 'event'))}"
            )
        if len(moments) > 8:
            lines.append(f"  … {len(moments) - 8} more in moments.json")
        lines.append("")
    lines.append(f"State-chart transitions ({len(transitions)}):")
    for row in transitions[:12]:
        lines.append(f"  +{_seconds(row.get('t')):>7}s  {row.get('from')}  →  {row.get('to')}   ({row.get('trigger')})")
    if len(transitions) > 12:
        lines.append(f"  … {len(transitions) - 12} more in timeline.jsonl")
    lines.append("")
    lines.append(
        f"Totals: {lanes.get('input', 0)} input events ({inputs.get('pointer_move', 0)} moves, {inputs.get('pointer_down', 0)} presses, "
        f"{inputs.get('key_down', 0)} key downs) · {lanes.get('dom', 0)} DOM events · {lanes.get('store', 0)} store diffs · "
        f"{lanes.get('menu', 0)} menu changes · {len(console_rows)} console rows · {len(frames)} frames"
    )
    lines.append(
        f"Deep lanes: {lanes.get('action', 0)} app actions · {lanes.get('workspace', 0)} workspace events · "
        f"{lanes.get('network', 0)} network events · {lanes.get('perf', 0)} performance events · "
        f"{detail_counts.get('store', 0)} lossless store diffs"
    )
    lines.append("")
    if state_map:
        lines.append("States seen, and the file that defines each:")
        for state, source in state_map.items():
            lines.append(f"  {state:<28} {source or '(not found — a tldraw core state or a typo in the map)'}")
        lines.append("")
    lines.append("Read these files, in this order:")
    lines.append(f"1. {folder / 'README.md'}  — this summary")
    lines.append(f"2. {folder / 'manifest.json'}  — artifact index, counts, sizes, capture health, and privacy boundaries")
    lines.append(f"3. {folder / 'moments.json'}  — errors, stalls, app actions, and menu moments already paired with the nearest frame")
    lines.append(
        f"4. {folder / 'timeline.jsonl'}  — the compact causal index, one JSON object per line. `t` is ms since the start. Lanes: input (what tldraw's "
        "state chart received), dom (raw key, pointer, and click events on the window, with the UI element hit), state (state-chart path changes), "
        "menu (open menus), store (compact add/update/remove summaries), console, action, workspace, network, perf, ui, and mark."
    )
    if frames:
        first = frames[1] if len(frames) > 1 else frames[0]
        lines.append(
            f"5. {folder / 'frames'}/  — {len(frames)} event-aware screenshots named by ms since the start ({first.get('file', '').split('/')[-1]} = +{_seconds(first.get('t'))} s). "
            "Use the frame named by moments.json, or open the first frame with a larger t. " + frame_note
        )
    else:
        lines.append(f"5. (no frames) — {frame_note}")
    lines.append(
        f"6. {folder / 'store.full.jsonl'}  — complete added, removed, and before/after updated records; "
        "timeline store rows point here by `detail` id"
    )
    lines.append(
        f"7. {folder / 'start.snapshot.json'}  — the tldraw store (document + session records) at t=0; "
        f"{folder / 'end.snapshot.json'} is the store at save time. `editor.store.loadStoreSnapshot(start)` then replaying `store.full.jsonl` reproduces every document instant."
    )
    lines.append(
        f"8. {folder / 'workspace.jsonl'}, network.jsonl, ui-hits.jsonl, performance.jsonl, browser-errors.jsonl, actions.jsonl, host.jsonl "
        "— detailed lanes; open only when the compact index points there"
    )
    lines.append(f"9. {folder / 'playback.html'}  — open in a browser: slow frames, fast lanes, one scrubber; #t=<ms> deep-links a moment.")
    lines.append("")
    lines.append(f"Recorder cost inside the page: {header.get('recorderCostMs', '?')} ms over {_seconds(header.get('recorderUptimeMs'))} s of uptime.")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# The viewer
# --------------------------------------------------------------------------- #

PLAYBACK_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
  :root{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--blue:#315be8;--red:#c4392c}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{width:min(1400px,calc(100% - 24px));margin:auto;padding:18px 0 40px}
  h1{margin:0 0 4px;font-size:20px;letter-spacing:-.02em}
  .meta{margin:0 0 12px;color:var(--muted);font-size:12.5px}
  .meta code{background:#eceff2;padding:.1em .3em;border-radius:4px;font:12px ui-monospace,monospace}
  .viewer{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px}
  @media(max-width:900px){.viewer{grid-template-columns:1fr}}
  .screen{position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#eee;aspect-ratio:__ASPECT__}
  .screen img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}
  .screen .empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px}
  .screen .empty[hidden]{display:none}
  .cursor{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;background:var(--blue);box-shadow:0 0 0 3px #315be866;pointer-events:none;transition:left .05s,top .05s}
  .cursor.down{background:var(--red);box-shadow:0 0 0 6px #c4392c55}
  .log{height:100%;max-height:62vh;overflow:auto;border:1px solid var(--line);border-radius:8px;background:#0f1216;padding:8px 10px;font:11.5px/1.55 ui-monospace,monospace;color:#cfd7e6}
  .log div{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
  .log div[data-detail]{cursor:pointer}
  .log div[data-detail]:hover{background:#ffffff18}
  .log div.now{background:#ffffff14}
  .log .t{color:#7d8794;display:inline-block;width:66px}
  .log .lane{display:inline-block;width:78px;font-weight:700}
  .controls{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font:12.5px ui-monospace,monospace}
  .controls input[type=range]{flex:1;min-width:200px}
  .controls button{padding:5px 11px;border:1px solid var(--line);border-radius:7px;background:#fafbfc;font:700 12px ui-monospace,monospace;cursor:pointer}
  .lanes{display:flex;flex-wrap:wrap;gap:6px}
  .lanes label{display:inline-flex;gap:4px;align-items:center;padding:2px 8px;border:1px solid var(--line);border-radius:999px;font:700 11px ui-monospace,monospace;cursor:pointer}
  .frames{display:flex;gap:4px;overflow-x:auto;grid-column:1/-1;padding-top:4px}
  .frames img{height:54px;border:2px solid transparent;border-radius:4px;cursor:pointer}
  .frames img.on{border-color:var(--blue)}
  .detail{grid-column:1/-1;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#fbfcfd}
  .detail summary{cursor:pointer;font-weight:700}
  .detail pre{max-height:280px;overflow:auto;border:0;padding:8px 0 0;background:transparent}
  pre{margin:14px 0 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap}
</style>
</head>
<body><main>
<h1>__TITLE__</h1>
<p class="meta">__META__</p>
<div class="viewer">
  <div class="screen" id="screen"><img id="frame" alt="recorded frame"><div class="empty" id="empty" hidden>no frame yet</div><div class="cursor" id="cursor"></div></div>
  <div class="log" id="log"></div>
  <div class="controls">
    <button id="play">▶ play</button>
    <input type="range" id="scrub" min="0" max="__DUR__" value="0" step="10">
    <span id="tlabel" style="min-width:80px">0 ms</span>
    <span class="lanes" id="lanes"></span>
  </div>
  <div class="frames" id="strip"></div>
  <details class="detail" id="detail"><summary>Selected event detail</summary><pre id="detailpane">Click a highlighted timeline row to inspect its full detail.</pre></details>
</div>
<pre id="packet">__PACKET__</pre>
<script>
(() => {
  const frames = __FRAMES__;
  const rows = __ROWS__;
  const details = __DETAILS__;
  const detailById = new Map(details.map((detail) => [detail.id, detail]));
  const dur = __DUR__;
  const FW = __FW__, FH = __FH__;
  const colours = { input: '#7aa2ff', dom: '#9fd0ff', state: '#75d39b', store: '#c39bff', menu: '#f2b46b', console: '#f28b7d', mark: '#ff9ad5', network: '#f0c96f', workspace: '#60d4c2', action: '#8fb8ff', perf: '#ff9e64', ui: '#b7c6d9' };
  const img = document.getElementById('frame'), empty = document.getElementById('empty'), cursor = document.getElementById('cursor');
  const log = document.getElementById('log'), scrub = document.getElementById('scrub'), tlabel = document.getElementById('tlabel');
  const screen = document.getElementById('screen'), play = document.getElementById('play'), strip = document.getElementById('strip'), lanesBox = document.getElementById('lanes');
  const detailBox = document.getElementById('detail'), detailPane = document.getElementById('detailpane');
  const hidden = new Set(['input', 'dom', 'store', 'ui']);
  for (const lane of Object.keys(colours)) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" ${hidden.has(lane) ? '' : 'checked'} data-lane="${lane}"><span style="color:${colours[lane]}">${lane}</span>`;
    label.querySelector('input').addEventListener('change', (e) => { e.target.checked ? hidden.delete(lane) : hidden.add(lane); rebuild(+scrub.value); });
    lanesBox.appendChild(label);
  }
  frames.forEach((f, i) => { const th = document.createElement('img'); th.src = f.file; th.title = '+' + (f.t / 1000).toFixed(2) + ' s'; th.addEventListener('click', () => { pause(); scrub.value = f.t; seek(f.t); }); strip.appendChild(th); f.el = th; });
  const text = (r) => {
    if (r.lane === 'input') return r.name + (r.screen ? ' ' + JSON.stringify(r.screen) : '') + (r.key ? ' ' + r.key : '') + (r.shape ? ' on ' + r.shape.type : '') + (r.target ? ' @' + r.target : '');
    if (r.lane === 'dom') return r.event + (r.key ? ' ' + r.key : '') + (r.screen ? ' ' + JSON.stringify(r.screen) : '') + ' on ' + (r.on || '');
    if (r.lane === 'state') return r.from + ' → ' + r.to + '  (' + r.trigger + ')';
    if (r.lane === 'store') return (r.ops || []).map((o) => o.op + ' ' + o.type + (o.delta ? ' ' + JSON.stringify(Object.keys(o.delta)) : '')).join(', ');
    if (r.lane === 'menu') return 'open: ' + ((r.open || []).join(', ') || '(none)');
    if (r.lane === 'mark') return '✎ ' + r.text;
    if (r.lane === 'console') return r.level + ': ' + (r.args || []).join(' ');
    if (r.summary) return r.summary;
    return JSON.stringify(r);
  };
  let shown = -1, rendered = 0, lines = [], pointerDown = false;
  function rebuild(t) { log.innerHTML = ''; rendered = 0; lines = []; shown = -1; pointerDown = false; render(t); }
  function render(t) {
    let fi = -1;
    for (let i = 0; i < frames.length; i++) if (frames[i].t <= t) fi = i;
    if (fi !== shown) {
      shown = fi;
      if (fi >= 0) { img.src = frames[fi].file; img.hidden = false; empty.hidden = true; } else { img.removeAttribute('src'); empty.hidden = false; }
      frames.forEach((f, i) => f.el.classList.toggle('on', i === fi));
      if (fi >= 0) frames[fi].el.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
    while (rendered < rows.length && rows[rendered].t <= t) {
      const r = rows[rendered];
      const eventName = r.name || r.event || '';
      if (/pointer_down|pointerdown/.test(eventName)) pointerDown = true;
      if (/pointer_up|pointerup|pointercancel|cancel/.test(eventName)) pointerDown = false;
      if (!hidden.has(r.lane)) {
        const div = document.createElement('div');
        div.innerHTML = `<span class="t">+${(r.t / 1000).toFixed(2)}s</span><span class="lane" style="color:${colours[r.lane] || '#fff'}">${r.lane}</span>${text(r).replace(/</g, '&lt;')}`;
        if (r.detail && detailById.has(r.detail)) {
          div.dataset.detail = r.detail;
          div.title = 'Click for full detail';
          div.addEventListener('click', () => {
            detailPane.textContent = JSON.stringify(detailById.get(r.detail), null, 2);
            detailBox.open = true;
          });
        }
        log.appendChild(div); lines.push(div);
      }
      rendered++;
    }
    let last = null;
    for (let i = rendered - 1; i >= 0; i--) { const r = rows[i]; if ((r.lane === 'input' || r.lane === 'dom') && r.screen) { last = r; break; } }
    if (last) {
      const rect = screen.getBoundingClientRect();
      const scale = Math.min(rect.width / FW, rect.height / FH);
      const ox = (rect.width - FW * scale) / 2, oy = (rect.height - FH * scale) / 2;
      cursor.style.left = (ox + last.screen[0] * scale) + 'px'; cursor.style.top = (oy + last.screen[1] * scale) + 'px';
      cursor.classList.toggle('down', pointerDown);
    }
    log.scrollTop = log.scrollHeight;
    tlabel.textContent = Math.round(t) + ' ms';
  }
  function seek(t) { if (t < (rows[rendered - 1]?.t ?? -1)) rebuild(t); else render(t); }
  let playing = false, startedAt = 0, startT = 0;
  function pause() { playing = false; play.textContent = '▶ play'; }
  function tick(now) { if (!playing) return; const t = Math.min(dur, startT + (now - startedAt)); scrub.value = t; seek(t); if (t >= dur) { pause(); play.textContent = '▶ replay'; return; } requestAnimationFrame(tick); }
  play.addEventListener('click', () => { if (playing) return pause(); startT = +scrub.value >= dur ? 0 : +scrub.value; startedAt = performance.now(); playing = true; play.textContent = '❚❚ pause'; requestAnimationFrame(tick); });
  scrub.addEventListener('input', () => { pause(); seek(+scrub.value); });
  const wanted = Number((location.hash.match(/t=(\\d+)/) || [])[1]);
  const start = Number.isFinite(wanted) && wanted > 0 ? Math.min(dur, wanted) : 0;
  scrub.value = start; seek(start);
})();
</script>
</main></body>
</html>
"""


def playback_html(header: dict, rows: list[dict], frames: list[dict], details: list[dict], packet: str) -> str:
    viewport = header.get("viewport") or {}
    width = int(viewport.get("w") or 1440)
    height = int(viewport.get("h") or 960)
    title = f"Recording {header.get('startedAt', '')} · {header.get('channel', '')}"
    meta = (
        f"{_seconds(header.get('durationMs'))} s · {len(rows)} rows · {len(frames)} frames ({header.get('framesSource', 'none')}) · "
        f"{header.get('pathAtStart')} → {header.get('pathAtEnd')} · <code>{html.escape(str(header.get('url', '')))}</code>"
    )
    slim_frames = [{"t": frame["t"], "file": frame["file"]} for frame in frames]
    page = PLAYBACK_TEMPLATE
    for slot, value in {
        "__TITLE__": html.escape(title),
        "__META__": meta,
        "__ASPECT__": f"{width}/{height}",
        "__DUR__": str(int(float(header.get("durationMs") or 0))),
        "__FW__": str(width),
        "__FH__": str(height),
        "__FRAMES__": _script_json(slim_frames),
        "__ROWS__": _script_json(rows),
        "__DETAILS__": _script_json(details),
        "__PACKET__": html.escape(packet),
    }.items():
        page = page.replace(slot, value)
    return page


# --------------------------------------------------------------------------- #
# Writing and listing
# --------------------------------------------------------------------------- #

def _unique_destination(root: Path, stamp: str) -> Path:
    destination = root / stamp
    counter = 2
    while destination.exists():
        destination = root / f"{stamp}-{counter}"
        counter += 1
    return destination


def write_recording(
    payload: dict,
    files_root: Path,
    *,
    source_root: Path,
    channel: str,
    build: str,
    version: str,
    frame_dump=None,
    host_events: list[dict] | None = None,
    build_identity: dict | None = None,
) -> dict:
    """Write one recording folder. `frame_dump(frames_dir, header)` may add screencast frames."""
    header = dict(_require(payload, "header", dict))
    rows = _require(payload, "rows", list)
    details = payload.get("details", [])
    store_diffs = payload.get("storeDiffs", [])
    start_snapshot = _require(payload, "startSnapshot", dict)
    end_snapshot = _require(payload, "endSnapshot", dict)
    if len(rows) > MAX_ROWS:
        raise RecordingError(f"recording holds {len(rows)} rows; the cap is {MAX_ROWS}")
    rows = [row for row in rows if isinstance(row, dict)]
    if not isinstance(details, list) or len(details) > MAX_DETAILS:
        raise RecordingError(f"recording details must be a list capped at {MAX_DETAILS}")
    if not isinstance(store_diffs, list) or len(store_diffs) > MAX_STORE_DIFFS:
        raise RecordingError(f"recording store diffs must be a list capped at {MAX_STORE_DIFFS}")
    details = [item for item in details if isinstance(item, dict)]
    store_diffs = [item for item in store_diffs if isinstance(item, dict)]
    host_events = [item for item in (host_events or []) if isinstance(item, dict)]

    root = recordings_dir(files_root)
    root.mkdir(parents=True, exist_ok=True)
    stamp = recording_stamp(header)
    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=root))
    try:
        frames_dir = staging / "frames"
        frames_dir.mkdir()
        frames: list[dict] = []
        frames_source = "none"
        frame_dump_result: dict = {}
        if frame_dump is not None:
            positional = [
                parameter for parameter in inspect.signature(frame_dump).parameters.values()
                if parameter.kind in (parameter.POSITIONAL_ONLY, parameter.POSITIONAL_OR_KEYWORD)
            ]
            dumped = frame_dump(frames_dir, header, rows) if len(positional) >= 3 else frame_dump(frames_dir, header)
            if isinstance(dumped, dict) and dumped.get("frames"):
                frame_dump_result = {key: value for key, value in dumped.items() if key != "frames"}
                frames = [dict(frame) for frame in dumped["frames"]]
                frames_source = "screencast"
            elif isinstance(dumped, dict):
                frame_dump_result = {key: value for key, value in dumped.items() if key != "frames"}
        canvas_frames = payload.get("canvasFrames")
        if not frames and isinstance(canvas_frames, list):
            import base64

            for frame in canvas_frames:
                if not isinstance(frame, dict) or not isinstance(frame.get("png"), str):
                    continue
                t = int(float(frame.get("t") or 0))
                name = f"f-{t:06d}.png"
                content = base64.b64decode(frame["png"])
                (frames_dir / name).write_bytes(content)
                frames.append({"t": t, "bytes": len(content), "file": f"frames/{name}"})
            if frames:
                frames_source = "canvas"
        frames.sort(key=lambda frame: frame["t"])

        frame_gaps = [
            float(current.get("t", 0)) - float(previous.get("t", 0))
            for previous, current in zip(frames, frames[1:])
        ]
        capture_health = {
            **frame_dump_result,
            "source": frames_source,
            "framesKept": len(frames),
            "largestKeptGapMs": round(max(frame_gaps), 1) if frame_gaps else None,
            "durationMs": header.get("durationMs"),
        }

        header.update({
            "channel": channel,
            "build": build,
            "version": version,
            "framesSource": frames_source,
            "frames": len(frames),
            "savedAt": datetime.now(UTC).isoformat(),
            "buildIdentity": build_identity or {},
            "detailCounts": {
                "details": len(details),
                "store": len(store_diffs),
                "host": len(host_events),
            },
        })
        state_map = state_sources(rows, source_root)
        destination = _unique_destination(root, stamp)
        moments = build_moments(rows, frames, host_events)
        packet = build_packet(
            header,
            rows,
            frames,
            destination,
            state_map,
            moments=moments,
            detail_counts=header["detailCounts"],
        )

        _text(staging / "header.json", json.dumps(header, ensure_ascii=False, indent=2) + "\n")
        _text(staging / "timeline.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
        # Change 3 (module docstring): the COMPLETE detail list, so an in-app
        # viewer reading this folder back sees exactly what `playback.html`
        # was handed. The per-lane files below remain the donor's subset.
        _text(staging / "details.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in details))
        _text(staging / "store.full.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in store_diffs))
        _text(staging / "start.snapshot.json", json.dumps(start_snapshot, ensure_ascii=False))
        _text(staging / "end.snapshot.json", json.dumps(end_snapshot, ensure_ascii=False))
        _text(staging / "frames.jsonl", "".join(json.dumps(frame, ensure_ascii=False) + "\n" for frame in frames))
        _text(staging / "capture-health.json", json.dumps(capture_health, ensure_ascii=False, indent=2) + "\n")
        _text(staging / "moments.json", json.dumps(moments, ensure_ascii=False, indent=2) + "\n")
        _text(staging / "host.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in host_events))

        error_detail_ids = {
            row.get("detail") for row in rows
            if row.get("lane") == "console" and row.get("level") == "error" and row.get("detail")
        }
        detail_groups: dict[str, list[dict]] = {filename: [] for filename in DETAIL_FILES.values()}
        detail_groups["browser-errors.jsonl"] = []
        for detail in details:
            lane = str(detail.get("lane", ""))
            filename = DETAIL_FILES.get(lane)
            if lane == "dom" and detail.get("kind") == "ui-hit":
                filename = "ui-hits.jsonl"
            if filename:
                detail_groups[filename].append(detail)
            if detail.get("id") in error_detail_ids:
                detail_groups["browser-errors.jsonl"].append(detail)
        for filename, lane_details in detail_groups.items():
            _text(staging / filename, "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in lane_details))

        _text(staging / "states.json", json.dumps(state_map, ensure_ascii=False, indent=2) + "\n")
        _text(staging / "README.md", packet)
        _text(staging / "playback.html", playback_html(header, rows, frames, details, packet))

        artifact_descriptions = {
            "README.md": "compact handoff packet",
            "header.json": "recording and environment identity",
            "timeline.jsonl": "compact causal index on the recording clock",
            "details.jsonl": "every detail record, complete — what the viewer reads back",
            "moments.json": "high-signal seek index paired with frames",
            "store.full.jsonl": "lossless replay diffs with complete records",
            "start.snapshot.json": "store snapshot at recording start",
            "end.snapshot.json": "store snapshot at recording end",
            "frames.jsonl": "frame timestamps and capture reasons",
            "capture-health.json": "screencast target and frame-gap diagnostics",
            "states.json": "state-chart source map",
            "network.jsonl": "request timing and failures without bodies",
            "workspace.jsonl": "workspace and autosave lifecycle detail",
            "actions.jsonl": "semantic app command detail",
            "ui-hits.jsonl": "focus, target geometry, and hit-test stacks",
            "performance.jsonl": "long-task detail",
            "browser-errors.jsonl": "structured browser errors and stacks",
            "host.jsonl": "bounded local controller request log",
            "playback.html": "self-contained synchronized viewer",
        }
        row_counts = {
            "timeline.jsonl": len(rows),
            "details.jsonl": len(details),
            "moments.json": len(moments),
            "store.full.jsonl": len(store_diffs),
            "frames.jsonl": len(frames),
            "host.jsonl": len(host_events),
            **{filename: len(values) for filename, values in detail_groups.items()},
        }
        artifacts = [
            _artifact(path, staging, artifact_descriptions[path.name], row_counts.get(path.name))
            for path in sorted(staging.iterdir())
            if path.is_file() and path.name in artifact_descriptions
        ]
        manifest = {
            "format": "systemsketch-recording-v2",
            "clock": "milliseconds since header.startedAtWall",
            "durationMs": header.get("durationMs"),
            "moments": len(moments),
            "captureHealth": capture_health,
            "privacy": {
                "networkBodies": "not captured",
                "clipboardContents": "not captured",
                "textInput": "event lengths only; key names remain in the input lane",
                "passwordValues": "not captured",
            },
            "artifacts": artifacts,
        }
        _text(staging / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        os.replace(staging, destination)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    removed = prune_recordings(root, KEEP_LAST_RECORDINGS)
    return {
        "path": str(destination),
        "packet": packet,
        "savedAt": header["savedAt"],
        "frames": len(frames),
        "framesSource": frames_source,
        "pruned": removed,
    }


def _recording_dirs(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(
        (path for path in root.iterdir() if path.is_dir() and not path.name.startswith(".") and (path / "header.json").is_file()),
        key=lambda path: path.name,
    )


def prune_recordings(root: Path, keep: int) -> list[str]:
    """Keep the newest `keep` recordings; the folder is a buffer, not an archive."""
    removed: list[str] = []
    dirs = _recording_dirs(root)
    for path in dirs[: max(0, len(dirs) - keep)]:
        shutil.rmtree(path, ignore_errors=True)
        removed.append(str(path))
    return removed


def last_recording(files_root: Path) -> dict | None:
    dirs = _recording_dirs(recordings_dir(files_root))
    for path in reversed(dirs):
        readme = path / "README.md"
        if not readme.is_file():
            continue
        try:
            header = json.loads((path / "header.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            header = {}
        return {
            "path": str(path),
            "packet": readme.read_text(encoding="utf-8"),
            "savedAt": header.get("savedAt"),
            "frames": header.get("frames", 0),
            "framesSource": header.get("framesSource", "none"),
        }
    return None


# --------------------------------------------------------------------------- #
# The frame sidecar, seen from the host
# --------------------------------------------------------------------------- #

class FrameSidecar:
    """Owns `recorder_frames.mjs`: one Node process per host, started lazily.

    The protocol is one JSON object per line each way. The sidecar attaches to
    every page of the channel's Chrome over its debugging port, keeps a ring of
    screencast frames per page while armed, and writes the slice a save asks
    for straight into the recording's staging folder.
    """

    def __init__(self, script: Path, *, cdp_port: int | None, window_ms: int = 60_000, node: str | None = None):
        self.script = script
        self.cdp_port = cdp_port
        self.window_ms = window_ms
        self.node = node or shutil.which("node")
        self.url_prefix: str | None = None
        self.process: subprocess.Popen | None = None
        self.armed = False
        self._lock = threading.Lock()
        self._sequence = 0

    def availability(self) -> tuple[bool, str]:
        if self.cdp_port is None:
            return False, "this channel's Chrome was started without a debugging port; relaunch it to get screencast frames"
        if not self.node or not (Path(self.node).is_file() or shutil.which(self.node)):
            return False, "node is not installed, so the screencast sidecar cannot run"
        if not self.script.is_file():
            return False, f"{self.script.name} is missing beside the host"
        return True, "Chrome screencast over the debugging port"

    def _alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def _start(self) -> None:
        assert self.node and self.url_prefix
        self.process = subprocess.Popen(
            [
                self.node,
                str(self.script),
                "--cdp-port", str(self.cdp_port),
                "--url-prefix", self.url_prefix,
                "--window-ms", str(self.window_ms),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            close_fds=True,
        )

    def _request(self, message: dict, timeout: float = 20.0) -> dict:
        with self._lock:
            if not self._alive():
                self._start()
            assert self.process and self.process.stdin and self.process.stdout
            self._sequence += 1
            message = {"id": self._sequence, **message}
            self.process.stdin.write(json.dumps(message) + "\n")
            self.process.stdin.flush()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                line = self.process.stdout.readline()
                if not line:
                    raise RecordingError("the screencast sidecar exited")
                try:
                    reply = json.loads(line)
                except ValueError:
                    continue
                if reply.get("id") == message["id"]:
                    return reply
            raise RecordingError("the screencast sidecar did not answer in time")

    def arm(self, enabled: bool, page_url: str) -> dict:
        ok, reason = self.availability()
        if not ok:
            return {"screencast": False, "reason": reason}
        prefix = page_url.split("?", 1)[0]
        origin_end = prefix.find("/", prefix.find("//") + 2)
        self.url_prefix = prefix[: origin_end + 1] if origin_end > 0 else prefix
        if not enabled and not self._alive():
            self.armed = False
            return {"screencast": True, "reason": reason, "armed": False}
        try:
            reply = self._request({"op": "arm", "enabled": enabled})
        except (RecordingError, OSError) as cause:
            return {"screencast": False, "reason": f"screencast sidecar failed: {cause}"}
        self.armed = enabled
        if not reply.get("ok"):
            return {"screencast": False, "reason": str(reply.get("error", "sidecar refused to arm"))}
        return {"screencast": True, "reason": reason, "armed": enabled, "targets": reply.get("targets", 0)}

    def status(self) -> dict:
        ok, reason = self.availability()
        payload = {"screencast": ok, "reason": reason, "armed": self.armed}
        if ok and self._alive():
            try:
                payload["sidecar"] = self._request({"op": "status"}, timeout=5.0)
            except (RecordingError, OSError) as cause:
                payload["sidecar"] = {"error": str(cause)}
        return payload

    def dump(
        self,
        frames_dir: Path,
        header: dict,
        rows: list[dict] | None = None,
        *,
        keep_gap_ms: int = KEEP_FRAME_GAP_MS,
    ) -> dict | None:
        ok, _reason = self.availability()
        if not ok or not self._alive() or not self.armed:
            return None
        key_times = []
        started = float(header.get("startedAtWall") or 0)
        for row in rows or []:
            lane = row.get("lane")
            important = (
                lane == "state"
                or lane in {"action", "workspace"}
                or (lane == "console" and row.get("level") == "error")
                or (lane == "network" and row.get("level") == "error")
                or (lane == "dom" and row.get("event") in {"pointerdown", "click", "keydown"})
            )
            if important:
                key_times.append(started + float(row.get("t") or 0))
        try:
            reply = self._request({
                "op": "dump",
                "dir": str(frames_dir),
                "fromWall": header.get("startedAtWall"),
                "toWall": header.get("endedAtWall"),
                "keepGapMs": keep_gap_ms,
                "url": header.get("url", ""),
                "keyWalls": key_times,
            }, timeout=30.0)
        except (RecordingError, OSError):
            return None
        return reply if reply.get("ok") else None

    def stop(self) -> None:
        with self._lock:
            if self.process is not None and self.process.poll() is None:
                try:
                    if self.process.stdin:
                        self.process.stdin.close()
                    self.process.wait(timeout=3)
                except (OSError, subprocess.TimeoutExpired):
                    self.process.kill()
            self.process = None
            self.armed = False


# --------------------------------------------------------------------------- #
# Reading one back, for the in-app viewer
# --------------------------------------------------------------------------- #
#
# NEW (change 4 in the module docstring). The archive never needed this: its
# viewer was `playback.html`, a page this module WROTE into the folder, with
# the frames, rows and details already interpolated into it
# (`playback_html`, above). Zach, 2026-09-19: "that should open the viewer in
# a modal in the app. I feel you already designed that somewhere it was cool
# it showed the screen shots and the event trace, etc.."
#
# A modal has no folder to sit in, so the same four inputs travel over one
# route instead. The shapes are the written page's own variables, unrenamed —
# `__FRAMES__`, `__ROWS__`, `__DETAILS__` and the packet — so the React viewer
# (apps/storybook-basics/src/components/recordingViewer.tsx) is reproducing a
# design rather than inventing one.

VIEWER_MAX_FRAMES = 120
VIEWER_MAX_FRAME_BYTES = 24 * 1024 * 1024
VIEWER_MAX_ROWS = 20_000
VIEWER_MAX_DETAILS = 4_000

FRAME_MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _read_jsonl(path: Path, limit: int) -> tuple[list[dict], bool]:
    """Up to `limit` objects from a JSONL file. Returns (rows, truncated)."""
    rows: list[dict] = []
    truncated = False
    if not path.is_file():
        return rows, truncated
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            if len(rows) >= limit:
                truncated = True
                break
            try:
                value = json.loads(line)
            except ValueError:
                continue
            if isinstance(value, dict):
                rows.append(value)
    return rows, truncated


def resolve_recording(files_root: Path, raw_path: object = None) -> Path | None:
    """The folder a bundle request names, fenced inside the recordings root.

    WHY the fence and not a bare `Path(raw_path)`: this value arrives from a
    query string. `systemsketch_files.py` learned the same lesson the hard way
    (its `_refuse_state_change` docstring records a judge finding where an
    unfenced route could overwrite one of Zach's boards). Reading is milder
    than writing, but an unfenced read here would turn a recordings viewer
    into "print me any file on this machine, base64-encoded".
    """
    root = recordings_dir(files_root)
    if raw_path is None or raw_path == "":
        directories = _recording_dirs(root)
        return directories[-1] if directories else None
    if not isinstance(raw_path, str):
        raise RecordingError("recording path must be a string")
    candidate = Path(raw_path).expanduser()
    resolved = (candidate if candidate.is_absolute() else root / candidate).resolve()
    fence = root.resolve()
    if resolved != fence and fence not in resolved.parents:
        raise RecordingError(f"recording path must stay under {fence}")
    return resolved if (resolved / "header.json").is_file() else None


def read_recording_bundle(
    files_root: Path,
    raw_path: object = None,
    *,
    max_frames: int = VIEWER_MAX_FRAMES,
    max_frame_bytes: int = VIEWER_MAX_FRAME_BYTES,
    max_rows: int = VIEWER_MAX_ROWS,
    max_details: int = VIEWER_MAX_DETAILS,
) -> dict | None:
    """One recording, shaped for the in-app player. None when there is none.

    Frames come back as `data:` URLs on the written page's own `{t, file}`
    shape, because the modal has nowhere to resolve a relative path against.
    Everything is bounded: a one-minute screencast is hundreds of JPEGs and a
    busy take is tens of thousands of rows, and this answer crosses a socket
    into one JSON object. `truncated` says so out loud rather than quietly
    showing a shorter recording than the one on disk.
    """
    import base64

    folder = resolve_recording(files_root, raw_path)
    if folder is None:
        return None
    try:
        header = json.loads((folder / "header.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(header, dict):
        return None

    rows, rows_truncated = _read_jsonl(folder / "timeline.jsonl", max_rows)
    details, details_truncated = _read_jsonl(folder / "details.jsonl", max_details)
    if not details:
        # A folder written before `details.jsonl` existed (change 3): fall back
        # to the per-lane files, which are a subset but better than nothing.
        seen: set[str] = set()
        for filename in (*sorted(DETAIL_FILES.values()), "browser-errors.jsonl"):
            lane_details, lane_truncated = _read_jsonl(folder / filename, max_details - len(details))
            details_truncated = details_truncated or lane_truncated
            for detail in lane_details:
                identity = str(detail.get("id", ""))
                if identity and identity in seen:
                    continue
                seen.add(identity)
                details.append(detail)
        details.sort(key=lambda detail: float(detail.get("t") or 0))

    frame_rows, frames_truncated = _read_jsonl(folder / "frames.jsonl", max_frames)
    frames: list[dict] = []
    budget = max_frame_bytes
    for frame in frame_rows:
        relative = str(frame.get("file", ""))
        if not relative:
            continue
        source = (folder / relative).resolve()
        if folder.resolve() not in source.parents or not source.is_file():
            continue
        size = source.stat().st_size
        if size > budget:
            frames_truncated = True
            break
        budget -= size
        media = FRAME_MEDIA_TYPES.get(source.suffix.lower(), "application/octet-stream")
        encoded = base64.b64encode(source.read_bytes()).decode("ascii")
        frames.append({"t": int(float(frame.get("t") or 0)), "file": f"data:{media};base64,{encoded}", "bytes": size})

    readme = folder / "README.md"
    return {
        "path": str(folder),
        "header": header,
        "rows": rows,
        "details": details,
        "frames": frames,
        "packet": readme.read_text(encoding="utf-8") if readme.is_file() else "",
        "truncated": bool(rows_truncated or details_truncated or frames_truncated),
    }


# --------------------------------------------------------------------------- #
# The routes, mountable in any handler
# --------------------------------------------------------------------------- #

class RecordingApi:
    """The ``/api/recordings*`` routes over one files root.

    NEW shape, PORTED behaviour. The archive answered these inside one
    monolithic handler (``/home/bam/systemsketch/scripts/server.py``: GET
    :521-527, the POST route set :599-600, the POST branches :641-645, and
    ``SystemSketchServer.save_recording`` :808-826). This repo's convention is
    a mixin-free object a host delegates to, exactly like
    ``systemsketch_files.py``'s ``WorkspaceApi`` — so the same code serves the
    dock's server, a vite dev proxy and the tests.

    GET  /api/recordings/last            → {"recording": last_recording(...) | null}
    GET  /api/recordings/status          → the frame sidecar's availability
    GET  /api/recordings/bundle[?path=]  → {"recording": read_recording_bundle(...) | null}
    POST /api/recordings/arm   {enabled, url} → arm or disarm the sidecar
    POST /api/recordings       <buffer>       → write_recording(...)

    ``last`` and ``bundle`` answer 200 with ``null`` rather than 404 when
    nothing has been saved. That is the donor's own decision, and its comment
    is the reason (server.py:522-524): "'Nothing saved yet' is an answer, not
    an error: a 404 here would print a console error on every mount, into the
    very lane the recorder captures."
    """

    _GET_ROUTES = frozenset({"/api/recordings/last", "/api/recordings/status", "/api/recordings/bundle"})
    _POST_ROUTES = frozenset({"/api/recordings", "/api/recordings/arm"})

    def __init__(
        self,
        files_root: Path,
        *,
        source_root: Path,
        channel: str = "dev",
        build: str = "dev",
        version: str = "",
        frames: "FrameSidecar | None" = None,
        host_events: object = None,
        cors_loopback: bool = False,
    ):
        self.files_root = files_root
        self.source_root = source_root
        self.channel = channel
        self.build = build
        self.version = version
        self.frames = frames
        self.host_events = host_events
        self.cors_loopback = cors_loopback

    # -- plumbing, ported from systemsketch_files.WorkspaceApi ---------------
    def _json(self, handler, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(content)))
        handler.send_header("Cache-Control", "no-store")
        if self.cors_loopback:
            origin = _loopback_origin(handler.headers.get("Origin"))
            if origin is not None:
                handler.send_header("Access-Control-Allow-Origin", origin)
        handler.end_headers()
        handler.wfile.write(content)

    def _refuse_state_change(self, handler) -> str | None:
        """Why this POST must not run, or None to let it.

        PORTED from ``systemsketch_files.py``'s ``WorkspaceApi.
        _refuse_state_change`` — read that docstring for the judge finding
        that produced it. It matters less here (the worst a forged POST can do
        is write a junk recording folder), but a saved recording carries a
        full store snapshot of whatever board is open, so letting an arbitrary
        page on another localhost port trigger one is an exfiltration route,
        not just noise.
        """
        origin = handler.headers.get("Origin")
        if origin is None:
            return None
        host = handler.headers.get("Host")
        if host and origin.split("//", 1)[-1] == host:
            return None
        if self.cors_loopback and _loopback_origin(origin) is not None:
            return None
        return "this request did not come from the SystemSketch page"

    # -- the routes ----------------------------------------------------------
    def handle_get(self, handler) -> bool:
        parsed = urlparse(handler.path)
        path = parsed.path
        if path not in self._GET_ROUTES:
            return False
        if path == "/api/recordings/last":
            self._json(handler, {"recording": last_recording(self.files_root)})
            return True
        if path == "/api/recordings/status":
            self._json(handler, self.frames.status() if self.frames else _NO_SIDECAR)
            return True
        # /api/recordings/bundle
        values = parse_qs(parsed.query).get("path", [])
        try:
            requested = values[0] if len(values) == 1 else None
            self._json(handler, {"recording": read_recording_bundle(self.files_root, requested)})
        except RecordingError as cause:
            self._json(handler, {"error": str(cause)}, HTTPStatus.BAD_REQUEST)
        return True

    def handle_post(self, handler) -> bool:
        parsed = urlparse(handler.path)
        path = parsed.path
        if path not in self._POST_ROUTES:
            return False
        refusal = self._refuse_state_change(handler)
        if refusal is not None:
            self._json(handler, {"error": refusal}, HTTPStatus.FORBIDDEN)
            return True
        try:
            length = int(handler.headers.get("Content-Length", "0"))
            if length > MAX_API_REQUEST_BYTES:
                raise RecordingError("request is too large")
            payload = json.loads(handler.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("payload must be an object")
            if path == "/api/recordings/arm":
                if self.frames is None:
                    self._json(handler, _NO_SIDECAR)
                    return True
                self._json(handler, self.frames.arm(payload.get("enabled") is True, str(payload.get("url", ""))))
                return True
            self._json(handler, self.save_recording(payload))
            return True
        except (OSError, ValueError, RecordingError) as cause:
            self._json(handler, {"error": str(cause)}, HTTPStatus.CONFLICT)
            return True

    def save_recording(self, payload: dict) -> dict:
        """Ported: server.py:808-826 (``SystemSketchServer.save_recording``)."""
        header = payload.get("header") if isinstance(payload.get("header"), dict) else {}
        started_at_wall = float(header.get("startedAtWall") or 0)
        ended_at_wall = float(header.get("endedAtWall") or time.time() * 1000)
        events = None
        if self.host_events is not None and hasattr(self.host_events, "between"):
            events = self.host_events.between(started_at_wall, ended_at_wall)
        return write_recording(
            payload,
            self.files_root,
            source_root=self.source_root,
            channel=str(payload.get("channel") or self.channel),
            build=str(payload.get("build") or self.build),
            version=str(payload.get("version") or self.version),
            frame_dump=self.frames.dump if self.frames else None,
            host_events=events,
        )


_NO_SIDECAR = {"screencast": False, "reason": "this host was started without a screencast sidecar"}


def _loopback_origin(origin: object) -> str | None:
    """An http origin on the loopback interface, echoed back, else None.

    Ported from ``systemsketch_files.py``'s helper of the same name; restated
    rather than imported because that one is private to its module.
    """
    if not isinstance(origin, str) or not origin:
        return None
    parsed = urlparse(origin)
    if parsed.scheme != "http":
        return None
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        return None
    return origin
