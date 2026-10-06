# WORK ORDER — the host-less shell

**Status:** APPROVED by Zach, 2026-09-19 (D1–D5 all *Approve*). Not started.
**Written by:** Claude Sonnet 5 (planner) · **Base:** branch `claude/library-vs-host-rule-2026-09-19` (carries this file, the host rule in `CLAUDE.md`, and the report builders); `main` was at `013728d`. If that branch has since merged, base on `main`.
**Executor:** one session, or a dispatcher running lanes. The phase boundaries in §6 are the sync points.
**You have no memory of the conversation that produced this.** Everything you need is here or in the four things in §0. Where this file states a number, it was measured on 2026-09-19; re-measure only what a gate depends on.

---

## 0. Read first, in this order

1. `/home/bam/bbox-ui/CLAUDE.md` — especially **"The host apps only host"**, **"Several agent sessions edit this tree at once"**, **"Isolated agent lanes"** — and `.claude/feedback.md`. (Both are on the base branch.)
2. The analysis behind this order: `python3 docs/build_host_less_shell_report.py` regenerates `/home/bam/bbox-ui/reports/host-less-shell-2026-09-19.html` from the live tree (measured numbers, the diagram, the five decisions).
3. Zach's diagram, the source of the layering: `/home/bam/SystemSketch/bbox ui package depency.systemsketch`. **Read-only. Parse the JSON; do not open it in any app** — it is his real board. Arrow = "depends on".
4. `ARCHITECTURE.md` ("The trunk", "Hosts", "What each host owns", "The line") and `docs/SYSTEMSKETCH-REBUILD-PLAN.md` §1–§3 (why the tldraw store is the document today).

## 1. Objective

Build a **shell**: every window around the canvas (burger/file menu, tool dock, side panels, status strip, floating selection toolbar) with the whiteboard as a swappable background. A tldraw host and a React Flow host each drop in behind the *same* shell through one contract, `HostPort`.

```
@bbox-ui/components ◄── @bbox-ui/scene ◄── @bbox-ui/editor        trunk kits — engine-free (apps/storybook-basics/src)
                                  ▲
        shell  — a NEW engine-free trunk kit: apps/storybook-basics/src/shell/
                                  ▲                       ▲
              app/bbox-tldraw ──────┘                       └────── app/bbox-reactflow
        (today: apps/systemsketch)                          (new: apps/bbox-reactflow)
                │                                                      │
             tldraw                                simple-reactflow-whiteboard (OWN REPO) → @xyflow/react

   app/bbox-no-host — thin runner: mounts the shell on an in-memory FAKE host. No whiteboard.
```

Arrows point at what is depended on. **Nothing in the shell may import tldraw or `@xyflow/react`.**

## 2. Decisions — frozen

| | Decision (Zach, *Approve*) | What it means for you |
|---|---|---|
| **D1** | The host owns its own native document. The shell only **reads a derived scene** and issues **commands**. | No canonical shell-side copy of the document, no sync engine. The shell reads a `BlockScene` (`apps/storybook-basics/src/scene/scene.ts:118`) and calls `HostPort` commands. A second copy is what caused the archive's drift bugs (`apps/systemsketch/src/chrome/problems.ts` header). |
| **D2** | **Open** `simple-reactflow-whiteboard`; do not grow it. | Library entry, observable + commandable state, registrable tools and node/edge types, history hooks. Then only: undo/redo and duplicate/paste. Parity with tldraw is a *separate, later* decision. |
| **D3** | No-host is an importable shell **plus** a thin app. | See interpretation I1. |
| **D4** | Wait for the lanes editing chrome, then: port + fake host + contract suite first; lift chrome second; React Flow host last. | See §6 and the gate command. |
| **D5** | The whiteboard stays **its own repo**, pinned by commit. | Do not copy it into bbox-ui. See P2/P3 for the pin and the no-push rule. |

### Interpretations the planner made — Zach can overrule any of these (§10)

- **I1 · Where the shell lives.** "Package" here means an **engine-free trunk kit**, `apps/storybook-basics/src/shell/`, reached through the existing `@trunk/*` alias like `components/`, `scene/`, `editor/` — no new `package.json`, no npm (this repo's only distribution channel is the shadcn registry). The thin runner is `apps/bbox-no-host`. This adds a fourth box to the diagram's `@bbox` group. Reversible: a directory move.
- **I2 · The gate is mechanical and wider than first said.** D4 was approved on "two lanes". Measured later: **five** live branches touch `apps/systemsketch/src/chrome/`, `main.tsx` or `App.tsx` (§4.6). The gate is the command in P1, not a list of names.
- **I3 · The no-host app's windows arrive in P1**, not P0. Building them earlier would fork wiring five lanes are still editing. P0 delivers the contract and a runner that mounts the shell skeleton.
- **I4 · The rename `apps/systemsketch` → `apps/bbox-tldraw` is OUT of scope.** Zach said the name is "more accurate"; he did not approve timing. Say "the tldraw app (`apps/systemsketch` today)" and pass the app path as a variable.

## 3. Non-goals and do-not-touch

- **No merge to `main`, no push, no deploy.** Commit to branches and report ("Implementing is not integrating"). `simple-reactflow-whiteboard` is a **public** repo: commit locally, never push without Zach saying so.
- Do not edit any live lane's branch or worktree (§4.6), and nothing outside a phase's **write set**. Never `git add -A`; read `git diff --cached --name-only` before every commit.
- Do not touch `packages/bbox-ui` (frozen v1) or `packages/schema`.
- No free-draw, text, sticky notes, styling panel or alignment guides in the whiteboard.
- No rename (I4). No new stories unless a surface already has one; if you add any, follow the `area:` / `lane:` tag convention in `CLAUDE.md`.
- Do not depend on `?board=`. Two unmerged lanes give it different meanings (§4.6); the shell reaches documents only through `HostPort.serialize/load`.

## 4. Ground truth — measured 2026-09-19

### 4.1 The tldraw app, `apps/systemsketch/src` — 10,876 non-test lines

| dir | lines | files | what it is |
|---|---|---|---|
| `shapes/` | 4,843 | 33 | tldraw `ShapeUtil`s + faces — **stays with the tldraw host** |
| `chrome/` | 2,780 | 14 | the shell's wiring — **11 of 14 import tldraw** |
| `backend/` | 1,337 | 4 | pyblocks consumer (reads edit events, applies scene diffs) |
| `document/` | 962 | 3 | tldraw store ↔ scene bridge (`sceneFromStore.ts`, `applySceneDiff.ts`, `editEvents.ts`) |
| `source/` | 768 | 4 | source view |

### 4.2 Chrome, file by file — a **hypothesis**; P1's first task is to confirm each row against the code *at gate time*

| file | what it is | disposition |
|---|---|---|
| `chromeBar.tsx` | trunk `ChromeBar` + undo/redo pair; board name is a tldraw *document setting* (`:90-91`) | **shell**; name via `HostPort` |
| `dock.tsx` | trunk `toolDock` wired to tldraw tool seams; arrow preset via `setStyleForNextShapes` (`:116`), `sideEffects.registerBeforeCreateHandler` (`:181`), geo variant (`:204`,`:220`) | **shell** wiring over `tools()`; the `next-shape style` machinery **stays in the tldraw adapter** |
| `families.tsx` | rows wrapping tldraw's own stock tools | **host-provided catalogue** (`tools()`) |
| `floatingToolbar.tsx` | placement loop over selection bounds; hides while `isIn("select.translating"/"resizing"/"brushing")` (`:123`) | **shell**; needs `selection().screenBounds` + an `interaction()` read |
| `selectionActions.ts` | what the pill can do to the selection | **shell**, over node commands |
| `fileActions.ts` | file group of the burger; `serializeBoard`/`openBoard`/`newBoard` (the files lane rewrites it: `loadBoardText`, `downloadBoard`, `clearBoard`) | **shell owns menu rows; host owns format** (`serialize`/`load`) |
| `frames.ts` | Frames panel model | **shell**, derived from `scene()` |
| `problems.ts` | Problems model: `store → scene → lintScene → rows`; `reveal` = select + fit camera | **shell**; `reveal` via `select` + `view` |
| `panels.tsx` | right rail: one `PanelShell`, Frames *or* Problems | **shell** |
| `statusStrip.tsx` | panel launchers + zoom readout | **shell**, over `viewport()` |
| `overlay.tsx` | the `InFrontOfTheCanvas` fan-out; reads `editor.getContainer()` (`:158`) | **tldraw slot adapter**; the shell owns its own container |
| `variantSwitch.tsx` | TEMPORARY design-variant pill (`:152` uses a history-ignoring `run`) | moves with the shell, **stays temporary**; needs `transact(…, {undoable:false})` |
| `legacyApp.ts` | burger row "Switch to old SystemSketch" | **host-supplied extra menu row** |
| `preferences.ts` | per-family last-used member, arrow preset (localStorage) | **shell**, behind the `tools` capability |

The trunk already supplies most of the *view*: chrome consumes `@trunk/components/{toolDock, toolPreferences, problemsPanel, chromeBar, statusStrip, framesPanel, floatingToolbar(+placement), panelShell, toolbar, dropdown-menu, toggle-group, button}`, `@trunk/skin/{portVariants, regionVariants}` and `@trunk/scene/{scene, lint}`. What is in the app is wiring.

### 4.3 The editor surface the chrome uses → the `HostPort`

A text search of `chrome/` finds 71 `editor.*` call sites over about 36 distinct methods (a few are mentions in comments), plus tldraw UI hooks: `useValue` ×16, `useEditor` ×15, `useToasts` ×4, `useDialogs` ×4. Grouped:

| capability | methods used today |
|---|---|
| Camera | `zoomToFit`, `zoomToBounds`, `getZoomLevel`, `getViewportScreenBounds`, `getCurrentPageBounds` |
| Selection | `select`, `getSelectedShapeIds`, `getSelectedShapes`, `getSelectionRotatedScreenBounds` |
| Node operations | `getShape`, `getShapePageBounds`, `getCurrentPageShapes`, `getCurrentPageShapeIds`, `updateShape(s)`, `deleteShapes` |
| Document I/O | `loadSnapshot`, `getDocumentSettings`, `updateDocumentSettings` |
| History | `undo`, `redo`, `getCanUndo`, `getCanRedo`, `clearHistory`, `run` |
| Tools | `setCurrentTool`, `getCurrentToolId`, `isIn` |
| Duplicate / clipboard | `duplicateShapes` |
| Next-shape style | `setStyleForNextShapes`, `getStyleForNextShape` — a tldraw idea with no React Flow twin |

**Out of the port** (they are tldraw internals or shell concerns): `store`, `sideEffects`, `css`, `persistenceKey`, `getContainer`; and **toasts and dialogs** (`useToasts`/`useDialogs` are tldraw's own UI — the shell owns them, with the repo's Base UI popups).

### 4.4 React Flow 12.11.6 (checked against its type definitions)

Ships: `fitView`, `setViewport`, `getViewport`, `zoomTo`, `zoomIn`, `zoomOut`, `useOnSelectionChange`, `SelectionMode`, `getNodesBounds`, `deleteElements`, `applyNodeChanges`, `NodeResizer`, `toObject`, `snapGrid`, `MiniMap`, `Controls`, `Panel`. **Has no** undo, redo, clipboard, history or tool concept (0 hits for each in its public types).

### 4.5 `simple-reactflow-whiteboard`

`github.com/zacharyyamaoka/simple-reactflow-whiteboard`, local checkout `/home/bam/simple-reactflow-whiteboard`, HEAD `71fd936`, clean. MIT. **954** lines of `src`, **429** lines and **19** tests in `tests/whiteboard.spec.ts` (Playwright, `pnpm test`). Five tools `V H R L A`: select/box-select, hand, rectangle, line, arrow. Its README lists what it leaves out: no ports, frames, style panel, persistence, collaboration. **It is closed:** `Whiteboard()` takes no props; `Tool` is a fixed union (`'select'|'hand'|'rect'|'line'|'arrow'`); `nodeTypes`/`edgeTypes` are module constants; state is internal (`useNodesState`, `useState`); `package.json` has no `main`/`exports`. Missing entirely: undo/redo/history, clipboard/duplicate, resize, `fitView`, serialisation. A free line end is an invisible 1×1 `anchor` node in the node array, so a derived scene **must filter** `type: 'anchor'`. It was trimmed from a ~14.5k-line predecessor in pyblocks (its own README's figure); Zach's Aug 26 rule is the guardrail — "I now get stage 1 for free with tldraw" — so do not let it grow back.

### 4.6 Live lanes, and where they collide

Live (worktree present, last commit 18:27–19:21 on 09-19), each touching `chrome/`, `main.tsx` or `App.tsx`: `claude/chrome-files-settings-2026-09-19` (19 ahead), `claude/devtools-2026-09-19` (23), `claude/draft-compare-2026-09-19` (21), `claude/review-boards-2026-09-19` (13), `claude/settings-pages-2026-09-19` (21). Known collisions:

- `main.tsx`: review-boards and chrome-files-settings **conflict** (`git merge-tree` confirms), and both give `?board=` a meaning (review: same-origin URL fetched on boot, persistence off; files: absolute path via the file host).
- The files lane **removes `openBoard`** and adds `loadBoardText(editor, text)`; the review-board generator in `claude/review-board-skill-2026-09-19` already tolerates both.
- `pnpm-workspace.yaml` lists apps **explicitly** (no `apps/*` glob) — a new app needs a line there and changes `pnpm-lock.yaml`, which `claude/devtools-2026-09-19` also changes. Regenerate the lockfile at merge time; never hand-merge it.
- `apps/storybook-basics/src/engineFree.test.ts` is touched by **no** lane — safe to edit.

## 5. The contract: `HostPort` — a starting point, not law

P0 finalises this in a short design note. What is fixed is the **constraint list**; the sketch is a starting point.

**Constraints (fixed):**
1. Engine-free. No tldraw or React Flow vocabulary in names: no `shape`, `page`, `instance`, `store`, `editor`. Reuse the trunk's own scene vocabulary (`SceneNode`, parent-relative `position`, `data`) instead of inventing one.
2. **Read** = one `subscribe` + pulled getters (the shell wraps it in `useSyncExternalStore`). **Write** = commands only; the shell never mutates host state.
3. **The scene is derived, one direction** (D1). Free-floating helper records (React Flow anchors) never appear in it.
4. **Capabilities are declared.** A host states which optional capabilities it has; the shell **hides** an affordance a host lacks instead of erroring. This is what lets the React Flow host arrive incrementally.
5. **Document I/O is host-native.** `serialize()`/`load(text)` speak the host's own format (`.tldr` for tldraw). `load` performs its own history reset and camera fit — tldraw's `loadBoardText` and the old `openBoard` (`fileActions.ts:141-185`) are the reference.
6. Coordinates are **container-relative screen pixels** — the shell owns its container; there is no `getContainer`.

```ts
type NodeId = string;                                   // opaque, the host's own id
type HostCapability = "history" | "tools" | "duplicate" | "resize" | "nextStyle";

interface HostPort {
  readonly capabilities: ReadonlySet<HostCapability>;

  // read — reactive
  subscribe(onChange: () => void): () => void;
  scene(): BlockScene;                                  // DERIVED; never stored by the shell
  selection(): { ids: readonly NodeId[]; screenBounds: ScreenRect | null };
  viewport(): { zoom: number; screenBounds: ScreenRect };
  interaction(): "idle" | "moving" | "resizing" | "selecting";   // replaces the four editor.isIn() reads
  tools(): { catalogue: readonly ToolDescriptor[]; active: string };  // host's tools, incl. variants
  history(): { canUndo: boolean; canRedo: boolean };
  documentName(): string;

  // write — commands only
  select(ids: readonly NodeId[]): void;
  setTool(id: string): void;
  view(a: { kind: "fit"; ids?: readonly NodeId[] } | { kind: "zoomTo"; zoom: number }): void;
  nodes(a: { kind: "update"; patches: readonly NodePatch[] } | { kind: "delete" | "duplicate"; ids: readonly NodeId[] }): void;
  undo(): void; redo(): void;
  transact<T>(label: string, fn: () => T, opts?: { undoable?: boolean }): T;   // one gesture = one undo step
  setDocumentName(name: string): void;

  // document — the host's own format
  serialize(): Promise<string>;
  load(text: string): { ok: true } | { ok: false; reason: string };
}
```

The `transact` option exists because `variantSwitch.tsx:152` needs a history-ignoring write; `interaction()` because `floatingToolbar.tsx:123` hides during move/resize/brush. **If P0 finds a call site that needs a tldraw-only verb, that verb stays in the tldraw adapter — it does not enter the port.** If the port needs more than ~12 methods beyond the eight capability groups, stop (P0's stop rule).

## 6. Phases

```
P0 contract  ─┐
              ├──►  P1 lift chrome  ──►  P3 React Flow host
P2 whiteboard ┘        (GATED)            (needs P0 + P1 + P2)
```
P0 and P2 are independent — different files, different repos — and can start together.

**Acceptance-first, for every phase.** Before a builder touches production code, the executor commits that phase's acceptance tests **red**, in their own commit. Builders may not edit them; "cannot pass → report FAIL with the reason" is a valid result. Any test file in a fix diff goes to an **auditor on a different model than the builder** (read-only). No completion claim is relayed without `git diff --stat` matching the files it names — a zero-diff "done" is fabricated; redispatch fresh. Spatial claims are **measured** (`getBoundingClientRect`, `pageToScreen`), never inferred from DOM presence. UI work is proven in a **real browser** against the running app; a mock is not proof.

### P0 — the contract barrier · *start now*

**Write set (all additive):** `apps/storybook-basics/src/shell/**` (new) · `apps/bbox-no-host/**` (new thin app; copy the scaffold of `apps/systemsketch`: `vite.config.ts` with the `@trunk` alias, `tsconfig.json` paths, `app.css`) · one array element in `apps/storybook-basics/src/engineFree.test.ts` (`ENGINE_FREE_DIRS` gains `"shell"`) · one line in `pnpm-workspace.yaml` · `pnpm-lock.yaml` (regenerate).

**Do:**
1. Finalise §5 in `apps/storybook-basics/src/shell/HOST-PORT.md` (≤ 2 pages): resolve the call sites §4.2 flags, and state which capability flags exist.
2. `shell/hostPort.ts` — the types.
3. `shell/hostContract.ts` — an exported `describeHostContract(makeHost)` suite: at least one case per capability group, plus "a host lacking a capability does not get the affordance" cases. It must be runnable from a Node unit project **and** from a real-browser project.
4. `shell/fakeHost.ts` — an in-memory host that passes it (holds a tiny scene, selection, viewport, a real undo stack).
5. `shell/BboxShell.tsx` — the skeleton: `<BboxShell port={HostPort | null} background={ReactNode}>`. `null` port = "no canvas yet" state. **No windows yet (I3).**
6. `apps/bbox-no-host` mounts `<BboxShell port={fakeHost}>` on an empty background.

**Acceptance (committed red first):**
- **A0.1** `describeHostContract(fakeHost)` green; and **red against three deliberately broken fakes** — undo that does not restore, a selection that does not notify subscribers, a scene stored instead of derived. Report the three red outputs. A contract that cannot fail is not a contract.
- **A0.2** `engineFree.test.ts` scans a real `shell/` directory (assert it exists — a wrong path passes vacuously) and goes **red** when a scratch `import … from "tldraw"` is added to a shell file. Report it.
- **A0.3** `pnpm --filter bbox-storybook-basics test` (**both** vitest projects — `test-stories` alone runs only half) is no worse than the baseline you record at the start.
- **A0.4** `apps/bbox-no-host` typechecks and, in real headless Chromium, mounts with **no console errors** and the shell container present.
- **A0.5** `git diff --name-only <base>...HEAD` equals the write set exactly.

**Stop rule:** the port needs a tldraw-only verb in its public surface, or grows past the eight capability groups by more than ~12 methods → stop and report which call sites forced it.

### P2 — open the whiteboard · *independent; start now, in its own repo*

Work in `/home/bam/simple-reactflow-whiteboard` on a **new branch**. **Do not push.**

**Do (D2):**
1. A library entry: `src/index.ts` exporting `Whiteboard` and its types; `package.json` `exports`/`types`. The existing `pnpm dev` app must keep working from the same source.
2. Props and a handle: `Whiteboard` accepts `tools` (a registry), `nodeTypes`/`edgeTypes` to merge with its own, and `onChange({ nodes, edges, selection, tool })`; an imperative `WhiteboardHandle` (`getScene`, `select`, `setTool`, `fitView`, `undo`, `redo`, `duplicate`, `serialize`/`load` via `toObject`).
3. `Tool` becomes an open string id; the five built-ins register through the same registry a host uses.
4. **Then** build what neither the repo nor React Flow has: undo/redo (one drag = one step; drawing = one step), duplicate + copy/paste. Resize is stock (`NodeResizer`).
5. Keep it **independent of bbox**: no `bbox`/`@trunk` imports; it is a good boundary and the diagram draws it as one.

**Acceptance (committed red first):** **A2.1** the 19 existing tests pass **unchanged**. **A2.2** new tests: a custom tool registered by a *consumer* draws a custom node type; `onChange` fires with selection/tool/nodes; undo→redo round-trips a drawn rectangle and a moved one as single steps; duplicate produces a copy at an offset; `git grep -n -i bbox -- src` is empty. **A2.3** a scratch consumer project resolves the package entry and renders `<Whiteboard>`.

**Stop rule:** `src/` exceeds **2,000 lines** (954 now) → stop and report what grew. Free-draw, text, sticky notes, styling, alignment guides are out unless Zach adds them.

### P1 — lift chrome behind the port · **GATED**

**Gate — run this; P1 may start only when it prints nothing, or Zach has named the remaining branches as dead:**

```bash
for b in $(git for-each-ref refs/heads --format='%(refname:short)'); do [ "$b" = main ] && continue; [ "$b" = gh-pages ] && continue; git diff --quiet main...$b -- apps/systemsketch/src/chrome apps/systemsketch/src/main.tsx apps/systemsketch/src/App.tsx || echo "$b"; done
```

Also requires P0 landed on your base. **Re-read §4.2 against the code at gate time** — five lanes are changing those files and the table will be stale.

**Write set:** `apps/storybook-basics/src/shell/**`; `apps/systemsketch/src/chrome/**`, `main.tsx`, `App.tsx`; new `apps/systemsketch/src/host/tldrawHostPort.ts` (the adapter: `HostPort` over tldraw's `Editor`, incl. `sceneFromRecords`); `apps/bbox-no-host/**`. Test files: **import-path fixes only**, each declared in the commit message.

**Do:** for each `chrome/` row marked *shell*, move the wiring into `shell/` (`git mv` where the code is already engine-free; otherwise re-express it over `HostPort`), leaving a provenance header naming the source file and commit. What stays tldraw-side is a **slot adapter** (`components.Toolbar`, `InFrontOfTheCanvas`) that mounts the shell's pieces and supplies the port. The shell owns toasts and dialogs. `tldrawHostPort.ts` implements the port and **passes `describeHostContract` in a real-browser project**. `apps/bbox-no-host` now shows every window against the fake host.

**Acceptance (committed red first):**
- **A1.1** *Baseline:* record `pnpm --filter systemsketch test` per-suite pass counts on your base **before** any edit; after, every suite is equal or higher, no `.skip`, no test weakened.
- **A1.2** The contract suite is green against `tldrawHostPort` (real Chromium).
- **A1.3** `stockBoundary.test.ts` and `engineFree.test.ts` (with `shell`) green. `git grep -n -E "from ['\"](tldraw|@tldraw|@xyflow)" apps/storybook-basics/src/shell` is empty.
- **A1.4** A **real-browser journey** on the tldraw app, screenshots inspected: open the burger → File menu; switch tools in the dock; press **A** repeatedly (arrow presets cycle); undo/redo; select a Block and **measure** that the floating toolbar tracks the selection bounds (`getBoundingClientRect` vs `selection().screenBounds`, ≤ 2 px) and hides during a drag; toggle Frames and Problems panels; zoom readout; open/save a board. **Pointer pass-through:** press-drag a Block from a point covered by the shell's container but by no window — it must move. Behaviour must match what the app did before; a difference is a finding, not a fix.
- **A1.5** `apps/bbox-no-host` shows the same windows on the fake host with an empty canvas (screenshot inspected, capability-less affordances hidden).

**Stop rule:** any *behaviour change* is required, or the port needs more than two verbs beyond §5 → stop and report; do not bend a contract to make a test pass.

### P3 — the React Flow host · **needs P0 + P1 + P2**

**Write set:** `apps/bbox-reactflow/**` (new), `pnpm-workspace.yaml`, `pnpm-lock.yaml`. Reuse the trunk's shared scene→view renderer `apps/storybook-basics/src/hosts/nodeViews.tsx` (682 lines; "a third host imports this file and owns nothing but its viewport"). Do not edit `hosts/reactFlowHost.tsx`, the bench.

**Do:** a `HostPort` over the opened whiteboard; register the bbox node types and tools through the registry (Block, Code, Port, Loop, Branch as the app needs them); declare capabilities honestly — `nextStyle` is absent, so the shell hides it. **Filter `type: 'anchor'` out of `scene()`.** Consume the whiteboard per **D5**: a pinned git dependency once Zach has pushed it; until then a dev-only `file:` reference with the intended SHA written in the app's README, and say so in the handoff.

**Acceptance (committed red first):** **A3.1** `describeHostContract` green against the React Flow port. **A3.2** the A1.4 journey, restricted to the capabilities declared, green; screenshots inspected. **A3.3** a loose arrow draws two anchor nodes and `scene().nodes` contains **neither**. **A3.4** the chrome shows no affordance for an undeclared capability. **A3.5** `pnpm install --frozen-lockfile` works on a clean clone (or the `file:` fallback is documented).

**Stop rule:** host glue exceeds **~1,500 lines** excluding tests → stop and report which capability is expensive.

## 7. Working rules that matter here

- WHY comments where a choice preserves a stated preference or rules out an obvious alternative (this order's decisions are the source; cite them, not this file).
- **Algorithm provenance** (`.claude/feedback.md`, 2026-09-17): a file that ports real logic cites the file and lines it came from — a path that exists on disk, never from memory.
- **Decision record at merge**, not before: the D1–D5 architecture decision and the rejected alternatives (shell-owned canonical document; app-inside-app; copying the whiteboard in), in this repo's existing `docs/` convention, linked from a `WHY:` comment at the port.
- Update `ARCHITECTURE.md` with the shell layer and the diagram when P1 lands.

## 8. Handoff

At each phase boundary, and at the end, follow Zach's handoff rule: **a rich-media report** in `/home/bam/bbox-ui/reports/` (built by a `docs/build_*.py`; `reports/media/` if it inlines captures), rendered headlessly and **looked at**, with real screenshots, and — for P1 and P3, which have an interaction — a short muted looping hero clip recorded from the real app. Verify the `file://` with `gio info`, and list the report in the clone's `.git/info/exclude` (or commit it) so a peer's `git stash -u` cannot take it. Hand it over as an **Open it** table whose report row is the one-line fence `/home/bam/.local/bin/open <absolute path>`. Then the decision packet: **done and proved** (with the evidence) · **left** · **needs Zach** (each with your recommendation and the reversible default) · **deliberately not done**.

## 9. Traps already measured — do not rediscover

- **Tailwind v4 only scans the app's own sources.** `apps/bbox-no-host` must copy `apps/systemsketch/src/app.css` including its two `@source` lines, or utilities used only by trunk components render invisible.
- `pnpm test-stories` runs **one** of the trunk's two vitest projects; the gate is `pnpm test`. A play function's first call should be `findBy*`; a `queryBy…not.toBeInTheDocument()` on an unmounted story is vacuously true.
- **Stock arrows cannot bind to our shapes** (`canBind` accepts only the wire binding, and `createBindings` drops a refused binding silently). Do not "fix" it.
- A fresh worktree has **no `node_modules`**: `pnpm install --filter <pkg>...` (pnpm hardlinks; it is cheap). `.claude/settings.json` carries `worktree.baseRef: head` — without it a lane branches from `origin/main` and cannot see your base.
- Never `pkill -f` a pattern that matches your own command line. Do not stop a server you did not start; the app's dev port is 4340 with `--strictPort`, and Zach usually has it running — use your own port.
- The tldraw store **is** the document today (`sceneFromRecords` derives the scene, `applySceneDiff` applies one back). The adapter keeps that; the shell never sees a record.

## 10. Needs Zach — each with a default, so ignoring it is free

| | Question | Recommendation / default |
|---|---|---|
| **N1** | **Rename** `apps/systemsketch` → `apps/bbox-tldraw`? | Out of scope here (I4). If yes: one barrier commit, *after* P1's gate opens, with the path passed as a variable in the meantime. **Default: no rename.** |
| **N2** | Confirm I1: the shell is a trunk kit `shell/` + the thin app `apps/bbox-no-host`, not a `packages/` dir. | **Default: as stated.** A directory move if you disagree. |
| **N3** | Merge `claude/library-vs-host-rule-2026-09-19` to `main` first? It is docs + report builders only, and `git merge-tree` against `main` at `013728d` shows no conflicts. | Yes — it puts this order and the host rule where every lane's worktree sees them. **Default: the executor bases on that branch; you merge when you like.** |
| **N4** | Push `simple-reactflow-whiteboard` (public) once P2 lands? Needed before P3 can pin by SHA. | **Default: the executor commits locally and does not push;** P3 uses a dev `file:` reference until you do. |
| **N5** | Any of the five gating lanes you want declared dead, so P1 need not wait for them? | **Default: P1 waits until the gate command prints nothing.** |
