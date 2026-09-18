# Trace control points — straight polylines, N bends, and a live gallery

Zach, 2026-09-17 (`Projects/bbox-ui/Components/DP - Trace.md:441`):

> Ok one change then is for straight with control point. then the lines should
> be straight not curved as it is right now… For the straight line possibly you
> have many intermediate control points as well… Like the multi elbow trace, you
> should always be able to hover over the middle of a chord and drag it to add a
> new bend to the straight line… The code for having those new control points
> appear feels very similar to the multi elbow trace.
>
> Also can you please edit storybook so that the control points on the arrows
> are actually interactive… Copy this code from system sketch. When you click on
> the arrow and your mouse is hover near it you should be able to move the
> control points… This is great because right now the galleries are like static,
> but now this can make it interactive so we can see how it works… I guess in
> the full case we can also move the start and end points of the arrows… those
> are also just kinda like control points… (that optionally perhaps you want to
> lock sometimes so that you can only move the in-between control points)

Everything below is **settled**. The implementing lane decides none of it; it
types it, measures it, and reports anything that turns out to be impossible as a
blocker rather than adjusting the target.

---

## The one deliberate divergence from the donor

`routeTrace`'s `straight` branch currently reads:

```ts
// WHY this branch is not simply a line: the donor's `straight` with
// a dragged control point calls the SAME `bentCurvedPath` as
// `curved` (`connectionRouting.ts:212-214`). Bending a straight line
// does not produce a second kind of curve — it produces THE curve.
```

That comment is *correct about the donor* and is now **the wrong behaviour for
this repo**. Zach looked at it and said no: a straight trace with a control
point is a **polyline**, not a quadratic. SystemSketch is the spec for target
behaviour, not an authority that outranks him
(`systemsketch-is-spec-not-source`).

**The comment must be rewritten, not deleted and not left standing.** It is the
one place a future re-sync will look, and a re-sync that reads the old text will
silently restore the quadratic. The replacement states: the donor bends a
straight into `bentCurvedPath`; this repo deliberately does not; here is the
date and the reason; `curved` still does, and that difference is the point.

`curved` is untouched. `slanted` is untouched. `elbow` is untouched.

---

## D1 · The bend model — chord-relative, like `ElbowPin`

Zach noticed the resemblance himself ("feels very similar to the multi elbow
trace"), and it is not a coincidence: `elbow/elbowPins.ts` already stores a pin
as a normalized `(t, o)` pair precisely so it survives the endpoints moving.
Since this feature *also* lets you drag the endpoints, absolute points would
strand every bend the moment a terminal moved. So:

```ts
/** One intermediate control point on a `straight` trace, stored in the
 *  chord's own frame so it survives the endpoints moving.
 *  `t` — fraction along start→end (may leave 0..1; a bend is allowed to
 *        sit "behind" the start, which is how a hairpin is drawn).
 *  `o` — perpendicular offset from the chord in px, positive to the LEFT
 *        of the direction of travel. */
export interface TraceBend {
  t: number;
  o: number;
}
```

Two pure conversions, exact round-trip, in a new `src/components/trace.bends.ts`:

```ts
export function traceBendPoint(bend: TraceBend, start: Point, end: Point): Point
export function traceBendFrom(point: Point, start: Point, end: Point): TraceBend
```

Degenerate chord (`start` ≈ `end`, length < 1e-6): the frame has no direction.
Fall back to the screen axes (`t` along +x, `o` along −y) so the functions stay
total. State that in a comment; do not throw.

## D2 · `routeTrace` — `bends` on `straight`

```ts
export interface TraceRouteOptions {
  curve?: TraceCurve | null;
  slantT?: number | null;
  /** `straight` only: N intermediate control points, in chord space.
   *  Resolved in ARRAY order — the caller owns the ordering, because a
   *  hairpin deliberately has non-monotonic `t`. */
  bends?: readonly TraceBend[] | null;
}
```

The `straight` branch becomes:

1. `resolved = (bends ?? []).map(b => traceBendPoint(b, start, end))`
2. If `bends` is absent/empty **and** `curve` is present, resolve the legacy
   single control point: `resolved = [getCurveWaypoint(start, end, curve)]`.
   This is what keeps every existing story rendering through its dragged point
   with no story edit — it just draws straight through it now.
3. `points = [start, ...resolved, end]`
4. `path = polylinePath(points)`
5. `points` is returned **non-null** — a bent straight now genuinely has
   vertices, which is a strict gain: `TraceBadge`, the tidy pass and the pill
   stop needing a sampled approximation for this case.
6. `waypoint` = the polyline's own midpoint by arc length. `trace.tsx:511`
   already does exactly this for `elbow` ("the middle of the polyline"); reuse
   that, do not invent a second rule. If a shared helper does not exist yet,
   extract one and have the elbow branch call it too.

`bends` is ignored by `slanted` and `curved`. Not an error, not a warning —
ignored, and said so in the type's doc comment.

## D3 · `traceHandles` — pure, in `src/components/trace.handles.ts`

```ts
export type TraceHandleKind = "terminal" | "bend" | "virtual";

export interface TraceHandle {
  /** "start" | "end" | `bend:${i}` | `virtual:${i}` */
  id: string;
  kind: TraceHandleKind;
  x: number;
  y: number;
  /** bend: its index in `bends`. virtual: the index a NEW bend would take. */
  index: number;
}

export function traceHandles(
  points: readonly Point[],
  options?: { minVirtualSegmentPx?: number },
): TraceHandle[];
```

Given the resolved polyline `[start, ...bends, end]`:

- `start` / `end` — `terminal`, at `points[0]` and `points.at(-1)`.
- `bend:i` — at each interior vertex.
- `virtual:i` — at the **midpoint of each segment**, `i` being the index the new
  bend would occupy. This is the donor's `grow:` model
  (`ConnectionShapeUtil.tsx:556-631`) and is exactly what Zach's screenshots
  show: small dots between the fat ones.
- A segment shorter than `minVirtualSegmentPx` (default **24**) gets **no**
  virtual handle. Donor's reason, unchanged: "a stubby end segment leaves no
  room between the port and the first corner; a handle there would overlap the
  port dot."

Pure function, no React, no DOM. It is where the unit tests live.

## D4 · `TraceEditor` — `src/components/traceEditor.tsx`

The one component that owns pointers. `Trace` itself stays props-in/DOM-out;
this wraps it. (Repo CLAUDE.md's core rule is about `packages/bbox-ui`, but the
split is worth keeping here anyway — it is what makes D3 testable without a
browser.)

```ts
export interface TraceEditorProps
  extends Omit<TraceRouteProps, "bends" | "onGeometry"> {
  /** Controlled. Omit and pass `defaultBends` for uncontrolled. */
  bends?: readonly TraceBend[];
  defaultBends?: readonly TraceBend[];
  onBendsChange?(bends: TraceBend[]): void;
  /** Controlled terminals; omit for uncontrolled (seeded from from/to). */
  onTerminalsChange?(next: { from: TraceTerminalSpec; to: TraceTerminalSpec }): void;
  /** Terminals become undraggable. Default false — Zach: "in the full case
   *  we can also move the start and end points". A trace welded to a real
   *  Port passes true. */
  lockEndpoints?: boolean;
  /** Interior control points become undraggable (read-only display). */
  lockBends?: boolean;
  /** Force handles on/off; omit for the hover-or-selected policy. */
  revealed?: boolean;
  handleRadius?: number;      // default 4 (bend) / 3 (virtual)
  onGeometry?: TraceRouteProps["onGeometry"];
}
```

### Reveal policy

`active = revealed ?? (hovered || selected)`.

- **hovered** — pointer within the trace's hit area. `Trace` already ships
  `TRACE_HIT_STROKE_PX = 12` and an `interactive` prop; use that hit path, do
  not invent a second one.
- **selected** — set on pointer-down on the trace, cleared by `Escape` or a
  pointer-down that lands on neither the trace nor a handle.

Donor equivalent: `connectorControlVisibility.ts`'s padded-rectangle test. The
padded rectangle is a *tldraw-zoom* concern (it exists so the target stays 24
screen px at any zoom); a Storybook gallery has no zoom, so the hit stroke is
the honest simplification. Say that in the comment so a reader does not think
the rectangle was missed.

When `active`, **every** handle shows — terminals and interior together. One
rule. The donor splits them (terminals always, interior gated) because a tldraw
selection is a different thing from proximity; here it is not, and two policies
would be ceremony.

### Drag

Pointer-down on a handle: `setPointerCapture`, `preventDefault`, stop
propagation so it does not also select.

- **`bend:i`** → replace `bends[i]` with `traceBendFrom(cursor, start, end)`.
- **`virtual:i`** → on the first `pointermove` of the gesture, *insert* a new
  bend at index `i`; every later move of the **same gesture** updates that same
  bend. Capture the base array once at pointer-down and re-apply against it.
  This is the donor's `activeRailDrag` rule verbatim
  (`ConnectionShapeUtil.tsx`): "one drag grows exactly one rail and keeps
  adjusting it, rather than inserting a fresh rail on every pointer move." Get
  this wrong and a single drag inserts forty bends.
- **`start` / `end`** → move the terminal, unless `lockEndpoints`. `dir` is
  preserved; only `x`/`y` move.
- **pointer-up** → collapse: drop any bend now within
  `TRACE_BEND_COLLAPSE_PX` (**4**) of the straight segment joining its two
  neighbours. This is the inverse gesture and therefore how a bend is deleted —
  drag it back onto the line and it is gone. Mirrors the donor's `simplify`
  (`elbowAuthoredRoute.ts:124`).
- **double-click a `bend:i`** → remove it outright.

Cursor `grab`, `grabbing` while dragging. `touch-action: none` on the handles.

### Coordinates

The story renders inside an `<svg>`. Convert client → local with the svg root's
`getScreenCTM().inverse()` and a `DOMPoint`. **Do not** assume 1 CSS px = 1 user
unit and do not subtract `getBoundingClientRect()` — a `viewBox` that does not
match the pixel size will make every drag drift, and the galleries do use
`viewBox`.

## D5 · Stories — `src/stories/TraceInteractive.stories.tsx`

Title `Trace/Interactive` (the folders landed in `7aa8af6`).

1. **`StraightWithBends`** — the hero. One wide trace, starts with zero bends.
   Caption states the gesture: drag the small dot at a segment's middle to add a
   corner; drag a corner back onto the line to remove it.
2. **`ManyBends`** — seeded with three bends, proving N is not 1.
3. **`LockedEndpoints`** — `lockEndpoints`, with a caption saying why (the
   terminals are a Port's, not yours).
4. **`AllRoutings`** — one interactive row per routing
   (`straight`, `slanted`, `curved`, `elbow`) so the static gallery becomes a
   live one. This is the story Zach asked for by name: "right now the galleries
   are like static, but now this can make it interactive so we can see how it
   works." `slanted`/`curved`/`elbow` show terminal handles only (they have no
   `bends`); that is truthful, not a gap — caption it.
5. **`AddAndRemove`** — carries the measured play function (A7/A8 below).

Every story keeps this repo's gallery idiom: several variants visible at once,
each captioned with what it proves.

---

## Acceptance criteria — FIXED

These were written before dispatch and are **not** the implementing lane's to
edit, soften, or reinterpret. A criterion that looks impossible to satisfy is a
bug in the implementation or a genuine blocker to report — never a reason to
weaken the assertion. (This repo has already shipped one lane that rewrote a
failing assertion to match a bug and wrote a comment justifying it.)

| # | Claim | How it is measured |
|---|---|---|
| A1 | A bent straight is a polyline | `routeTrace("straight", A, B, {bends:[{t:.5,o:40}]})` → `points` is non-null, `points.length === 3`, and `/[QCSTA]/.test(path) === false` |
| A2 | Its `d` is exactly the polyline | `path === polylinePath(points)` |
| A3 | The legacy single control point still works, and now draws straight | `routeTrace("straight", A, B, {curve:{dx:0,dy:40}})` → `points.length === 3`, `points[1]` within 0.01px of `getCurveWaypoint(A,B,curve)`, no `Q` in `path` |
| A4 | `curved` is untouched | `routeTrace("curved", A, B, {curve}).path` still contains `Q` and `points` is still `null` |
| A5 | Bends are chord-relative | With `bends:[{t:.25,o:30}]`, doubling the chord length doubles \|bend − start\| along the chord, and the perpendicular offset stays 30px |
| A6 | Handle derivation | `traceHandles` on a 3-vertex polyline (segments ≥ 24px) returns exactly 2 `terminal` + 1 `bend` + 2 `virtual`, the virtuals at the two segment midpoints |
| A7 | One drag adds exactly one bend | In `AddAndRemove`: pointer-down on the virtual handle, 3 `pointermove`s, pointer-up → the mounted `<path>`'s `d` has exactly **2** `L` commands (3 vertices). Count the commands in `d`; DOM presence of a dot proves nothing |
| A8 | Dragging a bend back onto the chord removes it | Same story, then drag that bend to within 2px of the chord → `d` has exactly **1** `L` |
| A9 | `lockEndpoints` holds | A full pointer drag on the `start` handle leaves the `M` coordinates of `d` byte-identical |
| A10 | Nothing else regressed | `pnpm test-stories` and `pnpm exec vitest --project=unit run` both green; counts ≥ 104 story and 149 unit |

**Non-vacuity is part of the deliverable.** For A7, A8 and A9, break the
implementation on purpose, paste the failing output into the report, revert, and
show it green. A gate nobody has seen fail is not a gate — that is exactly how
`storyRenders[].reportedException` cost this repo hours.

---

## The one pre-authorized test edit

`TraceRouting.stories.tsx:647-665` currently asserts **the behaviour being
changed**:

```ts
await expect(routeTrace("straight", A, B, { curve: bend }).path).toBe(
  routeTrace("curved",   A, B, { curve: bend }).path,
);
await expect(straightBent.getAttribute("d")).toBe(curvedBent.getAttribute("d"));
await expect(routeTrace("straight", A, B, { curve: bend }).points).toBeNull();
```

It will fail, and it *should* — it encodes the donor behaviour Zach overruled.
Invert it: the two `d`s now **differ**, the straight one has no `Q`, and its
`points` is non-null. Update the surrounding captions (`:539`, `:562`, `:571`,
and `TracePolarity.stories.tsx:1114` "becomes THE curve — same bentCurvedPath
call") to state the new truth and why it diverges from the donor.

**This is the only assertion authorized to change.** Any other red test is a bug
in the new code. If a second one genuinely encodes the old behaviour, stop and
report it rather than editing it.

## Do not touch

`src/components/elbow/**` (verbatim port, attribution guarded by
`provenance.test.ts`) · `trace.tidy.ts` · `traceBadge.tsx` · `blockPort.tsx` ·
`portEdge*` · `block.tsx` · `bar.tsx` · `vitest.config.ts` · `.storybook/**` ·
`routeTrace`'s `curved` and `slanted` branches · any story file other than
`TraceRouting.stories.tsx`, `TracePolarity.stories.tsx`, and the new
`TraceInteractive.stories.tsx`.
