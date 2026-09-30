#!/usr/bin/env python3
"""Drag a cable; the cable writes the code. Executed, not asserted.

Zach, Daily Note - Sep 18 2026: "when we start adding round trip editing, by
dragging the cable we actually edit the code!! thats the whole point"

Right — and the vault already bounds how far that can go. A cable drag is a
`put` in the lens sense (C - Bidirectional Transformation (Lenses)), and
Lechtenboerger's undoability test (PODS 2003) says a view update is translatable
precisely iff its effect can be undone from within the view. That is a
MECHANICAL test, so this file runs it per gesture instead of arguing about it.

Read side is marimo's AST analysis (Cell.refs / .defs). The WRITE side must be a
CST, or every cable drag silently reformats the human's file and eats their
comments — see C - Comment Preserving Code Editing (CST vs AST). So: libcst,
never `ast`.

    uv venv /tmp/mv && uv pip install --python /tmp/mv/bin/python marimo libcst
    /tmp/mv/bin/python docs/probe_cable_edit.py > docs/probe_cable_edit.out
"""
from __future__ import annotations

import importlib.metadata as meta

import libcst as cst
import marimo
from marimo._ast.compiler import compile_cell

# A cell as a human actually writes one: a comment above, a trailing comment,
# and spacing nobody would choose. All three have to survive a cable drag, or
# the gesture is not usable on real code.
ORIGINAL = (
    '# the distribution is the whole point of this board\n'
    'hist = df.hist( bins = 30 )   # 30 is deliberate, do not tidy this\n'
)


class Rebind(cst.CSTTransformer):
    """The whole implementation of "drag a cable onto an inlet".

    Renames a FREE reference only. A Name that is the target of an assignment is
    left alone: rebinding an inlet must never silently rename somebody's outlet,
    because that is a different gesture with a different undo.
    """

    def __init__(self, old: str, new: str, bound: set[int]) -> None:
        self.old, self.new, self.bound = old, new, bound

    def leave_Name(self, original: cst.Name, updated: cst.Name) -> cst.Name:
        if original.value == self.old and id(original) not in self.bound:
            return updated.with_changes(value=self.new)
        return updated


class CollectBindings(cst.CSTVisitor):
    def __init__(self) -> None:
        self.bound: set[int] = set()

    def visit_AssignTarget(self, node: cst.AssignTarget) -> None:
        if isinstance(node.target, cst.Name):
            self.bound.add(id(node.target))

    def visit_AnnAssign(self, node: cst.AnnAssign) -> None:
        if isinstance(node.target, cst.Name):
            self.bound.add(id(node.target))


def rebind(source: str, old: str, new: str) -> str:
    """put() — the cable drag, as one minimal comment-preserving CST edit."""
    module = cst.parse_module(source)
    collector = CollectBindings()
    module.visit(collector)
    return module.visit(Rebind(old, new, collector.bound)).code


def inlets(source: str) -> list[str]:
    """get() — the wire, re-derived from the source by marimo's own analyser."""
    return sorted(compile_cell(source, cell_id="probe").refs)


def outlets(source: str) -> list[str]:
    return sorted(compile_cell(source, cell_id="probe").defs)


def rule(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


TIDY = "do not tidy this"
SPACED = "hist( bins = 30 )"
ABOVE = "the whole point of this board"

print(f"marimo {marimo.__version__} · libcst {meta.version('libcst')} · nothing is executed")

rule("THE CELL A HUMAN WROTE")
print(ORIGINAL, end="")
print(f"get(source) -> inlets {inlets(ORIGINAL)}, outlets {outlets(ORIGINAL)}")

rule("GESTURE 1 · REBIND — drag the `norm` cable onto the `df` inlet")
after = rebind(ORIGINAL, "df", "norm")
print(after, end="")
print(f"get(put(source, norm)) -> inlets {inlets(after)}")
print(f"  round-trip law, get(put(w)) == w : {inlets(after) == ['norm']}")
print(f"  comment above survived           : {ABOVE in after}")
print(f"  trailing comment survived        : {TIDY in after}")
print(f"  the spacing nobody would choose  : {SPACED in after}")
print(f"  the outlet was NOT touched       : {outlets(after) == ['hist']}")

rule("THE UNDOABILITY TEST (Lechtenboerger, PODS 2003)")
back = rebind(after, "norm", "df")
print(f"  drag `df` back onto the inlet -> byte-identical to the original? {back == ORIGINAL}")
print("  => REBIND is undoable from inside the view, so it is a legal silent drag.")

rule("GESTURE 2 · RENAME a port")
producer = "norm = df / df.max()   # normalised, see the memo\n"
print(f"  producer : {producer.strip()}")
print(f"  rebind('norm'->'scaled') on the producer leaves the BINDING alone:")
print(f"             {rebind(producer, 'norm', 'scaled').strip()}")
print("  => a rename is two edits, not one: rebind every consumer, then re-bind the")
print("     producer. marimo's single-definition rule is what makes it exact — one")
print("     producer, N consumers, all statically known, so it is a correct global")
print("     refactor rather than a search-and-replace.")

rule("GESTURE 3 · CUT — deleting a cable is not an edit at all")
print("  hist = df.hist(bins=30)    remove the `df` reference and you are left with")
print("  hist = .hist(bins=30)      which is not Python. There is no name to put there.")
print("  Undoable from inside the view? NO — the undo needs the expression you deleted,")
print("  and the wire never carried it.")
print("  Same for CONNECT into a block that references nothing: there is no inlet to")
print("  land on, so the tool must ask WHERE, and a drag cannot ask.")

rule("THE BAND, STATED ONCE")
print("  legal as a silent drag : REBIND an existing inlet · RENAME a port")
print("  named command, preview : CONNECT a new reference · CUT · anything abstracting")
print("  never under a drag     : an LLM. Too slow, nondeterministic and untestable at")
print("                           interaction speed; it proposes a diff, it is not the")
print("                           edit engine. (Round Tripping note, Rule 6.)")
