#!/usr/bin/env python3
"""Derive a block's ports from ordinary Python, using marimo's own analyser.

This is the evidence behind the addendum in docs/build_canvas_notebook_report.py:
Zach's "if a block defines a df it should get a DF port" is not something we
have to invent — `marimo.Cell.refs` and `marimo.Cell.defs` are PUBLIC,
documented properties ("The references that this cell takes as input" / "The
definitions made by this cell"), and a wire is simply

    name in producer.defs  and  name in consumer.refs

Nothing here executes a cell. That is the whole point: a port has to be
knowable BEFORE the code runs, or it cannot be drawn. marimo derives defs/refs
by static AST analysis, which is exactly why it — and not a runtime tracer like
ipyflow — is the engine this design needs.

Run it against a throwaway venv so nothing lands in a project environment:

    uv venv /tmp/mv && uv pip install --python /tmp/mv/bin/python marimo
    /tmp/mv/bin/python docs/probe_marimo_ports.py > reports/media/shots-notebook/probe.out
"""
from __future__ import annotations

import marimo

app = marimo.App()


@app.cell
def load():
    import pandas as pd
    df = pd.read_csv("runs.csv")
    return df, pd


@app.cell
def normalise(df):
    norm = df / df.max()
    return (norm,)


@app.cell
def gap_of(norm):
    gap = 1 - norm.mean()
    return (gap,)


@app.cell
def histogram(norm):
    hist = norm.hist(bins=30)
    return (hist,)


@app.cell
def report(gap):
    print(gap)
    return ()


CELLS = {c.name: c for c in (load, normalise, gap_of, histogram, report)}
BOUND = set().union(*(c.defs for c in CELLS.values()))

print(f"marimo {marimo.__version__}  ·  public API only  ·  nothing is executed")
print()
print("PORTS — derived from the source, before anything runs")
for name, cell in CELLS.items():
    # A ref that nothing in the document binds is a builtin (`print`), not an
    # inlet: it has no producer, so it can never have a cable.
    inlets = sorted(r for r in cell.refs if r in BOUND)
    ins = ", ".join(inlets) or "—"
    outs = ", ".join(sorted(cell.defs)) or "—"
    print(f"  {name:10s} inlets = {ins:14s} outlets = {outs}")

WIRES = [
    (n, a, b)
    for a, ca in CELLS.items()
    for b, cb in CELLS.items()
    if a != b
    for n in sorted(ca.defs & cb.refs)
]
print()
print("WIRES — one per (name, producer, consumer). 20 lines of set intersection.")
for n, a, b in sorted(WIRES):
    print(f"  {n:6s} {a} -> {b}")


def descendants(start: str) -> list[str]:
    seen, stack = set(), [start]
    while stack:
        cur = stack.pop()
        for _, a, b in WIRES:
            if a == cur and b not in seen:
                seen.add(b)
                stack.append(b)
    return sorted(seen)


print()
print("ORDER — read off the same wires. No thread, no numbering, no stack needed.")
print(f"  edit 'load'   -> re-runs {descendants('load')}")
print(f"  edit 'gap_of' -> re-runs {descendants('gap_of')}")
print("  'gap_of' and 'histogram' are siblings, so they run IN PARALLEL:",
      "histogram" not in descendants("gap_of") and "gap_of" not in descendants("histogram"))

PARENTS = {c: {a for n, a, b in WIRES if b == c} for c in CELLS}
CHILDREN = {c: {b for n, a, b in WIRES if a == c} for c in CELLS}


def is_chain(selection: list[str]) -> bool:
    """Is this selection a PATH in the DAG — the only shape a stack can tell
    the truth about? Siblings in a stack assert an order the graph does not
    have, which is exactly the lie Jupyter's cell order tells."""
    sel = set(selection)
    inner = {c: (PARENTS[c] & sel, CHILDREN[c] & sel) for c in sel}
    if any(len(p) > 1 or len(ch) > 1 for p, ch in inner.values()):
        return False
    heads = [c for c, (p, _) in inner.items() if not p]
    if len(heads) != 1:
        return False
    walked, cur = [], heads[0]
    while cur:
        walked.append(cur)
        nxt = inner[cur][1]
        cur = next(iter(nxt)) if nxt else None
    return len(walked) == len(sel)


print()
print("STACK HONESTY — 'Stack this' is only offerable when the selection is a chain")
for sel in (["load", "normalise", "gap_of"], ["gap_of", "histogram"],
            ["normalise", "gap_of", "histogram"]):
    print(f"  {str(sel):46s} chain? {is_chain(sel)}")

print()
print("THE SINGLE-DEFINITION RULE — why the df outlet is well-defined")
from marimo._ast.compiler import compile_cell          # noqa: E402  (private: see report)
from marimo._runtime.dataflow import DirectedGraph     # noqa: E402

g = DirectedGraph()
for cid, code in {
    "c2": 'df = pd.read_csv("runs.csv")',
    "c3": "norm = df / df.max()",
    "c7": "df = df.dropna()",
}.items():
    g.register_cell(cid, compile_cell(code, cell_id=cid))
print("  added a second binding of df:  c7: df = df.dropna()")
print(f"  get_multiply_defined()     -> {g.get_multiply_defined()}")
print(f"  get_defining_cells('df')   -> {sorted(g.get_defining_cells('df'))}")
print("  => the df OUTLET would have two producers. marimo refuses it, and so must a port.")
