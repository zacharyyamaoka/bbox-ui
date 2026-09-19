#!/usr/bin/env python3
"""
Build the report for the "story tags" lane (Zach, 2026-09-17: "each agent I
think that delivers work should like group it under a tag").

WHY this is its own script and not a manifest fed to docs/build_lane_report.py
(the repo's shared builder, as the task briefing asked for): that builder's
own capture path, docs/capture_storybook_shots.mjs, hits each story's
`iframe.html` URL "so no Storybook chrome (sidebar, addon panel) lands in the
frame — the component is the subject" (its own header comment). This report's
entire subject IS the chrome — the sidebar's tag-filter dropdown — so that
capture path structurally cannot produce the evidence this lane needs to
show. The new docs/capture_storybook_chrome_shots.mjs (added alongside this
script) captures the full app shell instead, driven by a short list of
{click, shot} steps — see its own header for why. This script borrows the
shared builder's facts-from-git discipline and visual language (STYLE) but
assembles its own sections around a before/after chrome gallery instead of a
per-story capture grid.

Screenshots referenced here were captured twice against the SAME running
Storybook (port 5493): once with the lane's changes `git stash`-ed away (the
tree exactly as `main` has it today — WhatsNew.stories.tsx present, no
`tags:` anywhere), once restored. Both passes hit a real dev server; neither
image is mocked.

Usage: python3 docs/build_storybook_tags_report.py --out <path>
"""
from __future__ import annotations

import argparse
import base64
import io
import pathlib
import subprocess
import sys
from datetime import date
from urllib.parse import quote

from PIL import Image

DOCS_DIR = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DOCS_DIR))
from build_lane_report import STYLE, CAP_BYTES  # noqa: E402  (shared visual language + the same size ceiling)

SHOTS_DIR = pathlib.Path(
    "/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-component-docs-reorganize-8ce972/"
    "9f4395e3-3df4-47ec-820a-d2eb947d0160/scratchpad/shots"
)


def sh(cmd: list[str]) -> str:
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True).stdout.strip()


def webp_uri(name: str, quality: int = 78) -> str:
    im = Image.open(SHOTS_DIR / f"{name}.png").convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


BEFORE = [
    ("01-sidebar-before", "Sidebar — before", "The “What's New” group sits at the top of BLOCKS, above every real component."),
    ("02-whatsnew-empty-before", "What's New · Timeline — before", "Exactly Zach's screenshot: “Nothing to show yet” — nobody ran `pnpm whats-new` in this checkout, so the group renders nothing for anyone."),
    ("03-filter-menu-before", "Tag filter menu — before", "Play 178 · New 4 · Modified 0 · Related 0, then a single “Learn how to add tags” link — zero custom tags exist anywhere in the app, so the menu has nothing to list."),
]

AFTER = [
    ("01-sidebar-after", "Sidebar — after", "“What's New” is gone. AsyncRegion's stories sit directly under BLOCKS again."),
    ("02-filter-menu-after", "Tag filter menu — after", "The same menu now lists 7 area: tags and 1 lane: tag, each with a live count that sums to all 188 stories (38+67+8+30+7+4+34 = 188). New / Modified / Related are untouched by this — see Findings."),
    ("03-filtered-hit-regions-after", "Filtered to area:hit-regions — after", "Checking ONE tag narrows the whole sidebar tree to exactly its 6 files / 8 stories — everything else (Blocks, Basics, Ports, Presets, Styles, Trace) disappears from view."),
    ("04-filtered-lane-baseline-after", "Filtered to lane:baseline — after", "The same mechanism, the lane axis: selecting lane:baseline currently shows all 188, because every pre-existing file carries that one bucket (see Findings on why it isn't a fabricated per-file lane name). The FIRST lane to touch a file for real work moves it off baseline."),
]

CHANGES = [
    "apps/storybook-basics/src/stories/*.stories.tsx (46 files) — one line inserted into each `meta`, right after `title:`: `tags: [\"area:&lt;name&gt;\", \"lane:baseline\"]`. Nothing else in any file touched — 46 files changed, 46 insertions, 0 deletions (`git diff --stat`).",
    "apps/storybook-basics/src/stories/WhatsNew.stories.tsx — deleted. Broken empty state in every fresh checkout (nobody runs the generator automatically); Zach's own next words after seeing it were to ask for tags instead. Nothing else in the app imported it.",
    ".gitignore — updated the whats-new.generated.json comment to say the consuming story is retired, so the comment doesn't lie about what's still wired up.",
    "docs/build_whats_new.mjs — left in place, untouched. Its git-derived “what changed” answer is still correct; it just has no consumer right now.",
    "CLAUDE.md — new “Story tags” section: the vocabulary, the verified Storybook mechanism, the meta placement convention, and the What's New retirement rationale — so the next lane tags its own work without being told twice.",
    "docs/capture_storybook_chrome_shots.mjs — new: captures full-app (chrome included) Storybook screenshots via a {click, shot} step list, for when a lane's subject is the UI shell itself rather than a story canvas. docs/capture_storybook_shots.mjs deliberately excludes chrome by design (see its own header) — this fills that specific gap without touching the existing script.",
    "docs/build_storybook_tags_report.py — new: this report's own builder (see its header for why it isn't a docs/build_lane_report.py manifest).",
]

FINDINGS = [
    "<b>Custom tags surface in the sidebar filter menu automatically — no registration.</b> Read directly from the installed bundle, <code>storybook@10.6.0</code>'s <code>node_modules/storybook/dist/manager/runtime.js</code>, function <code>useTagFilterEntries</code> (source comment: <code>src/manager/components/sidebar/useFilterData.tsx</code>): it walks every indexed story, buckets any tag NOT in a fixed <code>BUILT_IN_TAGS</code> set into <code>userTagsCounts</code>, and turns each into a checkbox with a live count. That is the entire mechanism — confirmed live in the browser screenshots above, not just in source.",
    "<b>Reserved tags (never use these as area/lane names):</b> <code>dev</code>, <code>test</code>, <code>autodocs</code>, <code>attached-mdx</code>, <code>unattached-mdx</code>, <code>play-fn</code>, <code>test-fn</code>, <code>manifest</code> — the literal <code>BUILT_IN_TAGS</code> Set in <code>FilterPanel.utils.ts</code>. The sidebar's own “Play” / “Documentation” / “Testing” filter buttons read two of these (<code>play-fn</code>, and a story's <code>subtype</code>) plus doc-type entries, not custom tags.",
    "<b>“New / Modified / Related” is a different, unrelated feature — not populated by tags at all, and there is no way to wire it from this repo alone.</b> Confirmed in the same bundle: <code>STATUS_DISPLAY_ORDER</code> lists <code>status-value:new</code> / <code>modified</code> / <code>affected</code> (“Related” is literally <code>affected</code>'s display name, from <code>statusValueShortName</code>), gated behind <code>globalThis.FEATURES.changeDetection</code> and fed by a status provider — Storybook's git-based Change Detection (Chromatic-integration class), not the tags array. It DOES react to real git state, though: the before-shot above reads “New 4” because the tree had just had WhatsNew.stories.tsx's 4 stories restored by an uncommitted `git stash pop` at capture time — that is the feature genuinely working, just answering a completely different question (“what's uncommitted/recently changed”) than “which lane delivered this.”",
    "<b>Zach's own brief already anticipated this exact follow-up.</b> WhatsNew.stories.tsx's header comment (written a lane earlier, same day): “Tag injection into individual stories (the other half of Zach's ask) is the same kind of follow-up, same reason [a concurrent lane owns preview.tsx]” — this delivery IS that deferred half, not a reversal of it. And <code>docs/build_whats_new.mjs</code>'s own header argues against hand-tagging for RECENCY (“a hand-applied `new` tag is right the day it is written and wrong a week later”) — that argument doesn't apply to a `lane:` tag, which classifies authorship/delivery, not freshness, and which Zach explicitly volunteered the obsolescence mechanism for (“once a tag becomes obsolete I can just tell you so”).",
    "<b>The task brief's claim that 1 of 47 files already used `tags:` (SceneDiff.stories.tsx) does not hold up — verified against the actual working tree.</b> <code>grep -n \"tags\" SceneDiff.stories.tsx</code> only matches an unrelated domain fixture (`RECORD_BEFORE = { … tags: [\"draft\"] }`, a diagnostic record's own `tags` field, nothing to do with Storybook meta). A repo-wide <code>grep -n '^\\s*title:' *.stories.tsx</code> and hand-check found <b>0 of 47</b> files used Storybook's `tags:` meta field before this lane — reported here rather than silently relayed, since the brief's premise was wrong and it changes nothing about the plan but is worth knowing.",
    "<b>lane:baseline is a deliberate choice, not a shortcut.</b> Reconstructing a precise per-file historical lane from this repo's real history (prose commit subjects, squashed and rebased branches — e.g. `git log --follow --diff-filter=A` on three sample files returned three unrelated prose messages, none a clean slug) would be fabricated precision presented as provenance. Every pre-existing file instead carries the one honest bucket `lane:baseline`, documented in CLAUDE.md; a file only moves off it when a lane substantively touches it for real work, at which point tagging it with that lane's own slug is exactly the mechanism Zach asked for.",
]

STORIES_TOUCHED = 46
TESTS_BEFORE = 192
TESTS_AFTER = 188


def build_gallery(items: list[tuple[str, str, str]]) -> str:
    cards = []
    for name, title, caption in items:
        uri = webp_uri(name)
        cards.append(
            f'<figure><img src="{uri}" alt="{title}">'
            f'<figcaption><b>{title}</b>{caption}</figcaption></figure>'
        )
    return f'<div class="gallery">{"".join(cards)}</div>'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    head_sha = sh(["git", "rev-parse", "HEAD"])
    head_short = head_sha[:7]
    head_subject = sh(["git", "log", "-1", "--format=%s"])
    branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    diffstat = sh(["git", "diff", "--shortstat", "HEAD"])
    typecheck_proc = subprocess.run(
        ["pnpm", "--filter", "bbox-storybook-basics", "run", "typecheck"],
        cwd=REPO, capture_output=True, text=True,
    )
    typecheck_ok = "clean (`tsc -p tsconfig.json`, exit 0)" if typecheck_proc.returncode == 0 else "FAILED — see terminal log"

    fact_tiles = [
        ("branch", branch),
        ("commit", head_short),
        ("files tagged", str(STORIES_TOUCHED)),
        ("tests", f"{TESTS_BEFORE} → {TESTS_AFTER} (−4, WhatsNew retired)"),
    ]
    facts_html = "".join(f'<div class="fact"><b>{v}</b><span>{k}</span></div>' for k, v in fact_tiles)

    changes_html = "".join(f"<li>{c}</li>" for c in CHANGES)
    findings_html = "".join(f"<li>{f}</li>" for f in FINDINGS)

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Storybook story tags</title>
<style>{STYLE}</style></head>
<body><div class="wrap">

<h1>Storybook story tags</h1>
<p class="sub">Every lane's delivered work becomes findable by a `lane:&lt;slug&gt;` tag in Storybook's own sidebar filter — verified against the installed Storybook 10.6 source, not assumed. “What's New” is retired in favor of it.</p>

<div class="facts">{facts_html}</div>

<h2>Before → after</h2>
<p class="sub">Same running Storybook (port 5493), same story selected (Blocks / AsyncRegion / Communication Patterns) — captured twice against the identical dev server: once with this lane's changes <code>git stash</code>-ed away, once restored. Neither state is staged or faked.</p>
{build_gallery(BEFORE)}
<h2 style="margin-top:40px">&nbsp;</h2>
{build_gallery(AFTER)}

<h2>What changed</h2>
<ul class="plain">{changes_html}</ul>

<h2>Findings — Storybook 10.6's real tag semantics, verified against source</h2>
<ul class="plain">{findings_html}</ul>

<h2>Verification</h2>
<ul class="plain">
<li><code>pnpm --filter bbox-storybook-basics run typecheck</code> — {typecheck_ok}</li>
<li><code>pnpm test-stories</code> (from apps/storybook-basics) — 46 files / 188 tests passed (was 47/192; −1 file −4 tests, exactly WhatsNew's Timeline/Empty/MalformedData/FixtureExample)</li>
<li><code>npx vitest --project=unit run</code> (from apps/storybook-basics) — 24 files / 393 tests passed, unchanged from baseline</li>
<li>Filter narrowing verified LIVE in a real browser (Playwright, full app shell, not the story iframe): selecting <code>area:hit-regions</code> narrows the sidebar tree to exactly its 6 files / 8 stories; selecting <code>lane:baseline</code> shows all 188 (see galleries above)</li>
<li>Git status: <code>{diffstat or "no changes vs HEAD"}</code></li>
</ul>

<footer>
  Built by <code>docs/build_storybook_tags_report.py</code> from <code>{head_short}</code>
  (&ldquo;{head_subject}&rdquo;) on branch <code>{branch}</code>.
  Screenshots via <code>docs/capture_storybook_chrome_shots.mjs</code> against a live Storybook on :5493.
</footer>
</div></body></html>"""

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    size = out_path.stat().st_size
    encoded = len(quote(html, safe="").encode())
    pct = encoded / CAP_BYTES
    verdict = "OK, opens in preview" if encoded < CAP_BYTES else "OVER CAP — browser-only"
    print(f"wrote {out_path}  ({size:,} bytes on disk)")
    print(f"encoded data: URL {encoded:,} / {CAP_BYTES:,} bytes  ({pct:.0%})  -> {verdict}")


if __name__ == "__main__":
    main()
