/**
 * src/interaction/grabChain.ts — the HOST half: read a real DOM press into
 * the pure chain `dragPolicy.ts` reasons about.
 *
 * Everything in this file is interaction geometry and therefore host-owned
 * by `CLAUDE.md`'s core rule — hit-testing, the ancestor walk, the DOM
 * attribute names. None of it travels. The component side is
 * `DRAG_DECLARATIONS`, which is data.
 *
 * WHY the declaration rides on DOM attributes rather than React context:
 * the host that has to honour it is not in the React tree. React Flow's
 * drag filter runs inside d3-drag on a raw `mousedown`
 * (`@xyflow/system@0.0.82/dist/esm/index.mjs:2349-2355`) and tldraw's runs
 * inside its own state chart — neither can read a provider. An attribute on
 * the boundary is the one channel both engines already have, which is the
 * same reason `nodrag` is a class and not a prop.
 */

import { resolveGrab, type GrabChainLink, type GrabResolution, type GrabRole } from "./dragPolicy";

/** The declaring root: `data-drag-owner="block:expanded"`. The walk stops
 *  here, so a member's own declaration shadows its parent's. */
export const OWNER_ATTR = "data-drag-owner";
/** A parent's narrowing for one subtree: `data-drag-narrow="inert"`. */
export const NARROW_ATTR = "data-drag-narrow";

/**
 * React Flow's own veto token, and the only spelling that works with zero
 * adapter code — it is `@xyflow/react`'s default `noDragClassName`
 * (verified in the installed package at
 * `@xyflow/react@12.11.6/dist/esm/index.mjs:3767`), and its drag filter
 * rejects any press whose ancestor chain matches `.nodrag` before the node
 * root (`@xyflow/system@0.0.82/dist/esm/index.mjs:2352`).
 *
 * So `owns-pointer` has a mechanical equivalent on React Flow already, and
 * a component that declares it should ALSO emit this class. Kept here, in
 * the host module, because the spelling belongs to the host.
 */
export const OWNS_POINTER_CLASS = "nodrag";

const ROLES: readonly GrabRole[] = ["grab", "inert", "owns-pointer"];

function narrowOf(el: Element): GrabRole | undefined {
  const raw = el.getAttribute(NARROW_ATTR);
  return raw && (ROLES as readonly string[]).includes(raw) ? (raw as GrabRole) : undefined;
}

/**
 * Walk from `target` outward, stopping at `boundary` (a host node root) or
 * at the first declaring element, whichever comes first.
 *
 * WHY the walk stops at the first declaration instead of collecting every
 * match on the way up: that difference IS the measured bug. React Flow's
 * `hasSelector` keeps walking to the node root and matches the selector
 * anywhere on the chain (`index.mjs:2038-2048`), so a press on a member
 * Block's header satisfies the PARENT's `dragHandle` and drags the parent
 * — measured 2026-09-17, a drag on `kid`'s header moved `proc` by 40.8px.
 * Stopping at the nearest declaration is what makes Zach's "composites get
 * the logic for free" come out correct rather than accidental.
 */
export function grabChainFrom(target: Element | null, boundary?: Element | null): GrabChainLink[] {
  const chain: GrabChainLink[] = [];
  let cur: Element | null = target;
  let guard = 0;
  while (cur && guard++ < 64) {
    const link: GrabChainLink = {
      slot: cur.getAttribute("data-slot") ?? undefined,
      declares: cur.getAttribute(OWNER_ATTR) ?? undefined,
      narrow: narrowOf(cur),
    };
    chain.push(link);
    if (link.declares) break;
    if (boundary && cur === boundary) break;
    cur = cur.parentElement;
  }
  return chain;
}

/** The whole host-side question, in one call. */
export function resolveGrabAt(target: Element | null, boundary?: Element | null): GrabResolution {
  return resolveGrab(grabChainFrom(target, boundary));
}

/**
 * The props a component (or, until the components lane clears, a story
 * wrapper) spreads to declare itself.
 *
 * Emitting BOTH the attribute and the class is deliberate: the attribute is
 * what this policy reads, and the class is what React Flow's stock filter
 * reads with no adapter code at all. A declaration that only this module
 * understands would need the host to run before React Flow's own filter,
 * which it cannot.
 */
export function declareDrag(key: string): { [OWNER_ATTR]: string } {
  return { [OWNER_ATTR]: key };
}

export function declareOwnsPointer(): { className: string; [NARROW_ATTR]: GrabRole } {
  return { className: OWNS_POINTER_CLASS, [NARROW_ATTR]: "owns-pointer" };
}
