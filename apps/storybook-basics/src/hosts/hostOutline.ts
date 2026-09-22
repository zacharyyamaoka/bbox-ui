/**
 * src/hosts/hostOutline.ts — "what will outline blue inside a host?", asked
 * of the element stack under a point, ONE HOST AT A TIME.
 *
 * Zach, 2026-09-22: "How can I demonstrate in DOM what the hover regions are??
 * like what will outline blue inside the hosts? I feel that would be useful to
 * see?" This file is the answer's engine; `HitRegionsHostOutline.stories.tsx`
 * is its face.
 *
 * WHY per host, and not one answer (Codex audit, 2026-09-22): the hosts do
 * NOT agree, and an earlier cut of this file synthesised one policy and
 * presented it as what "a host" does. It was wrong for both benches — the
 * trunk's tldraw host hands every non-header block press to the content
 * (`tldrawHost.tsx`'s `contentOwnsPress`), and React Flow starts a node drag
 * only from the node's own stamped header (`reactFlowHost.tsx`'s
 * `DRAG_HANDLE_FOR_TYPE`). So the question is now asked of a named host:
 *
 *   - `hostPressOutlineAt(…, rule)` — a REAL host's own press predicate,
 *     passed in by the story (this file imports no engine; the story, a
 *     consumer, imports the hosts). The rule is the host's exported function,
 *     called on the same element the browser's hit test returns.
 *   - `policyOutlineAt(…)` — the DECLARED policy (`dragPolicy.ts`'s
 *     `resolveGrab`), which no bench fully implements yet. Labelled as the
 *     policy, never as a host.
 *
 * WHY it lives in `hosts/` and not beside the other hit-region stories in
 * `components/hitRegions/`: which element a host OUTLINES is interaction
 * geometry — host-owned by `CLAUDE.md`'s core rule. `hosts/` may import the
 * kit; `components/` never imports a host.
 *
 * THE POLICY PATH, for the record of what it reuses: the browser's own hit
 * test (`document.elementsFromPoint`, so a `pointer-events: none` rail margin
 * passes through exactly as under a mouse); a cable's own hit path
 * (`trace.tsx`'s `interactive` `trace-hit`); `resolveGrab` over a chain walked
 * out to the nearest `[data-block-id]`, with the declaration picked from the
 * owner's `data-view`; `button` / `.nodrag` narrowing to `owns-pointer`. And
 * ONE MIRROR, labelled wherever it answers: a region FRAME's own chrome,
 * restated from `apps/systemsketch/src/shapes/region/RegionShapeUtil.tsx`'s
 * `getGeometry`, which the trunk cannot import (`REGION_FRAME_DECLARATION`).
 * The SystemSketch app's own press rule (`apps/systemsketch/src/shapes/
 * shared/pointerOwnership.ts`) is likewise not importable from the trunk —
 * the app imports the trunk, never the reverse — so it is not offered as a
 * host here.
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
 * The DECLARED POLICY's answer for one screen point (`dragPolicy.ts`) — not
 * any host's. `boundary` is the host root; nothing outside it is ever an
 * answer, and reaching it means "the canvas". `scope` is where a region's
 * frame is looked up by id (defaults to `boundary`).
 */
export function policyOutlineAt(x: number, y: number, boundary: Element, scope: ParentNode = boundary): HostOutline {
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

/* ------------------------------------------------------------------ */
/* A REAL host's press predicate                                        */
/* ------------------------------------------------------------------ */

/** What a host does with a press on one element of one of its nodes. */
export type HostPressAnswer =
  /** The host takes it: select / drag the NODE. */
  | "node"
  /** The content owns it: the host stays out entirely. */
  | "content"
  /** Neither: the host neither drags the node from here nor yields to
   *  content (React Flow off its drag handle). */
  | "none";

/** One host's own predicate, adapted to a single signature by the caller. */
export interface HostPressRule {
  /** Shown in the caption: whose rule this is and where it lives. */
  source: string;
  takes(nodeType: string | undefined, nodeId: string, target: Element): HostPressAnswer;
}

/** The pointer-owning subtree a `content` answer outlines: a dot's halo, a
 *  rail card, a button / `.nodrag` subtree — else the element itself. */
export function contentTargetOf(hit: Element): { target: Element; kind: "port" | "owned" } {
  const dot = hit.closest('[data-slot="port-dot"]');
  if (dot) return { target: dot.querySelector('[data-slot="port-dot-halo"]') ?? dot, kind: "port" };
  return { target: hit.closest(`[data-slot="port-edge-card"], button, .${OWNS_POINTER_CLASS}`) ?? hit, kind: "owned" };
}

/**
 * What `rule`'s host does with a press at one screen point. Every host stamps
 * `data-scene-node` on its node wrapper (`domCanvas.tsx`, `reactFlowHost.tsx`,
 * `tldrawHost.tsx`), which is the id the host's own predicate is called with.
 * `nodeTypeOf` reads the scene record's `type` for that id.
 */
export function hostPressOutlineAt(
  x: number,
  y: number,
  boundary: Element,
  rule: HostPressRule,
  nodeTypeOf: (nodeId: string) => string | undefined,
): HostOutline {
  const hit = document.elementsFromPoint(x, y).find((el) => boundary.contains(el) && el !== boundary);
  if (!hit) return NONE;
  const cable = hit.closest('[data-slot="trace-hit"], .react-flow__edge');
  if (cable && boundary.contains(cable)) {
    return { kind: "cable", target: cable, owner: "a cable", rule: "the host's own edge hit target", role: null };
  }
  const root = hit.closest("[data-scene-node]");
  if (!root || !boundary.contains(root)) return NONE;
  const nodeId = root.getAttribute("data-scene-node") ?? "";
  const nodeType = nodeTypeOf(nodeId);
  const answer = rule.takes(nodeType, nodeId, hit);
  if (answer === "node") {
    const kind = nodeType === "region" ? "region" : "node";
    return { kind, target: root, owner: `${kind} ${nodeId}`, rule: `${rule.source} → the host takes the press`, role: null };
  }
  if (answer === "content") {
    const content = contentTargetOf(hit);
    return {
      kind: content.kind,
      target: content.target,
      owner: `${content.target.getAttribute("data-slot") ?? content.target.tagName.toLowerCase()} inside ${nodeId}`,
      rule: `${rule.source} → content owns the press; the host stays out`,
      role: null,
    };
  }
  return { ...NONE, owner: `nobody (inside ${nodeId})`, rule: `${rule.source} → not a drag surface here` };
}
