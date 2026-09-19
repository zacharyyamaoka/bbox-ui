# 0004 — A code cell's origin is a binding, not a setting

- **Status**: accepted
- **Date**: 2026-09-18
- **Decided by**: Zach's own note behind the source-code-view answers report
  ("Pseudo vs real"), settled in `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §3
  rule 2 before any lane existed; implemented by lane
  `scv-origin-and-actions`. Landed at merge per `docs/peps/README.md`.
- **Seam**: `apps/storybook-basics/src/scene/codeOrigin.ts:87` — the first
  line of `codeOriginState`, which carries a `WHY:` pointing here.
  `isCodeOrigin` in the same file is governed by the same ruling.

## The ruling

**The first semantic field a code node carries is a BINDING — a pointer you
can follow plus a hash you can check — and never a setting.** `origin` is
`{ uri, anchor, contentHash } | null`, and the four states a reader sees
(`pseudo`, `synced`, `drifted`, `orphaned`) are **computed** from that
binding and from what a host resolved *just now*. None of them is stored, so
none of them can be stale. `null` means the board owns the bytes; a present
binding means a file owns them and `codeCell.source` is a cache.

The corollary the code enforces: `pseudo` beats any resolution. A null
binding has nothing to resolve, so a host that resolved something anyway is
answering a question nobody asked, and its answer is discarded rather than
allowed to promote an unbound cell to "synced".

## What forced it

Ownership is exactly the fact that a *declaration* cannot keep. The event
that changes who owns a span — someone edits the file, someone renames the
definition, someone deletes it — is the same event that does not update a
declaration sitting beside it. A declaration is therefore stale precisely
when it matters, and there is no test that can catch it, because a
declaration agrees with itself.

A pointer plus a hash is not a declaration: it is checkable, and it is
checkable *cheaply*. `spanHash === contentHash` is one string compare, and
it answers the only question a reader actually has — "is what I am looking
at still what the file says?" — with one of four words.

Two facts fix the shape, both opened on disk:

- pyblocks applies the same **exact-keys** discipline in the other direction
  — `_is_exact_v1` at `/home/bam/pyblocks/pyblocks/systemsketch.py:415` is
  literally `set(payload) == keys and …`. A binding that round-trips through
  that mirror has to be validated the same way on this side, or one end
  writes a key the other silently drops while both believe they validated
  it. `isCodeOrigin` is therefore exact-keys, not "has at least these".
- the hash covers **the exact bytes of the span the partition reported**, so
  the comparison is an exact string compare with no case folding and no
  prefix stripping. `codeOrigin.test.ts` pins that by asserting an
  upper-cased hash and a prefix-less hash both read `drifted` — two
  spellings of one hash mean two producers, which is news, not formatting.

The whole judge is 22 assertions across `codeOrigin.test.ts` (13) and
`sourceActions.test.ts` (9), all green, and the function is total: a
garbage resolution (`{}`) reads `orphaned` rather than throwing.

## Options weighed

**A board- or app-level mode flag ("this board is file-backed").** Cheapest
to build, and it is how most code-adjacent canvases start. It loses because
ownership is *per cell*: the plan's own Rung B puts definition cells from
`stereo.py` on the same board as hand-drawn pseudo cells, and a single flag
has to lie about one of them. It also cannot answer "is this cell still in
sync" at all — a mode is not a check.

**A `# DO-NOT-EDIT — generated` header inside the cell's source.** Familiar,
self-documenting, travels with the text for free. It loses on the argument
above: the header is data *inside* the bytes it describes, so it is the one
thing an edit is guaranteed to carry along unchanged while making it false.
It is also unfalsifiable from outside — nothing can disagree with it.

**A `line:col` anchor instead of a qualified name + ordinal.** Precise,
trivially computed, and exactly what a naive implementation reaches for. It
loses because it rots under *any* edit above the definition, including edits
that do not touch it — a blank line inserted at the top of the file orphans
every cell below. A qualified name rots only when same-named definitions are
reordered, which is rarer and, unlike a line shift, is a real change to the
file's meaning (`identity.py`'s ladder; plan §3.3).

## What we give up

- **An unresolvable anchor is REPORTED, never re-guessed.** `orphaned` is a
  visible state with a red badge, not a recovery routine. We will not
  fuzzy-match a renamed definition to its likely successor, because a wrong
  guess re-binds a cell to bytes nobody chose and the hash then *agrees*.
  Re-binding is a gesture a human makes.
- **`drifted` is a dead end until someone acts.** The judge refuses to merge
  silently in either direction; the cell keeps showing its cached bytes and
  says so.
- **A down-migration is lossy on purpose.** Any host that persists a cell
  without the `origin` prop — an older board file, a canvas engine whose
  shape schema predates it — reads back as `pseudo`, and the binding is
  gone. That is the correct loss: a board that cannot carry a pointer cannot
  honour it either, and silently keeping a binding no reader validates is
  the stale declaration this record exists to refuse.
- **Two ways to read one cell's text.** `source` is canonical when `origin`
  is null and a cache when it is not, so every consumer has a branch. One
  field with two meanings was the alternative; a branch is cheaper than a
  lie.

## What would reopen it

**If a host ever needs the four states to be readable without doing IO** —
an offline export, a printed board, a diff of two board files — the states
would have to be materialised somewhere, and "computed, never stored" is
the sentence that breaks. The honest version of that is a *cache with a
timestamp* beside the binding, not a stored state replacing it; if anyone
proposes the second, this record is the thing they have to argue with.

Treat a second producer of `spanHash` as the other tripwire: the exact
string compare above is only safe while one slicer emits both sides.
