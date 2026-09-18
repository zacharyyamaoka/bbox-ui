# Comparison view — next steps from the shipped baseline

**Status: plan, nothing new implemented.** 2026-09-17. This is the sequel to
`docs/COMPARISON-VIEW-PLAN.md` (cited below as **CVP** §n) — it does not
restate that research, it plans from where the tree actually is *after* CVP's
S1 and S2 landed (merge `32295b0`). The review surface for this plan is the
HTML report at `/home/bam/bbox-ui/reports/media/comparison-next-steps-2026-09-17.html`
(built by `docs/build_lane_report.py` from
`docs/lane_report_manifest_comparison_next_steps.json`); this file is the
lane-readable input an implementing worktree reads from a commit.

Donor `/home/bam/systemsketch` read-only at `10748b8c`. Every donor claim
below was re-verified against the tree today, not carried from memory:
`CompareDialog.tsx` 1,127 lines, `PropertyTable.tsx` 583, `propertyRows.ts`
247 (`elementSummaries` at `:216`, `orderChanges` at `:243`),
`BoardRender.tsx` 280 (`useLinkedCameras` at `:258`), the cable-endpoints WHY
at `compareModel.ts:184-187`, `BLOCK_STATES` at `blockModel.ts:214`,
`DIFF_VARIANT_TRAITS` at `diffPresentation.ts:99-106`, the
diff-must-not-depend-on-lint WHY in the `diagnosticSeverityState` docstring
at `diagnosticsModel.ts:48-64`.

---

## 1 · What already shipped, and what it overtakes

CVP §6's S1 and S2 are **built, merged, and green** — verified in this tree,
not assumed: unit `393/393`, stories `47 files / 192 tests`, tsc clean
(re-run 2026-09-17 in this worktree).

| Shipped | What it is | What it overtakes in CVP |
|---|---|---|
| `src/scene/wordDiff.ts`, `fieldDiff.ts`, `lineDiff.ts` | Verbatim donor ports, byte-identical after provenance banners | §6 S1 — done |
| `src/scene/wordDiff.test.ts` (15/15) | Verbatim donor suite, green **here** | CVP's first "What I could not verify" bullet — closed |
| `src/scene/sceneDiff.ts` + test (18/18) | The three-state model re-expressed over `BlockScene`; `withoutDiffState` as a data-key strip | §6 S2 — done |
| `diffScene(before, after, portsOf?)` with `portsOf: {before, after}` resolvers | Port vocabulary from both sides, same callback shape as `findDanglingEdges` (`scene.ts:424`) | **§3's "Port-level diff: ❌ blocked … impossible" is no longer true.** Port add/remove diff works today with zero scene-contract change. |
| `src/stories/SceneDiff.stories.tsx` (4 variants, story-local markup, imports no component) | Surface-A output made visible | §6 S4, *partially* — the math-output gallery exists; the **paint** gallery (the six `DIFF_VARIANT_TRAITS` rows) still waits on paint |

**What the resolver seam does *not* give:** port **rename** detection. The
resolvers speak port *ids* only, so `ScenePortDiff` is `added | removed` by
construction (`sceneDiff.ts`, `ScenePortDiff` doc) — a renamed port reads as
removed+added. That is the honest remainder of CVP §3's gap, and it belongs
to S7 (or to widening the resolver to `{id, label}` records), not to any step
below.

---

## 2 · The two-producer ruling

**Diff marks get their own prop. The diff producer never writes into the
`diagnostics` list.** `INVALID-STATES-PLAN.md` §6 said "two props" when §1
still specified a scalar; §1's amendment to `diagnostics?: Diagnostic[]` with
stable ids re-opened the question, and this section re-closes it — same
answer, stronger reasons, so no future session re-litigates it from scratch.

The case *for* one list is real: a list with producer-owned stable ids is
exactly the multi-producer mechanism, and it did not exist when §6 was
written. It loses on five grounds:

1. **No common order.** The `diagnostics` prop's one component-level merge
   rule is `max(severity)` — halo color, flag count, popover sort all hang
   off it. `added | removed | modified` has no order: there is no "worst" of
   added-vs-removed, and any severity assigned to smuggle diff entries in
   (`modified → warning`?) is a lie the component would then *rank by*. A
   list whose merge rule cannot apply to some of its entries is two props
   sharing a field name.
2. **No common payload.** A `Diagnostic` is `{id, severity, message?, code?}`
   — prose about a judgement. A diff mark carries structured ink inputs:
   an operation, `FieldDiff[]` word tokens, a `PriorPose` ghost, a variant.
   Fitting that into `Diagnostic` either drops the payload (no word ink, no
   ghosts — the entire donor vocabulary evaporates) or turns `Diagnostic`
   into a union that halo, flag, and popover must all branch over.
3. **Dependency direction.** The donor's WHY (`diagnosticsModel.ts:48-64`):
   *the diff lane must not depend on the lint lane*. A diff producer emitting
   `Diagnostic[]` imports the lint lane's types — the forbidden arrow, in the
   kit that adopted the rule by name (`sceneDiff.ts`'s header: "never on any
   `src/diagnostics/`-shaped module … must not become this file's business
   when it does").
4. **No common lifecycle.** Diagnostics are continuously re-derived on the
   live document and never persisted (the `received`/`dimmed` contract). Diff
   marks exist only under a comparison *lens* and clear whole-document
   (`withoutDiffState`; donor: *"a half-cleared diff is worse than an
   uncleared one"*, `clearDiffStates.ts:11`). One list would need per-entry
   clearing rules — producer tagging, i.e. two props hidden inside one.
5. **The ids answer a different question.** Stable ids protect multiple
   producers *of judgements* (graph linter + type checker + a future Python
   analyzer, all writing `Diagnostic`s without the maxGraph
   `setCellWarning(cell, null)` clobber). The diff lane is not a third
   judgement producer; it states facts about a *pair* of documents. The donor
   contract's rule 7 ("one vocabulary, two producers") named one *visual
   state vocabulary on the primitives* — which INVALID-STATES §6 already
   split, decisively, because a single enum makes changed-AND-broken
   inexpressible, and the donor's own record shows the coupling cost ("the
   lint producer is not wired to paint").

**What stays shared** (unchanged from INVALID-STATES §3/§6): the three
severity tokens wherever both lanes need severity ink, and the channel
discipline — diff owns fills/washes/chips/ghosts/token ink; diagnostics owns
outer halo, corner flag, wavy underline, cable backdrop, popover.

### The component-level merge rule — "changed AND broken"

When both producers mark one element, **both render, in full, on their
disjoint channels. There is no cross-axis precedence and no cross-axis
`max()`** — composition is by channel disjointness. Concretely, on a Block
that is `modified` and carries an `error`:

- the diff wash/fill and its chips paint **inside** the card (diff channels);
- the diagnostic halo prepends **outside** the card's outline — outside the
  diff outline too (INVALID-STATES §6's closing sentence, honored verbatim) —
  and the flag renders on top with its count;
- neither lane recolours or suppresses the other; the popover lists
  diagnostics only, a diff mark's detail lives on the diff surfaces (chips,
  property-table row);
- **the top-right corner belongs to `DiagnosticFlag`** (three library
  traditions converged on it — INVALID-STATES Appendix B; stop deliberating).
  The `delta-badge` variant's pose badge yields: it renders top-left, or not
  at all when that variant is off.

The prop itself, as N2 should spec it: `diff?: DiffMark` on each mark-bearing
component, `DiffMark = { operation: DiffOperation; fields?: readonly
FieldDiff[]; priorPose?: PriorPose }`, with the presentation variant
(`DiffVariant`) supplied by the host and defaulting per `DIFF_VARIANT_TRAITS`.
Names are the implementer's to refine; the two-props ruling and the merge
rule above are not.

---

## 3 · The sequence from here

CVP §6's numbering is kept where it still applies (S5–S7); the new work gets
N-numbers because S3/S4/S6's content shifted. Live lanes as of dispatch:
`src/components/**` (diagnostics implementation), `src/hosts/**` (tldraw
host + drag policy), `.storybook/**` + story `tags:` (navigation),
`src/skin/**` (skin extraction). Anything touching those trees is
**sequenced behind them, not parallel** — including adds-only new files,
because directory ownership is the contract, and N2 additionally *composes
against* the diagnostics prop, so it must build against that landed contract
rather than the plan of it (serialize on contracts, not on fear).

| # | Step | Was | Size | Write set | Blocked on |
|---|---|---|---|---|---|
| **N1** | `propertyRows` re-expressed over `SceneDiff` — `elementSummaries` + `orderChanges` (donor `propertyRows.ts:216,243`), consuming our diff rows instead of the donor's `CompareChange` | CVP §2 table's one unshipped surface-A row | **S–M** | `src/scene/propertyRows.ts` + `.test.ts`, new `src/stories/ScenePropertyRows.stories.tsx`, append `docs/ALGORITHM-PROVENANCE.md` | **nothing — dispatchable today** |
| **N2** | Diff paint on the components: per-component `diff` prop (§2 above), `DIFF_VARIANT_TRAITS` ported verbatim as data (new `src/components/diffInk.ts`), channel discipline + corner rule enforced, the changed-AND-broken composition proven in a play function with measured geometry | S3 | **M–L** | `src/components/{block,port,labeledPort,trace,traceBadge,editableText}.tsx`, new `diffInk.ts`, new stories | **barrier**: components lane AND skin lane must land first; reads the landed `diagnostics` contract |
| **N3** | The variant gallery: six `DIFF_VARIANT_TRAITS` rows over one fixture scene | S4's remaining half | **S** | new `src/stories/DiffVariants.stories.tsx` + fixture | N2 |
| **S5** | `useLinkedCameras` + blend, host-parameterised (23 donor lines, `BoardRender.tsx:258-280`: leader/follower + `applying` re-entrancy latch) | S5 | **S** | `src/hosts/useLinkedCameras.ts` + a host story | hosts lane must land first; independent of N2 |
| **S6** | `PropertyTable` re-expressed as a shadcn-flavoured component over N1's rows | S6 | **M** | new `src/components/propertyTable.tsx` + story | N1, and components lane landed (directory ownership) |
| **N6** | Minimal `CompareView` composition story: two `DomCanvas` hosts side-by-side, linked cameras, diff paint, property table, `side-by-side \| overlay` as one mode enum, blend slider, fullscreen-forces-overlay — the four CVP §5 behaviours proven live | the honest slice of the chrome | **M** | new story + small `src/hosts/compareView.tsx` | N2 + S5 + S6 |
| **S7** | Ports as scene records (`SceneHandle`) | S7 | **L** | `src/scene/**` + `portEdge.tsx` seam | **stays deferred** — see §5 |

Genuinely **unblocked now: N1 only** (plus this plan itself). Everything
component- or host-facing waits for its owning lane — that is a statement
about *today's* lanes, not about the work's intrinsic order; the day the
components lane lands, N2 is next, and N3 follows it within the same lane.

Not on the list at all: **`diff3Scene`** (three-way). CVP §4 settled the
contract question (a merge base is a pair of documents, not a field — see
§6's tripwire); the function itself is pure adds-only `src/scene/` work that
is *unblocked but valueless until a consumer exists*. Building math with no
surface invites drift. It enters the sequence the day a merge/conflict UI is
asked for, not before.

---

## 4 · The chrome, honestly sized

- **`CompareDialog.tsx` (1,127 lines) does not port as code — CVP §2/§5
  stand.** It is app chrome: launcher, dialog frame, tab persistence, an
  editor registry. Its four load-bearing behaviours (one camera two boards;
  side-by-side and overlay as one mode; fullscreen as a CSS stamp that
  forces overlay; element-first grouping) are exactly what N6 proves in a
  story at a fraction of the size. **The full dialog waits for a consuming
  app** — SystemSketch already has one; this repo has no surface that needs
  a modal today. Building it now would be productizing a capability nobody
  consumes.
- **`PropertyTable.tsx` (583 lines) is worth building (S6)** — it is the
  readable half of review, it is where element-first grouping pays off, and
  it is a genuine shadcn-shaped component this registry could eventually
  publish. Re-expressed over N1's rows, not ported.
- **`useLinkedCameras` is the bargain (S5):** 23 lines, and CVP §5 calls it
  the highest value-per-line item in the donor. Port it as a pattern the
  moment the hosts lane frees.

---

## 5 · S7 stays deferred

`docs/SCENE-KIT.md` ("What absorbing `portLane.ts`'s reconcile would take",
closing line) records the block: it edits `portEdge.tsx`'s controlled-items
seam, which another lane holds. The resolver seam removed the urgency — port
add/remove diff works today with no scene-contract change.

**Un-defer conditions, so this is a decision with an expiry rather than a
habit:** (a) port *rename* detection is wanted (§1's honest remainder — ids
alone cannot say "renamed"); (b) `reconcileNodePorts` absorption per
SCENE-KIT.md's own three-step scope; (c) a third consumer needs per-port
fields. Any one of these makes S7 next; it then runs as its own barrier lane
over a frozen `portEdge` contract. A cheaper middle exists for (a) alone —
widen `ScenePortsOf` to return `{id, label}` records — and should be weighed
against full S7 at that time, not pre-decided here.

---

## 6 · TRIPWIRE-CRDT-SCENE-VERSION

CVP §4's decision — **no version/provenance field on `BlockScene`; a merge
base is a pair of documents; `diff3(base, a, b)` takes three ordinary
scenes** — holds *conditionally*, and the condition is recorded here so a
future session discovers a decision that became unsettled instead of
rediscovering the argument:

> **If `BlockScene` ever becomes the unit of live sync** — CRDT, multiplayer
> editing, offline merge at the document layer; concretely: any lane adding
> Yjs/Automerge/Loro or a `version`/`clock`/`parent` field to the scene —
> **causality must live in the document, and CVP §4 is reopened, not
> extended.** The lane that introduces sync must revisit §4 *before*
> shipping the field, because once a host ships `version`, removing it is a
> breaking change to every consumer. Grep for `TRIPWIRE-CRDT-SCENE-VERSION`
> — this block and the report are the only places it appears until tripped.

Until tripped, `BlockScene` stays `{ nodes, edges }`.
