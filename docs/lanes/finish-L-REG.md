# Lane finish:L-REG — Every registry item installs

_Plan: `docs/finish-2026-09-29/WORK-ORDER.md` + `lanes.json` (lane `L-REG`, wave W3 — `lanes.json` wins over prose) · repo: **bbox-ui** · branch target: `claude/finish-2026-09-29` (never main) · BASE `61e26e6` · depends on: W1-LAND (merged) · model: opus · size L · barrier: no_

Acceptance author: Claude Opus 5.5, 2026-10-06, in an isolated worktree cut at BASE.
`TRUNK` = `apps/storybook-basics/src`.

## What is true on BASE (measured 2026-10-06, not inherited)

- `python3 docs/build_menu_registry_items.py --check` → **exit 1**: `UNINSTALLABLE TRUNK ITEMS: block-region, labeled-group -> @bbox-ui/glyph-content`, plus WARNINGs for `port` / `block -> @bbox-ui/schema`. (CLAUDE.md's "36 items, exit 0" is about `verify`, not the generator.)
- `python3 docs/verify_registry_install.py --dir <scratch>` → 36 of 42 items, `tsc` exit 0; the six in `EXPECTED_UNINSTALLABLE` are skipped.
- Each of the 42 items installed **alone** into its own throwaway project: **36 pass, exactly the six fail** — `port`, `block` (npm E404 `@bbox-ui/schema`), `block-region`, `labeled-group` (E404 `@bbox-ui/glyph-content`), `block-node-reactflow`, `block-shape-tldraw` (TS2307 `@bbox-ui/core`, never declared).
- `npx shadcn@latest build -o <scratch>` (shadcn 4.21.3) reproduces `public/r` **byte-identically** — the committed payloads are the build output today.
- **A hidden clash the skip list was masking:** frozen-v1 `block` and trunk `block-card` both install to `components/bbox/block.tsx` with different bytes. Today `block` is skipped, so nobody saw it; the moment it installs, "every item into one project" silently keeps whichever came last. (`lib/utils.ts` is shared by both lineages but byte-identical — harmless.)
- **The donor's node file cannot go where the donor put it.** `claude/beautiful-bt-registry` (`611d985`) adds `TRUNK/components/blockNodeReactflow.tsx`, which imports `@xyflow/react`; `TRUNK/engineFree.test.ts` forbids any engine import under `components/` (and `scene/`, `editor/`, `shell/`). Only `hosts/` may import an engine — so the node goes in `TRUNK/hosts/`.
- **shadcn's `registryDependencies` resolution, measured with 4.21.3** (scratch items, `shadcn add -c <proj>`): a relative `./b.json` resolves against the *consumer's cwd* and fails ENOENT; an absolute path resolves; `@ns/b` resolves when `components.json` has `"registries": {"@ns": "<template>/{name}.json"}` (a local path template works); a bare name resolves against shadcn's *own* default registry, never this one. A URL resolves by fetching it.

## Write set (RE-ISSUED against BASE per `rules.writeSets` — the ONLY paths you may create or edit)

- `registry.json` — **generated only** (`docs/build_menu_registry_items.py`); every item you add or change is built by the generator, including the two adapters and `bbox-block-layout`, which are hand-authored entries today.
- `public/r/**` — **regenerated only** by `npx shadcn@latest build`; never hand-edited. Added at re-issue: `verify_registry_install.py` installs from here, so the lane cannot pass without rebuilding it (completeness-critic #10).
- `docs/build_menu_registry_items.py`
- `docs/verify_registry_install.py`
- `packages/bbox-ui/src/**` — **existing files: import specifiers only** (frozen v1 behaviour unchanged, proven by its own suite). **New files allowed:** verbatim copies of the unpublished packages' sources the v1 lineage needs, each with a provenance header naming `packages/<pkg>/src/<file>` at BASE (default: `packages/bbox-ui/src/schema/{field,resolve,index}.ts` from `packages/schema/src/{field,resolve}.ts` — `storybook.ts` is not used by any v1 file; and `packages/bbox-ui/src/glyph.content.ts` from `packages/glyph-content/src/content.ts` if the v1 item you ship reaches `glyph.tsx`).
- `packages/adapter-tldraw/src/**`, `packages/adapter-reactflow/src/**` — only to stop shipped files importing `@bbox-ui/core`; one repo-only shim module each if your route needs it (see the builder brief).
- `TRUNK/components/glyph.tsx` — the `@bbox-ui/glyph-content` import line only.
- `TRUNK/components/glyph.content.ts` — NEW, verbatim copy of `packages/glyph-content/src/content.ts` with a provenance header.
- `TRUNK/hosts/blockNodeReactflow.tsx`, `TRUNK/hosts/blockNodeReactflow.layout.ts` — NEW, ported from donor `611d985:apps/storybook-basics/src/components/blockNodeReactflow{,.layout}.{tsx,ts}` (moved to `hosts/` for the engine wall above).
- `TRUNK/hosts/BlockNodeReactflow.stories.tsx` — NEW, ported from donor `611d985:apps/storybook-basics/src/stories/BlockNodeReactflow.stories.tsx`.
- `CLAUDE.md` — the `## The registry is the product` section only.

## Do not touch

- The acceptance files below (read them; never edit them).
- `packages/bbox-ui/test/**` (incl. `registrySnapshot.test.ts`) and any v1 behaviour.
- `packages/schema/**`, `packages/glyph-content/**`, `packages/glyph-picker/**`, `packages/panel/**`, `packages/inspector/**`.
- `TRUNK/components/**` except the two `glyph` paths above — `blockPort*.tsx` is **L-PORTS-RAIL**'s (W3, in flight beside you), `blockMembers.tsx` **L-MEMBERS**'s.
- `TRUNK/hosts/**` except the three new files — `nodeViews.tsx` is **L-RF-HOST**'s, `reactFlowHost.tsx` is off-limits to everyone (L-RF-HOST's brief), `memberDrag.ts` L-MEMBERS', `useLinkedCameras.ts` L-COMPARE's.
- `TRUNK/scene/**` — the loop/branch presets ship **as they are**. If one cannot type-check once installed without a source edit, stop and report FAIL with the one-line fix; do not edit it.
- `TRUNK/editor/**`, `TRUNK/shell/**`, `apps/systemsketch/**`, `apps/docs/**`, `apps/bbox-reactflow/**`, `demos/**`, `README.md`.
- Every `package.json`, `pnpm-lock.yaml` (B-DEPS owns dependencies; `@xyflow/react` and `tldraw` are already storybook-basics deps).
- `rules.peerOwned`: `APP/stable-preview.json`, `scripts/launch_systemsketch.py`, `scripts/tests/*launch*`, `assets/bbox-ui.desktop`, `APP/src/chrome/{sites,legacyApp,siteStatus}.ts`, `APP/devFileHost.ts`, `scripts/dock_icon.py`, `scripts/launch_bboxui.py`.
- `docs/finish-2026-09-29/**` (the dispatcher's), `docs/CONTROL-FLOW-PLAN.md`, `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`.

## Acceptance (assertions you cannot edit)

From `lanes.json` → L-REG `acceptance`, plus its `extra` lines:

- `npx shadcn@latest build`, then `docs/verify_registry_install.py` installs **every** item into a throwaway project and `tsc` passes — **and every item installs ALONE too** (a consumer installs one item; one shared project hides an item that compiles only because a neighbour dropped its sibling, or a `registryDependency` that never resolved).
- The pin is empty and CLAUDE.md says so.
- `EXPECTED_UNINSTALLABLE → ∅`: `port`, `block`, `block-region`, `labeled-group`, `block-node-reactflow`, `block-shape-tldraw`.
- The adapters import copied siblings, declared as `registryDependencies`.
- `block-node-reactflow` sources the trunk's React Flow node view (donor `611d985`), re-expressed as `registryDependencies` on the item that ships `BlockPort` — never the donor's stale ~22-file list.
- Donor: the `bbox-block-layout` item (publishes `layoutSimpleBlock`, `packages/bbox-ui/src/blockLayout.ts:361`).
- `docs/CONTROL-FLOW-PLAN.md` §11 item 6: `value`, `loop`, `branch` presets as registry items.

Acceptance test files (committed before you existed; read them, never edit them):

- `packages/bbox-ui/test/registryInstallable.test.ts` — static, no network, rides `pnpm -r test` on every later merge:
  - `L-REG pin` — `EXPECTED_UNINSTALLABLE` still present and `set()`.
  - `L-REG CLAUDE.md` — the registry section states the pin is empty; the two bold present-tense claims (`**The two adapters cannot be installed by anyone.**`, `**But \`port\` and \`block\` do NOT install`) are gone (history may stay, past tense, not bold).
  - `L-REG <item>` ×N — no published payload imports an unpublished `@bbox-ui/*` package (red today for exactly the six).
  - `L-REG co-install` — no two items ship different bytes to one install target (red today: `components/bbox/block.tsx`).
  - `L-REG block-node-reactflow` / `block-shape-tldraw` — each declares a `registryDependency` on another item of THIS registry (namespaced `@x/<item>` or a URL/path ending `/<item>.json`; a bare name does not count — shadcn resolves it against its own registry).
  - `L-REG block-node-reactflow` — every file from `TRUNK`, depends on `@xyflow/react`, a registryDependency ships `TRUNK/components/blockPort.tsx`, and none of that dependency's files is re-listed.
  - `L-REG donor bbox-block-layout` — the item exists and a published file exports `layoutSimpleBlock`.
  - `L-REG preset value|loop|branch` — some item ships `components/block.value.tsx`, `scene/region.loop.ts`, `scene/region.branch.ts`.
  - `L-REG glyph` — `glyph.tsx` imports `decodeGlyphContent` from a RELATIVE sibling whose `decode`/`encode`/`same` match `@bbox-ui/glyph-content` over an 18-input corpus (the editor's glyph picker still encodes through the package; a drifted copy breaks picked icons). Mutation-tested by the author: a faithful sibling → green; dropping the `http://` branch → red on `decode("http://example.com/a.png")`.
- `docs/acceptance/registry/test_registry_installs.py` — the consumer proof (npm + network, 3–6 min by load; run at the L-REG merge and again in W5's G5, deliberately not under `scripts/tests` so G2's five runs do not pay it):
  - `test_L_REG_shadcn_build_reproduces_the_committed_payloads` — `npx shadcn@latest build -o <scratch>` equals `public/r` byte for byte (green today; it must stay green after you rebuild).
  - `test_L_REG_generator_check_is_clean` — `--check` exit 0 with no `WARNING`/`UNINSTALLABLE` line.
  - `test_L_REG_every_item_installs_together_and_type_checks` — `verify` with no names exits 0, then the test itself checks that every item's every file landed and re-runs `tsc` (strict) in the project.
  - `test_L_REG_item_installs_alone_and_type_checks[<item>]` — the same, one item per fresh project, for every item in `registry.json` at test time (so the items you add are covered automatically).

## Builder brief

You are the builder for lane **L-REG** of `docs/finish-2026-09-29/WORK-ORDER.md`, in an isolated worktree cut from the acceptance commit. First call `pwd` and keep your shell there; run git only as plain `git …` (`rules.isolatedGit`). Then `pnpm install --frozen-lockfile`. Never `git add -A`; stage explicit paths and read `git diff --cached --name-only` before every commit. No audits. Stop every process you start. Browser tests share vitest's port 63315 across worktrees: run only the story file you need, wait and retry if busy, never kill another process.

### Defaults already decided (take them; deviate only with a WHY comment and a line in your report)

- **Where it lands:** your lane branch → the dispatcher merges into `claude/finish-2026-09-29`. Never main, never push, never deploy (WORK-ORDER §6 D2, D6).
- **Names:** keep `block-node-reactflow` and `block-shape-tldraw` (CLAUDE.md, `README.md:501`, the docs index and `registrySnapshot.test.ts:46-52` all name them). The donor's `block-port-node-reactflow` does **not** become a second item: `block-node-reactflow` IS that node, re-sourced (one thing, one name — CLAUDE.md naming principle). Donor's `bbox-block-layout` keeps its name. Presets: `block-value`, `region-loop`, `region-branch` (descriptive, mirrors their source files and the existing `block-region` / `labeled-group`).
- **`registryDependencies` form:** URL `https://bbox-ui.com/r/<item>.json` (README's documented install base; zero consumer config). `verify_registry_install.py` must never fetch the live site for a bbox item — it serves the bytes of the last deploy, and deploying is Zach's call (D6) — so verify copies `public/r` into its scratch dir with that prefix rewritten to the local copies and installs from there (it never edits `public/r`). Acceptable alternative: the `@bbox/<item>` namespace with verify writing `"registries": {"@bbox": "<scratch>/r/{name}.json"}` into the throwaway `components.json` — measured to work; costs every consumer one config line, which the docs lanes would then have to document. Pick one; WHY comment in the generator.
- **The v1 lineage installs under `components/bbox/v1/`** (generator-built v1 items: `port`, `block`, and any v1 item you add for the tldraw adapter). This resolves the `block` / `block-card` clash. It moves no consumer: no v1 item has ever installed (E404). `bbox-skin` and `bbox-layout` keep their targets (they install today). The docs' `@/components/bbox/port` / `block` paths become a follow-up for L-DOCS-COMPONENTS.
- **Copies, not moves, for the unpublished packages**, each with a provenance header (`packages/<pkg>/src/<file>` at `61e26e6`) and a WHY naming CLAUDE.md's "copy the package's ~110 lines as a sibling": `TRUNK/components/glyph.content.ts`; `packages/bbox-ui/src/schema/`. Every `from "@bbox-ui/schema"` in `packages/bbox-ui/src` becomes `from "./schema"` (all files, not just the shipped ones, so v1 has one copy of its cascade). The v1 copy is frozen with v1 — no parity pin on it, on purpose (a pin would force v1 to follow `packages/schema` as L-INSPECTOR evolves it).
- **`block-node-reactflow`** = the donor's node + layout, ported to `TRUNK/hosts/` (engine wall), re-checked against BASE's `BlockPort` API (`BlockEdgeSpec`, `BlockPortLayout`, `BlockView` still export from `components/blockPort.tsx`; `blockPort.tsx` grew ~780 lines since the donor), files = those two only, `dependencies` ⊇ `["@xyflow/react"]`, `registryDependencies` → `block-port`. `block-port` installs mirrored (`components/bbox/components/…`), so the node must land at `components/bbox/hosts/…` for `../components/blockPort` to resolve — the generator must compute that.
- **`block-shape-tldraw` route (recommended):** the shipped `block-shape-util.tsx` imports one relative sibling module instead of `@bbox-ui/core`; in the repo that specifier resolves through a repo-only shim in `packages/adapter-tldraw/src/` re-exporting `@bbox-ui/core`, which the item does **not** ship (WHY comment at the shim: "the registry lands the real v1 module here"); the item declares a `registryDependency` on a generator-built v1 item (entry `packages/bbox-ui/src/index.ts`, e.g. `bbox-v1-core`) that lands a module of that name beside it under `components/bbox/v1/`. `packages/adapter-reactflow/src` stays as it is — it is no longer shipped once `block-node-reactflow` is trunk-sourced, and remains the demos' v1 adapter.

### The generator (`docs/build_menu_registry_items.py`) owes four changes

1. Build the adapters, `bbox-block-layout`, the v1 core item and the three presets — no hand-authored entries left for the items this lane touches.
2. A `registryDependencies` declaration per item: emit it, **subtract the dependency's file closure** from the item's own files, and in the sibling-rule check count the dependency's targets as landed. Rewrite the `_check_published_payloads` comment that calls any registryDependency "a drift from that design" — it is now the design for adapters, and the payload comparison of declared vs served stays.
3. Hard-fail ANY item with an unpublished `@bbox-ui/*` dependency (no more legacy soft WARNING — the pin is empty).
4. Replace the "presets are deliberately NOT registry items" comment block (`:109-136`) with the new rule; the presets are scene factories (closure ≈54 files incl. `hosts/hostScene.ts`, `hosts/regionScene.ts`) and land mirrored.

### `docs/verify_registry_install.py`

`EXPECTED_UNINSTALLABLE = set()` — **keep the variable and the derive-then-compare guard** (the acceptance fails if the pin is deleted). Resolve bbox registryDependencies locally (default above). Update its module doc.

### Build in this order (gate after each)

1. v1 + glyph imports: schema copy, glyph-content copies, specifier swaps. Gate: `pnpm --filter @bbox-ui/core test` 100% green with zero test edits except the acceptance file's own reds; `pnpm -r typecheck`; the `L-REG glyph` test green.
2. Generator + verify (regdeps, v1 targets, hard fail). Gate: `L-REG co-install`, `L-REG pin` green.
3. `block-node-reactflow` from the donor into `TRUNK/hosts/`, plus the story: `TRUNK/hosts/BlockNodeReactflow.stories.tsx`, title `Hosts/BlockNodeReactflow` (Hosts is flat, 5 entries today), tags `["object:block", "host:react-flow", "lane:finish-l-reg"]` right after `title:`. Port the donor `ClassicDag` play **assertions verbatim** — handle centre within ±1 px of its measured dot centre (`getBoundingClientRect`), `data-handlepos === port.edge`, `target`/`source` class — the dispatcher diffs them against `611d985`; you may only wrap the first query in `waitFor` (CLAUDE.md: a play's first wait must not be a bare synchronous read). Gate: `pnpm --dir apps/storybook-basics exec vitest --project=storybook run src/hosts/BlockNodeReactflow.stories.tsx`; `pnpm --dir apps/storybook-basics exec vitest --project=unit run src/storyOrganisation.test.ts src/engineFree.test.ts src/components/layering.test.ts`.
4. `block-shape-tldraw`, `bbox-block-layout`, the presets. Gate: `pnpm --filter @bbox-ui/adapter-tldraw test`; `pnpm --filter @bbox-ui/adapter-reactflow test`.
5. `python3 docs/build_menu_registry_items.py` → `npx shadcn@latest build` → commit `registry.json` + `public/r/**`. Gate: `--check` exit 0; `python3 docs/verify_registry_install.py --dir <scratch>` (every item, tsc 0); `python3 -m pytest -q docs/acceptance/registry/test_registry_installs.py` (all 45+ green — run it under `nohup … &` + `timeout 570 tail --pid=… -f /dev/null` per `rules.longRuns`).
6. CLAUDE.md registry section: the new truth — the pin is empty (say so in those words), the regdep form and what a consumer types, the v1 `components/bbox/v1/` targets, the presets as items, measured counts. Keep history in past tense, not bold. Gate: `L-REG CLAUDE.md` green.

**Mutation-test the guards (WORK-ORDER §4 step 4), in the commit message:** inject an `@bbox-ui/schema` import into one shipped trunk file → generator `--check` and `L-REG <item>` go red → restore → green.

**Name the user action:** none — this lane's consumer is `npx shadcn add`; the evidence line is the per-item install table.

### GATE (whole lane)

`pnpm -r typecheck` exit 0 · `pnpm --filter @bbox-ui/core test` all green (incl. `registryInstallable.test.ts`, `registrySnapshot.test.ts`) · adapter suites green · the story file + `storyOrganisation`/`engineFree`/`layering` green · `python3 -m pytest -q docs/acceptance/registry/test_registry_installs.py` all green · `git diff --stat BASE` touches only the write set.

### WHY comments to leave

At the v1 target rule (the clash, and that no consumer moves); at each copied module (provenance, frozen-with-v1 vs parity-pinned); at the regdep emission (relative paths resolve against the consumer's cwd — measured; why URL vs namespace); at the tldraw shim; at the node's move to `hosts/` (engine wall, `engineFree.test.ts`).

### Out of scope — follow-ups, named for W5 (do NOT widen the write set)

- `README.md:507-509` ("Known gap … not installable"; the item list at `:501`) and `apps/docs/content/llms-intro.md:52-56` ("Known gaps") — unowned; W5-VERIFY or the dispatcher.
- `apps/docs/content/docs/components/index.mdx:95-102` ("not yet installable") and the `port.mdx`/`block.mdx` install paths if v1 moves to `components/bbox/v1/` — **L-DOCS-COMPONENTS** (depends on L-REG, owns that folder); the consumer `registries`/URL note for adapters — **L-DOCS-SCENE-HOSTS**.
- `docs/CONTROL-FLOW-PLAN.md` §11 item 6 — mark it done once merged (dispatcher).
- Re-running the generator + this acceptance after every trunk change has merged — **W5-VERIFY / G5** (`lanes.json` W5 line already carries `--check` and the `public/r` freshness check; add `python3 -m pytest -q docs/acceptance/registry/test_registry_installs.py`).
- Coupling: L-PORTS-RAIL (W3) edits `blockPort.tsx` beside you. If it merges first and moves the `BlockPort` API, re-check the node port; the `registrySnapshot` ratchet forces every lane that edits a shipped trunk source to rebuild `public/r`.
