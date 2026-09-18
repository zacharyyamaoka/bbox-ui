# Provenance — `apps/storybook-basics/src/scene/history.ts`

Cards 21-26 of `reports/media/node-editor-prior-art-visuals-2026-09-18.html`
(the history contract). Written to the same standard as
`docs/ALGORITHM-PROVENANCE.md`: a citation earns its place only if it names a
path and line range that exists on disk **and was opened while writing this
document**. Nothing below is cited from memory.

## Where the donor was actually read

The dispatching brief for this lane named `joint-core` file:line citations by
memory (`Control.mjs:151,168`, `ToolsView.mjs:55`, `CellView.mjs:164`,
`Paper.mjs:3170-3187`, `CellView.mjs:1153`). Per this repo's own
"verify before asserting" rule, none of that was taken on trust — a real
checkout of `@joint/core` was found already present on this machine at
`/tmp/jointjs-observe/node_modules/@joint/core` (**version 4.3.1**, read from
its `package.json`), left over from this repo's own prior JointJS-comparison
work (`docs/build_jointjs_comparison_report.py`). Every line below was
re-read from that checkout today, 2026-09-18. Two of the brief's five
citations were off (by version drift or misremembering) and are corrected
here rather than repeated; the rest matched exactly.

| Brief's citation | Verified against 4.3.1 | Result |
|---|---|---|
| `src/cellTools/Control.mjs:151,168` | same | **exact match** |
| `src/dia/ToolsView.mjs:55` | same | **exact match** |
| `src/dia/CellView.mjs:164` | line 164 is inside `onAttributesChange`'s dirty/flag handling — nothing about a batch or a tool subscription | **wrong; the real subscription line is `CellView.mjs:1153`** (which the brief also separately, correctly, cited) |
| `src/dia/Paper.mjs:3170-3187` | lines 3162-3165 are `dispatchToolsEvent`; nothing at 3170-3187 in 4.3.1 relates | **off by ~8 lines; corrected to `Paper.mjs:3162-3165`** |
| `src/dia/CellView.mjs:1153` | same | **exact match** |

## The contract, with real line ranges

**1. One gesture = one batch.**

```js
// src/cellTools/Control.mjs:145-152 (onPointerDown)
onPointerDown: function(evt) {
    const { relatedView, paper } = this;
    if (this.guard(evt)) return;
    evt.stopPropagation();
    evt.preventDefault();
    paper.undelegateEvents();
    this.delegateDocumentEvents();
    this.focus();
    this.toggleExtras(true);
    relatedView.model.startBatch('control-move', { ui: true, tool: this.cid });
},
```

```js
// src/cellTools/Control.mjs:163-169 (onPointerUp)
onPointerUp: function(_evt) {
    const { relatedView, paper } = this;
    paper.delegateEvents();
    this.undelegateDocumentEvents();
    this.blur();
    this.toggleExtras(false);
    relatedView.model.stopBatch('control-move', { ui: true, tool: this.cid });
},
```

One `pointerdown` opens exactly one named batch (`'control-move'`); every
model mutation the ensuing `onPointerMove` calls makes happens while that
batch is open; the matching `pointerup` closes the same batch. That is the
donor's whole mechanism for "a drag is one undo step," and it is the shape
`openBatch` / `closeBatch` in `history.ts` reproduce as pure data instead of
model-mutating calls.

**2. Every write is stamped with its author.**

```js
// src/dia/Graph.mjs:1523-1536 (startBatch / stopBatch)
startBatch: function(name, data) {
    data = data || {};
    this._batches[name] = (this._batches[name] || 0) + 1;
    return this.trigger('batch:start', util.assign({}, data, { batchName: name }));
},

stopBatch: function(name, data) {
    data = data || {};
    this._batches[name] = (this._batches[name] || 0) - 1;
    return this.trigger('batch:stop', util.assign({}, data, { batchName: name }));
},
```

The `{ ui: true, tool: this.cid }` object `Control.mjs` passes in is not
discarded — `Graph.startBatch`/`stopBatch` merges it straight into the event
payload every listener receives. `tool: this.cid` is the stamp; it survives
from the pointer handler all the way to every subscriber on the graph's own
event bus. `history.ts`'s `record()` reproduces this by construction rather
than by convention: a `HistoryWrite`'s `author` field is set from the
batch's own `author`, so a caller cannot mint a write with a foreign stamp
the way nothing in `Control.mjs` prevents a hand-rolled batch call from
omitting `tool` (the donor's version is a convention two developers have to
remember to follow; this file's version is a type-level guarantee).

**3. The self-skip.**

```js
// src/dia/ToolsView.mjs:49-57 (update)
update: function(opt) {
    opt || (opt = {});
    const tools = this.tools;
    if (!tools) return this;
    const n = tools.length;
    const wasRendered = this.isRendered;
    for (let i = 0; i < n; i++) {
        const tool = tools[i];
        tool.updateVisibility();
        if (!tool.isVisible()) continue;
        if (this.ensureToolRendered(tools, i) && opt.tool !== tool.cid) {
            tool.update();
        }
    }
    ...
```

`opt.tool !== tool.cid` is the entire mechanism: a tool whose own `cid`
matches the batch's `tool` field is the one that just wrote the change, and
it is skipped — every OTHER tool in the same `ToolsView` still updates.
`history.ts`'s `shouldNotify(batch, subscriber)` is the same predicate,
inverted for readability (`subscriber !== batch.author`, `false` for the
batch's own author) and lifted out of the tool-loop context into a
standalone pure function a host can call from anywhere, not only from
inside a `ToolsView`.

**Card 26's mechanism** (documented in `HOST_CONTRACT` as
`one-clear-channel`, not implemented — this file has no DOM, no event bus):

```js
// src/dia/Paper.mjs:3162-3165 (dispatchToolsEvent)
dispatchToolsEvent: function(event, ...args) {
    if (typeof event !== 'string') return;
    this.trigger('tools:event', event, ...args);
},
```

```js
// src/dia/CellView.mjs:1146-1154 (addTools)
addTools: function(toolsView) {
    this.removeTools();
    if (toolsView) {
        this._toolsView = toolsView;
        toolsView.configure({ relatedView: this });
        toolsView.listenTo(this.paper, 'tools:event', this.onToolEvent.bind(this));
    }
    return this;
},
```

One event, `'tools:event'`, dispatched from the paper (`Paper.mjs:3164`) and
subscribed to by every `ToolsView` on every cell (`CellView.mjs:1153`) — a
single channel that reaches every affordance layer on the whole paper at
once, which is exactly the shape `history.ts`'s `one-clear-channel`
obligation describes: "a host exposes one channel that clears every
affordance layer, so a mode change cannot strand a handle."

## Independent re-derivation, before this file existed

`apps/storybook-basics/src/components/codeEditorGuards.ts:5-19`'s
`externalSync` annotation was written in this repo for an unrelated reason
(CodeMirror transaction bookkeeping, not undo/redo) and solves the identical
shape as clause 3 above: a writer's own write must be recognisable as its
own, so a listener does not treat it as fresh external input and fight it.
Quoted from that file's own header:

> "Marks `CodeEditor`'s own imperative doc swaps (the `value`-prop sync) so
> the change listener never echoes them back as typing."

Two unrelated bugs, solved the same way, independently, is the strongest
evidence available inside this repo that the self-skip is a real contract
and not a JointJS-specific convenience.

**A correction to the brief that dispatched this lane:** it named
`apps/storybook-basics/src/components/traceEditor.tsx`'s drag handling as
this repo's own prior art for the self-skip. That file was read in full
(all ~508 lines, 2026-09-18) and contains no such mechanism — its
`latestRef` pattern (around lines 303-306) exists to give a `window`-level
pointer listener, attached once per gesture, a way to read current
`from`/`to`/`bends` state without a stale closure; it stamps no write with
an origin and compares nothing against a subscriber's identity. The actual
second derivation is `codeEditorGuards.ts`, cited above. `history.ts`'s own
file header carries this same correction at the point a future reader would
otherwise go looking for it in the wrong file.

## Where the line is drawn: joint-core is read and cited only

`@joint/core` is licensed MPL-2.0. Consistent with this repo's existing
line on JointJS (`docs/build_jointjs_comparison_report.py` and its report):
**read for the shape of the mechanism, cited by file:line and quoted
snippet, never copied into shipped code.** `history.ts` is an independent
re-expression: different data shape (an immutable `HistoryBatch` value
versus a mutable `Backbone`-style model with `_batches` counters and
`trigger`), different API (`openBatch`/`record`/`closeBatch`/`shouldNotify`
as pure functions versus `startBatch`/`stopBatch`/`ToolsView.update` as
methods on stateful objects), and a narrower scope by design (a contract
only — no batch depth counter, no event bus, no undo stack; the donor's
`_batches[name]` counter and its `trigger`/`listenTo` wiring are exactly the
"host owns the stack" territory this file deliberately does not enter).

## Classification

| Piece | Class | Donor / prior art | Verified how |
|---|---|---|---|
| `openBatch` / `closeBatch` (one gesture = one batch) | (b) ours, known technique | `@joint/core@4.3.1` `src/cellTools/Control.mjs:151,168`, `src/dia/Graph.mjs:1523-1536` | Read today from `/tmp/jointjs-observe/node_modules/@joint/core` |
| `record` (author-stamped write) | (b) ours, known technique | same, plus `Graph.mjs`'s `util.assign({}, data, { batchName: name })` merge | same |
| `shouldNotify` (the self-skip) | (b) ours, known technique, re-derived twice | `ToolsView.mjs:49-57`; independently, `codeEditorGuards.ts:5-19` in this repo | Read today; `codeEditorGuards.ts` re-read in full |
| `closeBatch`'s empty-batch → `null` rule | (c) ours, ad hoc | No donor citation found for this specific rule — `Control.mjs`'s batches always close via `onPointerUp` regardless of whether a move happened, so the donor does not need (and does not have) an empty-batch elision | Searched `Control.mjs`, `Connect.mjs`, `Boundary.mjs`, `HoverConnect.mjs` for an empty-batch guard; none found |
| `HOST_CONTRACT.one-clear-channel` (documentation only, not implemented) | (b) ours, known technique | `Paper.mjs:3162-3165`, `CellView.mjs:1146-1154` (`'tools:event'`) | Read today |
| The undo stack itself | not built | N/A — `HOST_CONTRACT.host-owns-stack` states this is deliberately out of scope | N/A |

## What this file does not claim

- No claim that `history.ts` is compatible with, or a port of, `@joint/core`'s
  API. It reproduces the *shape* of the contract only.
- No claim about JointJS versions other than 4.3.1, the one actually read.
- No code from `@joint/core` appears in `history.ts` or its test — every
  snippet above is quoted here, in this document, for citation purposes
  only.
