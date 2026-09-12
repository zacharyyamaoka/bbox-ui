/**
 * The bench: which components exist, how each renders a preview, what a fresh
 * instance holds, and what "randomise" is allowed to write.
 *
 * WHY it lives in the package and not in an app: the Vite demo and the
 * bbox-ui.com create page both need exactly this, and a second copy would
 * drift the first time a component was added to one of them. Adding a ninth
 * component stays one import and one `registerComponent` call, in one file.
 */
import type { CSSProperties, ReactNode } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import {
  Bar,
  BAR_FIELDS,
  BAR_PRESETS,
  Block,
  BLOCK_FIELDS,
  BLOCK_PRESETS,
  BLOCK_RADIUS_DEFAULT,
  Flex,
  FLEX_FIELDS,
  FLEX_PRESETS,
  Glyph,
  GLYPH_FIELDS,
  GLYPH_PRESETS,
  Pill,
  pillResolutionSubject,
  PILL_FIELDS,
  PILL_PRESETS,
  Port,
  PORT_FIELDS,
  PORT_PRESETS,
  PortEdge,
  PORT_EDGE_FIELDS,
  PORT_EDGE_PRESETS,
  Stack,
  STACK_FIELDS,
  STACK_PRESETS,
  TextBox,
  TEXT_BOX_FIELDS,
  TEXT_BOX_PRESETS,
  DEFAULT_ARRANGEMENT,
  evenT,
  groupSlots,
  laneOrder,
  type AppearanceState,
  type Tone,
  type Lens,
  type Arrangement,
  type Placement,
  type Placements,
  type PortEdgeId,
} from "@bbox-ui/core";
import { registerComponent, type ComponentEntry, type RenderContext, type SlotSpec } from "./registerComponent";
import type { Subject } from "./fieldModel";
import type { MembersSpec } from "./members/contract";
import { PortLane } from "./portDnd";

/**
 * Which components hold others, and what. `accepts` is closed on purpose:
 * a PortEdge is a lane of Ports and nothing else; a Stack is a column of
 * block-shaped things; a Block's body takes one layout container or a few
 * leaves; a Flex takes leaves and Flexes. Widening a set is a one-line edit
 * here, and the Members control offers exactly this list.
 */
const LEAVES = ["Port", "Pill", "Glyph", "TextBox"];
export const MEMBER_SPECS: Record<string, MembersSpec> = {
  Stack: { accepts: ["Block", "Stack", "Flex", ...LEAVES] },
  PortEdge: { accepts: ["Port"], label: "Ports" },
  Flex: { accepts: [...LEAVES, "Flex", "Block"] },
  // Zach, 2026-09-12: "a Block owns its Ports (they are its members)" —
  // IN ADDITION to the slot fills a Block already carries (BLOCK_SLOTS).
  // A Block's `members` list is deliberately unbounded in ACCEPTS-type
  // terms (only Port), not in count: slot fills stay first (written at
  // creation, see `makeInstanceWithSlots`), ports are appended after by
  // the ordinary `addMember` path.
  Block: { accepts: ["Port"], label: "Ports" },
};

/**
 * The Block's anatomy, regrouped 2026-09-11 evening: header · body ·
 * footer. Header and footer are the same component, Bar ("they are
 * basically the exact same, we will fill them differently"), each with
 * three slots of its own (left · center · right, filled by Flex); the body
 * is a Flex column that holds rows. Slots nest: a fill that has slots
 * brings its own fills, so a Block arrives as 1 + 2 Bars + 6 Flexes + 1
 * body Flex = 10 instances, and the navigator reads Block › Header ›
 * Header · left …
 */
const cell = (side: "left" | "center" | "right"): SlotSpec => ({
  id: side,
  label: side[0]!.toUpperCase() + side.slice(1),
  region: side,
  fill: "Flex",
  fillProps: { justify: side === "left" ? "start" : side === "right" ? "end" : "center", gap: 6 },
});
export const BAR_SLOTS: SlotSpec[] = [cell("left"), cell("center"), cell("right")];
export const BLOCK_SLOTS: SlotSpec[] = [
  { id: "header", label: "Header", region: "header", fill: "Bar" },
  { id: "body", label: "Body", region: "body", fill: "Flex", fillProps: { direction: "column", align: "stretch", gap: 6 }, accepts: ["Flex"] },
  { id: "footer", label: "Footer", region: "footer", fill: "Bar" },
];

interface BlockRenderProps {
  width?: number;
  height?: number;
  radius?: number;
}

function stackMember(label: string): ReactNode {
  return (
    <div key={label} style={{ border: "2px solid currentColor", padding: "8px 12px", whiteSpace: "nowrap" }}>
      {label}
    </div>
  );
}

function threePorts(): ReactNode {
  return (
    <>
      <Port key="a" state="empty">
        alpha
      </Port>
      <Port key="b" state="wired">
        beta
      </Port>
      <Port key="c" state="received">
        gamma
      </Port>
    </>
  );
}

/**
 * A band wide/tall enough to hold a Port dot (max 18px, `lg`) plus its hit
 * halo without the lane reading as a bare sliver. Not a Port constant of
 * its own — a lane is a layout fact about the Block, not the Port.
 */
const LANE_BAND_PX = 26;

/**
 * One of the four PortEdge lanes, absolutely positioned on the Block's
 * outline so the dots sit ON its border line: `top`/`bottom` are
 * siblings of the header/body/footer, inset from the corners by the
 * Block's own radius; `left`/`right` are children of the body wrapper
 * (see `renderBlock`), which — because `Block` itself carries no padding
 * here — spans EXACTLY from the header's bottom edge to the footer's top
 * edge, so `top: 0; bottom: 0` on them is already "below the header,
 * above the footer" with no header/footer height to read.
 *
 * Which ports land here, in what order, and — in custom mode — at what
 * `t`, all come from the model (`laneOrder`, which itself resolves each
 * placement's `drawnEdge` — a port whose stored edge is off in this
 * Arrangement parks here if this is the nearest live edge walking
 * clockwise, per `portPlacement.ts`). Auto mode hands spacing to
 * `PortEdge`'s own flex (`layout="evenly"`) rather than reading `t` at
 * all — Zach's ruling that auto's `t` is a cache, not a truth to render
 * from.
 */
function renderLane(
  blockId: string,
  edge: PortEdgeId,
  arrangement: Arrangement,
  placements: Placements,
  members: Record<string, ReactNode>,
  locked: Set<string>,
  radius: number,
): ReactNode {
  const ids = laneOrder(placements, arrangement, edge).filter((id) => !locked.has(id) && members[id]);
  const idSet = new Set(ids);
  // Zach, 2026-09-12: "when collapsed, a group renders as one card at its
  // first member." `groupSlots` (portPlacement.ts) already computes exactly
  // that clustering — with no grouping set, or an expanded one, it hands
  // back one singleton slot per port, so this is a strict superset of the
  // old per-port render (every existing Block, ungrouped, draws identically)
  // rather than a behaviour change for the common case.
  const slots = groupSlots(placements, arrangement, edge)
    .map((slot) => ({ ...slot, portIds: slot.portIds.filter((id) => idSet.has(id)) }))
    .filter((slot) => slot.portIds.length > 0);
  const horizontal = edge === "top" || edge === "bottom";
  const custom = arrangement.mode === "custom";
  const straddle = -LANE_BAND_PX / 2; // centers the band ON the border line
  const laneStyle: CSSProperties = {
    position: "absolute",
    display: "flex",
    padding: 2,
    ...(horizontal
      ? { [edge]: straddle, left: radius, right: radius, height: LANE_BAND_PX }
      : { [edge]: straddle, top: 0, bottom: 0, width: LANE_BAND_PX }),
  };
  return (
    <PortLane key={edge} blockId={blockId} edge={edge} style={laneStyle}>
      <PortEdge edge={edge} layout={custom ? "custom" : "evenly"} style={{ position: "relative", flex: 1 }}>
        {slots.map((slot) => {
          // The FIRST member is the card; the rest of a collapsed group's
          // members render nothing of their own here (Zach's own words: "a
          // group renders as one card at its first member") — they still
          // exist as real Port instances/placements, just not as a second
          // dot on this lane.
          const headId = slot.portIds[0]!;
          return (
            <span
              key={slot.group}
              data-slot="port-group"
              data-port-id={headId}
              data-group={slot.portIds.length > 1 ? slot.group : undefined}
              data-group-size={slot.portIds.length}
              style={
                custom
                  ? {
                      position: "absolute",
                      ...(horizontal
                        ? { left: `${slot.t * 100}%`, transform: "translateX(-50%)" }
                        : { top: `${slot.t * 100}%`, transform: "translateY(-50%)" }),
                    }
                  : undefined
              }
            >
              {members[headId]}
            </span>
          );
        })}
      </PortEdge>
    </PortLane>
  );
}

/**
 * The slotted Block: a Bar above, the body Flex, a Bar below, plus (Zach,
 * 2026-09-12) four PortEdge lanes drawn on its outline from the
 * arrangement/placement model, and — when one Port is `locked` — the
 * function port pinned at the header's left corner, outside every lane.
 * A hidden Bar renders its marker only, so the region vanishes; the
 * radius clips both bars' corners.
 */
function renderBlock(props: Record<string, unknown>, _children?: ReactNode, ctx?: RenderContext): ReactNode {
  const p = props as BlockRenderProps;
  const radius = p.radius ?? BLOCK_RADIUS_DEFAULT;
  const arrangement = ctx?.arrangement;
  const placements = ctx?.placements;
  const blockId = ctx?.blockId;
  const members = ctx?.members ?? {};
  const lockedIds = ctx?.lockedMemberIds ?? [];
  const locked = new Set(lockedIds);
  const lockedId = lockedIds[0];
  return (
    <Block
      width={p.width}
      height={p.height}
      radius={p.radius}
      className="!justify-start !px-0 !text-left"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0,
        height: p.height && p.height > 0 ? p.height : undefined,
        minHeight: 120,
        maxWidth: "100%",
        // Block's own `overflow: clip` exists so a Bar's line clips at the
        // rounded corner rather than poking past it — but a lane straddles
        // the OUTLINE on purpose (the dot reads as "ON the border", the
        // usual port convention), which clip would cut clean off. Only
        // relaxed when there is something to straddle it with.
        overflow: arrangement && placements ? "visible" : undefined,
      }}
    >
      {ctx?.slots?.header ?? null}
      {lockedId && members[lockedId] && (
        <div
          data-slot="port-locked"
          style={{ position: "absolute", top: 0, left: 0, transform: "translate(-50%, -50%)", zIndex: 2 }}
        >
          {members[lockedId]}
        </div>
      )}
      <div data-slot="block-body" style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", position: "relative" }}>
        {ctx?.slots?.body ?? null}
        {arrangement && placements && blockId && (
          <>
            {renderLane(blockId, "left", arrangement, placements, members, locked, radius)}
            {renderLane(blockId, "right", arrangement, placements, members, locked, radius)}
          </>
        )}
      </div>
      {ctx?.slots?.footer ?? null}
      {arrangement && placements && blockId && (
        <>
          {renderLane(blockId, "top", arrangement, placements, members, locked, radius)}
          {renderLane(blockId, "bottom", arrangement, placements, members, locked, radius)}
        </>
      )}
    </Block>
  );
}

export const REGISTRY: ComponentEntry[] = [
  registerComponent({
    name: "Port",
    fields: PORT_FIELDS,
    presets: PORT_PRESETS,
    render: (props) => <Port {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "Pill",
    fields: PILL_FIELDS,
    presets: PILL_PRESETS,
    // Pill folds `tone` into the override layer before resolving, so the
    // panel has to resolve against the same subject or its trace disagrees
    // with the pixels. Imported, not reimplemented.
    toSubject: pillResolutionSubject,
    render: (props) => <Pill {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "Glyph",
    fields: GLYPH_FIELDS,
    presets: GLYPH_PRESETS,
    render: (props) => <Glyph {...(props as Record<string, never>)} />,
  }),
  registerComponent({
    name: "TextBox",
    fields: TEXT_BOX_FIELDS,
    presets: TEXT_BOX_PRESETS,
    render: (props) => (
      <div style={{ width: 220, border: "1px dashed #ccc" }}>
        <TextBox {...(props as Record<string, never>)} />
      </div>
    ),
  }),
  registerComponent({
    name: "Flex",
    fields: FLEX_FIELDS,
    presets: FLEX_PRESETS,
    members: MEMBER_SPECS.Flex,
    // An empty Flex paints nothing, which on the bench reads as a bug and
    // inside a Block hides the hole entirely. The dashed placeholder is
    // Zach's own sketch — "left slot", "Row 1" — and steps aside the moment
    // a member arrives.
    render: (props, children, ctx) => (
      <Flex {...(props as Record<string, never>)} data-slot-label={ctx?.slotLabel}>
        {children ?? (
          <span
            data-slot="flex-placeholder"
            // A placeholder must never be wider than its slot: inside a
            // narrow parent three "Header · …" labels overlapped each other.
            style={{ display: "inline-flex", alignItems: "center", minHeight: 24, minWidth: 0, maxWidth: "100%", padding: "0 8px", border: "1px dashed currentColor", opacity: 0.45, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", justifyContent: "center", ...(props.direction === "column" ? { alignSelf: "stretch", minHeight: 36 } : {}) }}
          >
            {ctx?.slotLabel ?? "Flex"}
          </span>
        )}
      </Flex>
    ),
  }),
  registerComponent({
    name: "Stack",
    fields: STACK_FIELDS,
    presets: STACK_PRESETS,
    members: MEMBER_SPECS.Stack,
    render: (props, children) => (
      <div style={{ width: 240, border: "1px dashed #ccc" }}>
        <Stack {...(props as Record<string, never>)}>
          {children ?? (
            <>
              {stackMember("Member A")}
              {stackMember("Member B")}
            </>
          )}
        </Stack>
      </div>
    ),
  }),
  registerComponent({
    name: "PortEdge",
    fields: PORT_EDGE_FIELDS,
    presets: PORT_EDGE_PRESETS,
    members: MEMBER_SPECS.PortEdge,
    render: (props, children) => (
      <div style={{ position: "relative", width: 260, height: 160, border: "1px dashed #ccc" }}>
        <PortEdge {...(props as Record<string, never>)}>{children ?? threePorts()}</PortEdge>
      </div>
    ),
  }),
  registerComponent({
    name: "Bar",
    fields: BAR_FIELDS,
    presets: BAR_PRESETS,
    slots: BAR_SLOTS,
    // The edge is not a field: it follows from which slot the Bar fills.
    render: (props, _children, ctx) => (
      <Bar {...(props as Record<string, never>)} edge={ctx?.slotId === "footer" ? "top" : "bottom"} left={ctx?.slots?.left} center={ctx?.slots?.center} right={ctx?.slots?.right} />
    ),
  }),
  registerComponent({
    name: "Block",
    fields: BLOCK_FIELDS,
    presets: BLOCK_PRESETS,
    slots: BLOCK_SLOTS,
    members: MEMBER_SPECS.Block,
    render: renderBlock,
  }),
];

/**
 * Seed props per component, as a LIST of genuinely different variations.
 *
 * WHY a list rather than one instance: the bench's whole purpose is checking
 * what a panel does when a selection disagrees — "it's good being able to
 * check the logic of what happens when you click multiple mixed instances".
 * If instance 2 were a copy of instance 1, nothing would ever read Mixed and
 * the bench would prove nothing. So each variation differs in at least one
 * field the panel actually shows.
 *
 * WHY the bench nonetheless opens with ONE: two instances and a pair of
 * checkboxes on first load reads as a puzzle rather than a primitive —
 * Zach, 2026-09-11: "I kinda wanted to see the primitive in isolation
 * first." Isolation is the default; disagreement is one click away.
 */
export const SEED_VARIANTS: Record<string, Record<string, unknown>[]> = {
  Port: [
    // WHY no `textLayout` on the first three: a Port added into a Block
    // lands on one of its lanes, and the lane cascades the inward layout
    // (label below a top-edge dot, right of a left-edge dot). An own value
    // wins over that cascade — the same trap the size rung hit, where a
    // seeded `size` beat the header's — so a seed carries only what the
    // bench must show. A bare Port's default is "right" regardless.
    { state: "empty", diameter: "md", children: "Port A" },
    { state: "wired", diameter: "md", children: "Port B" },
    { state: "received", diameter: "lg", children: "Port C" },
    { state: "valueSet", diameter: "sm", textLayout: "below", children: "Port D" },
  ],
  Pill: [
    { state: "wired", children: "Wired" },
    { state: "valueSet", children: "Default" },
    { state: "empty", children: "Empty" },
    { state: "outOfFocus", children: "Dimmed" },
  ],
  // WHY the first seed of a sized leaf sets no size: it is the one Add
  // uses, and an own size would beat whatever a header hands down — the
  // cascade must be visible on a freshly added member. The other seeds
  // still disagree, which is what the multi-select bench needs.
  Glyph: [
    { children: "🔍" },
    { size: "lg", children: "⚙️" },
    { size: "md", children: "◆" },
  ],
  TextBox: [
    { children: "Text Box" },
    { size: "lg", children: "Bigger text" },
    { size: "sm", children: "Small print" },
  ],
  Stack: [{}, { gap: "lg" }],
  PortEdge: [{ edge: "left" }, { edge: "right" }, { edge: "top" }],
  Flex: [{}, { justify: "between" }, { direction: "column", align: "stretch" }],
  Bar: [{}, { size: "lg" }, { line: false }],
  Block: [{}, { width: 320 }, { width: 480, height: 260 }],
};

export interface Instance extends Subject {
  /** Which registered component this instance is. Always the active component
   *  in a focused bench; the whole point of the mixed bench is that it varies. */
  type: string;
  /**
   * The ids of the instances this one holds, in order. Only present on an
   * instance whose component declares `members`. A held instance lives in
   * the same bench array as everything else — it just is not top-level —
   * so selecting it puts it in the inspector exactly like any other.
   * See members/model.ts for every derived fact (parent, depth, subtree).
   */
  members?: string[];
  /**
   * Set on an instance that fills one of its parent's slots. Such an
   * instance is created with the parent, cannot be removed, moved or
   * dragged, and prints its slot's label as its title.
   */
  slot?: { id: string; label: string; accepts?: string[] };
  /**
   * A Block's own Arrangements (Zach, 2026-09-12): named states, each with
   * a mode, live edges and an optional grouping set — see
   * `packages/bbox-ui/src/portPlacement.ts`. Present only on a Block;
   * `arrangement` is the id of the one currently active. Both default via
   * `makeInstance` the moment a Block is created, never left undefined for
   * one that exists — `activeArrangement`/`portPlacementsOf` still fall
   * back to `DEFAULT_ARRANGEMENT` for the rare instance built by hand
   * (a test fixture) without them.
   */
  arrangements?: Arrangement[];
  arrangement?: string;
  /**
   * A Port's placement, PER ARRANGEMENT id — never just one, because a
   * Port can be positioned differently in each of its Block's states.
   * Absent (or missing an entry for the active arrangement) is not an
   * error: `portPlacementsOf` fills the gap with `defaultPlacement`
   * without writing anything back.
   */
  placements?: Record<string, Placement>;
  /**
   * The function port: pinned at the Block's header-left corner, order 0,
   * never draggable, at most one per Block (enforced where a placement is
   * written, not here — this is just the stored fact).
   */
  locked?: boolean;
}

export function makeInstance(type: string, index: number, uid: number): Instance {
  const variants = SEED_VARIANTS[type] ?? [{}];
  const base: Instance = {
    id: `${type.toLowerCase()}-${uid}`,
    type,
    props: { ...variants[index % variants.length] },
  };
  // A Block always carries at least its "default" Arrangement — never
  // created bare and backfilled later, so every reader (the renderer, the
  // inspector, `activeArrangement`) can assume a fresh Block already has
  // one instead of special-casing "no arrangements yet".
  if (type === "Block") {
    return { ...base, arrangements: [DEFAULT_ARRANGEMENT], arrangement: DEFAULT_ARRANGEMENT.id };
  }
  return base;
}

/**
 * A fresh instance PLUS the instances that fill its slots, ids drawn from
 * `uid` upward (the caller advances `uid` by the returned length). The
 * first element is the instance itself, its `members` already pointing at
 * the fills in slot order. A component without slots returns one.
 */
export function makeInstanceWithSlots(type: string, index: number, uid: number): Instance[] {
  const self = makeInstance(type, index, uid);
  const slots = REGISTRY.find((e) => e.name === type)?.slots ?? [];
  if (slots.length === 0) return [self];
  let next = uid + 1;
  const fills: Instance[] = [];
  const fillIds: string[] = [];
  for (const slot of slots) {
    // A fill may itself have slots (a Bar's three cells): it brings them.
    const made = makeInstanceWithSlots(slot.fill, 0, next);
    next += made.length;
    const fill: Instance = {
      ...made[0]!,
      props: { ...(slot.fillProps ?? {}) },
      slot: { id: slot.id, label: slot.label, ...(slot.accepts ? { accepts: slot.accepts } : {}) },
    };
    fillIds.push(fill.id);
    fills.push(fill, ...made.slice(1));
  }
  return [{ ...self, members: fillIds }, ...fills];
}

/**
 * The cross-type bench. Zach, 2026-09-11: "a free flowing one where you can
 * add instances of any types of primitives so that you're able to check the
 * logic of what happens when you multiselect on various different types...
 * to see what are the things that you're able to update across all of them."
 */
export const MIXED_BENCH = "Mixed bench";

/**
 * The fields a panel may show when the selection spans several components.
 *
 * Intersection by id is not enough. Two components can both call a field
 * `size` and mean different option sets, and offering one control over both
 * would write a value that is legal for one and nonsense for the other. So a
 * field survives only when its id, kind AND option set all agree; anything
 * that merely shares a name is reported as excluded rather than silently
 * dropped, because "what can I edit across all of these" is the question the
 * bench exists to answer and a quiet omission is a wrong answer to it.
 */
export function sharedFields(entries: ComponentEntry[]): { fields: FieldSpec[]; excluded: string[] } {
  if (entries.length === 0) return { fields: [], excluded: [] };
  const [first, ...rest] = entries;
  const signature = (f: FieldSpec) =>
    `${f.kind}|${(f.options ?? []).map((o) => String(o.value)).join(",")}`;

  const fields: FieldSpec[] = [];
  const excluded: string[] = [];

  for (const field of first.fields) {
    // WHY two separate reasons and not one: "Stack has no State field" and
    // "Glyph's Size means something else" are different facts, and collapsing
    // them into one phrase told the reader the opposite of the truth in the
    // common case. A bench that explains why a field is missing has to
    // explain it correctly or it is worse than saying nothing.
    const absentFrom = rest.filter((e) => !e.fields.some((o) => o.id === field.id));
    const differsOn = rest.filter((e) =>
      e.fields.some((o) => o.id === field.id && signature(o) !== signature(field)),
    );
    if (absentFrom.length === 0 && differsOn.length === 0) fields.push(field);
    else if (differsOn.length > 0)
      excluded.push(`${field.label} (different options on ${differsOn.map((e) => e.name).join(", ")})`);
    else excluded.push(`${field.label} (not on ${absentFrom.map((e) => e.name).join(", ")})`);
  }

  const firstIds = new Set(first.fields.map((f) => f.id));
  const seen = new Set(excluded);
  for (const entry of rest) {
    for (const field of entry.fields) {
      if (firstIds.has(field.id)) continue;
      const line = `${field.label} (only on ${entry.name})`;
      if (!seen.has(line)) {
        seen.add(line);
        excluded.push(line);
      }
    }
  }
  return { fields, excluded };
}

/** The excluded list is for orientation, not for reading end to end — Port and
 *  Pill alone already produce seven entries. Show enough to see the shape. */
export const EXCLUDED_SHOWN = 5;


/** Label words for randomising a text field. Randomising a name to a UUID is
 *  noise; randomising it to a word keeps the preview readable, which is the
 *  point of the button. */
export const RANDOM_WORDS = ["alpha", "beta", "gamma", "delta", "signal", "frame", "pose", "goal", "mask", "tick"];

/**
 * A random legal value for one field, from the field's OWN declaration.
 *
 * WHY it reads the FieldSpec rather than a per-component table: a table would
 * be an eighth place that has to learn about a new component, and would go
 * stale silently the first time an option set changed. The schema already
 * says exactly what is legal here.
 */
export function randomValue(field: FieldSpec, roll: () => number): FieldValue | undefined {
  // A field may opt out (FieldSpec.randomize): host-computed state such as
  // Port's reveal-on-hover made instances vanish from the bench when rolled.
  if (field.randomize === false) return undefined;
  switch (field.kind) {
    case "segments": {
      const options = (field.options ?? []).filter((o) => o.randomize !== false);
      if (options.length === 0) return undefined;
      return options[Math.floor(roll() * options.length)]!.value;
    }
    case "toggle":
      return roll() < 0.5;
    case "number": {
      const min = field.min ?? 0;
      const max = field.max ?? min + 10;
      const step = field.step ?? 1;
      const steps = Math.max(1, Math.round((max - min) / step));
      return Math.round((min + Math.floor(roll() * (steps + 1)) * step) * 1000) / 1000;
    }
    case "text":
      return RANDOM_WORDS[Math.floor(roll() * RANDOM_WORDS.length)]!;
  }
}

/**
 * Every focused bench opens with exactly ONE instance — a primitive in
 * isolation. The mixed bench opens with two DIFFERENT components, because a
 * bench of one type is just the focused view and would say nothing about the
 * cross-type question it exists to answer. Both pieces of an app's state read
 * from this one seed, so a selection can never start out pointing at an
 * instance that is not there.
 */
/**
 * The Block bench's own extra seed (Zach, 2026-09-12): three real Ports —
 * "in", "cfg", "out" — added as members with placements already resolved
 * for the default Arrangement (two on the left, one on the right), so the
 * very first Block on the bench shows lanes with something ON them
 * instead of an empty outline. The `t`s are `evenT`'s own even-spacing
 * values, not guessed — a seed is data the model would have produced
 * itself, never a stale value `refresh()` would immediately overwrite.
 */
function seedBlockPorts(block: Instance, uid: number): { block: Instance; ports: Instance[] } {
  const leftT = evenT(2, DEFAULT_ARRANGEMENT.spacing);
  const rightT = evenT(1, DEFAULT_ARRANGEMENT.spacing);
  const port = (id: string, name: string, edge: PortEdgeId, order: number, t: number): Instance => ({
    id,
    type: "Port",
    props: { children: name, edge, direction: edge === "left" ? "input" : "output" },
    placements: { [DEFAULT_ARRANGEMENT.id]: { edge, order, t } },
  });
  const ports = [
    port(`port-${uid}`, "in", "left", 0, leftT[0]!),
    port(`port-${uid + 1}`, "cfg", "left", 1, leftT[1]!),
    port(`port-${uid + 2}`, "out", "right", 0, rightT[0]!),
  ];
  return { block: { ...block, members: [...(block.members ?? []), ...ports.map((p) => p.id)] }, ports };
}

export const INITIAL_BENCHES: Record<string, Instance[]> = (() => {
  const seeded: Record<string, Instance[]> = {};
  let n = 0;
  for (const entry of REGISTRY) {
    const made = makeInstanceWithSlots(entry.name, 0, n);
    n += made.length;
    if (entry.name === "Block") {
      const { block, ports } = seedBlockPorts(made[0]!, n);
      n += ports.length;
      seeded[entry.name] = [block, ...made.slice(1), ...ports];
      continue;
    }
    seeded[entry.name] = made;
  }
  seeded[MIXED_BENCH] = [makeInstance("Port", 0, n++), makeInstance("Pill", 0, n++)];
  return seeded;
})();

export const INITIAL_UID = Object.values(INITIAL_BENCHES).reduce((n, list) => n + list.length, 0);
