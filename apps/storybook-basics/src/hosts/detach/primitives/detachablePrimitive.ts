/**
 * src/hosts/detach/primitives/detachablePrimitive.ts — the contract ONE
 * PRIMITIVE signs: "here is how I lower myself to stock shapes."
 *
 * WHY this layer exists at all (Zach, RULING 5): "by making it work on the
 * basic components a primitive so then it comes for free for the higher
 * level things." Before this file, detach was implemented PER COMPOSITE —
 * `definitions/block.ts` reached into the Block's rendered DOM and hand-
 * enumerated every part it happened to know about (`[data-slot="block"]`,
 * `[data-slot="block-header"]`, then a loop over the scene's own port ids
 * finding `[data-slot="block-port-item"]`). Exactly one part, the port, had
 * been factored out into a reusable emitter. The consequence was that every
 * NEW composite owed a new hand-written lowering, and a part that a
 * composite rendered but its `lowerNode` had not been taught about simply
 * vanished on detach — which is what "BlockMembers is explicitly not lowered
 * here" was, and why Zach's MOC claim ("All components support detach to
 * primative") was not true.
 *
 * The inversion: a PRIMITIVE declares how it reduces itself, keyed by the
 * `data-slot` its component already stamps, and a generic walk
 * (`./lowerSubtree.ts`) dispatches over whatever a composite actually
 * rendered. A composite's lowering is then the walk — it enumerates
 * nothing, so a composite gets every registered primitive inside it for
 * free, at any nesting depth, INCLUDING itself (a Block nested as a member
 * inside another Block lowers through the very same `block` primitive).
 *
 * WHY `data-slot` is the key, and not a React component identity: a
 * component's `data-slot` IS this repo's own published DOM contract — it is
 * what every story, every measurement harness and `blockPort.tsx`'s own
 * band measurement already key off (`../../../components/blockPort.tsx:242`,
 * `:270`). It is also the only handle available at detach time, because by
 * then the component is painted DOM, not a React tree. A primitive that
 * lowers itself is therefore a `data-slot` plus a rule, and nothing in
 * `components/` learns that tldraw exists — the engine-free line
 * (`ARCHITECTURE.md`, "components... imports no canvas engine") holds
 * exactly as before.
 */
import type { Editor, TLShapePartial } from "tldraw";

/** What every primitive's `emit` is handed. `origin` is the element every
 *  emitted box is measured RELATIVE TO — the lowering composite's own
 *  wrapper — so one walk produces one consistent local frame no matter how
 *  deep a primitive sits. */
export interface PrimitiveContext {
  editor: Editor;
  origin: Element;
  /** tldraw's own text measurer, built once per walk
   *  (`../stockShapes.ts`'s `renderedLineMeasureFor`) rather than per
   *  primitive — it allocates a measuring element. */
  measureRendered: (line: string, fontPx: number) => number;
}

export interface DetachablePrimitive {
  /** The `data-slot` value this primitive owns — the component's own DOM
   *  contract. One primitive per slot; `registryOf` refuses a duplicate. */
  readonly slot: string;
  /**
   * Does the walk continue INTO this element's subtree?
   *
   * `false` for a primitive that has already accounted for everything
   * inside it — a port dot owns its halo and core, a text run owns its
   * glyphs. `true` for a primitive that paints its own box and then lets
   * its contents lower themselves, which is what makes a composite's parts
   * free.
   */
  readonly descend: boolean;
  /**
   * Wrap everything this element's subtree produced in its own stock group.
   *
   * Zach's rule for what the detached output should feel like: "unpeel the
   * groups from the top down until you get to the exact grouping you want."
   * A port row is the unit that earns one — its ring and its label move
   * together.
   */
  readonly groupsSubtree: boolean;
  /** The stock shapes this element becomes, in paint order. A purely
   *  structural primitive (one that only groups its children) returns []. */
  emit(context: PrimitiveContext, el: Element): TLShapePartial[];
}

export type PrimitiveRegistry = ReadonlyMap<string, DetachablePrimitive>;

/** Index primitives by slot. Throws on a duplicate slot rather than letting
 *  the later registration silently win — two rules for one `data-slot` is a
 *  registration bug, and it would otherwise show up as a part quietly
 *  changing shape. */
export function registryOf(primitives: readonly DetachablePrimitive[]): PrimitiveRegistry {
  const bySlot = new Map<string, DetachablePrimitive>();
  for (const primitive of primitives) {
    if (bySlot.has(primitive.slot)) {
      throw new Error(`duplicate detach primitive for data-slot="${primitive.slot}"`);
    }
    bySlot.set(primitive.slot, primitive);
  }
  return bySlot;
}
