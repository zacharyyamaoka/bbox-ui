# `HostPort` — the contract the shell talks to a canvas through

Finalises §5 of `docs/WORK-ORDER-HOST-LESS-SHELL.md`. The order's sketch was
"a starting point, not law"; this note records what survived contact with the
code, what changed, and why. Every claim below was measured on
2026-09-19 against `apps/systemsketch/src/chrome/` at `21268c2`.

Ported (not merged) onto `claude/finish-2026-09-29` on 2026-09-29. Since
`21268c2` the trunk moved `floatingToolbar.placement.ts` from `components/`
to `editor/` (the import follows it) and the studio foldered `chrome/` by
surface (`TitleBar/chromeBar.tsx`, `Toolbar/dock.tsx`,
`FileMenu/fileActions.ts`, `DevMenu/variantSwitch.tsx`,
`ContextualPopupMenu/selectionActions.ts`, …). The `chrome/<file>:<line>`
citations below are left as measured then; P1 re-measures them against the
tree it lifts.

## What the shell is, and where it lives

`apps/storybook-basics/src/shell/` — a fourth engine-free trunk kit beside
`components/`, `scene/` and `editor/`, reached through the existing
`@trunk/*` alias. `apps/bbox-no-host` is the thin runner that mounts it on an
in-memory fake host.

**Zach's diagram does not draw a `shell` box.** Parsed read-only from
`bbox ui package depency.systemsketch` (11 `geo`, 9 `arrow`, 16 bindings), it
draws:

```
app/bbox-tldraw ──► app/bbox-no-host ──► @bbox-ui/editor ──► @bbox-ui/scene
        └──► @tldraw                                    └──► @bbox-ui/componets
app/bbox-reactflow ──► app/bbox-no-host
        └──► simple-reactflow-whiteboard ──► @reactflow
```

So the box both engine apps depend on is named `app/bbox-no-host`, and it sits
in the `app/` family, outside the `@bbox` group rectangle. D3 ("no-host is an
importable shell **plus** a thin app") splits that one box in two; this note
records the mapping so the drawing and the tree can be read against each other:

| Diagram box | In the tree |
|---|---|
| `app/bbox-no-host`, as a thing others depend on | `apps/storybook-basics/src/shell/` (`@trunk/shell/*`) |
| `app/bbox-no-host`, as a thing you can run | `apps/bbox-no-host` |
| `app/bbox-tldraw` | `apps/systemsketch` today (I4: no rename) |

WHY the shell is a trunk kit and not its own app or `packages/` dir (I1,
kept — three measured reasons, not taste):

1. The repo has exactly one source alias, `@trunk/*`. A shell outside that
   tree needs a second alias configured in three apps' `vite.config.ts` **and**
   `tsconfig.json`.
2. `engineFree.test.ts` walks `apps/storybook-basics/src/<dir>` and nothing
   else. A shell outside the trunk is not covered by the engine wall at all —
   and the engine wall is the only mechanical guarantee that "the shell
   imports no engine" is true rather than intended.
3. CLAUDE.md's first measured trap is Tailwind v4 scanning only the app's own
   sources. One more `@source` line, in three apps, is three chances to ship
   invisible utilities.

**One consequence to record rather than discover:** `ARCHITECTURE.md` states
the kit DAG as "`edit` imports both other kits; **nothing imports edit**".
Zach's own arrow — `app/bbox-no-host ──► @bbox-ui/editor` — makes the shell
the first importer of `edit`. That sentence needs amending when the shell
lands, not quietly falsifying.

## The constraints (fixed by the order), plus one

1. Engine-free. No `shape`, `page`, `instance`, `store`, `editor` in any name.
2. Read = one `subscribe` + pulled getters. Write = commands only.
3. The scene is derived, one direction. Helper records never appear in it.
4. Capabilities are declared; the shell **hides** what a host lacks.
5. Document I/O is host-native (`serialize`/`load` speak the host's format).
6. Coordinates are container-relative screen pixels; there is no container getter.
7. **NEW — every read getter is referentially stable between notifications.**

WHY 7 exists, and why it is a contract clause rather than a note: the shell
reads through `useSyncExternalStore`, whose `getSnapshot` must return the same
reference when nothing changed, or React throws *"The result of getSnapshot
should be cached to avoid an infinite loop"* and the app spins. `scene()`
returns a `BlockScene` whose `nodes`/`edges` are fresh arrays every time it is
derived, so the obvious implementation of constraint 3 breaks constraint 2's
consumer. A host must memoise its own derivation and invalidate on notify.

This does **not** contradict D1. D1 forbids the *shell* from holding a second
copy of the document; a host caching its own derived projection is the host
caching its own work, and it is what makes the derivation observable at all.

Rejected alternative: a `version(): number` counter the shell keys off. It
works, but it adds a method, and the port is already at the order's stop-rule
line (below) — the stability rule costs zero methods and is directly testable.

## Capabilities — four, not five

The order proposed `"history" | "tools" | "duplicate" | "resize" | "nextStyle"`.
Shipping four, because **a capability that gates no affordance cannot satisfy
its own acceptance case** (A0.1: "a host lacking a capability does not get the
affordance"). That is the same vacuous-assertion failure CLAUDE.md already
names for story play functions, in a different costume.

| Capability | The affordance it gates | Evidence |
|---|---|---|
| `history` | the undo/redo pair in `ChromeBar` | `chrome/chromeBar.tsx:99-100,219,229` |
| `tools` | the tool dock and its per-family preferences | `chrome/dock.tsx`, `chrome/preferences.ts` |
| `duplicate` | the Duplicate row of the floating selection pill | `chrome/selectionActions.ts:78-86` |
| `documentIo` | File ▸ Open / Save / New in the burger | `chrome/fileActions.ts:68,164,203` |

**`nextStyle` is dropped, on evidence.** §4.2 already rules that the
next-shape-style machinery *stays in the tldraw adapter* — so the shell can
never call it, and a flag the shell cannot act on gates nothing. Reading
`dock.tsx:190-215` shows the real mechanism is already there: `selectTool`
takes ids that are **not tool ids** (`arrowPresetFromToolId`, `GEO_VARIANT_IDS`)
and translates them into `setStyleForNextShapes` + `setCurrentTool` before
tldraw ever sees them. That translation is the adapter's job after the lift.
So a variant is just a tool id in the catalogue, `tools().active` reports the
*variant*, and `setTool("geo:ellipse")` is the whole surface. One concept, not
two.

**`resize` is dropped** for the same reason: nothing in the 2,803 lines of
`chrome/` resizes anything. Resizing is a host gesture (tldraw's handles,
React Flow's `NodeResizer`), and by this repo's own line — interaction
geometry is host-owned and never travels — it never becomes a shell affordance.

Both are one array element away if an affordance ever needs them.

## The port

```ts
type NodeId = string;
type HostCapability = "history" | "tools" | "duplicate" | "documentIo";
```

`Rect` and `Size` are **imported from `@trunk/editor/floatingToolbar.placement`**,
not redeclared. The order's sketch invented `ScreenRect`, which violates its
own constraint 1 ("reuse the trunk's own scene vocabulary instead of inventing
one"): `placeFloatingToolbar(...)` — the single real consumer of these
rectangles — already takes `Rect` and `Size` from that module
(`floatingToolbar.placement.ts:105,112,342`). A new type would be converted at
exactly one call site, into the type it started as.

See `hostPort.ts` for the full interface. The eight capability groups of §4.3
survive unchanged; the members are:

| group | members |
|---|---|
| lifecycle | `capabilities`, `subscribe` |
| scene | `scene()` |
| selection | `selection()`, `select()` |
| camera | `viewport()`, `view()` |
| interaction | `interaction()` |
| tools | `tools()`, `setTool()` |
| nodes | `nodes()` |
| history | `history()`, `undo()`, `redo()`, `transact()` |
| document | `documentName()`, `setDocumentName()`, `serialize()`, `load()` |

19 members over 9 groups. The order's stop rule is "more than ~12 methods
beyond the eight capability groups" — 19 − 9 = 10, inside it, and that is why
`version()` was rejected above rather than argued about.

## Two shapes the order got right, kept after checking

- **`load` is synchronous, `serialize` is not.** It reads as an oversight. It
  is not: the reference implementation `fileActions.ts:164-190` calls
  `parseTldrawJsonFile` (sync) to load, while `serializeBoard` (`:68`) returns
  a promise because `serializeTldrawJsonBlob` is async. The asymmetry is the
  engine's, and mirroring it keeps the adapter a pass-through.
- **`transact(label, fn, { undoable })`.** `variantSwitch.tsx:152` is the call
  site that forces it, and it passes `{ history: "ignore", ignoreShapeLock: true }`.
  `undoable: false` covers the first; `ignoreShapeLock` is tldraw-only and
  stays in the adapter, which is the stop rule working as intended rather than
  a verb to add.

## Out of the port, and how many sites that is

Measured with comments stripped: **58 `editor.*` call sites over 34 distinct
methods** in `chrome/` (the order's 71/36 counted comment mentions too, which
its own text allowed for). Four of the 58 are out of the port by rule:

| site | why it stays host-side |
|---|---|
| `variantSwitch.tsx:144` `editor.store.allRecords()` | store access; becomes `scene()` |
| `dock.tsx:181` `editor.sideEffects.registerBeforeCreateHandler` | adapter-only, with the arrow preset |
| `fileActions.ts:167` `editor.store.schema` | inside `load()`, which is host-native by constraint 5 |
| `overlay.tsx:158` `editor.getContainer()` | constraint 6 — the shell owns its container |

Toasts and dialogs (`useToasts` ×4, `useDialogs` ×4) are tldraw's own UI and
become the shell's, on this repo's Base UI popups.

## How the contract is tested

`hostContract.ts` exports a **pure** `runHostContract(makeHost)` returning a
list of `{ name, ok, detail }` checks, and `describeHostContract()` sugar that
maps each to an `it()`. Pure-first for one reason: A0.1 requires proving the
suite goes **red** against deliberately broken hosts, and a failing `describe`
cannot be nested inside a passing test. As a value, "this host violates the
contract" is an assertion like any other — and the same function runs
unchanged in the Node project and in the browser project (requirement 3).

`affordancesFor(port)` is a pure function from capabilities to the set of
enabled affordance ids. It exists so A0.1's "a host lacking a capability does
not get the affordance" is assertable in **P0**, where I3 says the shell has no
windows yet. P1's windows consume the same function, so A1.5 renders exactly
what P0 proved.

### What an independent audit changed, after the first version passed

A read-only audit on a different model was asked one question: *can a host pass
every check while being genuinely wrong?* It could. The suite is 30 checks now,
not 28, and four of its findings are fixed here:

| Finding | What it meant | What changed |
|---|---|---|
| A host that leaks a constant phantom record passed all 28 | Every scene check compared a **delta** (one more node, one fewer), so a permanent extra was invisible. `fakeHost.ts` even carried a comment claiming its helper record made this checkable — it did not. | Two new checks: deleting every reported node must empty the scene, and every reported node must actually be selectable. A phantom fails one or both. A **fourth** broken fake, `scene-leaks-helper`, proves it. |
| The `CASCADE` allow-list permitted 12 cascades, 6 of which never fired | Over-permission is harmless only while nothing else is broken. A future regression that happened to trip a permitted name would be waved through as collateral of a different bug. | Each break now asserts an **exact** failure set, measured, not an allow-list. |
| `one transact is ONE undo step` was vacuous on a host with < 2 nodes | It indexed `ids[1]` with no guard; the second write silently no-opped and the check degraded to "one write undoes in one step" — true of almost anything. | One shared `idsAtLeast(port, n)` precondition, used by every check that indexes ids. |
| Three failure messages said "node vanished" when no node had ever existed | A misleading message costs more than no message. | The precondition above says what is actually wrong, and where to fix it. |

Two more the audit raised, handled rather than fixed:

- **`skipped` lets a sparsely-capable host pass by not running things.** A host
  declaring nothing skips 11 of 30 and reports zero violations. Failing it
  would be wrong — declaring less is honest, and it is exactly how the React
  Flow host arrives one capability at a time (D2). Hiding it would not be, so
  the count is in `ContractResult.skipped` and in the report line.
- **`useHostValue` reintroduced the same hazard on the shell side.** Constraint
  7 binds the *host's* getters; it says nothing about a caller's selector.
  `useHostValue(p => ({ tool: p.tools().active, canUndo: p.history().canUndo }), …)`
  — the obvious thing a window will want — allocates per call and throws the
  very error constraint 7 exists to prevent, as does an inline object
  `fallback` while no host is attached, which is the *common* state in the
  no-host app. Fixed in `BboxShell.tsx` with a version-keyed cache and refs for
  `select`/`fallback`, before either had a call site.

### One precondition the suite has, stated so P1 does not trip over it

**`makeHost()` must return a host whose scene already holds at least two
nodes.** The suite writes to nodes, deletes one, duplicates one and undoes all
of it; against an empty board every one of those checks would pass by having
nothing to be wrong about — which is the vacuous-assertion failure this whole
file exists to avoid. Two checks say so in their own failure text rather than
crashing on `nodes[0]`:

> host must start with at least one node for the contract to be meaningful
> host needs at least two nodes for delete to be meaningful

So `tldrawHostPort`'s suite in P1 seeds a scratch board first — never Zach's,
per the repo rule — and the React Flow suite in P3 does the same. The factory
is called fresh per check, so seeding is cheap and one check's writes can never
leak into the next.

## P1 — the windows, lifted (B-SHELL-P1, 2026-10-06)

The chrome's windows now live here, each over the port and nothing else:
`shellChromeBar.tsx`, `shellToolDock.tsx`, `shellStatusStrip.tsx`,
`shellPanelRail.tsx` (+ `useShellPanel`), `shellSelectionPill.tsx`, and
`documentFiles.ts` (File ▸ Open…/Save for a host with no file session). The
tldraw host is `apps/systemsketch/src/chrome/tldrawHostPort.ts`; the fake host
mounts the same windows in `apps/bbox-no-host/src/windows.tsx`. Three
decisions the lift had to make, each reversible:

- **`BboxShell`'s root does not hit-test**, and `background={null}` paints no
  canvas layer at all: on tldraw the shell sits in `InFrontOfTheCanvas`, over
  a canvas the engine paints, so a press anywhere no window is must reach it
  (A1.4, `shellLift.smoke.test.tsx` "pass-through").
- **`HostPortScope`** provides the port without the container, for a window a
  host must seat in its own engine slot — the studio's dock stays in tldraw's
  `Toolbar` slot, where its box is measured.
- **The dock is handed `tools().active` as its tool id.** The port already
  resolved tool + variant into one id, so a host's `FamilyDeclaration.isMember`
  / `variantOf` answer for variant ids (`ellipse`, `arrow-curve`) directly.
  `ToolDescriptor.family` stays what it says: the dock face an id sits under.
