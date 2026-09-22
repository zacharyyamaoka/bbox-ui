/**
 * src/hosts/hostOutline.ts — "what will outline blue inside a host?", as ONE
 * function over the real element stack under a point.
 *
 * Zach, 2026-09-22: "How can I demonstrate in DOM what the hover regions are??
 * like what will outline blue inside the hosts? I feel that would be useful to
 * see?" This file is the answer's engine; `HitRegionsHostOutline.stories.tsx`
 * is its face.
 *
 * WHY it lives in `hosts/` and not beside the other hit-region stories in
 * `components/hitRegions/`: which element a host OUTLINES is interaction
 * geometry — the element-under-the-pointer walk, the ownership lookup, what a
 * press falls through to — and `CLAUDE.md`'s core rule is that interaction
 * geometry is host-owned and never travels. `hosts/` may import the kit;
 * `components/` never imports a host. So the rule lives with the hosts, the
 * story beside it, and its title files it into the SAME "Hit Regions" group.
 *
 * NOTHING HERE IS A NEW RULE. Each branch below is a rule a host already runs,
 * reused rather than restated, and the `rule` string it returns names where:
 *
 *   1. The browser's own hit test decides what is under the point
 *      (`document.elementsFromPoint`) — the same test a real press takes, so a
 *      `pointer-events: none` box (a rail's empty margin, `blockPort.tsx`'s
 *      rail wrapper) passes through here exactly as it does under a mouse.
 *   2. A cable is its own hit corridor: `trace.tsx`'s `interactive` hit path
 *      (`data-slot="trace-hit"`, `TRACE_HIT_STROKE_PX`).
 *   3. Everything else resolves through `dragPolicy.ts`'s `resolveGrab` —
 *      nearest declaration wins — over a chain walked from the hit element
 *      out to the nearest `[data-block-id]`, the same ownership walk
 *      `apps/systemsketch/src/shapes/shared/pointerOwnership.ts` and
 *      `tldrawHost.tsx`'s `contentOwnsPress` make. The declaration is picked
 *      from the owner's own `data-view` (`block:expanded` vs `block:solid`,
 *      the same read `pointerOwnership.ts`'s `bodyIsContent` makes).
 *        - `grab`  → the host outlines the OWNER node's box. A region's corner
 *          card carries the REGION's id (`region.tsx`'s header: "a region is
 *          ONE node"), so the owner is the region and the outline is the whole
 *          frame — Zach's rule for the app, and the trunk's by construction.
 *        - `owns-pointer` → the host stays out; the subtree paints its own
 *          hover. `POLICY_TABLE`'s hover row says what that is: "the subtree's
 *          own hover (caret, dot halo)". For a dot, that is its halo.
 *        - `inert` → the press falls THROUGH (an expanded block's interior is
 *          child canvas), so the walk moves on to the next element in the
 *          stack that is not inside the inert owner.
 *   4. `button` and `.nodrag` narrow a subtree to `owns-pointer`
 *      (`grabChain.ts`'s `OWNS_POINTER_CLASS`; `tldrawHost.tsx`'s
 *      `contentOwnsPress` button rule for a region's fold chevron).
 *
 * THE ONE PART THAT IS A MIRROR, NOT A REUSE — stated so nobody mistakes it
 * for shared code: a region FRAME's own surface. The trunk has no
 * `DragDeclaration` for a region, and the rule the app runs lives in
 * `apps/systemsketch/src/shapes/region/RegionShapeUtil.tsx`'s `getGeometry`
 * (title strip + arm headers are `isLabel` chrome, the body is unfilled),
 * which the trunk cannot import. `REGION_FRAME_DECLARATION` below restates it
 * in `DragDeclaration` form, and the story labels it as a mirror.
 */

import {
  DRAG_DECLARATIONS,
  POLICY_TABLE,
  resolveGrab,
  type DragDeclaration,
  type GrabChainLink,
  type GrabRole,
} from "../scene/interactions/dragPolicy";
import { OWNS_POINTER_CLASS } from "./grabChain";

/**
 * A region frame's own surface, restated from the app (see the header): the
 * arm header rows grab the region, the body is see-through. A MIRROR of
 * `RegionShapeUtil.getGeometry`, not an import of it.
 */
export const REGION_FRAME_DECLARATION: DragDeclaration = {
  component: "Region frame (mirror of apps/systemsketch RegionShapeUtil.getGeometry)",
  face: "inert",
  parts: {
    "region-arm-header": "grab",
    "region-tab": "grab",
  },
};

const DECLARATIONS: Readonly<Record<string, DragDeclaration>> = { ...DRAG_DECLARATIONS, region: REGION_FRAME_DECLARATION };

/** What a host would outline for one point. */
export type HostOutlineKind =
  /** A node's own box (a block, a member). */
  | "node"
  /** A whole region frame — reached from its corner card or its chrome. */
  | "region"
  /** A port dot's halo — the dot owns the pointer. */
  | "port"
  /** Some other pointer-owning subtree (a chevron, a rail card, an editor). */
  | "owned"
  /** A cable's hit corridor. */
  | "cable"
  /** Nothing: the point falls through to the bare canvas. */
  | "none";

export interface HostOutline {
  kind: HostOutlineKind;
  /** The element whose box (or, for a cable, whose path) the host outlines.
   *  `null` for `none`. */
  target: Element | null;
  /** Who owns the pointer, in words, for the caption. */
  owner: string;
  /** The rule that decided, and where it lives. */
  rule: string;
  /** The resolved role, when `resolveGrab` was asked. */
  role: GrabRole | null;
}

const NONE: HostOutline = {
  kind: "none",
  target: null,
  owner: "the canvas",
  rule: "nothing under the point claims it — the browser's hit test lands on the bare canvas",
  role: null,
};

/** The declaring root a walk stops at, and the declaration it carries. */
function declarationOf(el: Element): string | undefined {
  if (el.hasAttribute("data-block-id")) return el.getAttribute("data-view") === "expanded" ? "block:expanded" : "block:solid";
  if (el.getAttribute("data-slot") === "region-frame") return "region";
  return undefined;
}

/** The element the owner's id names as a NODE: a region's frame when that id
 *  is a region (its corner card carries the region's id), else the owner. */
function nodeBoxOf(owner: Element, scope: ParentNode): { target: Element; kind: "node" | "region" } {
  const id = owner.getAttribute("data-block-id") ?? owner.getAttribute("data-region-id");
  const frame = id ? scope.querySelector(`[data-slot="region-frame"][data-region-id="${CSS.escape(id)}"]`) : null;
  return frame ? { target: frame, kind: "region" } : { target: owner, kind: "node" };
}

/**
 * Walk one hit element out to its declaring root and resolve it. Returns
 * `{ inert: owner }` when the answer is "falls through", so the caller can
 * move on down the stack.
 */
function resolveElement(hit: Element, boundary: Element, scope: ParentNode): HostOutline | { inert: Element } | null {
  const trace = hit.closest('[data-slot="trace-hit"]');
  if (trace && boundary.contains(trace)) {
    const wire = trace.closest("[data-wire-id]")?.getAttribute("data-wire-id") ?? "a cable";
    return {
      kind: "cable",
      target: trace,
      owner: `cable ${wire}`,
      rule: "trace.tsx `interactive` hit path — the corridor IS the target (TRACE_HIT_STROKE_PX)",
      role: "owns-pointer",
    };
  }

  const chain: GrabChainLink[] = [];
  let owner: Element | null = null;
  let narrowedBy: Element | null = null;
  for (let cur: Element | null = hit; cur && cur !== boundary; cur = cur.parentElement) {
    const owns = cur.tagName === "BUTTON" || cur.classList.contains(OWNS_POINTER_CLASS);
    if (owns && !narrowedBy) narrowedBy = cur;
    const declares = declarationOf(cur);
    chain.push({ slot: cur.getAttribute("data-slot") ?? undefined, declares, narrow: owns ? "owns-pointer" : undefined });
    if (declares) {
      owner = cur;
      break;
    }
  }
  if (!owner) return null;

  const resolution = resolveGrab(chain, DECLARATIONS);
  const ownerName = owner.getAttribute("data-block-id") ?? owner.getAttribute("data-region-id") ?? "?";

  if (resolution.role === "inert") return { inert: owner };

  if (resolution.role === "owns-pointer") {
    const dot = hit.closest('[data-slot="port-dot"]');
    if (dot && owner.contains(dot)) {
      const port = dot.closest("[data-port-id]")?.getAttribute("data-port-id") ?? "?";
      return {
        kind: "port",
        target: dot.querySelector('[data-slot="port-dot-halo"]') ?? dot,
        owner: `port ${ownerName}/${port}`,
        // Honest about the one host that disagrees today: tldraw hovers by
        // SHAPE geometry, not by DOM ownership, so apps/systemsketch also
        // paints the block's blue indicator while the dot's own halo shows
        // (measured 2026-09-22, hovering a For Loop's `Iterable` dot).
        rule: `dragPolicy \`${resolution.via}\` → owns-pointer; POLICY_TABLE hover: "${POLICY_TABLE[0].onOwned}" — POLICY: the tldraw app today ALSO outlines the block here`,
        role: resolution.role,
      };
    }
    // A rail press belongs to the one CARD under it (dnd-kit's sortable), not
    // to the whole 56px rail box — which is mostly the empty margin a press
    // passes through (`blockPort.tsx`'s rail `pointer-events: none`).
    const railCard = hit.closest('[data-slot="port-edge-card"]');
    const slotted = resolution.via !== "face" ? hit.closest(`[data-slot="${resolution.via}"]`) : null;
    const target = narrowedBy ?? railCard ?? slotted ?? hit;
    return {
      kind: "owned",
      target,
      owner: `${target.getAttribute("data-slot") ?? target.tagName.toLowerCase()} inside ${ownerName}`,
      rule: narrowedBy
        ? "a button / `.nodrag` subtree owns its press (tldrawHost.tsx contentOwnsPress, grabChain.ts OWNS_POINTER_CLASS)"
        : `dragPolicy \`${resolution.via}\` → owns-pointer: the host stays out`,
      role: resolution.role,
    };
  }

  const box = nodeBoxOf(owner, scope);
  const viaCard = box.kind === "region" && owner.hasAttribute("data-block-id");
  return {
    kind: box.kind,
    target: box.target,
    owner: box.kind === "region" ? `region ${ownerName}${viaCard ? " (via its corner card)" : ""}` : `node ${ownerName}`,
    rule:
      box.kind === "region"
        ? viaCard
          ? "the corner card carries the REGION's id — a region is ONE node (region.tsx), so the whole frame outlines (the app matches: cornerBlock.ts redirects SELECTING the card to its region, regionHoverIndicator.ts paints its HOVER on the frame)"
          : "region chrome grabs the region (MIRROR of apps/systemsketch RegionShapeUtil.getGeometry — the trunk has no region DragDeclaration)"
        : `dragPolicy \`${resolution.owner}\` \`${resolution.via}\` → grab; the nearest [data-block-id] owns it (pointerOwnership.ts)`,
    role: resolution.role,
  };
}

/**
 * The whole question for one screen point: what would a host outline?
 *
 * `boundary` is the host root; nothing outside it is ever an answer, and
 * reaching it means "the canvas". `scope` is where a region's frame is looked
 * up by id (defaults to `boundary`).
 */
export function hostOutlineAt(x: number, y: number, boundary: Element, scope: ParentNode = boundary): HostOutline {
  const stack = document.elementsFromPoint(x, y).filter((el) => boundary.contains(el) && el !== boundary);
  const skipped: Element[] = [];
  for (const el of stack) {
    if (skipped.some((inert) => inert.contains(el))) continue;
    const answer = resolveElement(el, boundary, scope);
    if (answer === null) continue;
    if ("inert" in answer) {
      skipped.push(answer.inert);
      continue;
    }
    if (skipped.length > 0) answer.rule += " — reached THROUGH an inert interior (dragPolicy `inert`: falls through)";
    return answer;
  }
  if (skipped.length > 0) {
    const inert = skipped[0];
    const name = inert.getAttribute("data-block-id") ?? inert.getAttribute("data-region-id") ?? "?";
    return {
      ...NONE,
      rule: `${name}'s interior is inert (dragPolicy: an expanded interior / region body is child canvas) — the press falls through to the bare canvas`,
      role: "inert",
    };
  }
  return NONE;
}
