# SOURCE-CODE-VIEW-PLAN — collapse to code, expand to blocks, one `origin` field

**Status:** implementation plan, 2026-09-18. Agent-readable: every phase names its write
set, its acceptance check, and what it may NOT touch. Written for a lane working in an
isolated git worktree that can only read this plan from a commit.

**Verified against disk on 2026-09-18.** Repo heads at planning time: bbox-ui worktree
branch `claude/source-code-view-f1855d` (ad3f125), bbox-ui scene-kit lane
`claude/bar-block-storybook-e61a36` (23fad70), pyblocks `6a64e0c`, systemsketch
`10748b8c`. Anything not re-verifiable at those refs is marked **unverified** inline.

---

## 1 · One-page summary

**What is being built.** The code cell and the block view become two states of one
document. A user selects N things on a SystemSketch canvas and collapses them into one
code cell; expands a cell back into blocks (P1, the gesture). One optional field on the
code-cell record — `origin` — decides per cell who owns the bytes: absent → the board
owns them (P4, a pseudo-code cell); present (uri + anchor + content hash) → a real `.py`
file owns them and the cell's `source` is a cache (P3). A block maps to a **definition**
(module / class / def / nested def), never to a statement — grain 1 is the ceiling, and
it recurses over the definition tree.

**Where each piece lands** (the three-repo boundary, non-negotiable):

| Piece | Repo | Where exactly |
|---|---|---|
| `origin` on the live code shape + migration | **systemsketch** | `src/code/codeModel.ts`, `src/code/CodeShapeUtil.tsx` |
| PEP recording the decision | **systemsketch** | `docs/peps/0018-*.md` |
| `origin` mirrored into the declarative board format | **pyblocks** | `pyblocks/systemsketch.py` |
| The partition (definition graph — the one new algorithm) | **pyblocks** | new `pyblocks/definition_graph.py` + CLI flag |
| Collapse-to-cell / expand pure scene functions + stories | **bbox-ui** | `apps/storybook-basics/src/scene/codeCell.ts` (new) |
| Origin-state badge (presentational) | **bbox-ui** | `apps/storybook-basics/src/components/` (new file) |
| The canvas gesture, file resolution, persistence | **systemsketch** | `src/code/`, host glue |

**The order** (details in §8; ⛔ = barrier, ∥ = parallel-safe):

```
P0 ⛔  PEP 0018 — freeze the origin contract (systemsketch, docs only)
P1 ∥   origin on the tldraw shape props + migration     (systemsketch)
P2 ∥   origin + languages in the pyblocks mirror         (pyblocks)
P3 ∥   the partition: definitions view                   (pyblocks)   ← can start day 0
P4 ∥   Rung A: collapse↔expand with an opaque cell       (bbox-ui)    ← can start day 0
P5     Rung A wired into SystemSketch                    (systemsketch, after P1+P4)
P6     Rung B: definition blocks, four-state badge,      (all three, after P2+P3+P5)
       command write path
```

P3 and P4 have no dependency on the `origin` contract and can be dispatched immediately,
in parallel, in separate repos. P0 is a one-file barrier that freezes the field shape
both P1 and P2 implement.

---

## 2 · Settled — do not re-litigate

These were decided by Zach across the four research passes
(`docs/build_source_code_view_report.py`, `docs/build_source_code_view_answers.py`,
`docs/build_vpl_prior_art_report.py`, `docs/build_marimo_report.py` — read them if you
need the argument, not to reopen it):

1. **P1 is the gesture** — collapse N selected things into one code cell; expand back.
2. **Text is canonical when a file backs the cell** (P3): block-side edits are named
   commands that rewrite minimal bytes. **The board is canonical when nothing backs it**
   (P4). Both, per cell, via `origin` — not a mode, not a setting.
3. **Grain 1 is the ceiling and it is a *kind*, not a number.** A block IS a definition;
   everything inside one is held text. Recursive: module → class → method → nested def
   are all grain 1. Statement/expression granularity is rejected ("that's exactly what I
   do not want… it starts to feel like Enso"). Evidence on disk: a 5-line function at
   expression grain rendered 17,192 px wide (`/home/bam/pyblocks/docs/pyflow-examples/`).
4. **The backend belongs in pyblocks**, the editor components in bbox-ui, the shape and
   persistence in SystemSketch (Zach: "definitely the editor components").
5. **A binding, not a setting.** Pseudo-vs-real is computed from the pointer + hash,
   never declared by a flag. Four states, all computed: absent / verifies / differs /
   cannot-resolve.
6. **P5 (grain slider) is dead.** Do not build a depth control.

---

## 3 · The `origin` field — exact contract (what PEP 0018 freezes)

### 3.1 Shape

There are **two code records** and they must carry the same field shape. The
authoritative one is the tldraw shape SystemSketch actually writes — NOT the pyblocks
record the research reports emphasised:

- **systemsketch** `src/code/codeModel.ts:106` — `CODE_SHAPE_PROPS = { w, h, code,
  language, size, fontScale, showLineNumbers, characterWidth }`. The text field is named
  **`code`** (not `source`), there is **no `version` field** (tldraw versions through
  shape migrations), and languages are the 9-value `CODE_LANGUAGES` enum
  (`codeModel.ts:6`, includes `plaintext`).
- **pyblocks** `pyblocks/systemsketch.py` — `CodeBlock{version, language, source}` under
  extension key `pyblocksCodeBlock` (`:170`), exact-v1 validated (`_is_exact_v1` `:415`
  rejects unknown keys; `_is_code_block_payload` `:423`), languages restricted to
  `("python", "markdown")` (`:177`). This is the declarative/analysis-side mirror.

The field, added to both:

```ts
// tldraw side (codeModel.ts). tldraw shape props are total, so "absent" is null.
origin: {
  uri: string          // "stereo.py" — POSIX path, relative to the board document's
                       // directory (open question Q2 carries the default; see §9)
  anchor: string       // qualified name, e.g. "Pipeline.run"; ordinal tie-break as
                       // "Pipeline.run#2" ONLY when the same qualname is defined
                       // more than once in the file (see 3.3)
  contentHash: string  // "sha256:<hex64>" of the anchored definition span's exact
                       // bytes at last sync (see 3.4)
} | null
```

Validator: `origin: T.nullable(T.object({ uri: T.string, anchor: T.string,
contentHash: T.string }))` — `T.nullable` exists in the pinned tldraw 5.3.2
(`node_modules/@tldraw/validate/dist-cjs/index.d.ts:379`). Also extend the
`declare module '@tldraw/tlschema'` block at `codeModel.ts:118` — it must stay in sync
with the validator map or the build lies.

**`origin` must NOT touch `src/fields/CodeField.tsx`.** PEP 0017 (Accepted 2026-09-14,
`systemsketch/docs/peps/0017-one-codefield-not-four.md`) converged four CodeMirror
mounts onto one `CodeField` with the stated rule: add to CodeField only what a different
*mount lifecycle* requires — "never anything for value semantics." `origin` is value
semantics. It lives on the shape and the layer above; CodeField never learns it exists.

**Why this warrants PEP 0018 at all:** `codeModel.ts` today holds *zero* semantics about
the code it contains — its own comment on `characterWidth` reads "A presentation
measurement, never a semantic interpretation of the code." `origin` is the **first
semantic field on this shape**. That crossing — presentational shape gains a semantic
binding — is the PEP's subject, not the field's JSON spelling.

### 3.2 The four states, all computed, never stored

| State | Condition | UI behaviour |
|---|---|---|
| **pseudo** | `origin == null` | Board owns the bytes. Edit freely. No parser runs. This is today's behaviour, unchanged. |
| **synced** | file resolves, anchor resolves, `sha256(span) == contentHash` | File owns the bytes; `code` is a faithful cache. Block-side edits route through a named pyblocks command (P6). Painted normally, small badge. |
| **drifted** | anchor resolves, hash differs | Someone (vim, Claude, Zach) edited the file. **Re-read, don't merge.** If the board side also changed, show both — the dpkg three-way case; never clobber either. |
| **orphaned** | file missing or anchor unresolvable | Say so on the block. Offer *re-bind* or *detach to pseudo* (`origin → null`, cache becomes owned bytes). Never silently fall back to the cache and pretend. |

State computation is a **pure function** — `codeOriginState(origin, resolution)` where
`resolution` (`{ fileFound, anchorFound, spanBytes? }`) is produced by the host. File IO
never enters bbox-ui or the shape model.

### 3.3 The anchor

Qualified name first, per the identity ladder's own rules
(`pyblocks/identity.py` — rungs `id → name → graph → source`, "stop. Report unmatched.
Never guess."). At grain 1 the qualified name is nearly sufficient alone. Tie-break for
duplicate same-name definitions: `#<ordinal>`, zero-based, in file order among
definitions sharing that qualname.

**Deliberate deviation, record it in PEP 0018:** the answers report's A2 default kept
`@line:col` as the tie-break. This plan uses the **source ordinal** instead —
`identity.py`'s own rung-4 vocabulary — because a line:col rots under any edit above the
definition, while an ordinal only rots when same-named definitions are *reordered*,
which is the rarer event. An anchor that does not resolve is reported as **orphaned**,
never re-guessed across names (the ladder's non-negotiable rule).

### 3.4 The hash

`sha256` over the **exact bytes** of the anchored definition's span as the definitions
view (§5) reports it — same slicer, one shared function, no normalization (no strip, no
newline canonicalization). Whether the span includes decorators follows whatever
pyblocks' span computation includes — **do not decide this twice**: the partition emits
the span, the hasher consumes the identical slice, and a test asserts they agree on a
decorated fixture. (Span source: `views[].sourceRef.span.startLine/endLine`, emitted by
`pyblocks/python_adapter.py` — `views` built at `:1849`, `AvailableView` at `:1779`.)

### 3.5 Version bump + migrations (both records)

- **tldraw shape:** append migration id 2 to the existing sequence at
  `src/code/CodeShapeUtil.tsx:65` (`createShapePropsMigrationSequence`; v1 precedent
  `MigrateFontSizeToSharedSize` at `:53`). `up`: add `origin: null`. `down`: strip
  `origin` (a bound cell downgrades to a pseudo cell holding its cache — lossy on
  purpose, and the `down` exists so old builds can open new docs). Acceptance surface
  already exists: `src/code/codeShapeMigrations.test.ts` and the v0→v1 precedent tests
  in `src/code/codeModel.test.ts:87`.
- **pyblocks mirror:** `CODE_BLOCK_EXTENSION_VERSION 1 → 2`. `_is_code_block_payload`
  accepts exact-v1 `{version:1, language, source}` AND exact-v2
  `{version:2, language, source, origin}` (origin `null` or the three-key object —
  reuse `_is_exact_v1`'s exact-keys discipline for the nested object too). Loader
  upgrades v1 → v2 on read (`origin: null`); writer emits v2. `assert_round_trip`
  (`systemsketch.py:1224`) already runs on every save and is the proof the field
  survives the `.systemsketch` ⇄ `.systemsketch.py` projection.
- **Language mismatch, fix while in there (verified, new finding):** the tldraw shape
  allows 9 languages including `plaintext`; the pyblocks mirror allows only
  `("python", "markdown")` (`systemsketch.py:177`). A JS or plaintext cell cannot
  round-trip through the mirror today. Extend `CODE_BLOCK_LANGUAGES` to the shape's set
  as part of the same v2 bump. This also resolves research ask A3 (pseudo cells get a
  real `plaintext` language; language and binding stay orthogonal).

---

## 4 · P1 in two rungs

### Rung A — opaque cell. Shippable alone. Zero pyblocks.

**What it is:** collapse a selection into a container whose face is a code cell; expand
it back, exactly. The cell is opaque — no parser anywhere. `origin` is absent.

**The mechanism is already built and measured.** On bbox-ui lane
`claude/bar-block-storybook-e61a36` (verify with `git show`, files are NOT on `main`
yet): `apps/storybook-basics/src/scene/collapse.ts` (444 lines) —
`collapseToRegion`/`dissolveRegion`, whose round trip is asserted as
`JSON.stringify(before) === JSON.stringify(dissolved)` in `collapse.test.ts`;
`boundary.ts` (539) — `classifyBoundary`/`promoteBoundary` derive the container's ports
from the edges that cross the selection. Rung A is `collapseToRegion` with the region's
`data` carrying a cell payload, plus a cell *face* rendered over the region — **not** a
new scene algorithm.

**The one honest subtlety — what fills the text.** Collapsing blocks with no emitter
means the cell's `code` cannot be derived source. At rung A the collapsed subgraph
**remains in the scene** (children re-parented under the region, exactly as
`collapseToRegion` already does) and is the single truth for expand. The displayed text
is annotation: seeded with a deterministic generated header (comment listing the
collapsed block names), freely editable as pseudo-code. Expand = `dissolveRegion`,
which replays the children and discards the annotation text — the pure function returns
what it discarded (`{ scene, discardedText }`) so a host can warn first. This is open
question Q1 (§9) with that as the default.

**Rung A delivers:** the gesture both ways, exact round trip, derived ports, pseudo-code
cells as first-class board citizens (P4 semantics).
**Rung A does not deliver:** any text↔blocks conversion; editing the cell text changes
nothing about the blocks; no file binding; no badge beyond "pseudo".

### Rung B — expand produces DEFINITION blocks. Needs the partition (§5).

**What it is:** expanding a cell whose `language` is python asks pyblocks for the
definitions view of its bytes (pseudo cell: the cache; bound cell: the file at
`origin.uri`) and lays one block per definition, edges = references between them. Each
produced block is itself a code cell at grain 1 — body is held text — and, when the
parent was bound, each child carries its own `origin` (same uri, its own anchor +
hash). The inverse (blocks → code) at grain 1 is "print the held bytes back inside the
def": concatenate spans in source order for a pseudo cell; for a bound cell there is
nothing to write — the file already holds the bytes, and block-side *edits* route
through `pyblocks.commands.apply_command` (`commands.py:337`; 8 command dataclasses,
`RenameFunction` `:43` … `PromoteToNamedOutputs` `:112` — minimal text edits, untouched
bytes byte-identical, refuses results that add dialect diagnostics).

**Rung B delivers:** definition blocks with reference edges; the four-state badge; the
first command (rename) wired from the canvas.
**Rung B does not deliver:** new commands beyond the shipped 8; rewiring semantics;
cross-file resolution (v1 is single-module; `pyblocks/symbols.py` exists for the
cross-file case later).

---

## 5 · The partition — the one genuinely new algorithm

**Definition:** given one Python module's source, emit a graph with **one node per
definition** — module, class, def, nested def, the recursive grain-1 tree — and
**edges = which definition references which** (calls and name references resolved
statically). Everything in a definition body that is not itself a definition is held
text. Module-level non-definition statements stay as the module node's held remainder.

**Where it lives: pyblocks.** New module `pyblocks/definition_graph.py`, surfaced behind
a CLI flag on the existing analyze entry point (`python3 -m pyblocks analyze
--view-kind definitions <file>` — flag wiring in `pyblocks/__main__.py`; keep
`python_adapter.py` edits to the minimal routing seam). This was research ask A4 and its
default (straight into pyblocks, no bbox-ui spike) stands.

**What it reuses — both halves already exist, measured:**

- **The nodes are free.** `analyze_source` (`pyblocks/analyzer.py:1923`) already
  computes the full definition tree — the `views[]` payload carries every definition
  with qualified name, exact span, signature, and construct kind. The answers report ran
  the real CLI on a 31-line/6-definition fixture and `views[]` held all of them. What
  does not exist is a *projection whose nodes are those views*: the current module page
  lowers statements (grain 2) and emits **no definition-to-definition edges at all** —
  measured: `estimate_pair` got no input port despite calling `rectify`, while
  free-variable capture (`in-CALIB`) was found. The gap is edges between definitions.
- **The edges use marimo's visitor technique — port and cite, never depend.** marimo is
  Apache-2.0 throughout its analysis code. Its `marimo/_ast/visitor.py`
  (`ScopedVisitor(ast.NodeVisitor)`) maintains a ref-stack per scope and bubbles free
  variables upward — exactly the reference-resolution shape needed, one level down
  (per-definition instead of per-cell). Its `marimo/_runtime/dataflow/` graph helpers
  (`topology.py`, `cycles.py`) operate on plain `dict[Id, set[Id]]` and port cleanly.
  **Provenance rule is hard:** the implementing agent fetches marimo at the pinned
  version the probe used (**0.24.2**), reads the actual files, and cites
  `path:line-range` from what it read in `definition_graph.py`'s header, with the
  Apache-2.0 notice. Citing from memory is forbidden (this repo's 2026-09-17 rule). Do
  NOT take marimo as a dependency (its own `InternalApp` docstring says the API is
  internal), do NOT adopt its file format or one-definition rule, and do NOT read
  `ryvencore` (LGPL — same rule as `elbow/nudge.ts:63-68` not reading libavoid).
- **The codegen discipline travels as a principle:** never re-serialize from an AST —
  splice held bytes verbatim; represent what will not parse as an explicit opaque node
  (marimo's `_unparsable_cell`; pyblocks' own opaque-region fallback, stated in
  `analyzer.py`'s module docstring: "the difference between an honest incomplete graph
  and a plausible but false one").

**Behavioural rules (from the research, settled):**

- Total, never refusing: a file the analyzer cannot fully parse still yields a view
  (opaque fallback). marimo's load-time `MultipleDefinitionError` does not travel — a
  name bound twice becomes a **visible state on the block, not an error** (ask C3).
- Static only: never imports or executes analyzed source (analyzer.py's standing rule).
- Deterministic: same input bytes → byte-identical JSON output.

**How it is tested:**

- New `tests/test_definition_graph.py` (pyblocks runs plain `unittest`; see
  `tests/test_commands.py` for house style).
- **Fixture 1 — the stereo module** (reconstruct the 31-line fixture from
  `docs/build_source_code_view_answers.py` in bbox-ui, `FIXTURE` constant): assert
  exactly 7 nodes (module + `EstimatePairOut` + `rectify` + `estimate_pair` +
  `Pipeline` + `Pipeline.__init__` + `Pipeline.run`), nesting via parent relation
  (methods under `Pipeline`), spans equal to `views[]` spans, and the edge set contains
  `estimate_pair → rectify` and `Pipeline.run → estimate_pair`.
- **Fixture 2 — duplicate names:** two `def f` in one module → two nodes, ordinals 0/1,
  a diagnostic, no refusal.
- **Fixture 3 — hostile syntax:** the DDG experiment's `try/except` fixture (which
  killed the expression-grain analyser) → still a total view.
- **Golden corpus:** add a definitions-view case to
  `examples/systemsketch_goldens/` alongside the existing subject-keyed cases
  (`pyblocks/goldens.py` owns the harness).

---

## 6 · Organise vs reuse — keep them apart, name them apart

Two different operations already exist as code on the bbox-ui lane, and the prior-art
sweep's central lesson is that conflating them is the documented failure mode:

- **Organise** = `scene/collapse.ts` — tidy, **copy**, no reuse. Collapse hides
  members behind a boundary; dissolve puts them back exactly. Unreal calls this
  "Collapse Nodes" and its docs say "not shared, even within a single Blueprint".
- **Reuse** = `scene/linking.ts` (727 lines, ported from SystemSketch's
  `definitionLinking.ts` with donor line-cites in its header) — a **shared definition**
  with a visible `definitionBadge`, `setDefinitionData` writing every occurrence,
  `unlinkOccurrence` as the fork gesture.

Why apart: every tool that shipped one undifferentiated "make composite" gesture is the
one with open bugs about it — ComfyUI's linked subgraph instances ship broken; Unreal
survived by splitting the gesture three ways in its own UI. The reuse tier's viscosity
is also the single strongest finding in the literature sweep (6/6 study participants
introduced a bug rewiring a live graph; 4/6 abandoned).

**Plan consequence:** P1's collapse-to-cell is **organise only**. It never mints or
touches a `definitionId` (collapse.ts already hard-codes this: "a region NEVER gets a
definitionId"). The UI verb is "Collapse to code" / "Expand"; reuse stays behind the
definition badge that linking.ts already draws, untouched by this plan. Do not add a
"convert to shared cell" gesture. If Zach later wants a bound cell to act as reuse
(several cells bound to the same `origin` anchor ARE de-facto shared views of one
definition — the reuse arrives via the *file*, which is the file-first answer), that is
its own future decision; note it in PEP 0018's Consequences and stop.

---

## 7 · Who owns what (the boundary a lane must not drift across)

| Concern | Owner | Anchor on disk |
|---|---|---|
| Parse, project, line accounting, opaque fallback | pyblocks | `analyzer.py` |
| The partition (definitions view) — NEW | pyblocks | `definition_graph.py` (new) |
| Block edit → source text (named commands) | pyblocks | `commands.py` |
| Anchors, matching, "never guess" | pyblocks | `identity.py` |
| `.systemsketch` format, v2 bump, round-trip proof | pyblocks | `systemsketch.py` |
| Code cell, block, ports, badges (props in, DOM out) | bbox-ui trunk | `apps/storybook-basics/src/components/` |
| collapse↔dissolve, boundary ports, linking (pure) | bbox-ui trunk | `apps/storybook-basics/src/scene/` (lane `claude/bar-block-storybook-e61a36`) |
| The tldraw shape, its props + migrations | systemsketch | `src/code/codeModel.ts`, `CodeShapeUtil.tsx` |
| Gesture wiring, file dialogs, resolution, persistence | systemsketch | `src/code/`, host |
| Running cells, kernels, outputs | the notebook thread | NOT THIS PLAN — see §10 |

Cross-repo rules that bind every phase: bbox-ui's core imports no canvas engine;
`packages/bbox-ui` is **frozen v1 — never edit it**; new bbox-ui design work goes in
`apps/storybook-basics/src/`; `systemsketch/src/bboxUi/` is a vendored consumer — a fix
made there gets an `// owed upstream: <what>` comment and does not silently become the
trunk's behaviour.

---

## 8 · Phases: write sets, acceptance, ordering

Notation: **W** = write set (exhaustive — a file not listed is out of bounds for that
lane), **A** = acceptance (mechanical), **D** = depends on.

### P0 — PEP 0018 (barrier, ~1 file, do first)

- **W:** `systemsketch/docs/peps/0018-code-cell-origin-binding.md` (follow
  `docs/peps/TEMPLATE.md`; 0018 verified free — the directory runs through 0017).
- Content: the decision that the code shape gains its **first semantic field**; the
  exact field shape of §3.1; the four states; the anchor format including the
  ordinal-not-line:col deviation and its WHY; the hash slicing rule (§3.4); the
  bytes-ownership rule ("whoever the binding points at owns the bytes"); binding-not-
  setting rationale; the PEP 0017 constraint (nothing enters CodeField); organise/reuse
  separation (§6) under Consequences. References section points at the four research
  reports by their `reports/media/*.html` paths.
- **A:** file exists, follows TEMPLATE.md sections, status `Proposed`, and quotes the
  frozen `origin` TypeScript shape verbatim so P1/P2 can diff against it.
- **D:** none. **Barrier for P1 + P2** (they implement its contract).

### P1 — `origin` on the tldraw shape (systemsketch)

- **W:** `src/code/codeModel.ts` (prop + validator + `TLGlobalShapePropsMap` block +
  `CodeOrigin` type + pure `codeOriginState()` helper + `getDefaultCodeProps` gains
  `origin: null`), `src/code/CodeShapeUtil.tsx` (migration id 2, up/down),
  `src/code/codeShapeMigrations.test.ts`, `src/code/codeModel.test.ts`.
- **NOT in W:** `src/fields/CodeField.tsx` (PEP 0017), `src/code/CodeBlockCanvas.tsx`
  (badge rendering is P6), anything in `src/bboxUi/`.
- **A:** `cd /home/bam/systemsketch && npm run test` green (vitest); new tests prove:
  v1 record up-migrates to `origin: null`; v2 record with a populated origin
  down-migrates by stripping it; `codeOriginState` returns each of the four states on
  synthetic resolutions; a default-created shape validates.
- Every non-obvious seam gets a `WHY:` comment pointing at PEP 0018.
- **D:** P0. **∥** with P2/P3/P4.

### P2 — the pyblocks mirror (pyblocks)

- **W:** `pyblocks/systemsketch.py` (VERSION 2, `_is_code_block_payload` v1|v2,
  `CodeBlock` origin kwarg, read-upgrade, `CODE_BLOCK_LANGUAGES` extended to the
  shape's 9 — §3.5), `tests/test_systemsketch.py` and `tests/test_systemsketch_codec.py`
  (both exist, verified).
- **A:** `cd /home/bam/pyblocks && python3 -m unittest discover -s tests -v` green;
  new tests prove: a v1 board loads unchanged and re-saves as v2 with `origin: null`;
  a bound cell survives `.systemsketch` → `.systemsketch.py` → `.systemsketch` with
  `assert_round_trip` (`:1224`) holding; a `plaintext` and a `typescript` cell
  round-trip; an unknown extra key inside `origin` is rejected (exact-keys discipline).
- **D:** P0. **∥** with P1/P3/P4 (write set disjoint from P3's).

### P3 — the partition (pyblocks) — start immediately

- **W:** `pyblocks/definition_graph.py` (new), `pyblocks/__main__.py` (the
  `--view-kind definitions` flag), minimal routing seam in `pyblocks/python_adapter.py`
  if unavoidable, `tests/test_definition_graph.py` (new), fixture files under `tests/`
  or `examples/systemsketch_goldens/` (one new golden case).
- **A:** §5's three fixture assertions + golden case, under
  `python3 -m unittest discover -s tests -v`; determinism (two runs, identical bytes);
  provenance header in `definition_graph.py` citing marimo 0.24.2 `path:lines`
  actually read, plus honest "ours, ad hoc" for anything derived rather than ported.
- **D:** none. **∥** with everything through P5.

### P4 — Rung A in the bbox-ui trunk — start immediately

- **Baseline warning (verified):** `collapse.ts` / `boundary.ts` / `linking.ts` are on
  lane `claude/bar-block-storybook-e61a36` (23fad70), NOT on `main` and NOT on the
  current report branch (which carries only `scene.ts`/`sceneWires.ts` + tests). The
  P4 lane must branch from that lane's tip or from its merge — the dispatcher decides
  which and says so in the lane brief. `.claude/settings.json` already carries
  `worktree.baseRef: "head"`; a fresh worktree still needs `pnpm install`.
- **W (adds only — no edits to collapse.ts/boundary.ts/linking.ts):**
  `apps/storybook-basics/src/scene/codeCell.ts` (new: `collapseToCode` = thin wrapper
  seeding `regionData` with the cell payload `{ code: { language, source, origin:
  null } }` + generated header text; `expandCode` = `dissolveRegion` + returns
  `discardedText`), `apps/storybook-basics/src/scene/codeCell.test.ts`,
  `apps/storybook-basics/src/components/originBadge.tsx` (new, presentational, the four
  states as props — no file IO, no engine imports),
  `apps/storybook-basics/src/stories/CodeCell.stories.tsx` (the variant gallery: cell
  face composed from the existing `components/codeEditor.tsx` (480 lines, verified) +
  block chrome + derived ports; collapse→expand round trip as a play function).
- **A:** `cd <lane>/apps/storybook-basics && pnpm test-stories` green (never trust
  `storyRenders` — repo CLAUDE.md); `codeCell.test.ts` asserts
  `JSON.stringify(before) === JSON.stringify(expanded)` (the collapse.test.ts pattern);
  ports on the cell equal `promoteBoundary`'s output for the same selection;
  `pnpm typecheck` green.
- **D:** scene-kit lane baseline only. **∥** with P1/P2/P3.

### P5 — Rung A wired into SystemSketch

- **W:** `systemsketch/src/code/` (the gesture: selection → code shape, expand back —
  likely `CodeSelectionControls.tsx` + a new `collapseToCode.ts` beside `detachCode.ts`,
  which is the in-repo precedent for lowering with `meta`-preserved payloads), vendored
  algebra into `src/bboxUi/` **with `// owed upstream:` comments**, one smoke test in
  the repo's `.mjs` style + vitest units.
- The stored-subgraph rule from §4 rung A applies: the collapsed shapes' records travel
  in the code shape's `meta` (the `detachCode.ts` pattern, including its
  `toJsonSafe` WHY about present-but-undefined keys), arrows re-bound the way
  `detachCodeToPrimitives` already re-binds them.
- **A:** `npm run test` green; smoke test: three shapes + two crossing arrows →
  collapse → one code shape; expand → original shape ids and arrow bindings restored;
  byte-stable board when the gesture is cancelled. Never bind 4321/4322/4323 — use
  `SYSTEMSKETCH_DEV_PORT`/`SYSTEMSKETCH_API_PORT` overrides; check
  `ss -ltnp | grep 432` first (repo CLAUDE.md).
- **D:** P1 (shape has `origin`), P4 (algebra proven in trunk). **Barrier for P6.**

### P6 — Rung B: definition blocks + four states + first command

- **W (three repos, sequenced inside the phase):**
  1. systemsketch host glue: resolve `origin.uri` against the board's directory, read
     the file, call pyblocks' definitions view, compute the four states. The Python
     host behind Preview (port 4323, `scripts/review_runtime.py` — **unverified**: how
     the tldraw app currently invokes Python; the implementing agent verifies the
     bridge before writing and records what it found) is the likely seam.
  2. Expand-bound-cell: one block per definition, each a grain-1 cell with its own
     `origin` (§4 rung B); layout is host-owned.
  3. Badge wiring: `CodeBlockCanvas.tsx` renders the trunk's `originBadge` states.
  4. First command: rename on a synced cell routes through
     `pyblocks.commands.apply_command` (RenameFunction), drifted/orphaned cells refuse
     with the state named.
- **A:** four states each reachable in a driven test (synced fixture; edit the file →
  drifted; delete the def → orphaned; detach → pseudo); rename round-trip: file bytes
  outside the renamed spans byte-identical (the commands module's own contract);
  expand-of-bound-cell produces the same node set as P3's fixture assertion.
- **D:** P2 + P3 + P5. Split into sub-lanes only after the host bridge (step 1) exists
  — it is the phase's internal barrier.

**Concurrency summary:** P0 first (hours, one file). Then P1, P2, P3, P4 in four
parallel lanes across three repos — write sets verified disjoint. P5 single lane after
P1+P4. P6 after everything, host-bridge first. No phase edits `packages/bbox-ui`,
`src/fields/CodeField.tsx`, or another lane's files. Never `git add -A` anywhere; stage
explicit pathspecs and read `git diff --cached --name-only` before every commit —
several agents write these trees concurrently.

---

## 9 · Open questions for Zach — each with the default a silent lane takes

- **Q1 — What does the rung-A cell display as text?** Default (§4): a deterministic
  generated comment header naming the collapsed blocks; text is annotation until rung
  B; expand returns `discardedText` and the host warns when it is non-trivial.
  Reversible — the subgraph is never lost either way.
- **Q2 — `origin.uri` format.** Default: POSIX path relative to the board document's
  directory (boards travel with their files; absolute paths break on any other
  machine). Alternative rejected by default: `file://` absolute URIs.
- **Q3 — Where does the board for a bare `.py` live?** Research ask A1's default
  stands: the free-standing board (`systemsketch_store.py` model) wins; the per-file
  sidecar directory (`sketch_store.py` model) is not extended to this feature. Opening
  a bare `.py` means "find or create a board that binds it."
- **Q4 — Does P5 ship to Zach's Preview channel before P6 exists?** Default: yes —
  rung A is useful alone (parking messy regions), and the review gate is SystemSketch's
  normal `## Review ·` + `review_runtime.py up` flow.

Everything else the research already settled (A2 anchor, A3 plaintext, A4 partition
placement, B1 two tiers, B3 no second sweep, B4 licences, C1 port-don't-depend, C2
runtime stays with the notebook thread, C3 report-never-refuse, D1 text-canonical, D4
dialect visible per block) — the defaults above fold them in; do not re-ask.

---

## 10 · Explicitly out of scope

- **Statement/expression granularity** — rejected by ruling and by measurement (17,192
  px for five lines; Green & Petre's nesting finding; the viscosity study). Grain 1 is
  a kind, not a dial. No `--view-kind statements` flag, ever, from this plan.
- **Executing code, kernels, outputs, run-cells, reactive staleness** — the notebook
  thread, a different agent. The two designs meet at exactly one fact and this plan
  holds that boundary: **cells without `origin` are runnable scratch; cells with one
  are a view onto a program.** Neither thread adds its own second flag to the record.
- **The P5 grain slider / depth control** — dead per §2.
- **marimo as a dependency** — port + cite only (§5).
- **Growing the pyblocks command set beyond the shipped 8** — P6 wires rename;
  everything else is follow-up work with its own plan.
- **Cross-file reference resolution** in the partition — v1 is single-module;
  `symbols.py` is the named seam for later.
- **`BlockView` ↔ `BlockScene` waist merge** (research ask D2) — the thin-adapter
  default stands; a merge wants its own PEP and is not on this critical path.
- **apps/docs pages, the npm registry, `apps/storybook` (the opt-in T0 spike)** — no
  phase touches them.

## 11 · House rules every lane restates in its own report

1. **Provenance:** every file implementing real math or a ported algorithm cites its
   donor by path and line range *actually read at a pinned revision*, or says "ours, ad
   hoc" (`bbox-ui/docs/ALGORITHM-PROVENANCE.md` is the classification; LGPL donors —
   ryvencore, libavoid — are deliberately not read and the header says so).
2. **`WHY:` comments** at every seam preserving a non-obvious decision (the four-state
   computation, the anchor ordinal deviation, the discarded-text return, the migration
   `down` being lossy on purpose).
3. **PEPs:** PEP 0018 is this plan's one required record (P0). A second PEP is
   warranted only if P6's host bridge forces a real architecture decision — do not
   write ceremony PEPs.
4. **Concurrent trees:** no `git add -A`; explicit pathspecs; check
   `git diff --cached --name-only` before each commit; `ls --time-style=full-iso`
   before rewriting any file a peer may hold; implementing is not integrating — land on
   the lane branch, report, and stop.
