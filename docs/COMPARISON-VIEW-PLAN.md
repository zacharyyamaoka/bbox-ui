# The comparison view — porting plan

**Status: research and plan only. No implementation code was written.**
2026-09-17. Donor `/home/bam/systemsketch` at revision
`10748b8ccdb374e71714f3d351abc43947ecfb0e`, read-only. Second donor
`/home/bam/pyblocks` (the diff engine and its contract), read-only.

Every claim below carries a `file:line`. Anything I could not verify is
labelled **UNVERIFIED** rather than asserted.

---

## The headline, before the detail

Zach's decomposition — *chrome · diff math · "it feels related to the file
type"* — is right in its parts and wrong in one joint. There are **three**
surfaces, not two, and the third is the one that decides whether this is a
real port or a rewrite.

And the timing finding, which he has not connected: **the identity model
that a visual diff needs landed today**, in
`apps/storybook-basics/src/scene/linking.ts`. His "we did a lot of research
into unique IDs — this was relevant for when you had to do the diffs
visually" is no longer research. Most of it is code. The part that is *not*
code is precisely where a diff would still have to guess, and that gap is
named in §4.

---

## 1. Is the diff `f(scene, scene)` or does it need the file?

**`f(scene, scene)`. The file is one 12-line function at the edge, and it is
already isolated in the donor.**

The donor's own code settles this. `compareBoards(before, after)`
(`/home/bam/systemsketch/src/compare/compareModel.ts:264`) takes two
`RecordMap`s — a structural type, deliberately kept structural so tests need
no store (`compareModel.ts:127`, *"kept structural so tests need no store"*).
The only thing in the whole module that knows a file exists is
`recordsOfSnapshot(snapshot)` at `compareModel.ts:499`, twelve lines that pull
a record map out of a tldraw store snapshot *in either shape*. That function is
the format seam, and it is already the only one.

So the answer to "does it relate to the `.systemsketch` / `.tldraw` file
type?" is: **only as a loader.** A file format is a serialization concern.
Diffing scenes rather than files is what buys three things a file diff cannot:

- **Cross-format comparison.** A `.systemsketch` against a `.tldraw` against a
  React Flow store — all three become a `BlockScene`, and one differ serves
  them. A file differ would need N² loaders.
- **Diffing what is not yet a file.** The interesting comparison is often
  live-editor-vs-saved, or generated-vs-target, neither of which is two files
  on disk.
- **Immunity to storage churn.** This is measured, not argued. The vault
  records that on golden case `01_linear_chain` — a case that *passes* the
  evaluator with zero policy violations — a raw record diff reported **40
  changed records**, and bucketing every JSON leaf put **zero** of them in a
  "meaning" bucket: all camera, geometry, identity and provenance churn
  (`/home/bam/zach_brain/Projects/pyblocks/PROJECT - pyblocks.md:3268`). A diff
  view whose passing case and broken case look identical is a rendering of the
  storage layer.

**The one caveat, and it is real.** The donor reads cable endpoints out of
*binding records* rather than off the cable
(`cableEnds`, `compareModel.ts:189`), with a stated WHY at `:184`: a cable's
`start`/`end` props are handle coordinates that move whenever either block
moves, *"so a coordinate diff would call every dragged board a rewiring."*
Our `SceneEdge` already carries `source`/`target`/`sourceHandle`/`targetHandle`
as ids (`apps/storybook-basics/src/scene/scene.ts:103-117`) — the endpoint fact
is first-class, so this entire class of false positive is designed out before
we start. `cableEnds` does not port; it **evaporates**. That is the single
clearest piece of evidence that the scene contract is the right diff input.

---

## 2. Three surfaces, not two

| | Surface | Rule | Kit |
|---|---|---|---|
| **A** | **Diff math** | `f(sceneA, sceneB) → SceneDiff`. No React, no DOM, no engine. Runs in Node. | `scene` |
| **B** | **Diff paint** | Given a scene element and its change, what ink does it carry? Props in, DOM out. | `components` |
| **C** | **Compare chrome** | The dialog, the two viewports, the linked cameras, the blend slider, fullscreen, the property table. | `edit` + host |

Zach named A and C. **B is the one he folded into C, and it is the one that
must not live there.** A visual diff is not a table beside a canvas — it is
*ink on the components themselves*: a removed port drawn in the row it is
missing from, a moved block's ghost at its former pose. The donor's own
architecture doc makes this the hardest requirement:

> a free-floating annotation cannot be drawn *inside* the port row it is
> missing from
> — `/home/bam/zach_brain/Projects/pyblocks/PROJECT - pyblocks.md:3281`

That is a **component prop**, not chrome. It belongs in the `components` kit
next to `Port` and `Block`, because it is bounded by one component's own box —
which is exactly the repo's own test for what is ours
(`ARCHITECTURE.md`, "Where an interaction belongs": *bounded → ours,
spanning → host's*).

### The connection to the linter, which is already in the contract

Zach's point 2 ("Part of this is also the linter, invalid states etc") is not
adjacent work. It is **the same surface B**, with a different producer. The
donor contract states it as rule 7:

> Marks share one vocabulary with board diagnostics. A diff mark and a lint
> mark are the same visual object with different producers — `operation` for
> the diff lane, `severity` for the lint lane
> — `/home/bam/pyblocks/docs/block-diff-contract.md`, §"The rules that make the
> seam hold", rule 7

And it is implemented that way, not merely written down:
`/home/bam/systemsketch/src/diagnostics/diagnosticsModel.ts:51-61` carries the
rule in a WHY comment, with a stated reason the state enum lives in
diagnostics rather than in `src/diff/`: *"the diff lane must not depend on the
lint lane."*

**So build B once, with two producers.** We already have the lint producer:
`findDanglingEdges`, `findCycles`, `duplicateEdges`
(`apps/storybook-basics/src/scene/scene.ts:424, 288, 373`). A diff producer
joins them. One `state` vocabulary on the primitives; two things that write it.

**Sizing consequence:** surface B is the expensive one and the reusable one.
If only one of the three gets built, build B.

### Where each donor file lands

| Donor file | Lines | Surface | Verdict |
|---|---|---|---|
| `src/diff/wordDiff.ts` | 197 | **A** | **Ports verbatim.** Zero imports, pure string→tokens. The tokenizer (`:51`) splits on camelCase so `runInference → runPredict` inks `Inference`, not the word. |
| `src/diff/fieldDiff.ts` | 208 | **A** | **Ports verbatim.** Pure. `classifyPoseChange` (`:127`) tells *moved* from *resized* by the drawing, with `POSE_EPSILON_PX = 0.5` (`:103`). |
| `src/compare/lineDiff.ts` | 163 | **A** | **Ports verbatim.** `stableJson` (`:44`) + LCS + `collapseContext` (`:138`). For the raw-evidence tab. |
| `src/compare/compareModel.ts` | 511 | **A** | **Re-expressed.** The three-state model and every WHY port; the tldraw record-walk does not. See §4. |
| `src/compare/propertyRows.ts` | 247 | **A** | **Ports nearly verbatim.** `elementSummaries` (`:216`), `orderChanges` (`:243`) are pure over the change list. |
| `src/compare/PropertyTable.tsx` | 583 | **C** | **Re-expressed** through our own props. Real shadcn candidate. |
| `src/compare/BoardRender.tsx` | 280 | **C** | **Mostly does not port.** It mounts a second `<Tldraw>` (`:23-46`). But `useLinkedCameras` (`:258-280`) is 23 lines of pure leader/follower camera sync with a re-entrancy latch — **that ports as a pattern**, host-parameterised. |
| `src/compare/CompareDialog.tsx` | 1127 | **C** | **Does not port as code; ports as a spec.** See §5. |
| `src/compare/CompareLauncher.tsx` | 232 | **C** | Host. Does not port. |
| `src/compare/CodeView.tsx` | 69 | **C** | Thin; re-express. |
| `src/compare/compareSource.ts` | 111 | — | **Does not port.** Already superseded in the donor itself by `src/history/boardHistory.ts` — stated at `src/compare/index.ts:25-29`. |
| `src/diff/diffPresentation.ts` | 347 | **B** | **Split.** `DIFF_VARIANT_TRAITS` (`:99`) is a pure data table and ports; the `atom()` + localStorage half (`:139`) is tldraw-bound host state. |
| `src/diff/clearDiffStates.ts` | 99 | **B/host** | **Ports as a rule, not as code** — it takes a tldraw `Editor` (`:15`). The rule is the valuable part: a diff state is a *lens*, whole-document, never partial (`:11`, *"A half-cleared diff is worse than an uncleared one"*). In a pure scene kit this is `withoutDiffState(scene)` and is trivial; the donor needed 99 lines only because tldraw stores it on shapes. |

---

## 3. Does the identity model that landed today support a visual diff?

**Partly — and the part it supports is the hard part.** Assessed against the
donor's own identity ladder.

### The ladder, re-measured

The ladder is the unique-ID research Zach remembers. Its rungs, as shipped:
`id · name · graph · source · unmatched`
(`/home/bam/pyblocks/docs/block-diff-contract.md`, `Change.identity.rung`).

I re-ran the measurement rather than citing it
(`python3 /home/bam/pyblocks/docs/block_diff_ladder_measure.py`, 2026-09-17):

```
blocks 450 · by_name 355 · duplicate_name 95 · by_graph 51 · by_source 44
boards 5
```

**450 of 450 resolved, 0 unresolved.** 78.9% by qualified name alone; the 95
name-collisions split 51 by graph neighbourhood and 44 by source position.
Note what is *absent*: no threshold, no score, no similarity floor in the
resolved path. The donor's own note records that the content-similarity rung
was deleted and nothing was lost
(`/home/bam/zach_brain/Projects/SystemSketch/PROJECT - System Sketch.md:1595`).

### What we have

| Ladder rung | Scene contract today | Verdict |
|---|---|---|
| **id** | `SceneNode.id` — opaque, host-minted, never derived from a name (`scene.ts:74-94`). `duplicateNode` mints fresh (`scene.ts:472`). | ✅ **Complete.** This is the whole revision-diff profile. |
| **name** | Not a heuristic here — a **first-class scene fact**. `normalizedDefinitionName` (`linking.ts:187`), `definitionId` as a group id (`scene.ts:94`), `commitDefinitionName` as the only thing that re-derives it (`linking.ts:343`). | ✅ **Better than the donor.** See below. |
| **graph** | Derivable today: `producersOf`/`consumersOf` (`scene.ts:175,180`) give exactly the neighbourhood signature the probe computes (`/home/bam/pyblocks/docs/block_diff_matching_probe.py:~120`). Not written, but nothing blocks it. | 🟡 **Available, unwritten.** |
| **source** | Nothing. No provenance field anywhere — `grep -n "version\|provenance\|ancestor"` over `scene.ts`/`linking.ts` returns only two comments about the *port's* provenance, never a data field. | ❌ **Absent.** Only matters for generated-vs-target; see §6. |
| **unmatched** | N/A — an output kind, not a contract field. | — |

### The genuinely new thing, which is better than what the donor had

The donor treats **name matching as a heuristic rung** you fall back to when
ids differ. `linking.ts` makes the same fact **authoritative and maintained**:
"same name = same thing" is an invariant the scene *repairs itself into*
(`reconcileDefinitions`, `linking.ts:623`), not a guess the differ makes
afterwards.

That inverts the hardest problem in visual diff. The donor's own model comment
says matching there is *"the identity ladder's first rung only — `stableId`…
The name / graph / source rungs exist for target-vs-generated conformance,
where ids legitimately differ, and are deliberately not implemented here"*
(`compareModel.ts:37-42`). We can implement the name rung **without a
heuristic**, because `definitionId` already carries the answer.

Concretely: a rename detaches an occurrence and never rewrites its peers
(`linking.ts` rule 2, mutation-tested as L1, `docs/SCENE-KIT.md` §Definition
linking) — so a diff can distinguish *"this block was renamed"* from *"this
block was replaced"* by reading `definitionId`, with no similarity threshold.
That is the thing `git diff` needs `-M` and a similarity score for, and which
JGit and git famously disagree about
(`/home/bam/zach_brain/Projects/SystemSketch/PROJECT - System Sketch.md:1580`).

### THE GAP — and it is one gap, stated precisely

**The scene owns no port records.** `BlockScene` is `{ nodes, edges }`
(`scene.ts:118-123`). `SceneNode` has `id`, `type`, `position`, `data`,
`parentId`, `definitionId` — and no ports. Port ids exist *only* as
`sourceHandle`/`targetHandle` strings on edges (`scene.ts:103-117`), i.e. only
for ports that happen to be wired.

The proof is in the lint that already needed them. `findDanglingEdges` takes
the port vocabulary as an **optional host callback**:

```ts
// apps/storybook-basics/src/scene/scene.ts:424
export function findDanglingEdges<E extends SceneEdgeEnds & { id: string }>(
  scene: { nodes: readonly { id: string }[]; edges: readonly E[] },
  portsOf?: (nodeId: string) => readonly string[] | undefined,
): DanglingEdgeEnd[]
```

`docs/SCENE-KIT.md` says the same in its own words, under "What absorbing
`portLane.ts`'s reconcile would take": *"A port list per node — either
`data.ports: { id, label }[]` by convention or a first-class `SceneHandle`."*

**Why this is fatal to a port-level diff specifically.** The donor's entire
reason for having three states rather than two is ports:

> a port that appeared is an insertion of the port, not a modification of the
> Block that gained it
> — `compareModel.ts:23-30`

That rule needs to enumerate *every* port on both sides, not just the wired
ones. The donor reads them off the record (`portsOf`, `compareModel.ts:177`);
we cannot, because the scene does not carry them. **An unwired port that was
added or removed is invisible to a scene-only diff today** — and unwired ports
are exactly the ones a reviewer most needs told about, because no edge change
hints at them.

**Consequences, honestly:**

- Block-level diff (added/removed/renamed/moved/relinked): ✅ works today,
  no heuristics.
- Edge-level diff (added/removed/rewired): ✅ works today — better than the
  donor, since endpoints are ids not coordinates (§1).
- **Port-level diff: ❌ blocked** on a port vocabulary. Not "needs a
  heuristic" — *impossible*, the data is not present.
- Field-level diff of block content (`name`, `linked`, `expanded`): ✅ —
  `definitionContentSignature` (`linking.ts:240`) already defines what "same
  content" means, key-sorted so `{a,b}` and `{b,a}` compare equal
  (module header WHAT CHANGED #6).

**The fix is not the differ's to make.** Either the differ takes the same
`portsOf` callback `findDanglingEdges` already takes — the *cheap, consistent,
reversible* option, and my recommendation — or ports become scene records,
which `SCENE-KIT.md` already scopes and which another lane's
`portEdge.tsx` seam currently blocks. Taking the callback costs nothing and
commits to nothing; if ports later become records, `portsOf` becomes a
one-line reader over them and no caller changes.

---

## 4. Three-way diff — the contract question, which should be answered now

"diffdiffs" means comparing two changes, which needs a common ancestor. That
is the classic merge problem.

**Does the scene contract need version/provenance?** I verified it has none:
`BlockScene` is `{ nodes, edges }` and nothing else (`scene.ts:118`).

**My position: no — and deliberately not.** Three-way diff needs a merge
*base*, but a merge base is a **pair of documents**, not a field on a
document. `diff3(base, a, b)` is a function of three scenes, and every one of
them is an ordinary `BlockScene`. Putting a `parentVersion` on the scene would:

- make the scene self-referential (it would name documents it cannot resolve),
- force every host to invent version identity to author a literal,
- and duplicate a fact the *storage* layer already owns — the donor's own
  draft/version design records a **base digest** on the draft, outside the
  document (`PROJECT - System Sketch.md:1545`: *"A Draft is a named editable
  fork of an exact Main-file digest… Promotion is guarded: a stale base stops
  the merge"*).

The one thing three-way genuinely needs from the *contract* is **stable
identity across all three inputs**, and that is `id` + `definitionId`, which
we have. So:

> **Recommendation: do not add version or provenance to `BlockScene`.** Keep
> `BlockScene` `{ nodes, edges }`. Three-way diff is `diff3(base, a, b)`, a
> function of three scenes, and version identity belongs to whatever stores
> them.

**This is a durable architecture decision, not a bug fix.** It is a genuine
fork a future rewrite must not silently re-litigate: once a host ships a
`version` field, removing it is a breaking change to every consumer. I have
*not* written a decision record, because per the standing rule those are
written **at merge**, not before — and nothing has merged. If this plan is
accepted and lands, it earns one.

**What would change my mind:** if Zach wants the *scene* to be the unit of
sync (CRDT-style live collaboration), causality has to live in the document and
the answer flips. That is a different product than "compare two saved states,"
and he has not asked for it.

---

## 5. What Figma's compare model gives you that side-by-side does not

He copied it deliberately. Four things, each verifiable in the donor:

1. **One camera, two boards.** `useLinkedCameras`
   (`BoardRender.tsx:258-280`) is leader/follower with an `applying`
   re-entrancy latch. Without it, side-by-side is two unrelated pictures and
   the reviewer does the registration in their head. **This is the single
   highest value-per-line item in the whole donor: 23 lines.**
2. **Side-by-side and overlay are one surface, not two.**
   `CompareMode = 'side-by-side' | 'overlay'` (`CompareDialog.tsx:46`), with a
   blend slider (`:133`, `:518`) — Onshape's blend, which the research names
   as the closest mature reference (`block-diff-contract.md`, §"Why it is
   shaped like this"). **Overlay is what makes small movement visible at all**;
   side-by-side is what makes structure comparable. Neither alone is enough.
3. **Fullscreen is a stamp, not a second surface.** `CompareDialog.tsx:139-152`
   — *"the tree never unmounts. Fullscreen hides the chrome with CSS and
   promotes the stage to the viewport, so selection, tab, blend, git-ink and
   scroll position all survive."* And at `:501-507` a real consequence:
   fullscreen forces overlay, because *"there is one viewport and two boards"*
   — a half-width side-by-side with an inert slider would be a lie.
4. **Element-first grouping.** A block renamed *and* one of its ports renamed
   is **one** row with two changes, not two rows the reviewer must notice
   belong together (`block-diff-contract.md`, §Group). `elementSummaries`
   (`propertyRows.ts:216`) computes it.

What a naive side-by-side gives you instead: two pictures and a reader doing
registration by eye. Everything above exists to delete that work.

---

## 6. The sized sequence

Ordered so each step is independently useful and nothing blocks on a lane
that does not exist.

| # | Step | Kit | Size | Blocked on |
|---|---|---|---|---|
| **S1** | Port `wordDiff.ts` + `fieldDiff.ts` + `lineDiff.ts` verbatim with provenance headers, plus their tests | `scene` | **S** — ~570 donor lines, pure, already tested | nothing |
| **S2** | `sceneDiff.ts` — the three-state model over `{nodes, edges}`, `portsOf` as an optional callback exactly like `findDanglingEdges` | `scene` | **M** | nothing |
| **S3** | Diff-state props on `Block`/`Port`/`Trace` — one vocabulary, two producers (diff + lint) | `components` | **M–L** | ⚠️ collides with 3 live lanes in `src/components/**` |
| **S4** | The Storybook variant gallery: the 6 `DIFF_VARIANT_TRAITS` rows over one fixture scene | stories | **S** once S3 lands | S3 |
| **S5** | Linked cameras + blend as a host-parameterised hook | `edit`/host | **S** — 23 donor lines | S3 |
| **S6** | `PropertyTable` re-expressed as shadcn | `edit` | **M** | S2 |
| **S7** | Ports as scene records (`SceneHandle`), unblocking port-level diff | `scene` | **L** | `portEdge.tsx` seam, held by another lane |

**Start at S1+S2.** They are pure, they need no component seam, they collide
with no live lane, and they are the half that is genuinely portable. S3 is
where the value is and where the contention is — sequence it after the
component lanes land, per the repo's own dispatch rule (a task editing a
contract other lanes import is a barrier).

**S7 is the one to not do yet.** It is the real fix for the port gap, but
`SCENE-KIT.md` already records why it is deferred, and doing it now would edit
`portEdge.tsx`'s controlled-items seam that another lane holds.

---

## What I could not verify

- **UNVERIFIED:** I did not run the donor's own test suites
  (`compareModel.test.ts`, `wordDiff.test.ts`, `diffState.test.ts`) — the
  donor is read-only and installing its deps was out of scope. I read them as
  source only. Line counts and symbol locations are measured; *green* is not
  claimed.
- **UNVERIFIED:** the HTML research reports in `/home/bam/pyblocks/docs/`
  (`block-diff-visual-vocabulary-*.html`, 1.7–3.8 MB each) were **not** opened
  and read. I sourced the visual-vocabulary narrative from the vault callouts
  that summarise them and from `diffPresentation.ts`, which is the code those
  reports produced. If the six variants matter to a decision, those pages are
  the primary source and I did not re-derive them.
- **UNVERIFIED:** `apps/storybook-basics/src/components/**` current state. I
  deliberately did not read the component tree to avoid stepping on the three
  concurrent lanes; the S3 sizing is therefore an estimate from the donor's
  side only.
- The ladder measurement is over **pyblocks' golden corpus** (5 generated
  boards, 450 blocks) — generated Python→board output, not hand-drawn
  SystemSketch boards. It says the ladder resolves generated content; it does
  not measure hand-authored boards.
