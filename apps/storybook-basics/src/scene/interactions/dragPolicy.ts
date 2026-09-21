/**
 * src/interaction/dragPolicy.ts — who owns a press, declared by the
 * component and implemented by the host.
 *
 * ── The requirement this exists to serve ────────────────────────────────
 * Zach, `PROJECT - Black Box UI.md:2504`:
 *
 *   "generally where I just 1 click and drag I want it to move, even if it
 *    hasn't been selected prior, you need to sense the click and drag
 *    motion..."
 *
 * WHY that sentence is load-bearing and must not be refactored away: it
 * rules out the intuitive alternative — click to select, then drag the
 * selection — which is what a form feels like and what SystemSketch
 * deliberately does NOT do. The donor proves the same rule by test:
 * `systemsketch/tests/block_click_to_edit_smoke.mjs:261-270` drags from a
 * Block's title and asserts the Block MOVED and no editor opened. A press
 * that becomes a drag is a move, always, from cold.
 *
 * ── The split this module draws ─────────────────────────────────────────
 * `CLAUDE.md`, "The one rule the design rests on": interaction geometry is
 * host-owned and never travels. So:
 *
 *   A component DECLARES, about itself, in its own vocabulary:
 *     "my header band is a grab surface; my code face owns its pointer;
 *      my interior is inert child canvas."
 *   That is a fact about the component, expressed as data keyed by the
 *   `data-slot` names it already emits. It imports no engine, measures
 *   nothing, listens to nothing, and is identical on every host.
 *
 *   A host IMPLEMENTS: which element is under the pointer, the walk from
 *     that element to the nearest declaration, the click-vs-drag threshold,
 *     pointer capture, the viewport transform, z-order, and what
 *     "selected" means.
 *
 * Zach's instinct was "each component should define its own behaviour ...
 * in the composite components you get the logic for free." That is right
 * about the DECLARATION and wrong about the BEHAVIOUR, and the difference
 * is measurable: React Flow implements `dragHandle` by walking ancestors
 * from the press target up to the node root and matching a CSS selector
 * (`@xyflow/system@0.0.82/dist/esm/index.mjs:2038-2048`, `hasSelector`).
 * With `dragHandle: '[data-slot="block-header"]'` on a parent Block, a
 * press on a MEMBER Block's header matches the parent's selector and drags
 * the parent — measured 2026-09-17 in this lane, a 40x24px drag on `kid`'s
 * header moved `proc` 40.8px. Inheritance by ancestor-matching is the bug.
 *
 * So composition is NEAREST-DECLARATION-WINS, not inheritance: the walk
 * stops at the first element that carries a declaration, and a child's
 * declaration shadows its parent's. That is simultaneously the fix for the
 * leak above and the mechanism that makes "free for composites" correct
 * rather than accidental.
 */

/* ------------------------------------------------------------------ */
/* Roles — the whole vocabulary a component may use about itself       */
/* ------------------------------------------------------------------ */

/**
 * What a press on one named part of a component means.
 *
 * Ranked deliberately (`GRAB_RANK` below): a parent override may only ever
 * LOWER the rank. See `narrowRole`.
 */
export type GrabRole =
  /** A press here starts the host's move gesture for this component. */
  | "grab"
  /** A press here starts nothing and does not move this component; it
   *  falls through to whatever is beneath (an expanded Block's interior is
   *  child canvas, so the child gets the press). */
  | "inert"
  /** This subtree consumes the press itself — a CodeMirror caret, a
   *  dnd-kit rail, a port dot's cable gesture. The host must not start any
   *  gesture here. On React Flow this is what the `nodrag` class means
   *  (`@xyflow/react` default `noDragClassName`, index.mjs:3767); on tldraw
   *  it is `editor.markEventAsHandled`. Same declaration, two vetoes. */
  | "owns-pointer";

/** Only for `narrowRole`'s lattice. Higher = more grabbable. */
const GRAB_RANK: Record<GrabRole, number> = { grab: 2, inert: 1, "owns-pointer": 0 };

/**
 * A parent's override of a child's declared role.
 *
 * WHY a parent may only NARROW, never widen: widening lets a parent claim
 * a press over a child that owns its pointer — dragging the block instead
 * of placing the caret in its code editor — which is the exact bug class
 * `nodrag` exists to prevent, and it makes a component's declaration about
 * its own internals non-authoritative. Narrowing is safe in the worst
 * case: a surface that simply does not drag. Zach asked for "the correct
 * default behaviour, and then you can always override it at the parent
 * level"; this is that, with the one direction that cannot break a child.
 */
export function narrowRole(declared: GrabRole, override: GrabRole | undefined): GrabRole {
  if (override === undefined) return declared;
  return GRAB_RANK[override] < GRAB_RANK[declared] ? override : declared;
}

/* ------------------------------------------------------------------ */
/* The declaration — data, not behaviour                               */
/* ------------------------------------------------------------------ */

export interface DragDeclaration {
  /** The component's own name. Diagnostics and story tables only. */
  readonly component: string;
  /** What a press on this component's own face means where no listed part
   *  claims it. */
  readonly face: GrabRole;
  /** Per-`data-slot` roles. A slot named here wins over `face`. */
  readonly parts: Readonly<Record<string, GrabRole>>;
  /** Slots whose press, when this component is already active and the
   *  press did NOT become a drag, opens an editor on that part. This is
   *  the donor's two-click rule; see `resolveClick`. */
  readonly editableParts?: readonly string[];
}

/**
 * The per-component declarations.
 *
 * Every role below is the donor's, cited. Where bbox-ui currently
 * disagrees the citation is still the donor's — this table is the intended
 * policy, and `docs` records the wiring still owed to make the running
 * code match it.
 */
export const DRAG_DECLARATIONS: Readonly<Record<string, DragDeclaration>> = {
  /**
   * An EXPANDED Block is a container: its interior is child canvas and is
   * deliberately NOT grabbable, while its chrome bands are.
   *
   * Donor: `systemsketch/src/blocks/BlockShapeUtil.tsx:501-520` —
   * `isContainer = isExpandedBlockShape(shape)`, body `isFilled:
   * !isContainer`, and `chrome: isContainer ? [layout.header,
   * ...layout.ports.map(portLabelHitArea), layout.footer] : []`.
   * Asserted point-by-point in
   * `systemsketch/src/blocks/blockSelectableArea.test.ts:162-189`:
   * header/footer/port-dot/port-text/edge-to-words-gap grabbable;
   * "middle of child canvas" and "just above footer" not.
   */
  "block:expanded": {
    component: "Block (view=expanded)",
    face: "inert",
    parts: {
      "block-header": "grab",
      "block-footer": "grab",
      "port-label": "grab",
      "port-label-display": "grab",
      "block-members": "inert",
      // A member carries its OWN declaration; the walk stops there, which
      // is what stops a member's header from dragging its parent.
      "block-member": "inert",
      "port-dot": "owns-pointer",
      "port-dot-halo": "owns-pointer",
      "block-port-rail": "owns-pointer",
      "code-editor": "owns-pointer",
    },
    editableParts: ["block-header", "port-label", "port-label-display"],
  },

  /**
   * A NON-container Block (`simple` / `port` / `value`) is the opposite:
   * the whole face is solid.
   *
   * Donor: the same `isFilled: !isContainer` at
   * `BlockShapeUtil.tsx:512` with `isContainer === false`, asserted in
   * `blockSelectableArea.test.ts:207-214` — for each of
   * `['simple','port','value']`, `geometry.children[0].isFilled` is
   * `true` and no chrome band is wider than a port dot.
   *
   * WHY this row matters most: bbox-ui applies header-only to EVERY view,
   * so today a `port`-view Block is grabbable on its header alone.
   * Measured 2026-09-17: pressing `sink`'s interior centre moved it 0px.
   */
  "block:solid": {
    component: "Block (view=simple|port|value)",
    face: "grab",
    parts: {
      "port-dot": "owns-pointer",
      "port-dot-halo": "owns-pointer",
      "block-port-rail": "owns-pointer",
      "code-editor": "owns-pointer",
      "port-label": "grab",
      "port-label-display": "grab",
    },
    editableParts: ["block-header", "port-label", "port-label-display"],
  },

  /**
   * Folding an expanded Block flips it to solid. Donor:
   * `isExpandedBlockShape` requires `!blockIsFolded(shape.props)` —
   * `systemsketch/src/blocks/blockModel.ts:1122-1124` — so fold is a
   * hit-test change, not only a height change.
   */
  "block:folded": {
    component: "Block (folded)",
    face: "grab",
    parts: { "port-dot": "owns-pointer", "folding-chevron": "owns-pointer" },
  },

  /**
   * The glyph face is uniformly grabbable, and a single click opens the
   * picker. Donor/spec: `Projects/bbox-ui/Components/DP - Glyph.md:167` —
   * "single click on the glyph opens the picker in all three renders
   * (Notion). A drag still moves — both canvases suppress `click` after
   * the drag threshold".
   *
   * Measured 2026-09-17: bbox-ui does NOT do this. A press on the centre
   * of the rendered face (which resolves to the lucide `<svg><path>`) moved
   * the node 0px, while a press on the node's 1px margin moved it.
   */
  glyph: {
    component: "Glyph",
    face: "grab",
    parts: {},
    editableParts: ["glyph"],
  },

  /**
   * The editor owns its pointer, wall to wall — caret, selection,
   * in-editor drag. bbox-ui already gets this right via `nodrag`
   * (`apps/storybook-basics/src/hosts/nodeViews.tsx:145`), verified by
   * measurement: a press inside the Code face moves the node 0px.
   *
   * Donor for the two-click entry: `systemsketch/src/code/
   * codeClickToEdit.ts:43-56` — the second click enters the doc, and
   * CodeMirror owns the surface from then on.
   */
  "code-editor": {
    component: "CodeEditor",
    face: "owns-pointer",
    parts: {},
  },

  /**
   * A Value capsule's pill face is grabbable; only its editor is not.
   *
   * Donor: `BlockShapeUtil.tsx:503-508` gives `view === 'value'` a
   * `Stadium2d` with `isFilled: true` — a solid face — and
   * `blockSelectableArea.test.ts:207-214` covers `'value'` in the
   * non-container set.
   */
  value: {
    component: "ValueCapsule",
    face: "grab",
    parts: { "code-editor": "owns-pointer", "port-dot": "owns-pointer", "port-dot-halo": "owns-pointer" },
  },

  /**
   * A port's DOT is the cable handle; its TEXT is a grab surface.
   *
   * This is the sharpest rule in the whole policy and it is Zach's, in his
   * own words — `Projects/bbox-ui/Components/DP - Port.md:190`:
   *
   *   "The Port's text is now a real stock hit target, so pressing once on
   *    its name/type/value and dragging enters tldraw's normal move
   *    interaction immediately—no preliminary selection click. The circular
   *    dot deliberately remains the cable handle."
   *
   * Donor geometry: the dot is a `Circle2d` of `BLOCK_PORT_RADIUS` (6)
   * (`BlockShapeUtil.tsx:521-527`); the text band is `portLabelHitArea`
   * (`systemsketch/src/blocks/layoutBlock.ts:904-922`), which joins the
   * painted glyphs to the Block edge with `PORT_LABEL_HIT_PAD_PX = 8`
   * (`layoutBlock.ts:69`) of "breathing room beyond the final glyph", and
   * stops after the painted content so the empty half of a label box is
   * NOT grabbable (`blockSelectableArea.test.ts:182-185`).
   */
  port: {
    component: "Port / LabeledPort",
    face: "inert",
    parts: {
      "port-dot": "owns-pointer",
      "port-dot-halo": "owns-pointer",
      "port-dot-core": "owns-pointer",
      "port-label": "grab",
      "port-label-display": "grab",
    },
    editableParts: ["port-label", "port-label-display"],
  },

  /**
   * A trace owns its own press: its hit corridor selects it and its
   * handles reshape it. Donor: `systemsketch/src/blocks/connections/
   * connectionHit.ts` (whole file) — the corridor is the port dot's own
   * outer radius, 9 page units (`:89`), and a press on a dot always starts
   * a NEW cable rather than moving an existing one
   * (`PointingBlockPort.ts:149-153`).
   */
  trace: {
    component: "Trace",
    face: "owns-pointer",
    parts: {},
  },

  /**
   * A Bar is chrome inside a grab band: the bar itself drags the block,
   * every control in it owns its own press.
   *
   * Donor: `systemsketch/src/blocks/ui/BlockCanvas.tsx:1046-1052` on the
   * fold chevron — "This is chrome inside a tldraw shape. Keep its press
   * out of stock selection / drag handling so a chevron click is one
   * unsurprising fold operation rather than the start of a canvas
   * gesture." Same treatment at `:368` (footer menu) and `:1353` (add-port
   * bead).
   */
  bar: {
    component: "Bar",
    face: "grab",
    parts: {
      button: "owns-pointer",
      toggle: "owns-pointer",
      "dropdown-menu": "owns-pointer",
      "folding-chevron": "owns-pointer",
      "code-editor": "owns-pointer",
    },
  },

  /**
   * At rest an editable text face is a GRAB surface — a drag across it
   * moves the block. Only once the field is open does the mounted input
   * own the pointer.
   *
   * Donor: `systemsketch/src/blocks/blockClickToEdit.ts:131-135` drops the
   * pending edit when `editor.inputs.getIsDragging()`, and
   * `BlockInlineEditor.tsx:516-518` has the mounted input stop propagation
   * once it exists. Zach's own criterion, weighted 0.20 in his own table
   * (`Projects/bbox-ui/Components/DP - EditableText.md:186`): "the canvas
   * gesture survives: a drag across the text moves the Block; the field is
   * inert until meant".
   */
  "editable-text": {
    component: "EditableText (at rest)",
    face: "grab",
    parts: {},
    editableParts: ["editable-text"],
  },
  "editable-text:editing": {
    component: "EditableText (field open)",
    face: "owns-pointer",
    parts: {},
  },
};

/* ------------------------------------------------------------------ */
/* Resolution — pure, DOM-free, and therefore testable                  */
/* ------------------------------------------------------------------ */

/**
 * One link on the walk from the press target outward. A host builds this
 * from real DOM; every predicate below is a pure function of it, so the
 * policy is unit-testable with no browser.
 */
export interface GrabChainLink {
  /** The element's `data-slot`, if any. */
  readonly slot?: string;
  /** The declaration key this element carries, if it is a declaring root
   *  (`data-drag-owner`). The walk STOPS at the first of these. */
  readonly declares?: string;
  /** A parent-supplied narrowing for this subtree (`data-drag-narrow`). */
  readonly narrow?: GrabRole;
}

export interface GrabResolution {
  readonly role: GrabRole;
  /** Which declaration answered, or `null` if the walk found none. */
  readonly owner: string | null;
  /** Which slot (or `"face"`) the role came from. */
  readonly via: string;
}

/**
 * The default for an element under no declaration at all.
 *
 * WHY `inert` and not `grab`: an undeclared surface that silently drags is
 * how the `hasSelector` leak above behaves, and a press that moves the
 * wrong thing is worse than a press that moves nothing. A component opts
 * IN to being grabbable by saying so.
 */
export const UNDECLARED_ROLE: GrabRole = "inert";

/**
 * Resolve a press. `chain` runs from the press target OUTWARD (index 0 is
 * the deepest element under the pointer).
 *
 * Nearest declaration wins: the walk stops at the first link carrying
 * `declares`, so a member Block's own declaration shadows its parent's and
 * a press on the member never reaches the parent's grab map. Narrowings
 * collected on the way out still apply (a parent may only reduce).
 */
export function resolveGrab(
  chain: readonly GrabChainLink[],
  declarations: Readonly<Record<string, DragDeclaration>> = DRAG_DECLARATIONS,
): GrabResolution {
  const narrowings: GrabRole[] = [];
  const slotsSeen: string[] = [];
  for (const link of chain) {
    if (link.narrow) narrowings.push(link.narrow);
    if (link.slot) slotsSeen.push(link.slot);
    if (!link.declares) continue;
    const declaration = declarations[link.declares];
    if (!declaration) break;
    // The innermost named slot with an opinion wins; `face` is the floor.
    let role = declaration.face;
    let via = "face";
    for (const slot of slotsSeen) {
      const part = declaration.parts[slot];
      if (part !== undefined) { role = part; via = slot; break; }
    }
    for (const n of narrowings) role = narrowRole(role, n);
    return { role, owner: declaration.component, via };
  }
  let role = UNDECLARED_ROLE;
  for (const n of narrowings) role = narrowRole(role, n);
  return { role, owner: null, via: "undeclared" };
}

/** Does a press here start the host's move gesture? */
export function isGrabbable(resolution: GrabResolution): boolean {
  return resolution.role === "grab";
}

/** Must the host keep out entirely — no drag, no selection, no pan? */
export function subtreeOwnsPointer(resolution: GrabResolution): boolean {
  return resolution.role === "owns-pointer";
}

/**
 * The donor's one rule for what a CLICK (a press that never became a drag)
 * means: *"was this Block already active when you pressed?"* — Zach's
 * shipped summary at `Projects/bbox-ui/Components/DP - Block.md:714`, and
 * the gate that implements it at `systemsketch/src/blocks/
 * blockClickToEdit.ts:42-51` (`getEditingShapeId() ??
 * getOnlySelectedShapeId()`, so a FIRST click arms nothing).
 *
 * There is deliberately no timer and no click counter, which is why
 * Zach's "2nd click (slow)" column behaves identically to "double click
 * rapid" (his own desired table, `DP - Block.md:696`) — the donor proves
 * it with an 800ms pause in
 * `systemsketch/tests/block_click_to_edit_smoke.mjs`.
 */
export type ClickOutcome =
  /** Nothing was active; this click activates it and does nothing else. */
  | { kind: "activate" }
  /** Already active and the press landed on an editable part. */
  | { kind: "edit"; part: string }
  /** Already active but the press landed on a part that opens nothing. A
   *  miss stays a miss — donor: `systemsketch/src/blocks/
   *  inlineBlockEditing.ts:362-368`. */
  | { kind: "keep-active" }
  /** The subtree owns the press; the host was never involved. */
  | { kind: "not-ours" };

export function resolveClick(
  resolution: GrabResolution,
  options: { readonly wasActive: boolean; readonly declaration?: DragDeclaration },
): ClickOutcome {
  if (resolution.role === "owns-pointer") return { kind: "not-ours" };
  if (!options.wasActive) return { kind: "activate" };
  const editable = options.declaration?.editableParts ?? [];
  return editable.includes(resolution.via) ? { kind: "edit", part: resolution.via } : { kind: "keep-active" };
}

/* ------------------------------------------------------------------ */
/* The state machine, as data — so the story table cannot drift         */
/* ------------------------------------------------------------------ */

export type GestureState = "idle" | "hovered" | "pressed" | "dragging" | "active" | "editing";

export interface PolicyRow {
  readonly gesture: string;
  readonly onGrab: string;
  readonly onInert: string;
  readonly onOwned: string;
}

/**
 * The table Zach asked for, in the one place the predicates above also
 * read from. Rendered by `DragPolicy.stories.tsx` beside a live canvas, so
 * the prose and the behaviour come from a single source.
 */
export const POLICY_TABLE: readonly PolicyRow[] = [
  {
    gesture: "hover (no button)",
    onGrab: "move cursor + hover paint; nothing claimed",
    onInert: "hover paint only",
    onOwned: "the subtree's own hover (caret, dot halo)",
  },
  {
    gesture: "press, then release under the threshold — never selected before",
    onGrab: "ACTIVATE (select). Nothing else — donor blockClickToEdit.ts:42-51",
    onInert: "press falls through to whatever is beneath",
    onOwned: "subtree handles it; host stays out",
  },
  {
    gesture: "press, then release under the threshold — ALREADY active",
    onGrab: "EDIT the part under the pointer, at any speed",
    onInert: "stays active; a miss stays a miss",
    onOwned: "subtree handles it",
  },
  {
    gesture: "press, then move PAST the threshold (cold, never selected)",
    onGrab: "MOVE IT. This is the requirement — no prior selection click",
    onInert: "the thing beneath is moved, not this one",
    onOwned: "the subtree's own drag (rail reorder, cable, caret select)",
  },
  {
    gesture: "press, move past threshold, while already active",
    onGrab: "MOVE IT — identical to cold. Active state changes nothing",
    onInert: "as above",
    onOwned: "as above",
  },
  {
    gesture: "click, then a SECOND press-and-drag",
    onGrab: "MOVE IT, and no editor opens — donor blockClickToEdit.ts:131-135",
    onInert: "as above",
    onOwned: "as above",
  },
  {
    gesture: "double click (rapid)",
    onGrab: "same as the slow second click — one rule, no timer",
    onInert: "the host's own step-into, if it has one",
    onOwned: "subtree handles it",
  },
];

/* ------------------------------------------------------------------ */
/* Thresholds — every number cited                                      */
/* ------------------------------------------------------------------ */

/**
 * Pointer travel, in CLIENT px, before the CANVAS (the outermost, least
 * specific gesture owner) turns a press into a move.
 *
 * 4 is tldraw's own: `dragDistanceSquared: 16` in
 * `/home/bam/systemsketch/node_modules/@tldraw/editor/dist-cjs/lib/
 * options.js:36` — read on disk, @tldraw/editor 5.3.2.
 *
 * WHY client px and not scene px: the threshold must mean the same amount
 * of finger movement at every zoom. React Flow agrees and says so in its
 * own source — `@xyflow/system@0.0.82/dist/esm/index.mjs:2303`, verbatim:
 * "Calculate distance in client coordinates for consistent drag threshold
 * behavior across zoom levels". Measured in this lane at zoom 1.75: a
 * 40px client drag moved the node 19.43 scene px ≈ (40 − first-step)/1.75,
 * so the delta is divided by zoom while the threshold is not. There is no
 * zoom bug here to fix.
 */
export const CANVAS_DRAG_INTENT_PX = 4;

/**
 * The same number for a coarse pointer (touch). 6, from tldraw's
 * `coarseDragDistanceSquared: 36` — same file, `options.js:34`.
 */
export const CANVAS_DRAG_INTENT_COARSE_PX = 6;

/**
 * Pointer travel before an INNER owner (a dnd-kit rail, a member stack)
 * claims the press from the canvas.
 *
 * 3, and it is strictly below `CANVAS_DRAG_INTENT_PX` on purpose. The
 * donor's own words, `/home/bam/systemsketch/src/blocks/
 * memberStackDnd.tsx:89-94`, verbatim:
 *
 *   "Strictly below tldraw's own drag-start threshold (4 screen px —
 *    `options.dragDistanceSquared: 16`, verified in @tldraw/editor 5.3.2),
 *    so the claim preempts `pointing_shape -> translating` rather than
 *    racing it. A press released under this distance is a plain click and
 *    never touches dnd-kit."
 *
 * WHY the ordering is the whole point, and why bbox-ui currently has it
 * INVERTED: the more specific owner must arm FIRST, or the canvas wins
 * every contested press. bbox-ui leaves React Flow's `nodeDragThreshold`
 * at its default of 1 (`@xyflow/react@12.11.6/dist/esm/index.mjs:3331`)
 * while its dnd-kit rails arm at 4 — so on any surface where both listen,
 * the canvas claims the gesture 3px before the rail ever sees it. The
 * repo is currently saved from this only by spatial exclusion
 * (`dragHandle` / `nodrag`), which is exactly the thing measured to be
 * incomplete.
 */
export const INNER_CLAIM_PX = 3;

/**
 * WHY there is no long-press / dwell entry in this module.
 *
 * The donor spent a PEP on it: `/home/bam/systemsketch/docs/peps/
 * 0013-two-scoped-canvas-drag-owners.md:39-47` establishes that tldraw's
 * `long_press` does NOT mean "the press did not move" — it is a 500ms
 * timer cleared by, among other things, the `pointer_move` branch past the
 * drag threshold. So timing cannot separate two drag owners; only "which
 * state owns the press, re-checked at claim time" can (`:36-38`).
 * SystemSketch now fails its own build if any comment under `src/` claims
 * otherwise (`:87-88` — four comments asserted it before that landed).
 * This module therefore separates owners by DECLARED ROLE and by
 * threshold ordering, never by a timer.
 */
