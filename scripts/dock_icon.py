#!/usr/bin/env python3
"""The dock icons this repo owns, installed from the artwork they are drawn from.

  (default)             Install/refresh every icon in ICONS, then say what GTK resolves.
  --check               Exit 1 if any installed icon differs from its source. Writes nothing.
  --fit-installed NAME  Resize and outline an icon some OTHER project installed (pyblocks) to the
                        same outer size, in place. Idempotent.

Zach, 2026-09-22: "many agents in the past have tried to update this icon but
it still seems to be using a cached version?"

It was never one cache. Measured that day, three separate things:

1. The running window is not bbox-ui.desktop's. Every whiteboard window
   carries WM_CLASS "systemsketch" (launch_systemsketch.py's --class), and two
   installed entries claim that class: bbox-ui.desktop and systemsketch.desktop.
   GNOME Shell breaks the tie for the entry whose desktop-file ID *equals* the
   class (gnome-shell 46.0 src/shell-app-system.c:98-111 and :142-144,
   `startup_wm_class_is_exact_match`), so the lit dock slot is always
   systemsketch.desktop's `Icon=systemsketch`. An edit to bbox-ui's icon
   could never reach it.
2. The file behind `Icon=systemsketch` was the archived repo's 2026-08-30
   raster. /home/bam/systemsketch's install_desktop.py re-wrote it on 09-09
   from a main that never received the 09-06 icon refinement (that lives on
   its unmerged track/icon-cable-refinement), and deleted every other size as
   "conflicting". Nothing in THIS repo owned the file, so the 09-06 refinements
   and the 09-21 bbox studio mark each landed on the site and stopped there.
3. And the real cache, which makes a correct fix look like a failed one:
   GNOME Shell's icon theme only rescans when a theme DIRECTORY's own mtime
   changes (46.0 src/st/st-icon-theme.c:787-803 records `<base>/hicolor`,
   :2115-2140 compares only that). Overwriting a file inside
   hicolor/512x512/apps/ leaves the parent's mtime alone, so the shell keeps
   painting the old texture until logout. `refresh()` below bumps it on
   purpose. That is necessary, not sufficient: the shell only stats the
   directory when its texture cache MISSES (st-icon-theme.c:1085 runs from a
   lookup, and st-texture-cache.c answers cache hits without one). Measured
   2026-09-22: files changed 03:58, the dock still painted the old pyblocks
   at 04:28. The next miss (the overview, Alt+Tab, a new icon) repaints every
   icon at once; on X11, Alt+F2 → r forces it without a logout.

So this module owns the icons, rendered from the same files the site draws —
Zach, 2026-09-09: "just have like a logo reference so you just ever need to
update it once in the entire system and then everything points to it". The
launcher re-syncs on every window open, so an edit to the artwork reaches the
dock the next time the icon is pressed (from main — the dock runs main), and a
stray run of the archived installer heals itself the same way.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MARK = REPO / "apps" / "docs" / "public" / "bbox-studio-mark.svg"

# Dock icon name -> the artwork it is drawn from.
#
# WHY the studio mark now hangs on "bbox-ui", and why "systemsketch" is gone
# from this table (2026-09-24): point 1 above is no longer true. The whiteboard
# window carries `--class=bbox-ui` now, systemsketch.desktop launches the
# ARCHIVED app and only the archived app, and the tie GNOME used to break
# against us does not exist any more. So the mark that was drawn for the
# whiteboard finally hangs on the whiteboard's own name — the reason four
# redesigns "never showed" is that they were being written to a slot the
# whiteboard was only borrowing.
#
# `systemsketch` is the archived app's icon and the archived app's installer
# owns it (/home/bam/systemsketch). This repo has no artwork for it and no
# business overwriting it on every launch, which is exactly what it was doing.
#
# `assets/bbox-ui.svg` — the "bbox ui" lettered tile this used to install — is
# left on disk, unreferenced. It was a placeholder standing in for the mark.
ICONS = {
    "bbox-ui": MARK,
}

# WHY every icon is re-framed to this box: Zach, 2026-09-22 — "make them a bit
# bigger they are smaller compared to the other ones on the dock make them
# match the outer dimensions of the codex/claude icons". Measured that day on
# /usr/share/icons/hicolor/256x256/apps/claude-desktop.png and
# /usr/share/pixmaps/chatgpt.png (alpha >= 128, rendered at 1000px): both put
# their square at 0.098..0.902 of the canvas, to within 0.001. Our artwork sat
# at ~0.115..0.885, and the studio mark 25 units high besides. Only the frame
# (the root viewBox) changes — never a path — so the artwork stays exactly as
# drawn. test_dock_icon.py re-measures both reference icons when present.
TARGET = (0.098, 0.902)

# WHY a hairline: with the size matched, Zach, 2026-09-22 — "Ok yes your right
# they are the same size. can you please add the hairline outline then?" — picking
# option C of three rendered in the dock-icon report. The #1E1E1E square sat at
# ~1.1:1 contrast on the dark dock (measured rgb(30,30,30) on rgb(18,19,19)), so
# the eye read only the white drawing and the icon looked smaller than Claude's.
# WHY inset, not a plain stroke: a stroke straddles its edge, and the outer half
# would grow the icon past TARGET. The outline is its own element laid INSIDE the
# square's footprint, after the square and before the drawing, so a wire that
# crosses the edge still paints over it. The square itself is never edited.
OUTLINE_WIDTH = 10  # in the artwork's own 500-unit space: ~1px at 48px
OUTLINE = b'fill="none" stroke="#FFFFFF" stroke-opacity="0.28"'
OUTLINE_MARK = b'data-dock-outline="1"'
_SQUARE = re.compile(rb'<rect\b[^>]*\sfill="#1E1E1E"[^>]*/>')

# hicolor's own fixed sizes up to 512, plus the SVG. WHY PNGs as well as the
# SVG: hicolor's index.theme caps scalable/apps at MaxSize=256, so a 512 lookup
# (the app grid on a scaled display) would otherwise fall through to whatever
# stale raster happens to sit in 512x512.
SIZES = (16, 24, 32, 48, 64, 128, 256, 512)
EXTENSIONS = (".png", ".svg", ".xpm")
MEASURE_PX = 1000
_ROOT_TAG = re.compile(rb"<svg\b[^>]*>")
_OPAQUE = bytes(1 if value >= 128 else 0 for value in range(256))


def data_home() -> Path:
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))


def hicolor(home: Path) -> Path:
    return home / "icons" / "hicolor"


def _pixbuf(svg: bytes, width: int, height: int):
    """Rasterise with GdkPixbuf — librsvg, the renderer GNOME itself uses for SVG icons."""
    import gi

    gi.require_version("GdkPixbuf", "2.0")
    from gi.repository import GdkPixbuf

    loader = GdkPixbuf.PixbufLoader.new_with_type("svg")
    loader.set_size(width, height)
    loader.write(svg)
    loader.close()
    return loader.get_pixbuf()


def render_png(svg: bytes, size: int) -> bytes:
    ok, data = _pixbuf(svg, size, size).save_to_bufferv("png", [], [])
    if not ok:
        raise OSError(f"could not encode an icon at {size}px")
    return bytes(data)


def _attribute(tag: bytes, name: bytes) -> bytes | None:
    found = re.search(rb"\s" + name + rb'="([^"]*)"', tag)
    return found.group(1) if found else None


def view_box(svg: bytes) -> tuple[float, float, float, float]:
    tag = _ROOT_TAG.search(svg).group(0)
    box = _attribute(tag, b"viewBox")
    if box:
        x, y, width, height = (float(part) for part in box.replace(b",", b" ").split())
        return x, y, width, height
    return 0.0, 0.0, float(_attribute(tag, b"width")), float(_attribute(tag, b"height"))


def visible_bounds(svg: bytes) -> tuple[float, float, float, float]:
    """The painted extent (alpha >= 128) in the SVG's own user units."""
    x, y, width, height = view_box(svg)
    columns = MEASURE_PX
    rows = max(1, round(MEASURE_PX * height / width))
    pixbuf = _pixbuf(svg, columns, rows)
    stride, channels, pixels = pixbuf.get_rowstride(), pixbuf.get_n_channels(), pixbuf.get_pixels()
    if channels != 4:
        return x, y, x + width, y + height
    left, right, top, bottom = columns, -1, None, None
    for row in range(pixbuf.get_height()):
        mask = pixels[row * stride : row * stride + columns * 4][3::4].translate(_OPAQUE)
        first = mask.find(1)
        if first < 0:
            continue
        top = row if top is None else top
        bottom = row + 1
        left, right = min(left, first), max(right, mask.rfind(1) + 1)
    if top is None:
        raise ValueError("icon paints nothing")
    scale_x, scale_y = width / columns, height / pixbuf.get_height()
    return x + left * scale_x, y + top * scale_y, x + right * scale_x, y + bottom * scale_y


def fit(svg: bytes) -> bytes:
    """Re-frame the artwork so its painted square fills TARGET, centred. Paths are untouched.

    The longer side lands on TARGET exactly; the shorter one keeps its aspect.
    """
    left, top, right, bottom = visible_bounds(svg)
    side = max(right - left, bottom - top) / (TARGET[1] - TARGET[0])
    centre_x, centre_y = (left + right) / 2, (top + bottom) / 2
    box = f"{centre_x - side / 2:.2f} {centre_y - side / 2:.2f} {side:.2f} {side:.2f}".encode()
    tag = _ROOT_TAG.search(svg)
    root = tag.group(0)
    root = re.sub(rb'\sviewBox="[^"]*"', b"", root)
    root = re.sub(rb'\s(width|height)="[^"]*"', b"", root)
    root = root[:4] + b' width="512" height="512" viewBox="' + box + b'"' + root[4:]
    return svg[: tag.start()] + root + svg[tag.end() :]


def outline(svg: bytes) -> bytes:
    """Add the inset hairline to the artwork's dark square. Already outlined → unchanged."""
    if OUTLINE_MARK in svg:
        return svg
    square = _SQUARE.search(svg)
    if square is None:
        raise ValueError('no <rect fill="#1E1E1E"> square to outline')
    tag = square.group(0)

    def number(name: bytes) -> float:
        value = _attribute(tag, name)
        return float(value) if value else 0.0

    half = OUTLINE_WIDTH / 2
    x, y, width, height, radius = (number(name) for name in (b"x", b"y", b"width", b"height", b"rx"))
    transform = _attribute(tag, b"transform")
    ring = (
        f'<rect {OUTLINE_MARK.decode()} x="{x + half:g}" y="{y + half:g}" width="{width - OUTLINE_WIDTH:g}" '
        f'height="{height - OUTLINE_WIDTH:g}" rx="{max(radius - half, 0):g}" stroke-width="{OUTLINE_WIDTH:g}" '
    ).encode() + OUTLINE + (b' transform="' + transform + b'"' if transform else b"") + b"/>"
    return svg[: square.end()] + b"\n" + ring + svg[square.end() :]


def dress(svg: bytes) -> bytes:
    """Artwork → dock rendition: the hairline, then the Claude/Codex frame."""
    return fit(outline(svg))


def is_fitted(svg: bytes, tolerance: float = 0.004) -> bool:
    x, y, width, _height = view_box(svg)
    left, top, right, bottom = visible_bounds(svg)
    extent = max(right - left, bottom - top) / width
    centre_x, centre_y = ((left + right) / 2 - x) / width, ((top + bottom) / 2 - y) / width
    return (
        abs(extent - (TARGET[1] - TARGET[0])) <= tolerance
        and abs(centre_x - 0.5) <= tolerance
        and abs(centre_y - 0.5) <= tolerance
    )


def wanted(name: str, svg: bytes) -> dict[str, bytes]:
    """Every file the icon should consist of, relative to hicolor/, with its bytes."""
    files = {f"scalable/apps/{name}.svg": svg}
    for size in SIZES:
        files[f"{size}x{size}/apps/{name}.png"] = render_png(svg, size)
    return files


def installed(root: Path, name: str) -> set[str]:
    return {
        str(path.relative_to(root))
        for extension in EXTENSIONS
        for path in root.glob(f"*/apps/{name}{extension}")
    }


def stale(root: Path, name: str, files: dict[str, bytes]) -> list[str]:
    """What differs: missing or wrong files, plus variants that should not exist."""
    wrong = [path for path, content in files.items() if not (root / path).is_file() or (root / path).read_bytes() != content]
    extra = sorted(installed(root, name) - files.keys())
    return wrong + extra


def write(root: Path, name: str, files: dict[str, bytes]) -> list[str]:
    changed = stale(root, name, files)
    for path, content in files.items():
        target = root / path
        if target.is_file() and target.read_bytes() == content:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.installing")
        temporary.write_bytes(content)
        os.replace(temporary, target)
    for path in installed(root, name) - files.keys():
        (root / path).unlink(missing_ok=True)
    return changed


def refresh(root: Path) -> None:
    """Make GNOME Shell notice, without a logout (point 3 in the module docstring)."""
    tool = shutil.which("gtk-update-icon-cache")
    if tool:
        subprocess.run(
            [tool, "-f", "-t", "-q", str(root)],
            check=False, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
        )
    # WHY bump the directory ourselves even though the rewritten cache file
    # usually does it: without the tool nothing else would, and that mtime is
    # the ONLY signal the shell watches. Then stamp the fresh cache to match,
    # because GTK ignores a cache older than its directory.
    os.utime(root)
    cache = root / "icon-theme.cache"
    if tool and cache.is_file():
        os.utime(cache, (root.stat().st_atime, root.stat().st_mtime))


def expected(icons: dict[str, Path] | None = None) -> dict[str, dict[str, bytes]]:
    return {name: wanted(name, dress(source.read_bytes())) for name, source in (icons or ICONS).items()}


def sync(home: Path | None = None, icons: dict[str, Path] | None = None, *, notify: bool = True) -> list[str]:
    """Install every icon from its artwork. Returns what changed; [] means all already matched."""
    root = hicolor(home or data_home())
    changed = [path for name, files in expected(icons).items() for path in write(root, name, files)]
    if changed and notify:
        refresh(root)
    return changed


def fit_installed(name: str, home: Path | None = None, *, notify: bool = True) -> list[str]:
    """Dress an icon another project installed, from its own installed SVG. [] if already dressed.

    WHY in place and never from a source: pyblocks' logo was installed outside
    any repo (2026-09-22), so the installed SVG is the only copy there is.
    WHY `is_fitted` before re-fitting: re-measuring an already-fitted frame
    could move it by a rounding hair every run; a dressed icon is left
    byte-for-byte alone.
    """
    root = hicolor(home or data_home())
    source = root / "scalable" / "apps" / f"{name}.svg"
    original = source.read_bytes()
    svg = outline(original)
    if not is_fitted(svg):
        svg = fit(svg)
    if svg == original:
        return []
    changed = write(root, name, wanted(name, svg))
    if changed and notify:
        refresh(root)
    return changed


def resolves_to(name: str, size: int) -> str | None:
    """What the desktop's own icon lookup returns for the name, right now."""
    try:
        import gi

        gi.require_version("Gtk", "3.0")
        from gi.repository import Gtk

        info = Gtk.IconTheme.get_default().lookup_icon(name, size, 0)
        return info.get_filename() if info else None
    except (ImportError, ValueError, RuntimeError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--fit-installed", metavar="NAME")
    arguments = parser.parse_args()
    root = hicolor(data_home())
    if arguments.fit_installed:
        changed = fit_installed(arguments.fit_installed)
        print(f"re-framed {arguments.fit_installed}: {len(changed)} files" if changed else f"{arguments.fit_installed} is already sized and outlined")
        return 0
    if arguments.check:
        differences = [path for name, files in expected().items() for path in stale(root, name, files)]
        for path in differences:
            print(f"stale: {root / path}")
        print("dock icons match their artwork" if not differences else f"dock icons do NOT match their artwork ({len(differences)} files)")
        return 1 if differences else 0
    changed = sync()
    print(f"updated {len(changed)} files under {root}" if changed else "dock icons already match their artwork")
    for name in ICONS:
        print(f"GTK resolves '{name}' at 48px to {resolves_to(name, 48)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
