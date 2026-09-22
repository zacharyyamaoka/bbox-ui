#!/usr/bin/env python3
"""The whiteboard's dock icon, installed from the one mark the site draws.

  (default)  Install/refresh the icon named `systemsketch` from
             apps/docs/public/bbox-studio-mark.svg, then say what GTK resolves.
  --check    Exit 1 if the installed icon is not the mark. Writes nothing.

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
   purpose.

So this module owns the icon, rendered from the same file the site header
draws — Zach, 2026-09-09: "just have like a logo reference so you just ever
need to update it once in the entire system and then everything points to
it". The launcher re-syncs on every window open, so an edit to the mark
reaches the dock the next time the icon is pressed (from main — the dock runs
main), and a stray run of the archived installer heals itself the same way.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MARK = REPO / "apps" / "docs" / "public" / "bbox-studio-mark.svg"

# WHY this name and not "bbox-ui": it is the name systemsketch.desktop asks
# for, and that entry is the one GNOME hands the window to (point 1 above).
ICON_NAME = "systemsketch"

# hicolor's own fixed sizes up to 512, plus the SVG. WHY PNGs as well as the
# SVG: hicolor's index.theme caps scalable/apps at MaxSize=256, so a 512 lookup
# (the app grid on a scaled display) would otherwise fall through to whatever
# stale raster happens to sit in 512x512.
SIZES = (16, 24, 32, 48, 64, 128, 256, 512)
EXTENSIONS = (".png", ".svg", ".xpm")


def data_home() -> Path:
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))


def hicolor(home: Path) -> Path:
    return home / "icons" / "hicolor"


def render_png(svg: Path, size: int) -> bytes:
    """Rasterise with GdkPixbuf — librsvg, the renderer GNOME itself uses for SVG icons."""
    import gi

    gi.require_version("GdkPixbuf", "2.0")
    from gi.repository import GdkPixbuf

    pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(str(svg), size, size)
    ok, data = pixbuf.save_to_bufferv("png", [], [])
    if not ok:
        raise OSError(f"could not encode {svg.name} at {size}px")
    return bytes(data)


def wanted(mark: Path = MARK) -> dict[str, bytes]:
    """Every file the icon should consist of, relative to hicolor/, with its bytes."""
    files = {f"scalable/apps/{ICON_NAME}.svg": mark.read_bytes()}
    for size in SIZES:
        files[f"{size}x{size}/apps/{ICON_NAME}.png"] = render_png(mark, size)
    return files


def installed(root: Path) -> set[str]:
    return {
        str(path.relative_to(root))
        for extension in EXTENSIONS
        for path in root.glob(f"*/apps/{ICON_NAME}{extension}")
    }


def stale(root: Path, files: dict[str, bytes]) -> list[str]:
    """What differs from the mark: missing or wrong files, plus variants that should not exist."""
    wrong = [name for name, content in files.items() if not (root / name).is_file() or (root / name).read_bytes() != content]
    extra = sorted(installed(root) - files.keys())
    return wrong + extra


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


def sync(home: Path | None = None, mark: Path = MARK, *, notify: bool = True) -> list[str]:
    """Install the mark as the dock icon. Returns what changed; [] means it already was the mark."""
    root = hicolor(home or data_home())
    files = wanted(mark)
    changed = stale(root, files)
    if not changed:
        return []
    for name, content in files.items():
        target = root / name
        if target.is_file() and target.read_bytes() == content:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.installing")
        temporary.write_bytes(content)
        os.replace(temporary, target)
    for name in installed(root) - files.keys():
        (root / name).unlink(missing_ok=True)
    if notify:
        refresh(root)
    return changed


def resolves_to(size: int) -> str | None:
    """What the desktop's own icon lookup returns for the name, right now."""
    try:
        import gi

        gi.require_version("Gtk", "3.0")
        from gi.repository import Gtk

        info = Gtk.IconTheme.get_default().lookup_icon(ICON_NAME, size, 0)
        return info.get_filename() if info else None
    except (ImportError, ValueError, RuntimeError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    root = hicolor(data_home())
    if arguments.check:
        differences = stale(root, wanted())
        for name in differences:
            print(f"stale: {root / name}")
        print("dock icon is the mark" if not differences else f"dock icon is NOT the mark ({len(differences)} files)")
        return 1 if differences else 0
    changed = sync()
    print(f"updated {len(changed)} files under {root}" if changed else "dock icon already matches the mark")
    for size in (48, 64):
        print(f"GTK resolves '{ICON_NAME}' at {size}px to {resolves_to(size)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
