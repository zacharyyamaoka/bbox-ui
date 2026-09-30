# The 229 untriaged backlog items (noticeability 1–3), clustered — 2026-09-29

Produced by a read-only Sonnet 5.5 scout from `docs/parity-backlog.json` against main `705847c`. Labels are one-grep spot checks, not verdicts — each lane re-verifies before building.

Tip 705847c is 173 commits past the triage snapshot (7abecd0), so labels below are against the current tree. "app" is `apps/systemsketch/src` and "trunk" is `apps/storybook-basics/src`. Each cluster got one grep in each root, not a deep read. Every id is assigned exactly once (65 + 8 + 156 = 229).

**dupOfCanonical=65, doNotBuild=8, clustered=156 (34 clusters)**

Format is `name | ids | area | label | zach-asked | description`.

**Clusters**
1. Component model, callable face, DAG mode | P-375,P-376,P-402,P-452,P-454,P-455,P-459,P-460 | canvas | likely-absent (0 hits for callable/wiring view) | intent only: "basically going to look like the roboflow editor" | Class drawn as function, Component→System nesting, DI/tick, DAG mode, `ClassType.method` labels. dNB #40 is respected by P-460; P-402 is the accepted alternative to dNB #145.
2. Diagnostics/log auto-wiring | P-296,P-370 | wires | likely-absent (0 hits) | Y "we can support like auto wiring so you don't need to drag everything" | Dx/log ports self-wire to one diagnostics component. Needs P-069 kinds. P-370's "hidden by default" collides with the explicit NO on hiding common ports.
3. Type block and Type Mapping | P-289,P-343,P-349,P-371 | shapes | likely-absent (0 hits) | Y "should have two views — source code view and then the UI view" | Block plus codefield member of attributes. Product question: ruling 8, dNB #100, P-227 UNSURE. Ask before dispatch.
4. Type-mismatch validation | P-248,P-332 | wires | likely-present (validationLevelHost.ts:135 `typeMatching`, problems.ts:265) | N | Shipped via ruling 3 at typed/strict levels.
5. Loop grammar | P-259,P-290,P-293,P-333,P-401 | wires | unclear (trunk has whileLoopNode and carriedValueEdge; `shapes/region/LoopTool.ts` places `for` only) | Y "should 100% come in from the outside and go to the header" | While region, exit semantics, zero-iteration cable, return-rail feedback. dNB #141 and #142 bound the grammar.
6. Port defaults, literal display, grammar pick | P-272,P-313,P-432,P-446,P-450,P-451 | shapes | likely-absent (portDeclaration.ts:56 sweeps `= default` into type) | soft "If its a large variable than we can mabye just show the type" | `= default` chip, ring, `= …` fold, resolved value beside formula. P-451 is an undecided grammar and needs Zach. Bound by dNB #18, #75, #29 and ruling 8.
7. Port paint states | P-250,P-287,P-399,P-408 | shapes | likely-absent (app paints wired/empty only, PortFace.tsx:450) | Y "Option to set if filled or not" | Modifiers over state, derived fill with override, not-selectable/hidden, producer count on standalone port.
8. Port view customization (Altium-style) | P-269,P-270,P-271,P-345,P-356,P-358,P-386,P-395,P-433,P-458 | shapes | unclear (`+N more` and freeOffsets in trunk portEdge.layout.ts:345, none in app) | Y "I do want alot of control in how it actually looks" | Per-side edge toggles with parking, count reveal, spacing, size cascade, container W/H. P-271 risks dNB #77/#81.
9. Port and wiring gestures | P-268,P-299,P-340,P-361,P-392 | wires | likely-absent (app 0; batchWire.ts is trunk-only) | N | Batch wiring, magnetic proposals, long-press reorder, port selection model, drop-picker offset.
10. Arrow tool, routing kinds, edge topology | P-247,P-316,P-360,P-434,P-444,P-456 | wires | likely-absent (arrowCycle exists; no arc, edge-on-edge or trunk) | Y "it should activate a port edge not an arrow" | A on a port makes a port edge, arc routing, edge-to-edge, hyperedge trunks.
11. Cable anchoring, appearance, control points | P-257,P-328,P-364,P-416 | wires | unclear (fixed midpoints in trunk blockPort.layout.ts:222; `props.color` exists at WireFace.tsx:87; halo and approach-reveal have 0 hits in app) | Y "Please enabel color control for the edges" | P-328 is the option Zach chose over dNB #128.
12. Hit-region tuning and overlays | P-260,P-318,P-331,P-406,P-437,P-462 | wires | unclear (TRACE_HIT_CORRIDOR_PX is in WireShapeUtil, so P-260 and P-318 are likely-present; no in-app ⇧H) | Y "draw the hit area shapes in opaque red" | Measured corridors and dev overlays.
13. Multi-select batch edits | P-242,P-275,P-315,P-355,P-398 | shapes | likely-absent for blocks (selectionActions `blockView` is null unless one is selected; wires already batch) | Y "quickly turn alot of blocks from port mode to expanded mode" | Batch view flip, batch restyle, pill shows the shared controls.
14. Block sizing and defaults | P-246,P-255,P-273,P-400,P-461 | shapes | likely-absent (0 size-ladder hits) | Y "the default one is empty - no ports - no icon, name, type, etc" | Empty default block, corner radius, shift-snap ladder, auto-grow description, parents query.
15. Text/size vocabulary | P-319,P-396,P-404,P-415,P-447 | other | likely-absent (only PORT_TEXT_SIZES) | Y "we can just get this working generically — small, medium, large" | Size presets with custom value, curated typefaces. Closed vocabulary is consistent with dNB #58.
16. Branch arms and conditional outputs | P-254,P-283,P-309,P-380 | shapes | unclear (return-union divider landed in trunk, 9ce5304; app has no arm hits) | Y "seperating conditional line should be equal to 1 port row height" | Arm stamping, case-view fade, half-line divider. Explicit NO on "Region: add an arm" stands (on hold).
17. Annotations, comments, visual group | P-251,P-338,P-359,P-409 | shapes | likely-absent (0 hits; P-409 ≈ the GroupCluster already in the pill) | Y "then I cannot move the canvas" | Callout with leaders and async region, annotation mode that pans, comments panel. Zach deferred P-409.
18. Code cell: origin state and display | P-264,P-278,P-279,P-321,P-431,P-442 | panels | unclear (OriginBadge only on CodeFace.tsx:105, not BlockFace) | Y "I do however want control over the width of the code block" | Block origin badge, re-bind/detach, flatten, width. P-321 hits dNB #30, but that entry is an AI-side reversal of an explicit Sep 5 ask, so treat it as a build.
19. Run code on canvas | P-372 | other | likely-absent (0) | N | Shift+Enter run per cell (Marimo).
20. Pages, frames panel, imports, history | P-276,P-307,P-311,P-323,P-350 | files | likely-absent (panels.tsx:72 says saved camera views are "not part of this document yet"; history rail has no data source) | Y "a block from another page should have that link icon and be read only" | Pages, cross-file imports, saved views.
21. Export | P-329,P-393,P-407 | files | likely-absent (0 hits) | Y "we had discused having a export to .tldr" | Stock .tldr flatten, real SVG. Related to P-154 and ruling 5.
22. File resilience and format housekeeping | P-249,P-277,P-312,P-346,P-405,P-435 | files | unclear (autosave hardened in 6192ca5; no backoff or moved-or-deleted banner) | N | Retry, conflict banner, migrations, stale cables. Related to P-176.
23. Generator contract and scene invariants | P-308,P-397,P-427,P-445 | backend | unclear (edgePolicy.ts:120,147 has containment rules; no docstring or stockConfig) | Y "lets implement this" (P-308) | Containment judge, docstring description, frozen ids. Related to P-104.
24. Diff, lint, golden tooling | P-330,P-368,P-413,P-425,P-448,P-449,P-464 | backend | unclear (compareModel, diffMark and wordDiff exist; no pixel diff, golden or CI lint) | Y "we need that visual diff engine when doing the golden layouts" | P-449 is the inverse of dNB #121 (one engine). P-067 is done.
25. Tags and perspectives | P-337,P-420 | other | likely-absent | Y "yes lets place it on the bottom." | IcePanel tags. Near dNB #8 and #84; check before building.
26. Standard components, templates, hardware seam | P-334,P-457,P-465,P-466,P-468 | canvas | likely-absent (dock librarySlot is a placeholder) | Y "Ease to drop in standard components at this stage as well" | Related to P-232. P-465 is CAD-exporter-side, out of repo.
27. Editor embeds | P-374,P-467 | other | likely-absent (only comments) | soft "so shall the obsidan plugin when we create it" | VS Code/Cursor and Obsidian; related to P-236.
28. Palette, popouts, search-to-place, keyboard | P-261,P-286,P-344,P-378,P-382,P-388,P-438 | menus | unclear (QuickSwitcher mounted at devtools.tsx:15, tools-only; library popout is a placeholder) | Y "just have it as a place holder" | Related to P-051 and P-232.
29. Toolbar/title chrome and notices | P-240,P-280,P-284,P-381,P-384,P-418 | other | unclear (toasts used; 0 `document.title`) | Y "indicator at the top of the page should appear" | Hotkey hints, window title, click-to-rename, recording indicator.
30. Release/version status | P-262,P-303,P-463 | other | likely-absent (`HelpMenu: null` at App.tsx:81; 0 changelog) | Y "Please make this information so that you see it in the help icon" | Related to P-238; dNB #53 rules out a top pill.
31. Dev profiles and Storybook bench | P-291,P-302,P-390,P-417 | other | likely-absent (0 hits) | Y "Can you please make these visual comparisons for rows in table" | CLAUDE.md makes Storybook opt-in, so it needs an explicit ask. `?lab=` URL flag echoes dNB #24; #56 is the adopted alternative.
32. Settings rows, theme tokens, naming | P-379,P-383,P-414,P-440 | settings | unclear (`--ss-*` tokens exist, no syntax theme) | N | Low-value polish.
33. Inspector presentation and field commit | P-274,P-439 | panels | unclear (FieldCommitMode live|exit at trunk codeEditorGesture.ts:36, so P-439 is likely-present) | Y "your cut-off dropdown was a real bug" | Inset popout and dropdown escape. Related to P-057.
34. Selection/edit chrome parity nits | P-241,P-244,P-297,P-327 | canvas | unclear (no handle-hide found) | Y "the resizing points on the outside dispear" | Excalidraw-style handles, hide resize handles while editing. Related to P-239.

**doNotBuild matches**
- P-267 -> #66 single-producer input
- P-292 -> #153 add-member flips free to stack (constraint only)
- P-373 -> #6 side-effect ports on header lines. The quote is "SKIP this for now", though trunk shipped side-effect ports in 63c2323.
- P-412 -> #74 raw CSS per circle in the inspector
- P-424 -> #75 name/type props on Port, also ruling 8
- P-314 -> #159 min-size floor. CONFLICT: Zach asked for one on the port view.
- P-394 -> #163 semantic zoom drives the view. CONFLICT: Zach asked for it as an opt-in.
- P-363 -> #32 Markdown component / #28 rich-text models. CONFLICT: Zach asked for a notes tab.

**Duplicates of triage-doc ids**

Grouped as `canonical <- ids`. All canonicals are ABSENT unless tagged.
- P-010 <- P-243 (its markdown half hits dNB #32), P-326
- P-012 (premise-false, `.bbox` ruling) <- P-258
- P-013 <- P-263
- P-055 <- P-294, P-348, P-377. This may already be landing: BlockFace imports `portLaneRequest`.
- P-057 <- P-341, P-428, P-430
- P-058 <- P-347
- P-059 <- P-324, P-354
- P-060 <- P-419, P-423, P-453
- P-064 <- P-335
- P-068 <- P-300
- P-070 <- P-310. Mouse buttons 3/4 clash with the selection-history binding noted at P-215.
- P-074 <- P-325, P-362, P-366
- P-075 <- P-351, P-369
- P-076 <- P-281, P-298, P-336, P-385
- P-083 <- P-357
- P-087 (premise-false, envelope key still owed) <- P-443
- P-097 <- P-266, P-305, P-317
- P-105 <- P-403
- P-107 <- P-387
- P-116 <- P-256
- P-119 <- P-288
- P-120 <- P-391
- P-121 <- P-410
- P-124 <- P-342, P-352, P-426
- P-127 <- P-253, P-285
- P-133 <- P-436
- P-136 (already-done) <- P-252, P-295
- P-137 <- P-389 (related to P-187)
- P-142 <- P-367
- P-144 <- P-301
- P-149 <- P-429
- P-152 <- P-282 (its min-size half hits dNB #159), P-306
- P-154 <- P-304, P-365, P-422
- P-161 <- P-411
- P-170 <- P-320 (an opt-in toggle; dNB #34 caution)
- P-186 (premise-false, wheel is already a setting) <- P-245
- P-188 <- P-421
- P-200 <- P-339
- P-206 (premise-false) <- P-353
- P-211 <- P-322
- P-213 <- P-265
- P-238 <- P-441

**Needs a Zach ruling before dispatch:** cluster 3 (Type block), cluster 2 (auto-wire vs "hide common ports" NO), and P-314, P-394, P-363. Cluster 6's P-451 is an undecided grammar choice.