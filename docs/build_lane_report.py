#!/usr/bin/env python3
"""
Build a media-rich HTML report for ONE lane's work, from a small manifest.

Zach, 2026-09-17: "Can these subagents please create html media rich
reports afterwards of their work when suitable so I can review in the
report... I also wonder if [I could] quickly sort and see the ones that
have recently been edited, so I can provide feedback?"

Every report in this repo up to now (docs/build_proposals_report.py,
docs/build_remaining_report.py) is a one-off script: facts, captures and
copy all hand-written for that single day's review. That does not scale to
"every lane makes one of these" — so this is the shared builder those two
scripts should have been: a lane hands it a MANIFEST (see
docs/lane_report_manifest.example.json, which is also the literal input
used to build THIS report — see the bottom of this file) and gets back a
self-contained HTML page.

WHY a JSON manifest file and not CLI flags: a lane's report needs NESTED,
repeated structure — a list of changes, a list of findings, and a list of
stories that each carry (id, title, viewport, "what to look at"). That is
awkward to express as flags and easy to express as JSON; it is also the
same shape a lane's own dispatch prompt could emit directly, and it is
diffable/reviewable sitting next to the report it produced. A flag-per-field
CLI would need a new flag for every field a future lane wants to add; the
manifest just grows a key.

WHAT IS CARRIED OVER from the two existing builders (do not regress):
  - captures auto-cropped to their drawn content and re-encoded to WebP
    (crop_to_content / webp() below, generalizing build_tree_and_slots.py's
    trim()+crop_content() into one bounding-box crop that works on either
    axis, since a lane's own story sizes are not known in advance the way
    the two hand-written reports' fixed capture list was);
  - every number in the page is read off the tree at BUILD time (git, not
    a value typed into the manifest and trusted);
  - the encoded `data:` URL is measured against the desktop preview's
    2,097,024-byte ceiling and the percentage is printed, so a lane knows
    before handing the link over whether it opens in-preview or is
    browser-only.

THE "WHERE TO LOOK LIVE" TABLE is the specific thing Zach asked for
("I can see actually which areas of storybook I should check out") — it is
rendered directly under the summary, before "what changed", not as a
footer, and it is built from the SAME `stories` list that drives capture
(one list, not a duplicated table + capture config that could drift apart).

USAGE
  python3 docs/build_lane_report.py <manifest.json> [--port N] [--skip-capture] [--out PATH]

MANIFEST SHAPE (see docs/lane_report_manifest.example.json for a real one):
  {
    "title": "...",                    # required
    "summary": "one line",             # required
    "repo_path": "…",                  # optional; default: this script's own repo root
    "base_ref": "main",                # optional; default "main"
    "branch_label": "…",               # optional; default: `git rev-parse --abbrev-ref HEAD`
    "storybook_port": 5463,            # required if "stories" is non-empty
    "changes": ["…", "…"],
    "findings": ["…", "…"],
    "stories": [
      {"id": "blocks-block--default", "title": "Block · Default", "look_for": "…", "w": 900, "h": 600}
    ],
    "slug": "…",                       # optional; default: slugified title
    "date": "2026-09-17",              # optional; default: today
    "sections": [                      # optional; rendered between Findings
      {                                # and Captures, in manifest order.
        "heading": "…",                # required per section
        "html": "<raw html>",          # optional inline body, OR:
        "html_file": "docs/frag.html", # optional file (relative to the lane
                                       # repo) whose text is inlined verbatim
        "images": [                    # optional figures under the body
          {"file": "path.png|.svg", "title": "…", "caption": "…"}
        ]                              # .svg is inlined as text (crisp, small);
      }                                # rasters go through the same
    ]                                  # crop+WebP pipeline as captures
  }

WHY `sections` exists (2026-09-17, comparison-next-steps lane): a PLAN's
report owes rendered MOCKS of things that do not exist yet — there is no
story to capture, so the capture pipeline alone cannot carry a plan's
evidence. A generic ordered-sections key keeps this the shared builder
(one report grammar, every lane) instead of forcing plan lanes back to
one-off scripts. Manifests without `sections` are byte-for-byte unchanged.
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import re
import subprocess
import sys
from datetime import date
from urllib.parse import quote

from PIL import Image, ImageChops

REPO = pathlib.Path("/home/bam/bbox-ui")
DEFAULT_LANE_REPO = pathlib.Path(__file__).resolve().parent.parent
CAP_BYTES = 2_097_024


def sh(cmd: list[str], cwd: pathlib.Path) -> str:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True).stdout.strip()


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


# ---------------------------------------------------------------------------
# image processing — bounding-box crop to drawn content, then WebP.
#
# Generalizes build_tree_and_slots.py's trim() (bottom-only, for tall pages)
# and crop_content() (full bbox, but assumes a fixed inset "frame") into one
# function: a lane's story viewports are not known ahead of time the way
# that script's fixed capture list was, so the crop cannot assume which edge
# has the whitespace or how wide a frame to discount.
# ---------------------------------------------------------------------------
def crop_to_content(im: Image.Image, margin: int = 20, threshold: int = 24) -> Image.Image:
    """Crop to the bounding box of pixels that differ from the background
    (sampled from the image's own corner), plus a margin. Falls back to the
    full image if nothing differs (a blank capture — left as-is so a broken
    story is visibly blank in the report rather than erroring the build)."""
    rgb = im.convert("RGB")
    background = Image.new("RGB", rgb.size, rgb.getpixel((rgb.width - 1, rgb.height - 1)))
    box = ImageChops.difference(rgb, background).point(lambda v: 255 if v > threshold else 0).getbbox()
    if not box:
        return im
    left, top, right, bottom = box
    return im.crop((
        max(0, left - margin),
        max(0, top - margin),
        min(im.width, right + margin),
        min(im.height, bottom + margin),
    ))


def webp_data_uri(path: pathlib.Path, quality: int = 82) -> str:
    im = crop_to_content(Image.open(path))
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "WEBP", quality=quality)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------
# manifest + facts
# ---------------------------------------------------------------------------
def load_manifest(path: pathlib.Path) -> dict:
    manifest = json.loads(path.read_text())
    for required in ("title", "summary"):
        if not manifest.get(required):
            raise SystemExit(f"manifest is missing required field: {required!r}")
    return manifest


def git_facts(lane_repo: pathlib.Path, base_ref: str) -> dict:
    """Every fact here is read off the LANE's own tree at build time — never
    copied from the manifest — so a stale manifest cannot misreport it."""
    head_sha = sh(["git", "rev-parse", "HEAD"], lane_repo)
    facts = {
        "head_sha": head_sha,
        "head_short_sha": head_sha[:7],
        "head_subject": sh(["git", "log", "-1", "--format=%s"], lane_repo),
        "branch": sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], lane_repo),
        "base_ref": base_ref,
        "commits_since_base": None,
        "diffstat": None,
    }
    merge_base = sh(["git", "merge-base", base_ref, "HEAD"], lane_repo)
    if merge_base:
        oneline = sh(["git", "log", "--oneline", f"{merge_base}..HEAD"], lane_repo)
        facts["commits_since_base"] = len(oneline.splitlines()) if oneline else 0
        shortstat = sh(["git", "diff", "--shortstat", f"{merge_base}...HEAD"], lane_repo)
        facts["diffstat"] = shortstat or "no changes vs base"
    return facts


# ---------------------------------------------------------------------------
# capture
# ---------------------------------------------------------------------------
def run_capture(lane_repo: pathlib.Path, media_dir: pathlib.Path, stories: list[dict], port: int) -> dict:
    """Calls the LANE's own docs/capture_storybook_shots.mjs (its own
    playwright install, its own running dev server on `port` — never
    :5421) against exactly the story list this manifest asked for. Returns
    the capture script's own manifest.json (ok/fail per shot) so failures
    can be reported rather than silently dropped."""
    capture_script = lane_repo / "docs/capture_storybook_shots.mjs"
    if not capture_script.exists():
        raise SystemExit(f"missing {capture_script} — is repo_path pointed at a real bbox-ui checkout?")

    shots = [
        {
            "id": s["id"],
            "w": s.get("w", 1000),
            "h": s.get("h", 700),
            "name": s.get("name") or slugify(s["id"]),
            # Optional per-story settle (ms) before the screenshot — for
            # stories whose play function IS the picture (a drag/zoom
            # journey's end state). Passed through to
            # capture_storybook_shots.mjs, which defaults it to 450.
            **({"settle": s["settle"]} if "settle" in s else {}),
        }
        for s in stories
    ]
    shots_file = media_dir / "_shots.json"
    media_dir.mkdir(parents=True, exist_ok=True)
    shots_file.write_text(json.dumps(shots, indent=2))

    proc = subprocess.run(
        ["node", str(capture_script), "--port", str(port), "--out", str(media_dir), "--shots", str(shots_file)],
        cwd=lane_repo,
        capture_output=True,
        text=True,
    )
    print("--- capture_storybook_shots.mjs ---")
    print(proc.stdout)
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        print(f"(capture exited {proc.returncode} — continuing with whatever DID capture)")
    print("------------------------------------")

    capture_manifest_path = media_dir / "manifest.json"
    if not capture_manifest_path.exists():
        return {}
    entries = json.loads(capture_manifest_path.read_text())
    return {e["name"]: e for e in entries}


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
STYLE = """
:root {
  --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38;
  --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
  --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#d29922; --err:#e5534b;
  --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
* { box-sizing:border-box }
body { margin:0; background:var(--bg); color:var(--fg);
  font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
.wrap { max-width:1080px; margin:0 auto; padding:48px 24px 96px }
h1 { font-size:32px; line-height:1.15; margin:0 0 6px; letter-spacing:-.02em }
h2 { font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
     margin:56px 0 16px; font-weight:600 }
.sub { color:var(--dim); font-size:16px; margin:0 0 24px }
code { font-family:var(--mono); font-size:.92em; color:var(--accent2) }
a { color:var(--accent2) }

.facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:10px; margin:24px 0 8px }
.fact { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 16px }
.fact b { display:block; font-size:16px; font-family:var(--mono); letter-spacing:-.01em; word-break:break-all }
.fact span { font-size:11px; color:var(--dim2); text-transform:uppercase; letter-spacing:.08em }

table.look { width:100%; border-collapse:collapse; font-size:13.5px;
  background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden }
table.look th { text-align:left; color:var(--dim2); font-size:11px; text-transform:uppercase;
  letter-spacing:.08em; padding:10px 14px; background:var(--panel2); border-bottom:1px solid var(--line) }
table.look td { padding:10px 14px; border-bottom:1px solid #1f232b; vertical-align:top }
table.look tr:last-child td { border-bottom:none }
table.look a { text-decoration:none; color:var(--fg); font-weight:600 }
table.look a:hover { color:var(--accent2) }

ul.plain { margin:0; padding-left:20px } ul.plain li { margin:0 0 8px }
ul.plain code { color:var(--accent2) }
.intro { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:6px 20px }
.intro p { margin:12px 0; color:var(--fg) } .intro b { color:var(--accent) }

.gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:18px }
figure { margin:0 }
figure img { width:100%; display:block; border-radius:8px; border:1px solid var(--line); background:#0a0b0e }
figcaption { font-size:12.5px; color:var(--dim2); margin-top:8px; line-height:1.5 }
figcaption b { display:block; color:var(--fg); font-size:13px; margin-bottom:2px }

.fail { background:#2a1c19; border:1px solid #4a2b24; border-radius:10px; padding:14px 18px;
  color:#f0a68e; font-size:13.5px; margin:16px 0 }

footer { margin-top:72px; padding-top:20px; border-top:1px solid var(--line);
  color:var(--dim2); font-size:12.5px }
"""


def render_sections(manifest: dict, lane_repo: pathlib.Path) -> str:
    """Optional `sections` — see the docstring. Each renders as its own
    <h2> block between Findings and Captures. Bodies are trusted HTML
    authored by the lane's own manifest (the same trust level as `changes`
    and `findings`, which are already raw HTML list items)."""
    rendered = []
    for section in manifest.get("sections", []):
        parts = [f"<h2>{section['heading']}</h2>"]
        body = section.get("html", "")
        if section.get("html_file"):
            body_path = pathlib.Path(section["html_file"])
            if not body_path.is_absolute():
                body_path = lane_repo / body_path
            body += body_path.read_text()
        if body:
            parts.append(body)
        figures = []
        for image in section.get("images", []):
            image_path = pathlib.Path(image["file"])
            if not image_path.is_absolute():
                image_path = lane_repo / image_path
            if image_path.suffix.lower() == ".svg":
                media = image_path.read_text()
            else:
                media = f'<img src="{webp_data_uri(image_path)}" alt="{image.get("title", image_path.name)}">'
            figures.append(
                f"<figure>{media}<figcaption><b>{image.get('title', '')}</b>"
                f"{image.get('caption', '')}</figcaption></figure>"
            )
        if figures:
            parts.append(f'<div class="gallery">{"".join(figures)}</div>')
        rendered.append("".join(parts))
    return "".join(rendered)


def build_html(manifest: dict, facts: dict, captures: dict, capture_port: int | None,
               lane_repo: pathlib.Path = DEFAULT_LANE_REPO) -> str:
    title = manifest["title"]
    stories = manifest.get("stories", [])

    fact_tiles = [
        ("branch", manifest.get("branch_label") or facts["branch"]),
        ("commit", facts["head_short_sha"]),
        ("since " + facts["base_ref"], f"{facts['commits_since_base']} commits" if facts["commits_since_base"] is not None else "n/a"),
        ("diff vs " + facts["base_ref"], facts["diffstat"] or "n/a"),
    ]
    facts_html = "".join(
        f'<div class="fact"><b>{v}</b><span>{k}</span></div>' for k, v in fact_tiles
    )

    def look_cell(s: dict) -> str:
        name = s.get("name") or slugify(s["id"])
        if name in captures:
            return f'<a href="#shot-{name}">{s["id"]}</a>'
        return f'<code>{s["id"]}</code>'

    look_rows = "".join(
        f"<tr><td>{look_cell(s)}</td><td>{s.get('title', s['id'])}</td><td>{s.get('look_for', '')}</td></tr>"
        for s in stories
    )
    look_table = (
        f'<table class="look"><tr><th>Story</th><th>What it is</th><th>What to look at</th></tr>{look_rows}</table>'
        if stories else '<p class="sub">This lane did not name any stories to look at.</p>'
    )

    changes_html = "".join(f"<li>{c}</li>" for c in manifest.get("changes", []))
    findings_html = "".join(f"<li>{f}</li>" for f in manifest.get("findings", []))

    # Optional `intro`: a list of paragraphs (raw HTML allowed, like every
    # other manifest string) rendered ABOVE the look-live table — for the
    # lane whose report has to LEAD with a status answer ("what existed,
    # what this adds, what is still missing") rather than jump straight to
    # stories. Additive: absent in every existing manifest.
    intro_html = "".join(f"<p>{p}</p>" for p in manifest.get("intro", []))
    intro_block = f'<h2>Status</h2><div class="intro">{intro_html}</div>' if intro_html else ""

    gallery_cards = []
    failures = []
    for s in stories:
        name = s.get("name") or slugify(s["id"])
        entry = captures.get(name)
        if not entry or not entry.get("ok"):
            failures.append(f'{s["id"]} ({entry.get("error", "not captured") if entry else "not captured"})')
            continue
        uri = webp_data_uri(pathlib.Path(entry["file"]))
        gallery_cards.append(
            f'<figure id="shot-{name}"><img src="{uri}" alt="{s["id"]}">'
            f'<figcaption><b>{s.get("title", s["id"])}</b>{s.get("look_for", "")}</figcaption></figure>'
        )
    gallery_html = "".join(gallery_cards) or '<p class="sub">No captures.</p>'
    failures_html = (
        f'<div class="fail"><b>Capture failures</b> — {"; ".join(failures)}</div>' if failures else ""
    )

    port_note = f" against Storybook on :{capture_port}" if capture_port else ""

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>{STYLE}</style></head>
<body><div class="wrap">

<h1>{title}</h1>
<p class="sub">{manifest["summary"]}</p>

<div class="facts">{facts_html}</div>

{intro_block}

<h2>Where to look live</h2>
{look_table}

<h2>What changed</h2>
<ul class="plain">{changes_html}</ul>

<h2>Findings</h2>
<ul class="plain">{findings_html}</ul>

{render_sections(manifest, lane_repo)}

<h2>Captures{port_note}</h2>
{failures_html}
<div class="gallery">{gallery_html}</div>

<footer>
  Built by <code>docs/build_lane_report.py</code> from <code>{facts["head_short_sha"]}</code>
  (&ldquo;{facts["head_subject"]}&rdquo;) on branch <code>{facts["branch"]}</code>.
  Every fact above is read off the lane's own tree at build time.
</footer>
</div></body></html>"""


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0].startswith("--"):
        raise SystemExit(__doc__)
    manifest_path = pathlib.Path(args[0]).resolve()
    flags = args[1:]

    def flag_val(name: str, default=None):
        if name in flags:
            i = flags.index(name)
            return flags[i + 1] if i + 1 < len(flags) else default
        return default

    skip_capture = "--skip-capture" in flags
    port_override = flag_val("--port")
    out_override = flag_val("--out")

    manifest = load_manifest(manifest_path)

    lane_repo_field = manifest.get("repo_path")
    lane_repo = (pathlib.Path(lane_repo_field).expanduser().resolve() if lane_repo_field else DEFAULT_LANE_REPO)
    base_ref = manifest.get("base_ref", "main")
    facts = git_facts(lane_repo, base_ref)

    slug = manifest.get("slug") or slugify(manifest["title"])
    report_date = manifest.get("date") or date.today().isoformat()
    media_dir = REPO / "reports/media" / f"{slug}-{report_date}"
    out_path = pathlib.Path(out_override).resolve() if out_override else REPO / "reports/media" / f"{slug}-{report_date}.html"

    stories = manifest.get("stories", [])
    port = int(port_override) if port_override else manifest.get("storybook_port")
    captures: dict = {}
    if stories and not skip_capture:
        if not port:
            raise SystemExit("manifest has `stories` but no `storybook_port` (and no --port override)")
        captures = run_capture(lane_repo, media_dir, stories, port)
    elif stories and skip_capture:
        # Reuse whatever a previous run already captured into media_dir.
        capture_manifest_path = media_dir / "manifest.json"
        if capture_manifest_path.exists():
            captures = {e["name"]: e for e in json.loads(capture_manifest_path.read_text())}

    html = build_html(manifest, facts, captures, port if stories else None, lane_repo)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    size = out_path.stat().st_size
    print(f"wrote {out_path}  ({size:,} bytes on disk)")

    encoded = len(quote(html, safe="").encode())
    pct = encoded / CAP_BYTES
    verdict = "OK, opens in preview" if encoded < CAP_BYTES else "OVER CAP — browser-only"
    print(f"encoded data: URL {encoded:,} / {CAP_BYTES:,} bytes  ({pct:.0%})  -> {verdict}")


if __name__ == "__main__":
    main()
