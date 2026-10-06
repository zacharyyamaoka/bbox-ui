#!/usr/bin/env python3
"""Launch bbox-ui.com: three separate things, kept separate (Zach, 2026-09-12).

  Stable   default. A pinned local build. Never changes until you promote.
  Preview  --preview. A real local `next dev` server with HMR, showing
           whatever is on this checkout's disk right now — committed or not.
  Remote   --remote. The actual deployed https://bbox-ui.com, which
           redeploys itself on every push to `main` (Cloudflare Workers
           Builds). No local state at all.

Originally copied from SystemSketch's Stable/Preview desktop launcher
(scripts/launch_systemsketch.py, deleted 2026-09-29 when the whiteboard moved
to the shared stable-preview-switcher runtime); as of 2026-09-22 this script is itself just
a thin, product-named wrapper around bbox_launch_common.run() — see
scripts/launch_bbox_storybook.py for the Storybook workbench's identical
interface on the same shared CLI, and bbox_release.py's module docstring for
why the two products share one model instead of two copies of this file.

"Promote" (--promote, or the badge in the Stable window) snapshots whatever
Preview's tree currently has — see bbox_release.py's module docstring for why
that's a snapshot of the live checkout, not a resolved git ref.
"""

from __future__ import annotations

import sys

from bbox_launch_common import run
from bbox_release import DOCS


def main() -> int:
    return run(DOCS, sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
