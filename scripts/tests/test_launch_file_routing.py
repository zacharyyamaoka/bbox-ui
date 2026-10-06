"""Which application a double-clicked board opens in.

Added 2026-09-21 with the `.bbox` rename (Zach: "lets call this file type
.bbox as this project is no longer system sketch its just the bbox
whiteboard").

WHY this file exists: `launch_systemsketch.py` handed EVERY `<file>` argument
to the archived app unconditionally. That was harmless only for as long as
every board on disk was one the archived app could read. The moment this build
starts WRITING `.bbox`, the same line becomes "double-click your own new board,
watch the wrong application fail to parse it" — a regression the rename would
have caused in silence, in the one surface that has no test around it.

Nothing here starts a server, opens a window, or touches
/home/bam/SystemSketch: the routing decision is a pure function, and that is
the whole point of it being one.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import launch_systemsketch  # noqa: E402
from launch_systemsketch import board_url, opens_here  # noqa: E402

WORKSPACE = Path("/home/bam/SystemSketch")


class FileRoutingTests(unittest.TestCase):
    def test_this_app_takes_the_plain_tldraw_documents_it_can_actually_read(self) -> None:
        # What this build writes, and what it wrote before the rename. Both
        # open here; neither is the archived app's business any more.
        self.assertTrue(opens_here(WORKSPACE / "Arm.bbox"))
        self.assertTrue(opens_here(WORKSPACE / "02_literal_argument.tldr"))
        # Suffix matching is case-insensitive, as it is everywhere else.
        self.assertTrue(opens_here(WORKSPACE / "Arm.BBOX"))

    def test_the_archived_envelope_still_goes_to_the_archived_app(self) -> None:
        # 84 of these sit in Zach's workspace. `.systemsketch` is a different
        # FORMAT, not a different name, and this build has never read it.
        self.assertFalse(opens_here(WORKSPACE / "bbox-ui-v3.systemsketch"))
        # And anything that is not a board at all is not claimed either.
        self.assertFalse(opens_here(WORKSPACE / "notes.json"))
        self.assertFalse(opens_here(WORKSPACE / "make_bbox_anatomy.py"))

    def test_the_board_url_is_the_apps_own_raw_query_spelling(self) -> None:
        url = board_url(WORKSPACE / "series_a_pose_pipeline_v7.bbox")
        # `?board=<absolute path>`, raw — not percent-encoded. That is the
        # spelling `apps/systemsketch/src/files/launchConfig.ts` parses and the
        # one Zach is handed everywhere else.
        self.assertEqual(
            url,
            f"http://127.0.0.1:{launch_systemsketch.PORT}/"
            "?board=/home/bam/SystemSketch/series_a_pose_pipeline_v7.bbox",
        )
        self.assertNotIn("%2F", url)
        self.assertNotIn("%3D", url)

    def test_every_suffix_the_file_host_lists_is_routed_by_exactly_one_app(self) -> None:
        """No board type may be claimed by both apps, or by neither."""
        import systemsketch_files

        for suffix in systemsketch_files.DOCUMENT_SUFFIXES:
            here = opens_here(WORKSPACE / f"Board{suffix}")
            expected = suffix in launch_systemsketch.OWN_SUFFIXES
            self.assertEqual(here, expected, f"{suffix} routed to the wrong app")
        self.assertEqual(
            sorted(set(systemsketch_files.DOCUMENT_SUFFIXES) - set(launch_systemsketch.OWN_SUFFIXES)),
            [".systemsketch"],
        )


if __name__ == "__main__":
    unittest.main()
