#!/usr/bin/env python3
"""Launch the bbox-ui Storybook workbench (apps/storybook-basics): the same
three channels as launch_bboxui.py, on the same shared CLI
(bbox_launch_common.run()) — nothing new to learn if you already know that
command.

  Stable   default. A pinned local `storybook build`. Never changes until
           you promote.
  Preview  --preview. A real local `storybook dev` server with HMR, showing
           whatever is on this checkout's disk right now — committed or not.
           This is NOT Zach's own review Storybook on :5421; see
           bbox_release.py's STORYBOOK config for the ports this claims
           instead (5430/5431 by default) and why.
  Remote   not available — Storybook has no public deploy. `--remote` prints
           an error and exits 1.

"Promote" snapshots whatever Preview's tree currently has (`storybook build
-o storybook-static`) and pins it as the new Stable — see bbox_release.py's
module docstring for why that's a snapshot of the live checkout, not a
resolved git ref.
"""

from __future__ import annotations

import sys

from bbox_launch_common import run
from bbox_release import STORYBOOK


def main() -> int:
    return run(STORYBOOK, sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
