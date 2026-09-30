# bbox-ui — working notes for agents

@.claude/feedback.md

Presentational components for black-box system design: blocks, ports, edges.
Copy-paste components people own, not a library they depend on.

`README.md` describes the components and `ARCHITECTURE.md` the core/adapter
split — read those for *what* things are. This file carries what only matters
when you are **changing** the repo.

## The one rule the design rests on

**The core imports no canvas engine.** `packages/bbox-ui` is props in, DOM out —
zero imports of tldraw, zero of React Flow, no pointer listeners, no
self-measurement. Layout geometry is portable and lives in the core;
interaction geometry (hit-testing, snapping, drag) is host-owned and never
travels.

**Z-index is not one thing, and this line used to say it was never emitted
here — that was already false the day it was written.** Amended 2026-09-18
(Card 04, the z-order lane): the mechanical test is whether the answer can be
computed from ONE component's own props, knowing nothing about what else is
on the canvas and nothing about what the pointer is doing.
- **Paint order WITHIN one component's own box** (which member paints above
  which, a header above a member's overflow, a port dot above its own
  Block) is deterministic from that component's own tree, identical on every
  host, and required for the render to be correct at all — that is layout,
  it is portable, and it is named in `apps/storybook-basics/src/components/
  paintOrder.ts`. Retroactively honest, not new: `blockPort.tsx` and
  `portEdge.tsx` were already emitting raw `zIndex` literals, coordinated
  only by prose comments across three files, before this ladder existed —
  see `docs/provenance/z-order.md`.
- **Z-order BETWEEN nodes on a canvas** (which node is on top,
  raise-on-select, drag-to-front) needs the selection, the pointer, or a
  sibling node's identity — that stays interaction geometry, host-owned,
  never travels.
- **The structural wall between the two:** every component root that emits a
  paint tier sets `isolation: isolate`, a hard CSS stacking-context boundary
  — a descendant's z-index cannot outrank anything outside its isolated root
  no matter what integer it carries. The kit still never emits a z-index on
  a node ROOT (a Block's own outer box); only a host does that. Mutation-
  tested proof that the wall is load-bearing (not just documented) is in
  `docs/provenance/z-order.md`.

(Zach, 2026-09-18: "Right now we're not doing any z-index. BUT I think that
is changing... in DOM canvas examples with expanded nodes with children
inside we definitely need this." That is what this section resolves —
between-node z-order is still his to grant per host; within-box paint order
is granted here, once, for every host.)

An adapter may import the core and its own engine — never the other engine,
never the other adapter. That rule is what keeps a third host a ~150-line
afternoon instead of a fork.

## The trunk is `apps/storybook-basics`

Full context and the verified evidence: `ARCHITECTURE.md`, "The trunk — one
canonical lineage, three consumers." The checkable version:

- **New design work happens in `apps/storybook-basics/src/`** — `components/`
  for what draws a scene element, `editor/` for the editor's chrome and
  authoring surfaces (see "Story titles" for where the line is).
  Not `packages/bbox-ui`, not `systemsketch/src/bboxUi/`.
- **`packages/bbox-ui` is frozen v1.** Keep publishing it as-is; never edit
  it to chase a trunk change. Regenerating it from the trunk is its own
  project (P7-class work), not a drive-by fix.
- **`systemsketch/src/bboxUi/` is a vendored consumer, not a co-author.** A
  fix made there gets a `// owed upstream: <what>` comment; it does not
  silently become the trunk's behavior just because it shipped first.
- **Same component in two places, disagreeing → the trunk wins.** Port the
  trunk's version forward. Never average the two, and never keep both "for
  now" — that is exactly how the vendored copy above started to diverge.

## The registry is the product

**There is exactly one distribution channel, and npm is not it.** Every
`packages/*` is `private: true` on purpose. Never add an `npm install` line for
bbox-ui to docs, llms.txt, or a component page — it would be a lie. If
publishing ever becomes the right call it is Zach's decision, not a convenience
fix for the adapters.

`registry.json` at the root is how people consume this — shadcn takes a GitHub
repo as a registry directly, with no website at all.

**But `port` and `block` do NOT install, and that sentence used to say they
did.** Measured 2026-09-18 against a real throwaway project: `npx shadcn@latest
add .../port.json` fails with `npm error 404 … @bbox-ui/schema@*`, before it
writes a single file. `packages/schema` is `private: true` like every other
`packages/*`, and `appearance.fields.ts`, `port.fields.ts`, `port.presets.ts`,
`block.fields.ts` and `pill.tsx` all import it — so this is the same
uninstallable-by-construction class as the two adapters and `glyph.tsx`, and
the fix is the same source change, not a registry tweak.

Worse, the breakage was hidden behind a *second* one. Both items shipped
file lists that omitted what their entry points import — `port.tsx` needs
`./appearance`, `./port.fields`, `./port.presets` and `./port.layout` and the
item carried none of the four. So `npm install` never got far enough to 404;
the install "succeeded" and left four unresolvable imports. Completing the
file lists is what surfaced the real blocker underneath. The trunk-sourced
items (`port-v2`, `block-v2`, the menu kit, …) have no such dependency and do
install — verified the same day, `tsc --noEmit` exit 0 on a throwaway project
with `compare-review`, `chrome-bar`, `control-strip`, `frames-panel` and
`tool-dock` installed into it.

**`registry.json`'s items are generated, not hand-edited** —
`docs/build_menu_registry_items.py` walks each entry point's real transitive
relative imports, applies the per-lineage target rule below, and then asserts
both failure modes: that every relative import resolves against its *target*
layout, and that no item depends on an unpublished `@bbox-ui/*` package. Add a
component there, not by hand. Run `--check` to see whether the file is stale.

**`shadcn add` copies source verbatim.** It rewrites only the `@/` alias prefix
against the consumer's `components.json`. It never rewrites relative specifiers,
because it cannot know where one was meant to point after `target:` remapping.

So every file a component imports relatively must land as its **sibling**. That
is why `port` and `block` each ship `layout.ts` and `lib/utils.ts` targeted into
`components/bbox/`. Change a `target:` and you can silently break the install
while every build stays green.

**The sibling rule depends on which relative path the source actually
wrote, not just which folder it's in.** `packages/bbox-ui/src/port.tsx`
imports `./lib/utils` (utils nested one level *below* the component), so its
registry item can flatten straight into `components/bbox/` and target
`lib/utils.ts` at `components/bbox/lib/utils.ts` — that keeps `./lib/utils`
resolving. The trunk (`apps/storybook-basics/src/`) is laid out differently:
`components/` and `lib/` are **siblings**, so every trunk component imports
`../lib/utils` (up-and-over, not down-and-in). Flattening `components/*` into
`components/bbox/*` moves every file down one level, so `lib/utils.ts` has to
land at `components/lib/utils.ts` — a sibling of `bbox/`, *not* nested inside
it — for `../lib/utils` to still resolve after the move. Landing it at
`components/bbox/lib/utils.ts` instead (right for `packages/bbox-ui`, wrong
here) is the exact "build stays green, install breaks" trap this section
already warned about: it shipped that way once, `npx shadcn@latest build`
exited 0, and a throwaway `tsc` caught it as `TS2307` on all twelve trunk
files that import `cn` — the check below is what caught it, not the build.

After editing `registry.json`:

```bash
npx shadcn@latest build
```

Then **install it into a throwaway project and type-check it**. `npx shadcn add`
exiting 0 proves nothing — this repo already shipped a registry that installed
cleanly and then failed to compile. That check is now one command:

```bash
python3 docs/verify_registry_install.py --dir /tmp/bbox-registry-check
```

It installs every installable item from `public/r/` into a fresh project and
runs `tsc`. First run (2026-09-22): 37 items, `tsc` exit 0 — and deleting one
installed file turns it red, so it can fail. After `region` became
`block-region` and `labeled-group` joined it (same day): 38 items, exit 0.

**Which items it skips is derived, not listed by hand — and the derivation is
pinned.** The old spelling was a hand-written set of four names, which is
exactly the thing that goes stale: an item that newly imports an unpublished
`@bbox-ui/*` package would just join the skip list and the gate would stay
green over a real breakage. The script now reads the **shipped payload content**
(the adapters import `@bbox-ui/core` in source and never declare it in
`dependencies`, so trusting the manifest calls them installable and then watches
npm 404) and fails on any delta against `EXPECTED_UNINSTALLABLE`, in either
direction. Mutation-tested red both ways, 2026-09-22.

The class grew from four to six on the 2026-09-22 integration merge:
`block-region` and `labeled-group` joined it, because `blockRegion.tsx` now
imports `./glyph` for the corner tab (commit `069e418`) and `glyph.tsx` imports
`@bbox-ui/glyph-content`, `private: true`. So the run is 36 items, exit 0 — two
items that installed on `main` that morning no longer do. Fixing it is the same
source change `glyph.tsx` has always needed (copy the package's ~110 lines as a
sibling); until then the registry ships two more reference implementations, and
this note is the "do not paper over it".

**Renaming or removing an item goes through `RETIRED_ITEMS`** in the
generator. It merges into `registry.json`, so a renamed item used to leave its
old entry behind, pointing at files that no longer exist: `--check` passed
and only `npx shadcn build` failed. The generator now retires listed names and
refuses to write any item whose files are missing.

**The two adapters cannot be installed by anyone.** `block-node-reactflow` and
`block-shape-tldraw` import `@bbox-ui/core`, which is `private: true` and
unpublished. Retargeting cannot fix it — shadcn copies source verbatim, so the
import has to already say something a consumer can resolve.

With npm ruled out, the only remaining fix is a **source change**: have the
adapters import the copied siblings (`./block`) rather than the workspace
package, and declare `block` as a `registryDependency` so it lands beside them.
That needs the repo to resolve the same specifier, so it is real work, not a
registry.json tweak. Until then they are reference implementations, and the docs
say so. Do not paper over it.

**Sixteen items now publish the trunk directly** (`badge`, `bar`, `text`,
`editable-text`, `folding-chevron`, `block-card`, `port-dot`, `code-editor`,
`labeled-port`, `port-edge`, `block-port`, `trace`, `trace-badge`,
`trace-editor`, `trace-tidy`, `wire-layer`) — sourced from
`apps/storybook-basics/src/`, each self-contained the same way `port`/`block`
are (no `registryDependencies` between bbox items; a shared file like
`elbow/*` or `lib/utils.ts` is simply re-listed, with its own `target`, by
every item that needs it). Since 2026-09-22 they are built by
`docs/build_menu_registry_items.py` too (`TRUNK_ITEMS`): their hand-set file
lists had drifted — `block.tsx`, `port.tsx`, `trace.tsx` gained imports the
items never picked up — and eleven of them installed and then failed to compile.

**Two install layouts, chosen by resolution, not by folder.** An item installs
flat (`components/bbox/X`, with `lib/`, `skin/` as siblings of `bbox/`) when
every one of its relative imports still resolves that way. When one would not —
an `editor/` file importing `../components/button`, or `skin/portVariants.ts`
importing `../components/port.layout` — the whole item installs as a mirror of
the trunk tree, `components/bbox/{components,editor,lib,skin}/X`. So an item's
install paths move only when they have to: 18 items are mirrored (the chrome
that moved to `editor/`, and the four port items through `skin/`), 23 stay flat.
Trade-off, recorded: a consumer who installs one flat and one mirrored item
gets two copies of shared files (e.g. `button.tsx` at both depths).

**Naming principle (Zach, 2026-09-17): bbox-ui's own names are descriptive
and precise; shorthand belongs to the consumer.** SystemSketch calls its
primitive a "port" and has no reason to know it's assembled from several
bbox-ui components — that shorthand is SystemSketch's to use, not ours to
bake into the registry. `block-card`/`port-dot` replace this pass's original
`block-v2`/`port-v2` names, which encoded history (a naming collision with
the v1 lineage below) instead of what the items are. `port.tsx` is the dot
alone — geometry, no label, no slot — and the code already names it that way
(`data-slot="port-dot"`, `portDotClass`); `labeled-port`/`port-edge` are what
add the label and the rail around it. `block.tsx` is header/body/footer
chrome painted with shadcn's own `bg-card`/`text-card-foreground` tokens and
its own doc comment calls it "a card with a header, a body, a footer" —
`block-card` names that directly, and `block-port` is the wrapper that mounts
ports on its walls.

`port`/`block` (no suffix) stay exactly as they are on purpose — still
pointing at the frozen `packages/bbox-ui` lineage. Renaming them would
silently break `apps/docs`'s live preview (which still imports
`@bbox-ui/core`) against its own install tab. The short names sitting on the
legacy lineage rather than the descriptive trunk items is deliberate and
self-correcting — it resolves itself the day `apps/docs` migrates to the
trunk, not something to "fix" by renaming `port`/`block` now.

Two things the reset shipped are deliberately **not** registry items:
- **`glyph.tsx`** — imports `@bbox-ui/glyph-content`, `private: true` and
  unpublished, the same blocker class as the two adapters above. Fixing it
  needs the same source change (copy the package's ~110 lines as a sibling)
  and is out of scope here for the same reason.
- **`button`, `toggle`, `dropdown-menu`, `tooltip`, `collapsible`** — each
  file says so in its own header comment: copied verbatim from
  `apps/docs/src/registry/new-york-v4/ui/*` (or, for `toggle`,
  `packages/inspector`), the stock shadcn `new-york` / Base UI primitives,
  vendored only so this app's own demo stories have controls to put inside a
  `Bar`. None of the reset's own design work lives in them. A consumer that
  wants them gets them from the stock shadcn registry
  (`npx shadcn add button`, etc.), not from bbox-ui.

## Control flow — a region is ONE node, and the frame owns no id

Loop, branch, arms and the opaque ⇄ expanded toggle are designed in
`docs/CONTROL-FLOW-PLAN.md`; read it before touching `scene/controlFlow.ts`,
`components/blockRegion*.{ts,tsx}`, `scene/regionView.ts` or `hosts/regionScene.ts`.

**The one rule that is easy to break and silent when broken:** the region
root and its frame carry `data-region-id`; the CORNER CARD alone carries
`data-block-id`. `wireLayer.tsx`'s `resolveDot` takes the FIRST
`[data-block-id="<id>"]` in document order (`wireLayer.tsx:81`), so stamping
the region's id on the frame makes every wire into that region resolve
against a box that owns no port dot — the frame would win the lookup and the
cable would silently fail to land. The corner card IS the region's interface
("everything is a block"): its ports are the region's ports, one id, one
port vocabulary.

The second rule, from the same plan: **control flow is never a cable.** Arms
are `type: "arm"` NODES whose children's positions are arm-relative
(`scene.ts:60-72`), so folding one arm never moves a sibling's blocks; and
`break`/`continue`/`pass` are `Badge` marks (`[data-slot="control-mark"]`),
never a wire with an endpoint.

## Storybook is opt-in, not default

`apps/storybook` (`bbox-storybook`, a T0 spike: one story rendered across three
hosts — plain DOM, a React Flow node, a tldraw shape) and
`packages/schema/src/storybook.ts` exist and work, but Zach isn't using them
much right now. Don't add or update stories, touch `.storybook/`, wire a new
component into Storybook, or run `storybook` / `build-storybook` as part of
routine work on this repo — only touch this surface when he explicitly asks
for Storybook work.

## Verifying story play functions — never trust `storyRenders`

`window.__STORYBOOK_PREVIEW__.storyRenders[0].reportedException` is **not a
real property** — it reads `undefined` whether or not the play function
threw, so `phase === "finished" && !reportedException` always looks green.
Two stories silently failed for hours behind that check (2026-09-17). In
`apps/storybook-basics`, run `pnpm test-stories` instead — it runs every
story as a real Vitest/Playwright test via `@storybook/addon-vitest`, with a
real process exit code. See `apps/storybook-basics/vitest.config.ts`.

**But `pnpm test-stories` is not the whole suite — use `pnpm test` as the
gate.** `vitest.config.ts` defines *two* projects, and `test-stories` runs
only `storybook` by deliberate design (its name says stories, and silently
widening what it covers would make the name lie). The second project,
`unit`, is where the pure node tests live — no DOM, no browser — and it is
the larger half by test count: measured 2026-09-18, `storybook` was 56 files
/ 294 tests while `unit` was 22 files / **314 tests**, including a
4,608-case differential sweep. A green `test-stories` therefore proves
nothing about more than half the assertions in the package.

This is not hypothetical. The menu-kit build (2026-09-18) gated four
barriers on `test-stories` alone and reported every wave green; an
independent audit found the 22 ported acceptance suites had never been
executed by any gate. They passed when finally run — but the verification
claim was hollow, and a claim that happens to be true is not a check. Run
`pnpm test` (all projects) for any gate or hand-off; `test-stories` /
`test-unit` are for narrowing while you iterate.

**A play function's first testing-library call should be `findBy*`.**
`getBy*` demands its element on the first tick, so a story that has not
finished mounting fails instantly under load — that is how the combined run
above surfaced its one failure. The sharper reason is the assertion that
comes *after*: `queryBy*(...).not.toBeInTheDocument()` passes trivially
against an empty DOM, so on an unmounted story a negative assertion is not
fragile, it is **vacuously true** — it would pass a component that rendered
nothing at all. Awaiting one real element first is what gives every later
assertion in that play function something to be false about. 115 play
functions here still open synchronously (most predate the menu kit); fix
them as you touch them rather than in one sweep.

## Story titles — the sidebar is the repo's top level, then families

Zach, 2026-09-22, picking proposal B out of three that ran side by side
(`reports/media/storybook-org-2026-09-22.html`): *"top level same as repo and
then familes beneath"*. Before this, every title was a free string each lane
chose locally; 151 reasonable choices added up to 11 sections, four holding
one thing, and six components living in two places.

- **The first segment is the story file's own top-level folder**, in
  ARCHITECTURE.md's words: `Components` · `Scene` · `Editor` · `Hosts` ·
  `Skin` (`src/components/…` → `Components/…`). There is no `Presets`
  section and no `presets/` folder: a preset lives with the component it
  configures (ARCHITECTURE.md, "presets/ … is gone"). A story that
  demonstrates another kit's code moves to that kit's folder; the title does
  not paper over the location.
- **A component's host boards live with the component**, as an aspect:
  `Components/Blocks/BlockPort/In A Host`, `Scene/Model & Diff/Scene/In A
  Host (tldraw)`. Zach, 2026-09-22: *"give thoose components back their
  thing and use tag to filter… stories in /hosts should be things that do
  not fit naturally within the components"*. So `src/hosts/` holds only
  stories about host-side code itself (the pyblocks loader, tldraw detach);
  "every example in React Flow / tldraw" is the `host:` tag filter below,
  not a section. (Measured when this was written: 19 story files reach an
  engine and 10 of them lived in `hosts/` — a section could never have held
  them all.)
- **Families: Components, Scene and Editor have one, with closed lists.**
  Components: `Ports`, `Blocks`, `Traces`, `Text & Marks`, `Stock`. Scene, by
  what an operation does: `Model & Diff`, `Wiring`, `Validation`, `Layout &
  Drag` — kept although its 14 entries would fit flat, Zach: *"I think we will
  be adding more functinality in the future"*. Editor: `Menus & Bars`,
  `Panels & Dialogs`, `On Canvas` (overlays drawn over the board). Every other
  section stays flat, and a flat section over 15 entries fails the test —
  give it a family list instead. Add a family in
  `src/storyOrganisation.test.ts` deliberately, never in a title.
- **Chrome is Editor's; what draws on a component is Components'.** Zach,
  2026-09-22: *"Menus & bars and panels & dialogs... most of these should
  belong in editor... Things that are needed to display information on the
  components, belong with the components"*. The line is mechanical: a file a
  component imports stays in `components/` (FoldingChevron, Badge, Bar,
  Button); editor-only chrome lives in `editor/`. The vendored shadcn
  primitives stay in `components/` under `Stock` even where only the editor
  uses them — they are stock, not editor design.
- **BlockRegion is a Block-family component** with its presets inside it:
  `Components/Blocks/BlockRegion/{Labeled Group, Loop, Branch, …}`. It is a
  composite, a frame plus a real `Block` in its corner, and the Labeled Group
  is BlockRegion given only a `title`. Zach: *"labeled group should be a
  preset of Block Region… Block Region is stanadlone component that composes
  the Block with a 'region'"*. The corner card's square junctions are a
  **Block** prop, `shape="region-corner"`, shown on `Components/Blocks/Block ›
  Shapes`, so a host that mounts the card on its own (the app's child shape)
  gets them by naming the shape, not by spreading a style object.
- **Then the component's code name** (`PortEdge`, not "Port Edge"), then an
  aspect in words where one file is a facet of a component
  (`Components/Ports/PortEdge/Hit Regions`).
- **Order** is `parameters.options.storySort` in `.storybook/preview.tsx`.

`src/storyOrganisation.test.ts` (the `unit` project, so `pnpm test`, not
`test-stories`) fails on a section that is not the file's folder, a family
outside its section's list, a flat section over 15, or a wrong tag below — it reads
titles with Storybook's own CSF parser. It cannot tell whether a component
is in the *right* family; that stays a judgement.

## Story tags — every lane's work is findable by its tag

Zach, 2026-09-17, looking at 47 story files with no way to filter them: *"I
still need better help navigating the storybook... each agent I think that
delivers work should like group it under a tag."* Storybook's sidebar filter
menu builds a checkbox per tag **automatically** — any tag on a story's
`meta.tags` that isn't one of Storybook's own reserved tags (`dev`, `test`,
`autodocs`, `attached-mdx`, `unattached-mdx`, `play-fn`, `test-fn`,
`manifest`) becomes a filterable entry with a live count, no registration
step required. Verified by reading the built sidebar bundle itself
(`storybook/dist/manager/runtime.js`, `src/manager/components/sidebar/
FilterPanel.utils.ts` and `useFilterData.tsx`): `useTagFilterEntries` walks
every indexed story, buckets any non-`BUILT_IN_TAGS` tag into
`userTagsCounts`, and turns each into a checkbox — that is the whole
mechanism, and it is exactly what this section uses.

**The "New / Modified / Related" row in that same filter menu is a
different, unrelated feature — do not try to populate it with tags.** It is
Storybook's git-based Change Detection status (`STATUS_DISPLAY_ORDER`:
`status-value:new` / `modified` / `affected` — "Related" is `affected`'s
display name), gated behind `globalThis.FEATURES.changeDetection` and fed by
a status provider (Chromatic-class integration), not by `tags` at all. It
reads 0/0/0 regardless of what any story is tagged, and there is no local
config that wires it up from this repo alone.

**The tag vocabulary is closed — three prefixes, nothing else:**

- **`object:<name>`** — one per file: what the story is *about*, the axis the
  tree does not show — `port`, `block`, `trace`, `region`, `scene`,
  `text-marks`, `chrome`, `stock`, `skin`. Filter `object:port` and every
  story about ports appears, whichever section holds it. (Replaces `area:`,
  retired 2026-09-22: it restated the title's first segment in 121 of 121
  files, so it added nothing a filter needed.)
- **`host:<engine>`** — `host:dom`, `host:react-flow`, `host:tldraw`: which
  hosts the file's stories render in, *measured* — the test walks the file's
  relative imports (type-only imports erase, so they don't count) and fails
  when the tags disagree, so add or drop them when
  your imports change. Filter `host:tldraw` to see every tldraw example,
  including the ones under Presets and Scene, not just the Hosts section.
- **`lane:<slug>`** — one per file, naming the delivery that produced or most
  recently substantively changed it. **When your lane creates a new story
  file or materially reworks an existing one, set its `lane:` tag to your
  own branch/task slug** (e.g. `lane:component-docs-reorganize`) — this is
  the literal mechanism Zach asked for: `git grep -l 'lane:<slug>'` finds
  everything one delivery touched, and he can say "that tag is obsolete" and
  it's a mechanical `sed`/grep-and-delete across those files, not an
  archaeology project.
  - Every file that predates this convention (2026-09-17) carries
    `lane:baseline` instead of a fabricated historical lane name — the repo's
    real history here is prose commit messages and squashed/rebased
    branches, and guessing a precise per-file lane from those would be
    fabricated precision, not provenance. `lane:baseline` is honest about
    what it is: "existed before lane tags did." Retag a file to its real
    lane only when you actually touch it for a reason.

Put the tags on the line right after `title:` — every existing file follows
this order, so a new one should too:

```ts
const meta = {
  title: "Components/Blocks/Block",
  tags: ["object:block", "lane:baseline"],
  component: Block,
  ...
} satisfies Meta<typeof Block>;
```

**`WhatsNew.stories.tsx` is retired** (was: a git-derived changelog view,
`docs/build_whats_new.mjs` → `pnpm whats-new` → a gitignored JSON the story
read). It answered "what changed recently," a real but different question
from "what did lane X deliver" — but it shipped generating nothing for a
fresh clone (nobody runs `pnpm whats-new` automatically), so every session
including Zach's own saw a permanently-empty group costing sidebar space for
zero information. Faced with that, Zach's own next words were to ask for
tags instead. `docs/build_whats_new.mjs` is left in place (its git-derived
answer is still correct, just not rendered anywhere right now) in case a
future surface wants a "recently changed" view; the story consuming it is
gone.

## bbox studio's Stable / Preview — one data file, `apps/systemsketch/stable-preview.json`

The whiteboard's release channels come from the shared package at
`/home/bam/stable_preview_switcher` (its `skill/SKILL.md` is the recipe; its
`docs/CONTRACT.md` every exact shape). The app holds **data, never code** for them:
no launcher, release script, Stable server, badge or chip lives in this repo any
more — `scripts/launch_systemsketch.py` and `assets/bbox-ui.desktop` were deleted
on 2026-09-29 for it. If a channel seems to need app code, that is a gap in the
runtime: fix it there, never here.

`sps` finds the app by walking up from the working directory to
`stable-preview.json`, which lives in `apps/systemsketch/` — so from the repo or
worktree root it answers "stable-preview.json: none found". Run it from
`apps/systemsketch`, or pass `--root` as below.

| Want | Run |
|---|---|
| where things stand | `sps --root /home/bam/bbox-ui/apps/systemsketch status` |
| Stable (:4341) / Preview (:4340) | `sps --root /home/bam/bbox-ui/apps/systemsketch open` / `… open --preview` |
| make Preview the new Stable | `sps --root /home/bam/bbox-ui/apps/systemsketch promote` — Zach's call, never an agent's |
| undo the last promote | `sps --root /home/bam/bbox-ui/apps/systemsketch rollback` — Zach's call |
| your own lane (agents) | `sps --root <your worktree>/apps/systemsketch dev` — prints a lane URL; `… dev --stop` when done |

JSON has no comments, so the WHY of each choice in `stable-preview.json` is here:

- **`"app": "bbox-ui"`** — the id is the WM class, the `.desktop` id and the icon
  name. Zach's pinned dock favourite is `bbox-ui.desktop`; any other id would
  unpin it and split the window from its icon.
- **No `icon`** — `Icon=bbox-ui` already resolves to the fitted, outlined tile
  `scripts/dock_icon.py` installs from `assets/bbox-ui.svg`. The contract only
  reaches an icon inside the app dir, and `sps install-desktop` would copy the raw
  artwork over the fitted one. After an artwork change run
  `python3 scripts/dock_icon.py` by hand (the old launcher re-synced it on every press).
- **Ports 4341 (Stable) / 4340 (Preview)** — the old launcher's and the app's own
  `dev` script's ports, so muscle memory does not move.
- **`stable.processes` `files` on 4342 + `stable.proxy`** — the old Stable server
  mounted `/api/workspace/*` and `/api/recordings/*` in-process; now Stable runs the
  same `scripts/systemsketch_files.py serve` the Vite plugin (`devFileHost.ts`)
  starts, over the real home as files root, and proxies both prefixes to it
  same-origin. `--files-root-from-env` makes it resolve its roots exactly as
  `devFileHost.ts` does for Preview: `SYSTEMSKETCH_FILES_ROOT` (with
  `SYSTEMSKETCH_LOCK_ROOT`, or the shared lock root) wins when set, so an isolated or
  agent run of Stable never writes into the real home; the runtime hands a Stable
  process the environment of whoever started it (its contract §9.20). An empty value
  counts as unset and a relative one resolves against `apps/systemsketch` on BOTH
  channels — `--app-dir {root}` here, the module's own directory in `devFileHost.ts` —
  never against a cwd: Stable's cwd is its release snapshot, so anything cwd-relative
  split Preview's locks from Stable's. Both routes set `rewriteOrigin` (the package's contract §6): the file
  host refuses any write whose `Origin` is not its own `Host`, and behind the proxy the
  `Host` is the backend's, so without it every save from Stable came back 403. The
  rewrite touches only the Stable page's own `Origin` — a foreign page is still refused,
  the same rule `devFileHost.ts`'s `crossOriginRefusal` applies in Preview. No
  `--lock-root`: the script's default IS `resolveSharedLockRoot`
  (pinned by `src/devFileHost.test.ts`). `--source-root {root}/../..` keeps the
  recorder reading the main checkout's sources, as the old Stable did. Preview needs
  no process — `devFileHostPlugin` spawns its own.
- **`snapshot.include` + the `../storybook-basics/node_modules` link** — the build
  reaches outside the app (`@trunk` = `../storybook-basics/src`, the tsconfig's
  `../../tsconfig.base.json`, the trunk's `@bbox-ui/glyph-content`) and Stable's
  backend is a repo-root script. A snapshot of the app dir alone cannot build or run
  it, so those paths are copied into Stable's snapshot and fingerprinted (a trunk
  change reads "Stable is behind"). The lockfile and root `package.json` are in the
  fingerprint for the same reason the old launcher refused a dirty build over them.
- **`snapshot.exclude`** — seeded review boards, the README and test files cannot
  change what Stable serves, so a commit touching only them keeps "Stable matches".
- **`chip.avoid` = `[data-slot="status-strip"]`** — the bottom-right cluster (grid ·
  frames · problems · dev · help · zoom). The chip floats above it, never on it.

**Migration differences** — what the old launcher (`scripts/launch_systemsketch.py`)
did that is gone now, so nobody hunts for it:

- **`/api/health` on Stable.** The Stable server answers none, so the ☰ site rows
  cannot say "differs from this board" there; the chip carries Stable's commit and
  relation instead. Preview and lanes still answer it (`statusEndpoint.ts`).
- **Auto-start of :4321 and :5421.** Nothing starts the archived SystemSketch or
  Storybook any more. "Switch to old SystemSketch" works while
  `systemsketch.desktop` has :4321 up; "Open Storybook" is probed dead and disabled
  while :5421 is down.
- **The shared Chrome profile with the archived app.** sps windows use their own
  profile (`~/.local/state/stable-preview-switcher/bbox-ui/browser`), so the old
  origin opens without its own storage after the switch row.
- **The recording header.** Recordings made on Stable say channel `dev`, build `dev`
  (the file host's CLI), where the old in-process mount said `stable` and the commit.
- **The dock's site actions.** "Open bbox-ui.com (deployed)" and "Open the site's
  local Preview (HMR)" are gone; the right-click menu is the three sps actions. The
  ☰ "Open bbox-ui.com" row remains.
- **Automatic dock-icon refresh.** Run `python3 scripts/dock_icon.py` by hand after
  an artwork change.
- **The private-Xvfb `--headless` capture/hold workflow.** Use `sps dev` + headless
  Chrome (below).
- **Clean-tree-only promotion.** `sps promote` snapshots uncommitted edits too and
  records them as `dirty`.
- **`<file>` argument routing.** No live caller (the entry had no MimeType); a board
  still opens by URL, `?board=/abs/path.bbox`.
- **Chrome singleton recovery and visible-window confirmation on a dock press.**
  Owed to the shared runtime (Codex audit P1 #5, 2026-09-29), handled there.

## Open the app HEADLESS — never on Zach's display

Zach, 2026-09-23, mid-session, while agents were driving the whiteboard on his
screen: *"why do you keep on opening the application? its distrbuting me while I
work. can You test it headless?"*

So: **every agent-driven launch of the whiteboard is headless.** From your
worktree:

```bash
SPS_NO_WINDOW=1 sps --root <your worktree>/apps/systemsketch dev
```

It starts your own lane (the app's own Vite, this worktree's files) on a port of
its own and prints the URL; the chip there reads `Dev · <branch> · …`. Drive that
URL with headless Chrome or Playwright on a **throwaway profile** — never Zach's
profile, never a visible window. `sps --root <your worktree>/apps/systemsketch dev
--stop` when you are done. Never run
`sps open` yourself: it opens a visible app window in the `bbox-ui` profile, and
never bind :4340/:4341/:4342 — those are Zach's.

**WHY this is a rule and not a courtesy — it is also a correctness bug.** A Chrome
`--user-data-dir` is a machine-wide mutex. An agent whose browser holds the app
window's profile makes Zach's next dock press print *"Opening in existing browser
session"*, hand its command line to the agent's browser and exit 0 — his window
opens on a hidden Xvfb. That is what killed the bbox-ui dock icon on 2026-09-23,
recorded in `journalctl --user` as three presses in twenty seconds that each
printed their URL and opened nothing. **A visible agent launch breaks the very
thing it is verifying.**

Two traps worth knowing before you debug anything Chrome-shaped here, both
measured 2026-09-23:

- **Chrome rewrites its own `/proc/<pid>/cmdline`**, replacing the NUL separators
  with spaces. `split("\0")` returns one giant string and every `--flag in argv`
  test silently answers False.
- **That same rewrite clobbers `/proc/<pid>/environ`**, so a live Chrome reads
  back with no `DISPLAY` at all. Ask the display which windows exist instead.

The same rule exists in `/home/bam/pyblocks` — its icon died of the identical
cause first.

## Seed the review board before handoff

Zach, 2026-09-19: a board that opens blank makes him *"build the changes myself to
see them"*. After a change to a host app's canvas behaviour — or to a trunk
component that renders on one — the handoff carries a **seeded board**, not "open
the app". Use the `bbox-review-board` skill (`skills/bbox-review-board/`, reached
at `.claude/skills/`). It builds `<tldraw app>/review/<feature>.tldr`: the real
objects at the interaction, numbered orange cue cards in tldraw's stock shapes and
a green PASS WHEN card, made through the real app and then cold-reopened through
the app's own Open, failing the build on a broken board.

tldraw only today. **React Flow is still to be decided** — say "no seeded board for
React Flow yet" and flag it; do not improvise a second annotation vocabulary.
A board supplements the real-browser proof of the change and never replaces it.

## Isolated agent lanes — the two lines every one of them needs

Zach reviews a long-running Storybook on **:5421**. A work-in-progress edit
made directly in his worktree breaks the thing he is watching, so
implementation agents get `isolation: "worktree"` and merge back when done.

**`.claude/settings.json` must carry `{"worktree": {"baseRef": "head"}}`.**
Without it worktrees branch from `origin/main` and an isolated agent asked to
extend `apps/storybook-basics` finds no such directory — measured 2026-09-17,
the reflog reading literally `branch: Created from origin/main` on a worktree
cut 30 minutes *after* the lane commit it ignored. With it, re-measured on the
same day: `branch: Created from 16b1243…`, the lane tip, `apps/` containing
`storybook-basics`, 27 components present. The Agent tool has no base-ref
parameter; this setting is the only control.

Note the lane branch itself is not checked out — the worktree gets an
auto-named branch pointing at the same commit. That is fine for working and
merging back; it just means `git rev-parse --abbrev-ref HEAD` will not say
the lane's name.

**`pnpm install` is still required.** A fresh isolated worktree has **zero**
`node_modules` at any level — the setting carries source, not dependencies.
That install is the real per-lane cost; disk is nearly free because pnpm
hardlinks into a shared store.

```bash
pnpm install --filter <target-package>...
```

**Verification does not need a server.** `pnpm test-stories` compiles the
lane's own source through Vitest's Vite pipeline; it does not fetch stories
from `storybookUrl` (the plugin's own default is `:6006`, which never runs
here, and the suite passes with nothing bound to the configured port). So a
lane's tests test the lane's code, and :5421 is never consulted. For a
*visual* check a lane may start its own Storybook — set `STORYBOOK_PORT` to a
free port so it cannot collide with Zach's.

**Merging back** is the dispatcher's job, from the lane worktree, after the
lane's tests pass: `git merge <agent-branch>`. Vite HMR then shows Zach
finished work, and only finished work. Landing on `main` remains a separate
decision that is his, not the dispatcher's.

## The website — apps/docs

`apps/docs` is bbox-ui.com. Fumadocs + Next, statically exported, deployed to a
Cloudflare **Worker** (not Pages) on push to `main`.

Deliberately unoriginal. Its whole job is to make the install command obvious
and show each component working. Not a place to be creative.

### Never push without preflight

```bash
pnpm preflight          # before pushing
pnpm preflight --live   # after deploying
```

It runs the exact sequence Cloudflare runs, in order, failing the same way.
**Cloudflare posts no commit status and no check-run back to GitHub** —
verified, `check-runs.total_count` is 0 — so there is nothing to poll and no log
to read from here. Local reproduction is the only feedback loop that exists.

`--live` asserts on the response **body, never the status code**. An
unconfigured Worker answers `200 Hello world` on *every* path, including paths
that cannot exist. That is exactly how the first deploy looked healthy while
serving the default scaffold.

### Adding a component page

Three edits, no site code. The sidebar, catalog list, search, OG images and
`llms.txt` follow the page tree on their own.

1. `apps/docs/src/registry/new-york-v4/examples/<name>-demo.tsx` — the live
   demo. Import from `@bbox-ui/core`; never copy component source into a demo.
2. `apps/docs/src/registry/registry-examples.ts` — register it.
3. `apps/docs/content/docs/components/<name>.mdx` — copy `port.mdx`, the
   canonical shape: hero preview → install tabs → features → usage → examples →
   props table.

Use `<ComponentSource src="../../packages/bbox-ui/src/<name>.tsx" />` rather
than pasting code; it reads the real file at build time and cannot go stale.

The example path prefix `src/registry/new-york-v4/` is hardcoded in
`apps/docs/src/scripts/build-registry.mts`. Demos must live there despite the
name meaning nothing here.

| Change | File |
|---|---|
| Site name, tagline, nav, links | `apps/docs/src/lib/config.ts` |
| Logo mark | `apps/docs/src/components/icons.tsx` (`Icons.logo`) |
| Landing page | `apps/docs/src/app/(home)/page.tsx` |
| Cache / CORS headers | `apps/docs/public/_headers` |
| Deploy target, assets dir | `wrangler.jsonc` |

### Reference sites — copy these, do not invent

| Site | Take from it |
|---|---|
| [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) · `shadcnblocks/kibo` (MIT) | The component-page shape. `port.mdx` follows it. |
| [ReUI](https://reui.io) · `keenthemes/reui` (MIT) | Landing-page craft, clean branding seams. |
| [React Flow UI](https://reactflow.dev/ui) (closed source) | The canvas rule below. Imitate; it cannot be copied. |
| [shadcn/ui](https://ui.shadcn.com) · `shadcn-ui/ui` (MIT, `apps/v4`) | The registry contract. |
| [Fumadocs](https://fumadocs.dev) (MIT) | The framework. Check its docs before hand-rolling a docs feature. |

Kibo's Preview/Code tabs are **hand-rolled app code**, ~90 lines of Server
Component — not a stock Fumadocs feature. Do not hunt for a built-in.

## Traps that have already cost time here

- **Tailwind v4 only scans the app's own sources.** A utility used *only* by a
  sibling workspace package is never generated — `border-foreground` on an empty
  `Port` rendered invisible. `apps/docs/src/app/global.css` carries an `@source`
  for `packages/bbox-ui/src`. A new source directory needs its own.
- **Canvas components get an iframe, not an inline preview.** `tldraw` and
  `@xyflow/react` ship global CSS that fights the docs page. React Flow UI
  iframes a separate app on its own subdomain; do the same.
- **tldraw cannot go on a public page without a licence key.** Its licence
  forbids production use, enforced mechanically with a watermark and a render
  cutoff. Localhost is carved out forever, and the MIT adapter is fine because
  it only peer-deps. `@xyflow/react` is plain MIT — lead public canvas surfaces
  with React Flow.
- **Do not pin the build to a Node version.** The build image resolved Node 24
  while `.node-version` asked for 22. Node strips TypeScript by default from
  22.18 onward, so the build uses plain `node` with no flag and survives either.

## Handing over a board — a link, never a file chooser

Zach, 2026-09-20, rating a handoff **Bad**: *"you should make it so I can open
this file directly. I was able to do this is system sketch. I think perhaps it
had like a URI or something?"*

A generated review board exists so he does not have to build the thing under
review. Ending with "start the server, then ☰ › File › Open and pick this path"
hands that saving straight back — it is [[show don't tell]]'s "a screenshot is
evidence, not access" one step further along: access to the *app* is not access
to the *artifact*.

**So the board row of an Open-it table is always one fence with the server
command, and the board's own URL in a code span directly beneath it:**

```bash
pnpm --dir <tree> --filter systemsketch exec vite --port <your own port> --strictPort
```

`http://127.0.0.1:<port>/?board=/absolute/path/to/board.tldr`

Three things about that URL, each already measured:

- **The `=` is what must stay literal.** Never wrap the URL in a markdown
  `[text](url)` link: a chat client rewrites `?board=` into `?board%3D…`, which
  mangles the *key*, and the app then cannot find the parameter at all. Hand over
  a bare URL or a code span.
  The `/` inside the **value** is a different matter, and the earlier wording
  here ("never percent-encode the `=` or the `/`") was wrong — measured
  2026-09-20: `URLSearchParams.set` *always* escapes `/` to `%2F`, so the
  donor's own `documentHref` has never emitted the literal-slash form. Both
  parse to the same path; the literal form is merely readable. So build in-app
  navigation with `documentHref`, and render a link for a human with
  `boardLinkFor` — the paste-safe spelling, with a test pinning that the two
  parse identically.
- **The archived app is the reference**, not a thing to reinvent:
  `/home/bam/systemsketch/src/workspace/workspaceModel.ts:157` builds the link,
  `src/workspace/LocalWorkspace.tsx:367` reads it.
- **Check what already exists before building any of it.** On 2026-09-19
  `?board=` had *three* implementations — the donor plus two different in-flight
  meanings on sibling branches — and a trunk `documentHref(path, base)` already
  ported. `git grep` the branches first.

Boards live under the app's own `review/` directory. **Never** under
`/home/bam/SystemSketch` — those are Zach's real boards and the app autosaves
into whatever it has open.

## Several agent sessions edit this tree at once

Peers write here in real time — `packages/inspector` especially. This is the
normal case, not an edge case.

- Never `git add -A`. Stage explicit pathspecs and read
  `git diff --cached --name-only` before every commit.
- `ls --time-style=full-iso` a file before rewriting it. A recent mtime means a
  peer is mid-run; leave it, or make a surgical exact-match edit that fails
  loudly rather than a rewrite.
- Never `pkill -f` a pattern that matches your own command line — it kills the
  shell running it, and your cwd silently resets. This has happened twice.
- **Implementing is not integrating.** Commit to a branch and report. Do not
  merge to `main`, push, or deploy unless Zach asks in those words.
