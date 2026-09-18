# Provenance — `src/scene/definitionTable.ts`

Card 13 from `reports/media/node-editor-prior-art-visuals-2026-09-18.html`:
"definitions as a flat table." Zach: *"yeah that's fine we can do a flat
table reference. It's a nice little algorithmic thing."*

Held to the same rule as `docs/ALGORITHM-PROVENANCE.md`: a citation earns its
place only if it is a path and line range that exists on disk and was
actually opened, or a URL fetched while writing this, with the relied-on
text quoted. Nothing here is cited from memory. This file is separate from
`docs/ALGORITHM-PROVENANCE.md` on purpose — this lane's write set does not
include that file.

## Classification

**(c) Ours, ad hoc, plus one counter-example.** The flat-table-by-id shape
is Zach's ruling, not lifted from a paper or a shipped implementation we
read as a positive model. The one prior-art citation below is used as a
**counter-example** — what we deliberately did NOT build — not as a donor.
The facet split the table stores is not re-derived either; it is
`linking.ts`'s own documented split, cited by line below.

## What is actually ours: the facet split, cited not reinvented

`apps/storybook-basics/src/scene/linking.ts:132-164` (the `OccurrenceData`
doc comment) and the type declaration immediately below it at
`linking.ts:165-171` name the SYNCED/FREE split verbatim:

> "LINKED — shared by every occurrence of one definition: `name` … `linked`
> … `expanded` … `draftOrdinal` … FREE — occurrence-local, never synced:
> `appearance` … …everything else a host keeps in `data`, plus `position`,
> `parentId`, and the node's edges."

`DefinitionRecord` in `definitionTable.ts` carries exactly the SYNCED list
(`name`, `draftOrdinal`, `linked`, `expanded`) and nothing from the FREE
list. This is a direct transcription of an existing, cited split — not a
new taxonomy.

The representative-occurrence rule (`projectDefinitions` folds a group by
reading its FIRST occurrence in scene order) is likewise not invented: it
is `reconcileDefinitions`'s own convergence sweep, `linking.ts:707-719`,
read verbatim —

```ts
/* The convergence sweep — every occurrence carries its group's facets. */
const seenGroups = new Set<string>();
for (const node of scene.nodes) {
  const representative = current(node.id)!;
  if (!representative.definitionId || seenGroups.has(representative.definitionId)) continue;
  seenGroups.add(representative.definitionId);
  ...
```

— opened 2026-09-18 at the path above. `representative` there is exactly
"the first node encountered, in `scene.nodes` order, for this
`definitionId`" — the same rule `projectDefinitions` uses to pick which
occurrence's facets become the group's `DefinitionRecord`. This is why L1
(`applyDefinitions(scene, projectDefinitions(scene).table)` deep-equals
`reconcileDefinitions(scene)` on a conflict-free scene) holds: both
functions converge on the same representative by construction, not by
coincidence.

The content-signature reuse (`definitionContentSignature`,
`linking.ts:240-242`) to detect a `DefinitionConflict` is calling the
existing function, not reimplementing it — `definitionTable.ts` imports it
directly.

## The counter-example: litegraph's inlined subgraph body

**Repo:** `jagenjo/litegraph.js` (MIT), fetched to a local scratchpad clone
at commit `0555a2f` ("fixed the event actions not executed in nodes without
onExecute"), package version `0.7.14` per its own `package.json`. Opened
2026-09-18 at
`.../scratchpad/litegraph.js/src/nodes/base.js` (path not inside this repo
— a temporary clone made for the prior-art survey this card responds to).

**`base.js:20-33`** — the `Subgraph` node constructor builds its OWN full
inner graph object as an instance property, not a reference into any shared
table:

```js
function Subgraph() {
    var that = this;
    this.size = [140, 80];
    this.properties = { enabled: true };
    this.enabled = true;

    //create inner graph
    this.subgraph = new LiteGraph.LGraph();
    this.subgraph._subgraph_node = this;
    this.subgraph._is_subgraph = true;
```

`this.subgraph = new LiteGraph.LGraph()` (line 29 counting from the file's
top) is where a `Subgraph` *node instance* owns a live, independent graph
object — there is no id-keyed table anywhere a second `Subgraph` node could
point at to share that body.

**`base.js:291-294`** — serialization inlines that whole body into the
node's own saved data:

```js
Subgraph.prototype.serialize = function() {
    var data = LiteGraph.LGraphNode.prototype.serialize.call(this);
    data.subgraph = this.subgraph.serialize();
    return data;
};
```

Every `Subgraph` occurrence's `serialize()` calls `this.subgraph.serialize()`
on its OWN graph and embeds the full result — nodes, links, everything —
under `data.subgraph`. Two `Subgraph` nodes with "the same" inner graph
serialize two full, independent copies.

**`base.js:370-380`** (found while verifying the above, not part of the
task's brief, cited because it reinforces the same finding rather than
contradicting it) — `Subgraph.prototype.clone` explicitly deep-copies that
body on top:

```js
Subgraph.prototype.clone = function() {
    ...
    // need to change node IDs here, so clone it first.
    const subgraph = LiteGraph.cloneObject(data.subgraph)
```

**Why this is the counter-example, precisely:** this is the exact failure
mode `definitionTable.ts`'s header describes as "litegraph's failure mode
one level up" — content stored redundantly per instance, with no shared
record and no way to detect two copies drifting apart short of comparing
their serialized bodies by hand. `DefinitionTable` is the opposite shape:
one record per `definitionId`, instances holding only a reference
(`SceneNode.definitionId`, `scene.ts:85-93`) — never the content.

*Correction to how this counter-example was first framed in the prior-art
report*: that report described litegraph as "inlin[ing] a subgraph's whole
serialized body into the node (`base.js:293`)" and "deep-copy[ing] on
clone (`:29`)" — the deep-copy is real but lives at `base.js:370-380`
(`clone`), not `:29`; `:29` is the constructor building the node's own
graph instance in the first place, which is the more basic version of the
same problem (never shared, not merely re-copied later). Both lines are
real and both support the finding; the line-to-claim pairing in the
original report was swapped.

## What this document does NOT claim

- No paper, RFC, or named algorithm is cited for the table itself — there
  isn't one; "flat table keyed by id" is exactly what it looks like, and
  claiming more would be the "plausible paper nobody opened" failure mode
  `.claude/feedback.md` warns against.
- litegraph is not a donor of any code in `definitionTable.ts` — zero lines
  are ported from it. It is cited only as the shape we are not building.
