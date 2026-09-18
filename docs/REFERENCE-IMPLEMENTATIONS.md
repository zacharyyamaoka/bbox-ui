# Reference implementations — copyable functional donors for the validation stack

Compiled 2026-09-18 from three oracle sessions that **ran the libraries** (real npm installs in /tmp scratch projects, real Chromium via CDP for JointJS, jsdom for maxGraph, plain Node for the rest) rather than recalling them. Verdicts: **COPY** (port with citation), **BEHAVIOUR-DERIVE** (observe, reimplement fresh), **AVOID/SKIP**. Every citation names a file actually fetched or installed; nothing here is from memory. Licences read under this survey: Apache-2.0, MIT, ISC, BSD-3-Clause, EPL-2.0, MPL-2.0 (behaviour + dist option-names only, source never copied), tldraw custom (shape only). LGPL (libavoid + TS port) deliberately never opened — precedent `apps/storybook-basics/src/components/elbow/nudge.ts:60-68`.

> Split out of the "Validation stack — FINAL spec (rulings 1–9, post-oracle)" task text at write time by the story lane (worktree `wf_166de375-080-8`, 2026-09-18) — the task's own `${args.refsDoc}` placeholder arrived unsubstituted, so this file lands at the path the spec's own cross-references already assume: `docs/REFERENCE-IMPLEMENTATIONS.md`.

## Connection validation & verdicts

| Donor | Licence | Where (verified) | Pure? | Verdict | Notes |
|---|---|---|---|---|---|
| maxGraph `getEdgeValidationError` | Apache-2.0 | `packages/core/src/view/mixin/ValidationMixin.ts:59-130` @ v0.24.0 (fetched) | method on AbstractGraph | **BEHAVIOUR-DERIVE** | The three-valued contract (`null`/`''`/`"msg"`). RAN: the `''` silent case is invisible even to `validateGraph`'s own audit (`\|\| ''` at :182-187) — the architectural argument for our reasoned-refusal union. Do not port the silent case. |
| maxGraph `validateGraph` | Apache-2.0 | same file :140-206; collapsed-parent bubbling :173-179 | method | **BEHAVIOUR-DERIVE** | Recursive child walk + mark-nearest-visible-ancestor → our `surfaceFindings`, inverted (flat lint then surface up). RAN: folds descendants into ONE generic string; ours keeps per-finding ids. |
| maxGraph `setCellWarning` | Apache-2.0 | `OverlaysMixin.ts:132-155`, `removeCellOverlays` :89-100 | mutating | **AVOID** | RAN: `setCellWarning(cell, null)` deletes EVERY overlay on the cell, unrelated ones included. The argument for `diagnostics` staying a dedicated prop, never a shared overlay list. |
| maxGraph `isValidSource/Target/Connection` | Apache-2.0 | `ConnectionsMixin.ts` (dist :343-353 confirmed) | method | **BEHAVIOUR-DERIVE** | RAN: `isValidTarget` literally delegates to `isValidSource`; `isValidConnection` is a cheap connectable-gate, not the rule engine. Keep our fast gate distinct from the full validator (two-tier). |
| maxGraph `Multiplicity.check` | Apache-2.0 | `Multiplicity.ts:137-170`, `checkTerminal` :204-208 @ v0.24.0 | method | **AVOID** | RAN, reproduced with maxGraph's own Validation-story fixtures: `checkTerminal` receives the EDGE in its `terminal` parameter, so the gate silently skips for every ordinary edge in shipped v0.24.0. Do not adopt as a type/count vocabulary. `getDirectedEdgeCount` counting (audit path) is correct if min/max-per-port is ever wanted. |
| maxGraph `Multiplicity.checkType` | Apache-2.0 | `Multiplicity.ts:213-236` | pure | **BEHAVIOUR-DERIVE** | The one clean ~20-line piece (value-vs-declared-type predicate, no Cell coupling, not implicated in the bug). Model for a plain-value `TypeCompatible`, superseded here by Blockly's shape. |
| Vyuh Flow `deny(reason:, showMessage:)` | MIT | per `docs/INVALID-STATES-PLAN.md` App. B (read then) | value obj | **BEHAVIOUR-DERIVE** | Declared the reasoned-verdict value object, then dropped `reason` on the floor. We close their loop. |

## Type compatibility (D6 donors)

| Donor | Licence | Where (verified) | Pure? | Verdict | Notes |
|---|---|---|---|---|---|
| Blockly `ConnectionChecker.doTypeChecks` | Apache-2.0 | fetched `github.com/google/blockly` main `core/connection_checker.ts:203-219` | pure method | **COPY (the shape)** | List-intersection: optional array of accepted tags per side; `undefined` = unconstrained. **The adopted default `TypeCompatible`.** npm ships only minified bundles — fetch from GitHub to cite. |
| Blockly `ConnectionChecker.getErrorMessage` | Apache-2.0 | same file :102-138 | pure method | **COPY (the pattern)** | One canonical reason string per error code — exactly ruling 2's "severity + text produced low". |
| Blockly `doSafetyChecks` | Apache-2.0 | same file :148-192 | pure method | **BEHAVIOUR-DERIVE** | Self-connection / workspace / shadow ordering prior art. |
| litegraph.js `LiteGraph.isValidConnection` | MIT | `node_modules/litegraph.js/build/litegraph.js:686-720` | pure | **COPY-grade, not chosen** | RAN 6/6 (wildcard `''`/`'*'`, comma-list multi-type, case-insensitive). Alternative encoding to Blockly's arrays; one convention only — arrays won. |

## Graph algorithms

| Donor | Licence | Where (verified) | Pure? | Verdict | Notes |
|---|---|---|---|---|---|
| graphlib `alg/tarjan.js` + `alg/find-cycles.js` + `alg/topsort.js` | MIT | `node_modules/graphlib/lib/alg/` (47 + 10 + 34 lines) | pure | **COPY** | RAN: real cycle `[['c','b','a']]`, real topo order, CycleException. The citable donor if the cycle lint rule ever swaps off "ours, ad hoc". |
| @xyflow/system `getOutgoers/getIncomers/getConnectedEdges` | MIT | fetched `packages/system/src/utils/graph.ts:76-135, 332-410` | pure | **BEHAVIOUR-DERIVE** | Already in bbox-ui's dep tree via @xyflow/react; API-shape parity check for `bubble.ts` traversal. |
| ngraph.graph | BSD-3 | npm, RAN | data structure | **SKIP** | graphlib covers it and bundles the algorithms. |
| cytoscape.js headless mode | MIT | npm, RAN (`headless:true` BFS/DFS) | engine | **AVOID as dep** | Wrong weight class; the headless-construction-flag *pattern* is the only reusable idea. |

## Spatial indexing & snapping (magnet lane's shelf)

| Donor | Licence | Where (verified) | Pure? | Verdict | Notes |
|---|---|---|---|---|---|
| rbush | MIT | `node_modules/rbush/rbush.js` (594 lines) | pure class | **COPY** (dep or port) | RAN: `search`/`collides` correct. Bbox hit-testing once scenes outgrow O(n). |
| d3-quadtree `find(x,y,radius)` | ISC | `node_modules/d3-quadtree/src/{quadtree,find}.js` (143 lines) | pure | **COPY** | RAN: correct nearest hit + correct radius miss. The "nearest port within snap radius" primitive for ruling 5's snap. |
| JointJS `snapLinks` search | MPL-2.0 | dist joint.js:31740-31780 (option-names read; behaviour RAN live) | — | **BEHAVIOUR-DERIVE** | Validates-while-searching: the validator IS the candidate filter, so nothing invalid ever snaps or highlights. Mirror this: one predicate for glow AND lock. |
| tldraw `SnapManager`/`BoundsSnaps`/`HandleSnaps` | tldraw custom | `@tldraw/editor/src/lib/editor/managers/SnapManager/` (on disk; structure only) | stateful | **BEHAVIOUR-DERIVE ONLY** | Production-gated licence; read the shape, write fresh. |
| tldraw `Polyline2d.nearestPoint`/`getLength` | tldraw custom | `.../primitives/geometry/Polyline2d.ts:48, :40` (on disk) | pure method | **BEHAVIOUR-DERIVE ONLY** | Exactly `resolvePathAddress`'s segment-scan shape; must be written fresh. |

## Drag-time availability (D5 donors)

| Donor | Licence | Where (verified) | Pure? | Verdict | Notes |
|---|---|---|---|---|---|
| JointJS `markAvailable` lifecycle | MPL-2.0 | dist joint.js:31927-31952, :31984-32017; RAN live | — | **BEHAVIOUR-DERIVE** | Marked set computed ONCE at drag-start, cleared once at drag-end — never per-pointermove (RAN: incompatible magnet under the pointer changed nothing mid-drag). Our once-per-gesture contract. Default classes `available-magnet`/`available-cell`; highlighter registry is exactly `{addClass, list, mask, opacity, stroke}` + user-registered — no built-in named "custom". |
| JointJS `validateConnection` | MPL-2.0 | dist joint.js:34046; RAN | callback | **BEHAVIOUR-DERIVE** | Fires O(nodes × ports) at drag-start including source-vs-self — short-circuit self early in any default validator. |
| JointJS `validateMagnet` / `magnet="passive"` | MPL-2.0 | dist joint.js:34041-34044; RAN | attr check | **BEHAVIOUR-DERIVE** | Flat-attribute "cannot originate a link" opt-out, separate from per-candidate logic. Cheap escape hatch if ever wanted. |
| JointJS `linkPinning` | MPL-2.0 | dist joint.js:34079, :36756-36771, :20335-20339; RAN both settings | post-drop gate | **BEHAVIOUR-DERIVE** | Default TRUE commits a genuinely dangling point-target edge; FALSE discards cleanly at mouseup, no zombie. Precedent for a host-level policy toggle atop always-reasoned refusals. |
| JointJS `magnetThreshold` | MPL-2.0 | dist joint.js:21170-21201 (source-only) | — | **BEHAVIOUR-DERIVE** | Numeric form counts mousemove EVENTS (not px); `'onleave'` is DOM-containment. Copy the semantic distinction, never "N pixels" — synthetic pointer streams (Playwright) behave differently. |
| maxGraph `ConnectionHandler` hover validate | Apache-2.0 | `ConnectionHandler.ts:607-611, 2037-2112` (fetched; not driven — jsdom has no hit-testing) | — | **BEHAVIOUR-DERIVE** | The OTHER design: lazy, per-hover, single-target validation. Fallback pattern for huge scenes; not built. |
| maxGraph `ConstraintHandler` lifecycle | Apache-2.0 | `ConstraintHandler.ts:46, 83, 386, 451, 127/357/185/197` (fetched) | stateful | **BEHAVIOUR-DERIVE** | reset → setFocus → redraw → destroy: the Apache-clean painting-lifecycle template beside the MPL precedent. |

## Path addressing & marks (D4 donors)

| Donor | Licence | Where (verified) | Pure? | Verdict | Notes |
|---|---|---|---|---|---|
| JointJS `Path.pointAtLength/tangentAtLength` negative form | MPL-2.0 | dist joint.js:7780-7830; RAN (`distance:-20` landed ~28px from the target end) | pure | **BEHAVIOUR-DERIVE** | Negative px = measured from the END. The `{px}` semantics of `PathAddress`, reimplemented. |
| JointJS percent `distance` negative | MPL-2.0 | dist joint.js:8042-8069; RAN (`'-20%'` clamped to the SOURCE end) | pure | **counter-example** | Percent form does NOT count from the end. Negative-fraction semantics in `resolvePathAddress` are OURS, built deliberately, never claimed as a port. |
| JointJS `ToolsView` positioning | MPL-2.0 | dist joint.js:37752-37820; RAN | — | **design GAP, cite as such** | ZERO collision avoidance: two `distance:'50%'` tools at the identical pixel; z-order = DOM append order. The justification for `separateAlongPath` being ours, ad hoc. |
| JointJS `list` highlighter reconciliation | MPL-2.0 | dist joint.js:32858-32925 (source-only) | — | **BEHAVIOUR-DERIVE** | Index-wise isEqual, rebuild only changed indices. Prior art for stable badge identity; React keyed lists do this for us. |
| Excalidraw `getSegmentMidPoint`(`Index`) | MIT | fetched `packages/element/src/linearElementEditor.ts:971, :1015` | static on 2844-line class | **LOW-CONFIDENCE COPY** | Extract the interpolation idea only; the class is store-coupled, unlike the pure `elbow/*.ts` donors already ported. |
| maxGraph label geometry | Apache-2.0 | `x ∈ [-1..1]` + orthogonal offset (App. B convergence row, `docs/INVALID-STATES-PLAN.md:336-343`) | — | **BEHAVIOUR-DERIVE** | The second independent 1-D + offset tradition; convergence is the argument for `PathAddress`. |

## Highlighting hosted-DOM content (gotchas on record)

| Donor | Licence | Where (verified) | Verdict | Notes |
|---|---|---|---|---|
| JointJS `highlighters.mask` + `deep:true` on foreignObject | MPL-2.0 | dist joint.js:32629-32683; RAN live | **AVOID porting** | `MASK_REPLACE_TAGS` includes FOREIGNOBJECT: any HTML content degrades to ONE bounding-box rect — zero interior fidelity for React-hosted content (our Port/Block). A real silhouette highlighter must be purpose-built from measured child rects. |
| same, missing-id crash | MPL-2.0 | dist joint.js:32665-32674; RAN (exact SyntaxError reproduced) | **gotcha on record** | `deep:true` THROWS (`querySelector('#')`) when a foreignObject lacks a DOM id. Flag for any future highlighting-parity work. |

## Layout (not this wave; shelf entries)

| Donor | Licence | Where (verified) | Verdict | Notes |
|---|---|---|---|---|
| dagre + graphlib layout | MIT | npm; RAN (real LR positions) | **BEHAVIOUR-DERIVE / dep** | Sugiyama-family, small, sync, MIT. Prefer when licence tree matters. |
| elkjs | EPL-2.0 (bundled LICENSE.md; package.json also offers GPL) | npm; RAN (real coords + edge sections) | **BEHAVIOUR-DERIVE / dep** | Better layout, heavier; EPL binds only modifications to ELK's own files. |
| @xyflow/system `getNodesInside` | MIT | fetched `graph.ts:264-304` | **BEHAVIOUR-DERIVE** | Viewport-transform-aware marquee/culling hit test. NAMING COLLISION: xyflow's `isVisible` = on-screen; ours = un-hidden-by-a-fold. Keep the vocab separate in docs. |

## Explicitly not read

**libavoid and its TypeScript port (LGPL)** — never opened, this session or any prior one; the elbow nudge rule was derived from geometry and checked against EPL/MIT implementations instead (`elbow/nudge.ts:60-68`). **JointJS source files** — never copied; live behaviour + dist option-name reads only, labelled per entry.
