# Comparison view — next steps from the shipped baseline

**Status: plan, revision 2 — revised after Zach answered the open questions**
(2026-09-17, `zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md:2589`,
"For the comparions view"). Three of his answers expand scope, so this
revision re-sequences rather than appends; §2's reconciliation, §4, §5,
§6, and §8's confirmation are new.
This is the sequel to `docs/COMPARISON-VIEW-PLAN.md` (cited as **CVP** §n) —
it plans from where the tree is *after* CVP's S1/S2 landed. The review
surface is `/home/bam/bbox-ui/reports/media/comparison-next-steps-2026-09-17.html`
(same link as revision 1, rebuilt); this file is the lane-readable input.

Donors, all read-only: `/home/bam/systemsketch` at `10748b8c`,
`/home/bam/pyblocks` (the diff engine + its research corpus — §6 reads it
properly this time). Every citation below was verified against the tree
today. Revision 1's verified set still holds (CompareDialog 1,127 ·
PropertyTable 583 · propertyRows 247 with `elementSummaries:216`/
`orderChanges:243` · `useLinkedCameras` at `BoardRender.tsx:258` · the
cable-endpoints WHY at `compareModel.ts:184-187` · `BLOCK_STATES` at
`blockModel.ts:214` · `DIFF_VARIANT_TRAITS` at `diffPresentation.ts:99-106` ·
the diff-must-not-depend-on-lint WHY at `diagnosticsModel.ts:48-64`), plus
§6's new pyblocks citations.

---

## 1 · What already shipped, and what it overtakes

CVP §6's S1 and S2 are **built, merged, and green** — re-verified in this
tree after the tags merge: unit `24 files / 393`, stories `46 files / 188`
(the 4-test drop from revision 1 is exactly `WhatsNew.stories.tsx`, retired
by the tags lane), tsc clean.

| Shipped | What it overtakes in CVP |
|---|---|
| `src/scene/wordDiff.ts`, `fieldDiff.ts`, `lineDiff.ts` (verbatim donor ports) + `wordDiff.test.ts` green here | §6 S1 done; CVP's first "could not verify" bullet closed |
| `src/scene/sceneDiff.ts` + tests; `withoutDiffState` | §6 S2 done |
| `diffScene`'s paired `portsOf` resolvers | **§3's "port-level diff is impossible" is no longer true** — port add/remove works today; the honest remainder is port *rename* detection (ids cannot say "renamed"), which belongs to S7 or an `{id,label}` resolver widening |
| `SceneDiff.stories.tsx` (4 stories, math output only) | §6 S4 partially — the paint gallery remains (N3) |

New story files this plan specifies carry the repo's tag convention
(`CLAUDE.md` § story tags): `tags: ["area:blocks", "lane:<implementing
lane's slug>"]` — scene-diff stories title under `Blocks/…`, so `area:blocks`.

---

## 2 · One paint, two producers — and two props (the Q2 reconciliation)

Zach approved the phrase *"one paint, two producers"* (Q2). **That is
exactly what this plan builds — his instinct is honoured, not overruled —
and it is delivered through two props.** "One paint" is real: one visual
language on the primitives, one channel discipline, the same three severity
tokens wherever either lane needs severity ink. "Two producers" is real:
the linter writes marks and the differ writes marks, and the same element
can carry both at once. The only thing that is *not* shared is the prop the
data arrives through — `diagnostics?: Diagnostic[]` for judgements,
`diff?: DiffMark` for comparison facts — and his own aside is the reason:
*"there is probably some like specific diff paint we will need."* There is:
word-level token ink, `PriorPose` ghosts, was-now chips. That structured
ink has no home in a `Diagnostic` (prose + severity), and
`added/removed/modified` has no rank, so the diagnostics prop's one merge
rule — `max(severity)` — cannot apply to it. Same paint, two doors.

The full five-ground argument (no common order; no common payload; the
donor's forbidden dependency arrow, `diagnosticsModel.ts:48-64`; no common
lifecycle — lens-scoped vs live-derived; stable ids protect many *judgement*
producers and `diffScene` is not one) is unchanged from revision 1, as is:

### The component-level merge rule — "changed AND broken"

Both render, in full, on disjoint channels; no cross-axis precedence, no
cross-axis `max()`. Diff wash/chips inside the card; diagnostic halo outside
— outside the diff outline too (INVALID-STATES §6's closing rule); the
popover lists diagnostics only; **the top-right corner belongs to
`DiagnosticFlag`**, so the `delta-badge` variant's pose badge yields to
top-left. The prop N2 specs: `DiffMark = { operation: DiffOperation;
fields?: readonly FieldDiff[]; priorPose?: PriorPose }`, variant supplied by
the host, defaulting per `DIFF_VARIANT_TRAITS`. A **merge conflict** (§5's
N7) is diff-lane vocabulary — "both sides changed this" is a comparison
fact, not a judgement — so conflict paint extends `DiffMark`, never
`Diagnostic`.

---

## 3 · The sequence, revised

Live lanes as of this revision: `src/components/**` (diagnostics),
`src/hosts/**` (tldraw host + drag policy), `.storybook/**` + story `tags:`
(navigation), `src/skin/**` (skin extraction). `src/scene/**` is owned by
no live lane — the three unblocked items below are all adds-only there.

| # | Step | Size | Write set | Blocked on |
|---|---|---|---|---|
| **N1** | `propertyRows` over `SceneDiff` — `elementSummaries` + `orderChanges` (donor `propertyRows.ts:216,243`) re-expressed over our diff rows | **S–M** | `src/scene/propertyRows.ts` + test, new story file, provenance append | **nothing** |
| **N7** | **Merge and rebase math** (Q3: *"we want to support both"*): `applySceneDiff(scene, diff)` and `diff3Scene(base, a, b) → { merged, conflicts }`; rebase = replay `diffScene(base, a)` onto `b` through the same apply, so one module carries both. Conflict = both sides touched one element's same field; `unmatched`-style honesty — a conflict is reported, never auto-resolved | **M** | `src/scene/merge.ts` (or `diff3.ts`) + test, story | **nothing** |
| **N8** | **Appearance diff** (Q1 — the golden-layouts driver): a second *profile* of `diffScene`, not a second engine — §5's verdict. Matched pairs compared on geometry (`classifyPoseChange` — shipped) + appearance-bearing fields; emits per-element deltas ("moved +40,−12", "resized: left edge") | **S–M** | `src/scene/appearanceDiff.ts` + test, story | **nothing** for revision pairs (shared ids); **N9** for generated copies |
| **N2** | Diff paint on the components — per-component `diff` prop, `DIFF_VARIANT_TRAITS` verbatim as data, channel discipline + corner rule, changed-AND-broken proven with measured geometry | **M–L** | `src/components/{block,port,labeledPort,trace,traceBadge,editableText}.tsx` + new `diffInk.ts`, stories | **barrier**: components + skin lanes; composes against the landed `diagnostics` contract |
| **N3** | Six-variant gallery over one fixture scene | **S** | new stories + fixture | N2 |
| **S5** | `useLinkedCameras` + blend (23 donor lines, `BoardRender.tsx:258-280`) — **now the enabling mechanism behind the chosen design**: Q4 approves the Figma overlay + blend slider, so this is no longer one option among views; overlay/blend is the committed treatment and the camera link is what makes side-by-side and overlay one surface | **S** | `src/hosts/useLinkedCameras.ts` + story | hosts lane |
| **S6** | `PropertyTable` re-expressed over N1's rows — **an editor-kit component** (§4), not generic chrome | **M** | new editor-kit component + story | N1 + components lane |
| **N6** | The compare chrome as **editor components** (§4): `CompareBar` (mode toggle · blend slider · fullscreen), `DiffCodeView`, and the `CompareView` composition story assembling them over two hosts + S5 + S6 + N2 paint | **M** | editor-kit components + `src/hosts/compareView.tsx` + stories | N2 + S5 + S6 |
| **N9** | **Conformance identity ladder over `BlockScene`** — §6's port map, pre-scoped so golden testing executes it instead of re-deriving it | **M** | `src/scene/identity.ts` + test | **triggered by golden testing starting**, not by a lane |
| **S7** | Ports as scene records | **L** | scene + `portEdge.tsx` seam | **still deferred** — un-defer conditions unchanged (§7) |

Genuinely unblocked now: **N1, N7, N8** — three parallel-safe adds-only
scene lanes (disjoint files; N7 and N8 both consume `sceneDiff.ts` read-only).
`diff3Scene` was "not on the list" in revision 1 as valueless-without-a-
consumer; **Q3 named the consumer** (rebase and merge in the comparison
view), so it returns as N7. Everything component- or host-facing still
waits for its owning lane.

---

## 4 · The chrome ports into the editor kit (Q3, second half)

Zach: *"port over the chrome designs we did and add them to the
editor-components kit."* The docs tree already has the three-kit vocabulary
(`apps/docs/content/docs/{components,scene,editor}/`), and the editor kit's
own rule fits this chrome exactly: *"it imports both other kits; nothing
imports it"* (`editor/index.mdx:11`). So revision 1's "the dialog waits for
a consuming app" is **reframed: the pieces are editor components with their
own stories**; only the app-shell wiring stays out.

The chrome designs that exist, and where each lands:

| Design artefact | Where it is | Lands as |
|---|---|---|
| The converged `CompareDialog.tsx` (1,127 lines) — mode enum (`:46`), blend slider (`:133`), fullscreen-forces-overlay (`:139-152`, `:501-507`) | `/home/bam/systemsketch/src/compare/` | **`CompareBar`** — editor-kit component: side-by-side/overlay toggle, blend slider, fullscreen control. The dialog *frame* (modal shell, tab persistence, launcher wiring) is app shell and does not port |
| `PropertyTable.tsx` (583) | same | **S6** — editor-kit component over N1's rows |
| `CodeView.tsx` (69, thin over `lineDiff`) | same | **`DiffCodeView`** — editor-kit, small; `lineDiff` already shipped |
| The two-viewport stage + camera sync | `BoardRender.tsx` | host-side (`src/hosts/`) — a spanning interaction, the repo's own bounded/spanning rule; S5 is its hook |
| The eleven `systemsketch-track-diff-ui-*` worktrees (modal · omnibox · drawer · canvas-first · inline-rail · three converged · three history rails) | `/home/bam/systemsketch-track-diff-ui-*` | design *material*, not port sources — the converged lineage already landed as `src/compare/`, which is the source of record. The three `history-*` rails (Figma/Onshape-style version pickers) are review material for a later version-history surface, out of scope here |

Docs pages (`editor/property-table.mdx`, `editor/compare-bar.mdx`) follow
the inspector precedent — status callout first, registry item later — and
are owed at implementation, not now.

---

## 5 · The visual-diff split, with a verdict (Q1)

Q1 reversed mid-note: appearance comparison is **in**, with a named driver
— **golden layouts**, verifying that autogenerated functions *look* similar
to their targets. Zach asked for a split ("we need to support both") and
floated *"appearance can almost be done via a file diff, as it's probably a
lot of token changes."*

**Verdict: both ship, but as two profiles of one engine — not two engines —
and the pixel level is deliberately outside the differ.**

- **Semantic profile** (shipped: `diffScene`) — structure and content;
  authoritative for *what changed*: added/removed/modified nodes, edges,
  ports, fields.
- **Appearance profile** (N8) — same matched pairs, compared on exactly the
  fields the semantic profile's conformance stance ignores: geometry and
  appearance-bearing props, classified through `classifyPoseChange`.
  Authoritative for *whether and how it looks different*, per element, with
  no threshold.
- **Pixel render-and-compare** — deliberately not built. It detects but
  cannot explain, it reintroduces thresholds (anti-aliasing, font
  rasterization) into a design whose whole prior lineage is
  threshold-free (§6), and the prior work never needed it: pyblocks proved
  appearance preservation at the drawable-props level — 30
  canonicalizations, 0 drawable props changed
  (`block_diff_matching_probe.py`, `appearance_fingerprint` over
  `DRAWABLE_PROPS`) — without rendering a pixel. It returns only if
  *rendering itself* (skins, CSS, fonts) becomes the subject, as a thin
  Playwright acceptance harness that, on failure, points at the N8 diff to
  explain.

Why not the raw file/token diff as the engine: measured, twice. A raw
record diff on a *passing* golden case reported 40+ changed records with
**zero** in the meaning bucket (all camera/geometry/identity/provenance
churn), making the passing case indistinguishable from the broken ones —
*"a diff view whose calm case and broken case look the same is a rendering
of the storage layer"* (`block-diff-architecture-2026-09-02.html` §1-2).
Zach's token-diff instinct survives in its correct role: an id-free
fingerprint of drawable props is the cheap **boolean oracle** ("did
appearance change at all") — that is exactly what `appearance_fingerprint`
is — while `f(scene, scene)` is the engine that says *which element, how*.
His own note already leans there: *"I do like the idea of F(scene, scene)
as it's doing the diff at a semantic level which is very powerful."*

---

## 6 · The id-association research, within arm's reach

Zach: *"there was a lot of thinking we did previously about diff mutated
files, where the ids are known to be the same, vs generated copies where
the ids may be different… I am not sure the final conclusions from it…
make sure it's within arm's reach."* Read properly this time — the probes
and work orders in `/home/bam/pyblocks/docs/`, the shipped engine in
`/home/bam/pyblocks/pyblocks/`, and the engine report's stripped text —
not just listed. **The prior work answered his question, with measurements
and shipped code.** The map note is
`zach_brain/Projects/bbox-ui/MOC - Visual Diff.md`; what follows is the
distilled conclusion set with citations.

**The two cases he names are the two shipped profiles**
(`pyblocks/board_diff.py:80-90`):

| | Mutated file (revision) | Generated copy (conformance / golden testing) |
|---|---|---|
| Identity | free — `REVISION_RUNGS = ("id",)`: persistent ids, every later rung "a guess dressed up as evidence" (`identity.py:57-60`) | established by the ladder: `id → name → graph → source → unmatched` (`identity.py:1-31`) |
| Ignores | `{session}` | `{session, meta.original, layout}` — *"a moved block is real signal in a revision and noise in a conformance check — one entry in `ignore`, not a fork"* (`board_diff.py:8-11`) |
| Convergence | — | *"as the generator converges on the target the conformance profile relaxes toward the revision profile until the two calls are the same call"* |

**The final conclusions, each measured:**

1. **No similarity rung, no threshold, anywhere — and this was a
   deliberate deletion, not an omission.** The exploratory probe
   (`block_diff_matching_probe.py`) had a scored `content-similar` rung
   with `SIMILARITY_FLOOR = 0.45`; the shipped `identity.py` removed it and
   a test asserts its absence **against the module's parsed AST**. Nothing
   was lost: 450/450 blocks still resolve (355 name · 51 graph · 44
   source · 0 unmatched), and a renamed block now produces a *visible gap*
   instead of a silent re-match — *"a false match silently passes a
   regression; a visible gap is a reviewable finding"* (engine report §1,
   §3; `identity.py:14-20`).
2. **If names differ, assume different.** Rungs 3-4 only disambiguate
   candidates that already share a qualified name; they never reach across
   names to declare a rename (`identity.py:18-20`).
3. **Match on identity, diff on content — never match on what you are
   about to diff.** No `description`/`blockType` in any matching key
   (probe measured them burying the rename signal); position and
   appearance never match either — geometry alone accounted for 48 leaf
   changes across twelve semantically identical boards
   (`identity.py:22-29`).
4. **It was an addressing problem, not a kinship problem.** One
   canonicalization pass (drop session records, drop `meta.original`,
   re-address by place-in-graph) took the twelve exact cases from ~692
   phantom add/removes to **zero** — the documents were structurally
   isomorphic all along (architecture report §3). Zach's own correction
   ("fundamentally I feel they are the same… one engine") is what produced
   one-engine-two-profiles.
5. **Content-derived addresses are cacheable.** Adding a block moved 0
   existing addresses (the additive-churn stress) — which is what makes
   the designed-but-**unimplemented** write-back migration viable:
   stamping matched ids into the golden files so alignment runs once, not
   per diff (engine report §7 via `block-diff-work-order.md` "What is
   left"). Open work, recorded as such.
6. **The `source` rung is the one resting on an assumption** (same-named
   siblings listed in source order), and it must read the call-site's
   *whole span* — four `+` operators starting at the same `line:col`
   differ only in where they end; reading starts alone left 4 unresolved
   (`identity.py:63-66`, engine report §1).

**The port map for N9** — what each rung becomes over `BlockScene`, so
golden testing executes rather than re-derives:

| identity.py rung | BlockScene equivalent | Status |
|---|---|---|
| `id` | `SceneNode.id` | shipped (what `diffScene` uses) |
| `name` | `definitionId` / `normalizedDefinitionName` (`linking.ts`) — **stronger than the donor's**: name-identity is maintained by the scene, not guessed by the matcher (CVP §3) | shipped, unused by matching |
| `graph` | neighbourhood signature from `producersOf`/`consumersOf` (`scene.ts:175,180`) | derivable, unwritten |
| `source` | a host-supplied ordinal resolver — same optional-callback pattern as `portsOf`, because the scene owns no provenance field (CVP §3, measured absent) | needs the callback seam |
| `unmatched` | first-class output list | N9 |

---

## 7 · S7 stays deferred

Unchanged from revision 1: `SCENE-KIT.md` records the block (the
`portEdge.tsx` controlled-items seam another lane holds); the resolver seam
removed the urgency. Un-defer conditions: (a) port *rename* detection —
now slightly likelier, since golden testing surfaces renamed ports —
weighed then against the cheaper `{id,label}` resolver widening; (b)
`reconcileNodePorts` absorption; (c) a third per-port-fields consumer.

---

## 8 · TRIPWIRE-CRDT-SCENE-VERSION — held, and now *confirmed*

Q3's merge/rebase ask is not a threat to CVP §4's ruling — **it is the
confirmation of it**. `diff3Scene(base, a, b)` takes the merge base as an
ordinary scene *argument*; rebase replays a change-list onto an ordinary
scene. Both ship (N7) with `BlockScene` staying exactly `{ nodes, edges }`
— which is what §4 predicted: a merge base is a *pair of documents*, never
a field on one. The tripwire itself is unchanged:

> **If `BlockScene` ever becomes the unit of live sync** — CRDT,
> multiplayer, offline merge at the document layer; concretely any lane
> adding Yjs/Automerge/Loro or a `version`/`clock`/`parent` field —
> **causality must live in the document and CVP §4 is reopened, not
> extended**, before the field ships, because once a host ships `version`,
> removing it breaks every consumer. Grep `TRIPWIRE-CRDT-SCENE-VERSION`.

Until tripped, `BlockScene` stays `{ nodes, edges }`.
