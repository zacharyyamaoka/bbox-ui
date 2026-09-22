"""The dock icon is the site's mark, and stays that way.

Added 2026-09-22 after Zach asked why the dock "still seems to be using a
cached version" through four redesigns. scripts/dock_icon.py's docstring has
the three causes; each test below pins one of them.

The oracle for "what will the desktop show" is GTK's own icon lookup
(Gtk.IconTheme.lookup_icon) — the algorithm GNOME Shell's St icon theme is
forked from — never this module's own idea of which file matters. Everything
runs against a throwaway XDG data dir; the real ~/.local/share is not touched.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import dock_icon  # noqa: E402
import launch_systemsketch  # noqa: E402

import gi  # noqa: E402

gi.require_version("Gtk", "3.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import GdkPixbuf, Gtk  # noqa: E402

# The shape the archived installer leaves behind: one opaque raster at 512 and
# nothing else (install_desktop.py deletes every other size as "conflicting").
ARCHIVED_RASTER = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, False, 8, 512, 512)
ARCHIVED_RASTER.fill(0xFFFFFFFF)


def gtk_resolves(home: Path, size: int) -> str | None:
    theme = Gtk.IconTheme.new()
    # hicolor's directory list comes from the system index.theme; the icons
    # themselves only from the throwaway dir.
    theme.set_search_path([str(home / "icons"), "/usr/share/icons"])
    theme.set_custom_theme("hicolor")
    info = theme.lookup_icon(dock_icon.ICON_NAME, size, 0)
    return info.get_filename() if info else None


def plant_archived_raster(root: Path) -> Path:
    raster = root / "512x512" / "apps" / f"{dock_icon.ICON_NAME}.png"
    raster.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVED_RASTER.savev(str(raster), "png", [], [])
    return raster


class DockIconTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)
        self.root = dock_icon.hicolor(self.home)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_the_scalable_icon_is_the_sites_mark_byte_for_byte(self) -> None:
        dock_icon.sync(self.home, notify=False)
        installed = self.root / "scalable" / "apps" / f"{dock_icon.ICON_NAME}.svg"
        self.assertEqual(installed.read_bytes(), dock_icon.MARK.read_bytes())

    def test_every_png_is_the_size_its_folder_names_and_keeps_its_transparency(self) -> None:
        dock_icon.sync(self.home, notify=False)
        for size in dock_icon.SIZES:
            pixbuf = GdkPixbuf.Pixbuf.new_from_file(str(self.root / f"{size}x{size}" / "apps" / f"{dock_icon.ICON_NAME}.png"))
            self.assertEqual((pixbuf.get_width(), pixbuf.get_height()), (size, size))
            # The old raster's white square came from an opaque RGB PNG; the
            # mark sits on transparency and must stay that way.
            self.assertTrue(pixbuf.get_has_alpha(), f"{size}px lost its alpha")

    def test_the_desktop_lookup_moves_from_the_archived_raster_to_the_mark(self) -> None:
        raster = plant_archived_raster(self.root)
        self.assertEqual(gtk_resolves(self.home, 48), str(raster))
        dock_icon.sync(self.home, notify=False)
        for size in (16, 48, 64, 512):
            resolved = gtk_resolves(self.home, size)
            self.assertIsNotNone(resolved)
            self.assertTrue(resolved.startswith(str(self.root)), resolved)
            self.assertNotEqual(Path(resolved).read_bytes(), b"", resolved)
        self.assertEqual(dock_icon.stale(self.root, dock_icon.wanted()), [])

    def test_a_stray_run_of_the_archived_installer_is_seen_and_healed(self) -> None:
        dock_icon.sync(self.home, notify=False)
        # What /home/bam/systemsketch's install_desktop.py does: rewrite 512,
        # delete every other variant.
        for name in dock_icon.installed(self.root):
            (self.root / name).unlink()
        plant_archived_raster(self.root)
        self.assertIn(f"512x512/apps/{dock_icon.ICON_NAME}.png", dock_icon.stale(self.root, dock_icon.wanted()))
        self.assertNotEqual(dock_icon.sync(self.home, notify=False), [])
        self.assertEqual(dock_icon.stale(self.root, dock_icon.wanted()), [])

    def test_variants_the_mark_does_not_produce_are_removed(self) -> None:
        extra = self.root / "1024x1024" / "apps" / f"{dock_icon.ICON_NAME}.png"
        extra.parent.mkdir(parents=True)
        ARCHIVED_RASTER.savev(str(extra), "png", [], [])
        dock_icon.sync(self.home, notify=False)
        self.assertFalse(extra.exists(), "a leftover size would outrank the mark at that size")

    def test_other_apps_icons_are_left_alone(self) -> None:
        neighbour = self.root / "48x48" / "apps" / "bbox-ui.png"
        neighbour.parent.mkdir(parents=True)
        neighbour.write_bytes(b"not ours")
        dock_icon.sync(self.home, notify=False)
        self.assertEqual(neighbour.read_bytes(), b"not ours")

    def test_a_second_sync_is_a_no_op_that_writes_nothing(self) -> None:
        dock_icon.sync(self.home, notify=False)
        before = {name: (self.root / name).stat().st_mtime_ns for name in dock_icon.installed(self.root)}
        self.assertEqual(dock_icon.sync(self.home), [])
        after = {name: (self.root / name).stat().st_mtime_ns for name in dock_icon.installed(self.root)}
        self.assertEqual(before, after)

    def test_a_change_moves_the_theme_directory_mtime_the_shell_watches(self) -> None:
        # The real cache: St rescans only when <base>/hicolor's own mtime moves.
        # The case that bites is an IN-PLACE replacement — every size folder
        # already exists, so writing into one leaves hicolor/ itself untouched.
        # (Syncing into an empty dir would create folders and move the mtime
        # anyway, which is how a first draft of this test passed vacuously.)
        dock_icon.sync(self.home, notify=False)
        plant_archived_raster(self.root)
        os.utime(self.root, (1_000_000, 1_000_000))
        # With no gtk-update-icon-cache available, nothing but refresh() moves it.
        with mock.patch.object(dock_icon.shutil, "which", return_value=None):
            self.assertNotEqual(dock_icon.sync(self.home), [])
        self.assertGreater(self.root.stat().st_mtime, 1_000_000)

    def test_a_rebuilt_cache_is_not_older_than_its_directory(self) -> None:
        # GTK ignores an icon-theme.cache older than the directory it sits in.
        dock_icon.sync(self.home)
        cache = self.root / "icon-theme.cache"
        if not cache.is_file():
            self.skipTest("gtk-update-icon-cache is not installed")
        self.assertGreaterEqual(cache.stat().st_mtime, self.root.stat().st_mtime)


class LauncherWiringTests(unittest.TestCase):
    RECORD = {"build": "0123456789abcdef", "subject": "test", "built": "now"}

    def run_main(self, *argv: str, sync=None) -> list[str]:
        calls: list[str] = []
        sync = sync or (lambda: calls.append("sync") or [])
        with mock.patch.multiple(
            launch_systemsketch,
            stable_record=mock.DEFAULT,
            ensure_server=mock.DEFAULT,
            legacy=mock.DEFAULT,
            ensure_storybook=mock.DEFAULT,
            open_window=mock.DEFAULT,
        ) as fakes, mock.patch.object(dock_icon, "sync", side_effect=sync), mock.patch.object(sys, "argv", ["launch", *argv]):
            fakes["stable_record"].return_value = self.RECORD
            fakes["open_window"].side_effect = lambda url: calls.append("open")
            self.assertEqual(launch_systemsketch.main(), 0)
        return calls

    def test_pressing_the_dock_icon_resyncs_it_before_the_window_opens(self) -> None:
        self.assertEqual(self.run_main("--open"), ["sync", "open"])

    def test_a_double_clicked_board_resyncs_it_too(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".bbox") as board:
            self.assertEqual(self.run_main(board.name), ["sync", "open"])

    def test_a_broken_icon_never_stops_the_window_opening(self) -> None:
        def explode() -> list[str]:
            raise RuntimeError("librsvg is missing")

        with mock.patch.object(sys, "stderr"):
            self.assertEqual(self.run_main("--open", sync=explode), ["open"])


if __name__ == "__main__":
    unittest.main()
