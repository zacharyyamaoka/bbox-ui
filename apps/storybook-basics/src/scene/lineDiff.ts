// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied
// 2026-09-17 from `/home/bam/systemsketch/src/compare/lineDiff.ts`, 163
// lines, at revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`).
//
// Zero code edits below this banner — a byte-for-byte copy, including the
// donor's own doc comments. `docs/COMPARISON-VIEW-PLAN.md` §2 classifies this
// module "Ports verbatim", for the raw-evidence tab, and calls out
// `stableJson` (donor `:44`) + LCS + `collapseContext` (donor `:138`) as the
// details that must survive: sorted object keys so store-write order never
// masquerades as a change, and a hunk-style collapse of long unchanged runs.
//
// WHY a copy and not a dependency: same reason as `wordDiff.ts` — the core
// imports no canvas engine, and this module imports nothing to begin with.
// No dedicated donor test file exists for this module (only `wordDiff.ts`
// and `fieldDiff.ts` have one, combined in `wordDiff.test.ts`); it is
// exercised in the donor only indirectly, through the tldraw-bound
// `CodeView.tsx` and `compareModel.test.ts`, neither of which ports. This
// app's own `lineDiff.test.ts` is therefore NOT a donor port — it is written
// fresh here to close that gap, per the task's own note that the plan "did
// not run the donor's own test suites" and left it unverified.
// ============================================================================

/**
 * The Code tab: an ordinary git-style line diff over the raw records.
 *
 * This exists for exactly one reason, and it is Zach's: *"helpful to make sure
 * it's parsing correctly."* The Properties table is an interpretation — it says
 * a port was inserted, a title was renamed. The Code tab is the evidence that
 * interpretation was computed from, in the form every engineer already audits
 * without being taught: red line removed, green line added, unchanged lines as
 * context. If the table and the code ever disagree, the code is right and the
 * projector has a bug.
 *
 * Figma's own Compare panel does the same thing one level up — its Code tab
 * shows the selected layer's CSS with `- background: #FDBEAD;` above
 * `+ background: #FDCAAD;` — and Camunda ships an XML text view beside its
 * visual diff for the same purpose. Raw evidence one click below the meaning,
 * never merged into it.
 *
 * Note the deliberate asymmetry with `wordDiff`: this is a TWO-state diff, and
 * correctly so. Lines have no identity across the two sides, so "line 4 was
 * modified" is not a fact the data supports — it is a rendering of an adjacent
 * remove/add pair. That is the same reason token diffing needs only two states,
 * and the reason object diffing needs three lives in `compareModel.ts`.
 */

export type LineKind = 'context' | 'removed' | 'added'

export interface DiffLine {
	readonly kind: LineKind
	readonly text: string
	/** 1-based line number on the before side, or null for an added line. */
	readonly beforeNumber: number | null
	/** 1-based line number on the after side, or null for a removed line. */
	readonly afterNumber: number | null
}

/**
 * Serialize a record for display with its keys in a stable order.
 *
 * Sorted keys matter more than they look: without them a store that happened
 * to write `type` before `name` on one save produces a diff full of moved
 * lines that mean nothing. The reader must be able to trust that every marked
 * line is a real difference.
 */
export function stableJson(value: unknown): string {
	if (value === null || value === undefined) return ''
	return JSON.stringify(value, sortedReplacer(), 2)
}

function sortedReplacer() {
	return function replacer(this: unknown, _key: string, value: unknown) {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
		const entries = Object.entries(value as Record<string, unknown>)
		entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		return Object.fromEntries(entries)
	}
}

/** Longest common subsequence over whole lines — the alignment `diff` uses. */
function keptLines(before: readonly string[], after: readonly string[]): [boolean[], boolean[]] {
	const rows = before.length
	const columns = after.length
	const lengths: number[][] = Array.from(
		{ length: rows + 1 },
		() => new Array<number>(columns + 1).fill(0),
	)
	for (let i = rows - 1; i >= 0; i -= 1) {
		for (let j = columns - 1; j >= 0; j -= 1) {
			lengths[i][j] = before[i] === after[j]
				? lengths[i + 1][j + 1] + 1
				: Math.max(lengths[i + 1][j], lengths[i][j + 1])
		}
	}
	const inBefore = new Array<boolean>(rows).fill(false)
	const inAfter = new Array<boolean>(columns).fill(false)
	let i = 0
	let j = 0
	while (i < rows && j < columns) {
		if (before[i] === after[j]) {
			inBefore[i] = true
			inAfter[j] = true
			i += 1
			j += 1
		} else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
			i += 1
		} else {
			j += 1
		}
	}
	return [inBefore, inAfter]
}

/**
 * Diff two serialized records into displayable lines.
 *
 * Removed lines are emitted before the added lines they were replaced by, the
 * way `git diff` orders a replacement, so the pair reads top-to-bottom.
 */
export function lineDiff(beforeText: string, afterText: string): DiffLine[] {
	const before = beforeText === '' ? [] : beforeText.split('\n')
	const after = afterText === '' ? [] : afterText.split('\n')
	const [inBefore, inAfter] = keptLines(before, after)

	const lines: DiffLine[] = []
	let i = 0
	let j = 0
	while (i < before.length || j < after.length) {
		if (i < before.length && !inBefore[i]) {
			lines.push({ kind: 'removed', text: before[i], beforeNumber: i + 1, afterNumber: null })
			i += 1
			continue
		}
		if (j < after.length && !inAfter[j]) {
			lines.push({ kind: 'added', text: after[j], beforeNumber: null, afterNumber: j + 1 })
			j += 1
			continue
		}
		if (i < before.length && j < after.length) {
			lines.push({ kind: 'context', text: before[i], beforeNumber: i + 1, afterNumber: j + 1 })
			i += 1
			j += 1
			continue
		}
		break
	}
	return lines
}

/** How many lines of unchanged context to keep either side of a change. */
export const CONTEXT_LINES = 3

/**
 * Collapse long unchanged stretches, the way a diff shows hunks.
 *
 * A record serialized whole is mostly unchanged, and a reader scrolling past
 * forty identical lines to find the one that moved is being asked to do the
 * tool's job. Elided runs are replaced by a single marker line.
 */
export function collapseContext(lines: readonly DiffLine[], context = CONTEXT_LINES): DiffLine[] {
	const keep = new Array<boolean>(lines.length).fill(false)
	lines.forEach((line, index) => {
		if (line.kind === 'context') return
		for (let i = Math.max(0, index - context); i <= Math.min(lines.length - 1, index + context); i += 1) {
			keep[i] = true
		}
	})
	if (!keep.some(Boolean)) return []

	const out: DiffLine[] = []
	let eliding = false
	lines.forEach((line, index) => {
		if (keep[index]) {
			eliding = false
			out.push(line)
			return
		}
		if (eliding) return
		eliding = true
		out.push({ kind: 'context', text: ELISION, beforeNumber: null, afterNumber: null })
	})
	return out
}

export const ELISION = '⋯'
