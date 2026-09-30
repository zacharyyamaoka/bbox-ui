#!/usr/bin/env python3
"""Download the proof screenshots the vocabulary sheets cite, and prove each one
is really an image before it is allowed into the report.

    python3 docs/fetch_vocab_proof_images.py --sheets sheets.json --out DIR

A cited URL that 404s, redirects to HTML, or decodes to a 1x1 tracking pixel is
dropped and listed. WHY that matters here: the whole point of the screenshot is
"this is not my drawing, this is what the tool actually looks like" — a broken
or wrong image makes the claim worse than no claim.
"""
from __future__ import annotations

import argparse, io, json, os, re, shutil, subprocess, sys
from PIL import Image

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48]


def fetch(url, dest):
    if url.startswith("/"):
        if not os.path.exists(url):
            return None, "local file missing"
        shutil.copyfile(url, dest)
        return dest, None
    r = subprocess.run(["curl", "-sL", "--max-time", "35", "-A", UA, "-o", dest, url],
                       capture_output=True)
    if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) < 600:
        return None, f"download failed ({os.path.getsize(dest) if os.path.exists(dest) else 0} bytes)"
    return dest, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    sheets = json.load(open(a.sheets))

    manifest, dropped, kept_per = {}, [], {}
    for s in sheets:
        key = s["key"]
        kept_per[key] = []
        for i, im in enumerate(s.get("proof_images", [])):
            url = (im.get("url") or "").strip()
            if not url:
                continue
            name = f"{key}-{i}-{slug(im.get('construct', 'x'))}"
            tmp = os.path.join(a.out, name + ".bin")
            path, err = fetch(url, tmp)
            if err:
                dropped.append((key, url, err))
                continue
            try:
                img = Image.open(path)
                img.load()
                if img.width < 120 or img.height < 60:
                    raise ValueError(f"too small {img.width}x{img.height}")
            except Exception as exc:  # noqa: BLE001
                dropped.append((key, url, f"not a usable image: {exc}"))
                os.path.exists(path) and os.remove(path)
                continue
            final = os.path.join(a.out, name + ".png")
            img.convert("RGB").save(final)
            os.remove(path)
            manifest[name] = os.path.basename(final)
            kept_per[key].append(dict(im, key=name, w=img.width, h=img.height))

    # the hero for each vocabulary card: the widest kept image
    heroes = {}
    for key, ims in kept_per.items():
        if ims:
            best = max(ims, key=lambda m: m["w"] * m["h"])
            heroes[f"hero-{key}"] = manifest[best["key"]]
    manifest.update(heroes)

    json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=1)
    json.dump(kept_per, open(os.path.join(a.out, "kept.json"), "w"), indent=1)
    print(f"kept {len(manifest) - len(heroes)} images, {len(heroes)} heroes")
    for k, v in kept_per.items():
        print(f"  {k:12s} {len(v)}")
    if dropped:
        print(f"\ndropped {len(dropped)}:")
        for k, u, why in dropped:
            print(f"  {k:12s} {why:38s} {u[:90]}")


if __name__ == "__main__":
    main()
