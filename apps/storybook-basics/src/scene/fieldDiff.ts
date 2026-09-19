// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied
// 2026-09-17 from `/home/bam/systemsketch/src/diff/fieldDiff.ts`, 208 lines,
// at revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`).
//
// Zero code edits below this banner — a byte-for-byte copy, including the
// donor's own doc comments. `docs/COMPARISON-VIEW-PLAN.md` §2 classifies this
// module "Ports verbatim": pure, and calls out `classifyPoseChange` (donor
// `:127`) as the detail that must survive — it tells *moved* from *resized*
// by which corner stayed put, with `POSE_EPSILON_PX = 0.5` (donor `:103`)
// treating anything smaller as rounding, not an edit anybody made.
//
// WHY a copy and not a dependency: same reason as `wordDiff.ts` — the core
// imports no canvas engine, and this module imports nothing to begin with.
// Note the module does NOT depend on this app's own `SceneNode` — `PriorPose`
// is `{x,y,w,h}`, a shape our `SceneNode.position` (`{x,y}`, no size) does not
// carry, so `sceneDiff.ts` (this app's re-expression of `compareModel.ts`)
// does not call `classifyPoseChange` today. It is ported anyway because it is
// pure, tested, and a future host that DOES carry node size can call it
// unmodified — porting it now is free and re-deriving it later would not be.
// Tests ported alongside in `wordDiff.test.ts` (the donor combines both
// modules' tests in one file — see that file's own header).
// ============================================================================

/**
 * The before/after pair a primitive carries, and what a changed pose means.
 *
 * The board diff contract already emits exactly what round 2 needs — every
 * `Change` carries `fields: [{ path, before, after }]` — and round 1 simply did
 * not consume it. It kept one coarse `state` enum per primitive plus a single
 * bespoke `stateBefore` string on a port, which is why the only field in the
 * whole product that could render `old → new` was a port's name, and why every
 * other field could do nothing louder than a strike.
 *
 * So a primitive now carries the contract's own triple, unchanged, and the
 * display reads it. A new diffable field costs zero schema.
 *
 * Geometry is deliberately NOT in that array. `x`, `y`, `w`, `h` are numbers
 * whose mark is an outline rather than a word-diff, and stringifying them into
 * the text channel only to parse them back out would be a lie about what kind
 * of thing they are. They ride in `priorPose`.
 */

/** The contract's field triple, carried verbatim. */
export interface FieldDiff {
	/** Which field changed — see `BLOCK_FIELD_PATHS` and friends. */
	readonly path: string
	readonly before: string
	readonly after: string
}

/** Where a Block sat, and how big it was, on the before board. */
export interface PriorPose {
	readonly x: number
	readonly y: number
	readonly w: number
	readonly h: number
}

export const BLOCK_FIELD_PATHS = ['title', 'description', 'blockType'] as const
export const PORT_FIELD_PATHS = ['name', 'type'] as const
export const CABLE_FIELD_PATHS = ['temporal', 'delayValue', 'routing', 'start', 'end'] as const

/**
 * The contract writes a fully-qualified path — `props.inputs[2].name`. The
 * primitive already knows which port it is, so only the leaf matters here, and
 * accepting both spellings means a projector can hand its own paths straight
 * through without a translation table nobody would keep in sync.
 */
export function fieldDiffPath(path: string): string {
	const leaf = path.split('.').pop() ?? path
	return leaf.replace(/\[\d+\]$/, '')
}

export function findFieldDiff(
	diffs: readonly FieldDiff[] | undefined,
	path: string,
): FieldDiff | undefined {
	if (!diffs || diffs.length === 0) return undefined
	return diffs.find((entry) => fieldDiffPath(entry.path) === path)
}

export function hasFieldDiffs(diffs: readonly FieldDiff[] | undefined): boolean {
	return Array.isArray(diffs) && diffs.length > 0
}

/**
 * A port's pairs, with the round-1 field folded in.
 *
 * `stateBefore` said what a row used to be called and nothing else. It is still
 * written by anything that has not been updated, so it is read here as the
 * name pair it always was, rather than being migrated away and breaking every
 * board that already carries one.
 */
export function mergeLegacyNameDiff(
	diffs: readonly FieldDiff[] | undefined,
	stateBefore: string | undefined,
	liveName: string,
): readonly FieldDiff[] {
	const explicit = diffs ?? []
	if (!stateBefore || findFieldDiff(explicit, 'name')) return explicit
	return [...explicit, { path: 'name', before: stateBefore, after: liveName }]
}

/** How far each edge of the box travelled between the two boards. */
export interface PoseEdges {
	readonly left: number
	readonly right: number
	readonly top: number
	readonly bottom: number
}

export type PoseChangeKind = 'none' | 'moved' | 'resized' | 'moved-resized'

export interface PoseChange {
	readonly kind: PoseChangeKind
	readonly edges: PoseEdges
	/** Change in extent. This is what makes `resized` a different fact from `moved`. */
	readonly dw: number
	readonly dh: number
	/** Travel of the centre. This is what makes `moved` a different fact from `resized`. */
	readonly dcx: number
	readonly dcy: number
}

/** Below this a difference is rounding, not an edit anybody made. */
export const POSE_EPSILON_PX = 0.5

/**
 * Long enough that the leader reads as a direction rather than as a stray tick.
 * A pure resize shifts the centre by half the growth, so without this floor a
 * block that only got wider would sprout a leader and read as having moved.
 */
export const POSE_LEADER_MIN_PX = 12

/**
 * Classify a pose change by asking two independent questions.
 *
 * "Did it resize" is easy: did the extent change. "Did it move" is not, because
 * every pose change decomposes into a translation plus a resize in more than
 * one way — dragging a left edge is equally describable as "grew leftward" or
 * as "moved left and grew rightward", and the arithmetic cannot choose.
 *
 * A reader can. A resize is anchored at whichever corner stayed put, and if one
 * did, the card did not go anywhere: dragging the right edge of a card leaves
 * its top-left exactly where it was and nobody would call that a move. So the
 * rule is that a pose change is a MOVE only when no corner survived it. The
 * naive alternative — comparing centres — reports every one-edge resize as a
 * move as well, because growing a card by 60 shifts its centre by 30.
 */
export function classifyPoseChange(prior: PriorPose, live: PriorPose): PoseChange {
	const edges: PoseEdges = {
		left: live.x - prior.x,
		right: (live.x + live.w) - (prior.x + prior.w),
		top: live.y - prior.y,
		bottom: (live.y + live.h) - (prior.y + prior.h),
	}
	const dw = live.w - prior.w
	const dh = live.h - prior.h
	const still = (value: number) => Math.abs(value) <= POSE_EPSILON_PX
	const anchored = (still(edges.left) || still(edges.right))
		&& (still(edges.top) || still(edges.bottom))
	const resized = !still(dw) || !still(dh)
	const moved = !anchored
	const kind: PoseChangeKind = resized && moved
		? 'moved-resized'
		: resized
			? 'resized'
			: moved
				? 'moved'
				: 'none'
	return {
		kind,
		edges,
		dw,
		dh,
		// Reported only for a move, where the four edges agree and the number
		// means something. Under a resize the centre shift is an artefact of
		// which edge was dragged, not a distance anybody moved the card.
		dcx: (edges.left + edges.right) / 2,
		dcy: (edges.top + edges.bottom) / 2,
	}
}

/**
 * Whether the ghost should be joined to the live card by a leader.
 *
 * Only for a move. The leader says "it came from there", which is a claim about
 * travel — and a resize's centre shift is not travel, it is an artefact of
 * which edge was dragged. Reading the distance alone drew a leader on every
 * one-edge resize and made the two findings look like the same finding, which
 * is the exact distinction this vocabulary exists to keep.
 */
export function poseWantsLeader(change: PoseChange): boolean {
	if (change.kind !== 'moved' && change.kind !== 'moved-resized') return false
	return Math.hypot(change.dcx, change.dcy) >= POSE_LEADER_MIN_PX
}

function signed(value: number): string {
	const rounded = Math.round(value)
	return rounded >= 0 ? `+${rounded}` : `−${Math.abs(rounded)}`
}

/**
 * The badge text, in the two nouns the change actually is. A move reports the
 * travel of the whole card; a resize reports the change in extent. A card that
 * did both says both, in that order, because that is the order they happened
 * to the reader's eye.
 */
export function describePoseChange(change: PoseChange): string {
	const parts: string[] = []
	if (change.kind === 'moved' || change.kind === 'moved-resized') {
		parts.push(`↔ ${signed(change.dcx)}, ${signed(change.dcy)}`)
	}
	if (change.kind === 'resized' || change.kind === 'moved-resized') {
		parts.push(`⤢ ${signed(change.dw)}, ${signed(change.dh)}`)
	}
	return parts.join('  ')
}

/**
 * Which edges to draw heavier, so a resize says WHICH way it grew.
 *
 * Only meaningful for a resize: under a pure translation all four edges moved
 * by the same amount and emphasising them would claim an extent change that
 * did not happen.
 */
export function movedEdges(change: PoseChange): readonly (keyof PoseEdges)[] {
	if (change.kind === 'none' || change.kind === 'moved') return []
	return (['left', 'right', 'top', 'bottom'] as const)
		.filter((edge) => Math.abs(change.edges[edge]) > POSE_EPSILON_PX)
}
