#!/usr/bin/env python3
"""Re-derive every `try/except/else/finally` claim the proposal report makes,
by RUNNING CPython rather than quoting a summary of it.

`build_try_except_proposals_report.py` executes this at build time and embeds
the output verbatim, so a claim in the report cannot drift from what the
interpreter on this machine actually does. Run it on its own to check:

    python3 docs/try_except_facts.py

Each block prints the question, then the measurement. Nothing here is
asserted; everything is observed.
"""
from __future__ import annotations

import ast
import sys

print(f"CPython {'.'.join(map(str, sys.version_info[:3]))}")
print()

print("1. is an `except` header a PATTERN or an evaluated EXPRESSION?")
src = "try:\n    pass\nexcept make_exc_class():\n    pass\n"
handler = ast.parse(src).body[0].handlers[0]
compile(src, "<probe>", "exec")
print(f"   except make_exc_class():   compiles, and handler.type is ast."
      f"{type(handler.type).__name__}")
case = ast.parse("match x:\n    case f():\n        pass\n").body[0].cases[0]
print(f"   case f():                  pattern node is ast.{type(case.pattern).__name__}"
      f"  -- a PATTERN, never an expr")
print("   -> `except` takes an arbitrary expression; `case` cannot. Different grammars.")
print()

print("2. is that expression really evaluated, with side effects?")
log: list[str] = []


def make():
    log.append("header evaluated")
    return ValueError


exec("try:\n    raise ValueError('x')\nexcept make() as e:\n    log.append('arm ran')\n",
     {"make": make, "log": log})
print(f"   {log}")
print()

print("3. does the `as e` capture survive its own arm?")
ns: dict = {}
exec("try:\n    raise ValueError('boom')\nexcept ValueError as e:\n    pass\n", ns, ns)
print(f"   'e' still bound after the arm: {'e' in ns}   -- scoped to the arm, deleted on exit")
print()

print("4. is the `else` suite protected by the except clauses above it?")
try:
    exec("try:\n    pass\nexcept ValueError:\n    print('   caught')\n"
         "else:\n    raise ValueError('raised in else')\n")
except ValueError as exc:
    print(f"   escaped the whole try statement: ValueError({exc})   -- NOT protected")
print()

print("5. `finally` against `return` -- which wins?")


def foo():
    try:
        return "try"
    finally:
        return "finally"


print(f"   try: return 'try' / finally: return 'finally'  ->  {foo()!r}")
print()

print("6. does `else` run when the try suite leaves early?")
ran: list[str] = []


def bar():
    try:
        return "early"
    except Exception:
        ran.append("except")
    else:
        ran.append("else")
    finally:
        ran.append("finally")


bar()
print(f"   suites that ran: {ran}   -- `else` did not; `finally` did")
print()

print("7. `except` vs `except*` -- how many arms fire?")
fired: list[str] = []
exec("""
try:
    raise ExceptionGroup("g", [ValueError("v"), TypeError("t"), KeyError("k")])
except* ValueError as eg:
    fired.append("ValueError* took " + str([type(x).__name__ for x in eg.exceptions]))
except* TypeError as eg:
    fired.append("TypeError*  took " + str([type(x).__name__ for x in eg.exceptions]))
except* Exception as eg:
    fired.append("Exception*  took " + str([type(x).__name__ for x in eg.exceptions]))
""", {"fired": fired})
for line in fired:
    print(f"   {line}")
print(f"   -> {len(fired)} arms fired. First-match-wins is FALSE for except*.")
print()

print("8. what the grammar refuses")
for label, probe in [("except + except* mixed",
                      "try:\n pass\nexcept* ValueError:\n pass\nexcept TypeError:\n pass\n"),
                     ("bare  except*:", "try:\n pass\nexcept*:\n pass\n"),
                     ("bare  except:", "try:\n pass\nexcept:\n pass\n")]:
    try:
        compile(probe, "<probe>", "exec")
        print(f"   {label:<26} legal")
    except SyntaxError as exc:
        print(f"   {label:<26} SyntaxError: {exc.msg}")
