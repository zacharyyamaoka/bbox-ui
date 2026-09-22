"""`launch_systemsketch.health_document` — the dock's pinned Stable whiteboard's
own `/api/health`, and the producer half of the mismatch contract.

WHY this file exists (judge finding, 2026-09-22 — HIGH): that document used to
be `{product, build, channel}`, while
`apps/systemsketch/src/chrome/siteStatus.ts`'s `statusMismatchesOwn` compares
`commit` and the checkout id. So in the ONE configuration Zach gets by pressing
the dock icon — Stable whiteboard, Storybook from wherever — the comparison had
nothing to compare, returned `false`, and the "different from this board"
warning could never fire no matter how far the two had drifted. The consumer
half of the same contract is pinned in
`apps/systemsketch/src/chrome/siteStatus.test.ts`
("flags the DOCK'S STABLE WHITEBOARD against a moved checkout"); both halves
have to hold or the warning is decorative.

Run: ``python3 -m pytest scripts/tests/test_launch_systemsketch_health.py -v``
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import bbox_release as br  # noqa: E402
import launch_systemsketch as launcher  # noqa: E402


class HealthDocumentTests(unittest.TestCase):
    def test_it_carries_the_identity_the_comparison_reads(self) -> None:
        # MUTATION: remove either key from `health_document` and this goes
        # red — which is precisely the state the feature shipped in.
        document = launcher.health_document("0123456789abcdef0123456789abcdef01234567")
        self.assertIn("commit", document)
        self.assertIn("checkoutId", document)
        self.assertEqual(document["commit"], "0123456789abcdef0123456789abcdef01234567")
        self.assertEqual(document["checkoutId"], br.checkout_id(launcher.REPO))

    def test_the_checkout_id_uses_the_one_shared_algorithm(self) -> None:
        # Not a copy of the digest: the SAME function every other bbox-ui
        # surface calls, because two surfaces that compute it differently
        # answer "different checkout" forever and nothing notices.
        self.assertEqual(
            launcher.health_document("abc")["checkoutId"],
            br.checkout_id(launcher.REPO),
        )
        self.assertRegex(launcher.health_document("abc")["checkoutId"], r"^[0-9a-f]{12}$")

    def test_commit_is_none_rather_than_empty_when_there_is_no_build(self) -> None:
        # An empty string would compare as "missing" by falsiness anyway, but
        # `None` is what every other health document in this repo uses for
        # "unknown", and siteStatus.ts's parser only accepts a string.
        self.assertIsNone(launcher.health_document("")["commit"])

    def test_it_still_names_the_product_and_channel_the_launcher_gates_on(self) -> None:
        # `launcher.health()` refuses a payload whose product is not this one;
        # renaming the product here would make the launcher unable to find its
        # own server.
        document = launcher.health_document("abc")
        self.assertEqual(document["product"], launcher.PRODUCT)
        self.assertEqual(document["channel"], "stable")
        self.assertEqual(document["build"], "abc")

    def test_it_does_not_leak_the_absolute_checkout_path(self) -> None:
        self.assertNotIn("projectRoot", launcher.health_document("abc"))
        self.assertNotIn(str(Path.home()), repr(launcher.health_document("abc")))


if __name__ == "__main__":
    unittest.main()
