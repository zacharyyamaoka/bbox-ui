# Provenance — `src/components/paintOrder.ts` (Card 04, z-order)

Per `.claude/feedback.md`'s algorithm-provenance rule: a citation earns its
place only if it is a path and line range that exists on this disk and was
opened, or a URL actually fetched and quoted — never from memory. This file
covers ONE lane's math: the paint-order ladder in
`apps/storybook-basics/src/components/paintOrder.ts`.

## Classification

**(c) Ours, ad hoc.** The ladder is a rationalisation of numbers this repo
already had scattered across three files, coordinated only by prose
comments. It is not a port of anything, and no external paper or library was
read to derive it. The honest citation is the five in-repo call sites the
refactor reproduces exactly, listed below — opened directly, on this disk,
before writing `paintOrder.ts`.

## The five pre-existing raw `zIndex` literals this refactor reproduces

All five were read at their original locations (pre-refactor) in this
worktree before `paintOrder.ts` existed. Line numbers below are where each
literal lived at the moment it was read; after the refactor each site now
reads `zIndex: paintTier("<name>")` instead.

| File : line (pre-refactor) | Component | Literal | Token | Value |
|---|---|---|---|---|
| `apps/storybook-basics/src/components/blockPort.tsx:412` | `BlockFunctionPort` | `zIndex: 1` | `portDot` | `1` |
| `apps/storybook-basics/src/components/blockPort.tsx:538` | `BlockPortRail`'s wrapper `style` | `zIndex: 1` | `portDot` | `1` |
| `apps/storybook-basics/src/components/block.tsx:334` | `block-diagnostic-flag` | `zIndex: 1` | `flagBadge` | `1` |
| `apps/storybook-basics/src/components/portEdge.tsx:846` | `FreeSlotCard` | `zIndex: isDragging ? 10 : 1` | `dragActive` (10) / `memberContent` (1) | `10` / `1` |
| `apps/storybook-basics/src/components/portEdge.tsx:1003` | `PortLaneOverlay` | `zIndex: 5` | `laneOverlay` | `5` |

Verified as a no-op (not merely asserted): `PaintOrder.stories.tsx`'s
`TokensReproduceTodaysNumbers` and `PortEdgeTokens` stories mount the real
components and read `getComputedStyle(el).zIndex` back off the DOM, real
Chromium, via `pnpm test-stories` — not a value read back out of
`paintOrder.ts`'s own source. `paintOrder.test.ts`'s
`"reproduces today's five pre-existing raw literals exactly"` pins the same
five numbers as a fast unit check. Both suites are green as of this commit
(`STORYBOOK_PORT=5534 pnpm test-stories`: 65 files / 280 tests;
`pnpm exec vitest --project=unit run`: 46 files / 856 tests).

## The one genuinely NEW tier: `headerChrome`

Not a pre-existing literal — `block.tsx`'s `block-header` / `block-footer`
slots carried no `zIndex` (and no `position`) before this lane. This is the
capability Zach actually asked for (nested children in DOM canvas need a
Block's own chrome to paint above its own `BlockMembers` region, however
deeply that region nests other Blocks). See `paintOrder.ts`'s own header
comment and inline comments on `headerChrome` and `block.tsx`'s header/footer
`style` props for the full reasoning, including why its exact numeric value
does not need to out-rank tiers like `portDot`/`laneOverlay`/`dragActive`
numerically — the isolation invariant (below) is what actually does that
work.

## The isolation invariant — measured, not merely asserted

Every component root that emits a tier (`block.tsx`'s root, `blockPort.tsx`'s
`[data-slot="block-port"]` wrapper, `portEdge.tsx`'s `[data-slot="port-edge"]`
track) sets `isolation: isolate` (`paintOrder.ts`'s `ISOLATED_ROOT_STYLE`).

**Mutation-tested, live, twice, in this session — not just claimed:**

1. **Isolation removed** (`...ISOLATED_ROOT_STYLE` deleted from both
   `block.tsx` and `portEdge.tsx`, keeping the rest of the diff untouched):
   `STORYBOOK_PORT=5534 pnpm test-stories -- -t PaintOrder` went from 3/3
   green to **3/3 red**, including `NestedChildStaysBehindHeader` failing
   with exactly the predicted symptom — the assertion `hit.closest(
   '[data-slot="block-header"]')` returned `null` instead of the root
   header element, i.e. the dragging card (tier `dragActive`, raw value
   `10`, numerically ABOVE `headerChrome`'s `2`) painted over Root's header
   at their measured overlap pixel once nothing walled its interior off.
   Reverted immediately after (`diff` against a pre-mutation copy confirmed
   byte-identical restoration); full suite re-run green (65/65, 280/280).
2. **One token value changed** (`portDot: 1` → `portDot: 3` in
   `paintOrder.ts`): `pnpm exec vitest --project=unit run
   src/components/paintOrder.test.ts` went from 8/8 to **7/8**, failing
   exactly `"reproduces today's five pre-existing raw literals exactly"`
   with `expected 3 to be 1`. Reverted; re-run green.
3. **One raw literal reintroduced** (`blockPort.tsx`'s `BlockFunctionPort`
   temporarily changed back to `zIndex: 1` instead of
   `zIndex: paintTier("portDot")`): the grep-guard test failed, naming the
   exact file and line (`blockPort.tsx:417`). Reverted; re-run green.

This is why a closed, per-tier integer scale is safe to reuse across files
that never coordinate with each other (`portDot` and `flagBadge` both being
raw value `1`, in different files, is fine): removing the wall is what
actually lets a numerically-larger interior value escape and win, not the
choice of number itself.

## The rejected alternative — Vyuh Flow's `child.z = parent.z + 1` (NOT independently verified)

The wave brief cites
`packages/vyuh_node_flow/lib/src/nodes/group_node.dart:229-246,654-668,670-703`
as the donor for the mechanism this ladder deliberately does **not** adopt —
Vyuh's group-node z-order is reasserted at reparent/drag-start/load, which is
between-node CANVAS z-order (needs the pointer/selection/a sibling's
identity), host-owned under this repo's own ruling, not something the kit
should emit.

**That specific file was not found anywhere on this disk** (checked
`/home/bam` and a broader filesystem search; the donor is not vendored into
this repo, unlike `elbow/*` or the tidy/routing ports in
`docs/ALGORITHM-PROVENANCE.md`). It is quoted second-hand from
`/home/bam/bbox-ui/reports/media/node-editor-prior-art-visuals-2026-09-18.html`
(a report already in this repo's `reports/` tree, produced by an earlier
lane), not opened and read at the cited line numbers by this lane. Per this
repo's own provenance rule, that citation is recorded here as an
**unverified resemblance** — the reasoning for rejecting the mechanism (it is
canvas z-order, not paint order) stands on its own regardless of whether the
donor citation is exact, but the donor file:line numbers themselves should
not be treated as confirmed until someone actually opens that source.

## Why nothing here needed to read an external CSS spec

The one CSS mechanism this lane leans on — `isolation: isolate` forcing a new
stacking context regardless of `z-index`, and a stacking context being
opaque to its parent's own ordering — is standard behavior, confirmed
directly by this lane's own mutation tests (above) rather than by citing the
spec. No CSS Positioned Layout / CSS Color spec text is quoted here because
none was fetched for this lane; the measured behavior is the evidence.
