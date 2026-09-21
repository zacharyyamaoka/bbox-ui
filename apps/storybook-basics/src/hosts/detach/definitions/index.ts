/**
 * src/hosts/detach/definitions/index.ts — the one place a new detachable
 * scene-node KIND is registered.
 *
 * Note the division of labour after RULING 5, because the two registries
 * answer different questions and it is easy to reach for the wrong one:
 *   - THIS registry answers "which scene nodes can be detached at all"
 *     (`matches` + the record to stamp). A kind no longer carries a
 *     lowering — `../lowerSceneNode.ts` is shared.
 *   - `../primitives/index.ts` answers "what does each PART turn into".
 *     That is where a component's detach rule goes, and adding one there
 *     upgrades every composite at once.
 *
 * So the historical reason this file listed `glyph`/`code`/`value` as owed
 * work — each meant another bespoke DOM walk — is gone; what those node
 * types still need is a `matches` predicate each, plus a primitive rule for
 * whatever they paint that `../primitives/` does not cover yet.
 */
import type { DetachableKind } from "../detachableKind";
import { blockDetachableKind } from "./block";

export const DETACHABLE_KINDS: readonly DetachableKind[] = [blockDetachableKind];

export { blockDetachableKind } from "./block";
