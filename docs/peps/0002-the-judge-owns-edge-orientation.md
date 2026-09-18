# 0002 — The judge owns edge orientation, not the caller

- **Status**: accepted
- **Date**: 2026-09-18
- **Decided by**: two lanes reaching it independently — the batch-wiring
  lane's own bug fix (`scene/batchWire.ts`'s `WireVerdict.oriented`,
  `git log` "writes the edge in the judge's DATAFLOW order" regression),
  and the validation-stack lane's adversarial audit of `validateConnection`
  finding it had no polarity rule at all — then landed together by the
  worktree-agent lane that unified them, base commit `8064ab6`.
- **Seam**: `apps/storybook-basics/src/scene/edgeValidation.ts`
  (`ConnectionVerdict`, `ConnectionOrientation`, the `polarity` gate) and
  `apps/storybook-basics/src/scene/lint.ts` (`PortDirection`,
  `PortDirectionOf`, the `polarity` rule). Both carry a `WHY:` pointing
  back here.

## The ruling

**A verdict that permits a connection must say which way it runs.**
`ConnectionVerdict`'s allowed branch is not `{ allowed: true }` — it is
`{ allowed: true, oriented: ConnectionOrientation }`, where `oriented`
carries the edge's actual dataflow ends (`source` = the port that emits),
whether or not that matches the order the candidate was written in
(`reversed: boolean` says so), and how the judge knows (`by: "polarity" |
"gesture"`). The type makes the old shape — "yes" with no orientation —
impossible to construct, not merely undocumented.

The alternative this rejects: leave orientation to the caller, who
re-derives "which end is the source" from whatever port-direction facts it
happens to have, separately from the judge that already computed the same
answer to decide legality in the first place.

## What forced it

Two lanes hit the SAME bug from opposite directions, independently, before
either knew the other existed:

1. **Batch wiring's own regression.** A gesture names its ends in the
   order a person (or a batch's own name-match resolver) touched them —
   not the dataflow direction. `resolveWirePair` paired one block's `logs`
   **input** with another's `logs` **output** by name, and the edge came
   out reversed: its arrowhead pointed the wrong way, and every
   `producersOf`, `consumersOf`, and `topologicalOrder` read that traversed
   it read it backwards. Fixed once, in one place
   (`WireVerdict.oriented`), it stopped being possible to introduce again
   at a new call site — the type requires an answer.

2. **The validation stack's own audit.** `validateConnection` (before this
   ruling) had no polarity rule at all. Probed against the real
   `ValidityPreview` fixture: dragging from `num1/out` painted `num2/out` —
   another OUTPUT — `"available"`. Deciding "is this legal under a
   polarity rule" and "which end is the source" are the same question
   asked from two ends: you cannot judge same-vs-opposite-polarity without
   first resolving each end's polarity, and having resolved it, throwing
   the answer away and making the caller guess is pure waste — and a caller
   that guesses wrong reintroduces defect (1).

Both symptoms trace to one root: **orientation was being decided in two
different places** (whatever ad hoc logic each caller wrote) instead of
one (the judge that already has the facts).

## Options weighed

- **Caller re-derives orientation from a separate `directionOf`/polarity
  lookup, after the judge says yes.** Rejected: this is exactly the
  status quo that produced both bugs above — two call sites (batch wiring,
  drag-time availability) each got their own chance to get it wrong, and
  one did. A third caller (magnetic wire proposals) would have been a
  third chance.
- **A `reversed: boolean` flag only, caller re-swaps the ends itself.**
  Rejected: still requires every caller to remember the swap step; the
  actual fix removes the step by handing over the already-swapped `ends`
  directly (`{ id, ...verdict.oriented.ends }` IS the edge to commit).
- **Keep polarity out of the port model entirely** (this kit's scene has
  no port-*direction* vocabulary — grepped, confirmed absent) **and
  refuse to add one.** Rejected as too strict: it would leave the
  output→output bug permanently unfixable for any host that DOES know
  its own port directions (every host tried so far does — wall placement
  for `block`, writer/reader for `value`). The compromise struck instead:
  direction is a caller-SUPPLIED resolver (`PortDirectionOf`), not a
  scene-model field — omitted, every existing scene lints byte-identically
  to before ruling 1 (the "undefined = unknown, no judgement" convention
  `PortsOf`/`PortTypeOf` already established), so this is additive, not a
  schema migration.

## What we give up

- **A `ConnectionVerdict` literal cannot be hand-authored as bare
  `{ allowed: true }` anywhere in this codebase** — every test fixture,
  every stub judge, must supply an `oriented` value (`gestureOrientation`
  exists specifically to make that one line instead of three). This
  rippled through every existing test file that had one
  (`magnetProposals.test.ts`, `availability.test.ts`, `edgeValidation.test.ts`).
- **The scene model still does not know port direction.** `validateConnection`
  and `lint.ts`'s `polarity` rule are both INERT (contribute nothing, refuse
  nothing) unless a caller supplies `directionOf` — this ruling did not
  invent a port-type/port-direction ontology for `scene.ts`, it only gave
  callers that already have one (via their own node data, like `HostScene`'s
  wall placement) a documented seam to plug it into `validateConnection`.
- **Batch wiring's own donor vocabulary (`same-polarity`, `input-occupied`,
  `duplicate`, ...) and `edgeValidation.ts`'s rule-id vocabulary
  (`polarity`, `many-to-one`, `duplicate-edge`, ...) still disagree on
  spelling.** `batchWireJudge.ts`'s `validateConnectionJudge` translates
  between them at the one seam that needs to (`REFUSAL_CODE`) rather than
  either vocabulary being renamed to match the other — batch wiring's
  tests and sentences (`describeWireRefusal`) were written against the
  donor's words first and are not this ruling's to rewrite.

## What would reopen it

If `scene.ts` ever grows a real port-direction FIELD (not a caller-supplied
resolver) — e.g. because a second host family needs direction and hand-
rolling its own `PortDirectionOf` the way `hostPolarityOf` does stops being
worth it — `ConnectionOrientation.by` collapses to always `"polarity"` and
the `"gesture"` fallback becomes dead code worth deleting, but the
`oriented`-on-every-allowed-verdict shape itself should not change: the
reason for it (a caller cannot forget to ask) is independent of where the
direction fact comes from.
