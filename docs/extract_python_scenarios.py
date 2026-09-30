#!/usr/bin/env python3
"""Pull the 57 scenario cards out of reports/python-syntax-scenarios-2026-09-23.html
into JSON, so the industry-vocabulary report is generated from the SAME source of
truth rather than a retyped copy that can drift from it.

    python3 docs/extract_python_scenarios.py --out FILE
"""
import argparse, html, json, re, sys

SRC = "/home/bam/bbox-ui/reports/python-syntax-scenarios-2026-09-23.html"


def text(frag):
    frag = re.sub(r"<br\s*/?>", "\n", frag)
    return html.unescape(re.sub(r"<[^>]+>", "", frag))


def flat(frag):
    return re.sub(r"\s+", " ", text(frag)).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    s = open(SRC, encoding="utf-8").read()

    sections = {}
    for m in re.finditer(r'<h2 id="(g-[a-z]+)"[^>]*>(.*?)</h2>', s, re.S):
        sections[m.start()] = (m.group(1), flat(m.group(2)))
    sec_starts = sorted(sections)

    out = []
    # Three container flavours carry a card: plain, FACET (a composition
    # pressure rather than a syntax node) and "gap" (a construct with no golden
    # exercising it). Matching only `class="sc"` silently swallowed the next
    # card's examples into the previous one's.
    card_re = r'<div class="sc(?: facet| gap)?" id="s-([A-Za-z0-9]+)">(.*?)(?=<div class="sc(?: facet| gap)?" id="s-|<h2 |<div class="toc")'
    for m in re.finditer(card_re, s, re.S):
        sid, card = m.group(1), m.group(2)
        flavour = re.match(r'<div class="sc( facet| gap)?"', s[m.start():]).group(1) or ""
        sec = next((sections[p] for p in reversed(sec_starts) if p < m.start()), ("?", "?"))
        title = flat(re.search(r"<h3>(.*?)</h3>", card, re.S).group(1))
        chip = re.search(r'<span class="chip ([a-z-]+)">(.*?)</span>', card, re.S)
        grammar = re.findall(r'<span class="n">(.*?)</span>', card)
        canon = re.search(r'<pre class="canon">(.*?)</pre>', card, re.S)
        ports = re.search(r'<p class="ports">(.*?)</p>', card, re.S)
        note = re.search(r'<p class="sc-note">(.*?)</p>', card, re.S)
        examples = []
        for ex in re.finditer(r'<div class="ex"><p class="cap">(.*?)</p><pre class="tight">(.*?)</pre></div>', card, re.S):
            examples.append({"caption": flat(ex.group(1)), "code": text(ex.group(2)).strip("\n")})
        out.append({
            "id": sid,
            "flavour": flavour.strip() or "syntax",
            "section": sec[1],
            "section_id": sec[0],
            "title": title,
            "kind": flat(chip.group(2)) if chip else "",
            "grammar": [flat(g) for g in grammar],
            "canonical": text(canon.group(1)).strip("\n") if canon else "",
            "ports": flat(ports.group(1)) if ports else "",
            "note": flat(note.group(1)) if note else "",
            "examples": examples,
        })

    bad = [c["id"] for c in out if len(c["examples"]) != 3]
    print(f"{len(out)} scenarios; {sum(len(c['examples']) for c in out)} examples")
    if bad:
        print("WARNING cards without exactly 3 examples:", bad, file=sys.stderr)
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("->", a.out)


if __name__ == "__main__":
    main()
