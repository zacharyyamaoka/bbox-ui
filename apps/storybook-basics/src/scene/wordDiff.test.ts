// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied
// 2026-09-17 from `/home/bam/systemsketch/src/diff/wordDiff.test.ts`, at
// revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`). Only the two import
// specifiers below are unchanged in substance and identical in spelling —
// `./wordDiff` and `./fieldDiff` resolve to this directory's own siblings
// the same way they resolved to the donor's `src/diff/` siblings, because
// both ported modules land next to this file (`apps/storybook-basics/src/
// scene/`). No other line differs from the donor.
//
// This is the ported half of the task's own "port the tests too" — the
// donor combines `wordDiff.ts` and `fieldDiff.ts` coverage in ONE file, so
// porting it verbatim closes both at once. `lineDiff.ts` has no donor test
// file (verified: only `wordDiff.test.ts` in `src/diff/`, and
// `compareModel.test.ts`/`diffState.test.ts` in `src/diff`/`src/compare`,
// none of which import `lineDiff`) — its coverage is written fresh in this
// app's own `lineDiff.test.ts`, not ported.
//
// Run: `pnpm exec vitest --project=unit run` (node project, no DOM).
// ============================================================================
import { describe, expect, it } from 'vitest'

import {
	WORD_DIFF_TOKEN_LIMIT,
	tokenizeFieldValue,
	wordDiff,
	type DiffToken,
} from './wordDiff'
import {
	classifyPoseChange,
	describePoseChange,
	fieldDiffPath,
	findFieldDiff,
	mergeLegacyNameDiff,
	movedEdges,
	poseWantsLeader,
} from './fieldDiff'

/** The marked runs of one side, as the string a reader would see inked. */
function inked(tokens: readonly DiffToken[]): string {
	return tokens.filter((token) => token.kind !== 'same').map((token) => token.text).join('|')
}

function plain(tokens: readonly DiffToken[]): string {
	return tokens.map((token) => token.text).join('')
}

describe('tokenizing a field value', () => {
	it('keeps separators, so `a.b` cannot align with `ab`', () => {
		expect(tokenizeFieldValue('a.b')).toEqual(['a', '.', 'b'])
		expect(tokenizeFieldValue('run_inference')).toEqual(['run', '_', 'inference'])
	})

	it('splits at the humps a reader sees, and nowhere else', () => {
		expect(tokenizeFieldValue('runInference')).toEqual(['run', 'Inference'])
		expect(tokenizeFieldValue('parseHTTPBody')).toEqual(['parse', 'HTTP', 'Body'])
		// A digit is not a word boundary, or `v2` would arrive as two marks.
		expect(tokenizeFieldValue('poseV2')).toEqual(['pose', 'V2'])
		expect(tokenizeFieldValue('')).toEqual([])
	})
})

describe('the intra-value diff', () => {
	it('inks only the run that changed — the whole point of round 2', () => {
		const words = wordDiff('run_inference', 'run_predict')
		expect(words.changed).toBe(true)
		// `run_` survives on both sides and must not be marked. Filling the whole
		// former value red is a claim about six characters that did not change.
		expect(inked(words.before)).toBe('inference')
		expect(inked(words.after)).toBe('predict')
		expect(plain(words.before)).toBe('run_inference')
		expect(plain(words.after)).toBe('run_predict')
	})

	it('marks a pure suffix as a pure addition', () => {
		const words = wordDiff('run_inference', 'run_inference_v2')
		expect(inked(words.before)).toBe('')
		expect(inked(words.after)).toBe('_v2')
	})

	it('says nothing at all when the two values are the same', () => {
		const words = wordDiff('callee', 'callee')
		expect(words.changed).toBe(false)
		expect(inked(words.before)).toBe('')
	})

	it('handles an empty side, which is what an added or removed field is', () => {
		expect(inked(wordDiff('', 'Estimator').after)).toBe('Estimator')
		expect(inked(wordDiff('Estimator', '').before)).toBe('Estimator')
	})

	it('draws a rewrite as a rewrite rather than as confetti', () => {
		// Beyond the limit the alignment stops being worth reading: eighty
		// scattered marks look like damage, not like a change.
		const long = Array.from({ length: WORD_DIFF_TOKEN_LIMIT + 20 }, (_, i) => `w${i}`).join(' ')
		const words = wordDiff(long, `${long} tail`)
		expect(words.before).toHaveLength(1)
		expect(words.before[0].kind).toBe('removed')
		expect(words.after[0].kind).toBe('added')
	})

	it('coalesces neighbours, and keeps a genuinely shared run shared', () => {
		// Both words differ, but the space between them does not — so the reader
		// gets `alpha`/`beta` inked around an unmarked gap, which is exactly what
		// GitHub draws. Three spans, not five, and not one.
		const words = wordDiff('alpha beta', 'gamma delta')
		expect(words.before.map((token) => token.kind)).toEqual(['removed', 'same', 'removed'])
		expect(inked(words.before)).toBe('alpha|beta')
		// A run of same-kind neighbours really does merge.
		const merged = wordDiff('a_b_c', 'x')
		expect(merged.before).toHaveLength(1)
	})
})

describe('reading a field pair', () => {
	it('accepts the contract’s own fully-qualified paths', () => {
		// The engine emits `props.inputs[2].name`; the port already knows which
		// port it is, so both spellings have to resolve to the same field.
		expect(fieldDiffPath('props.inputs[2].name')).toBe('name')
		expect(fieldDiffPath('name')).toBe('name')
		const diffs = [{ path: 'props.inputs[2].name', before: 'callee', after: 'callable' }]
		expect(findFieldDiff(diffs, 'name')?.before).toBe('callee')
		expect(findFieldDiff(diffs, 'type')).toBeUndefined()
	})

	it('reads round 1’s single string as the name pair it always was', () => {
		const merged = mergeLegacyNameDiff(undefined, 'callee', 'callable')
		expect(merged).toEqual([{ path: 'name', before: 'callee', after: 'callable' }])
		// An explicit pair wins; the legacy field never overwrites it.
		const explicit = [{ path: 'name', before: 'x', after: 'y' }]
		expect(mergeLegacyNameDiff(explicit, 'callee', 'callable')).toBe(explicit)
		expect(mergeLegacyNameDiff(undefined, undefined, 'callable')).toEqual([])
	})
})

describe('a changed pose', () => {
	const at = (x: number, y: number, w = 200, h = 100) => ({ x, y, w, h })

	it('separates moved from resized, because they are different questions', () => {
		expect(classifyPoseChange(at(0, 0), at(40, -12)).kind).toBe('moved')
		expect(classifyPoseChange(at(0, 0), at(0, 0, 260, 100)).kind).toBe('resized')
		expect(classifyPoseChange(at(0, 0), at(0, 0)).kind).toBe('none')
	})

	it('calls a one-edge drag a resize, because a corner stayed put', () => {
		// Growing leftward shifts the centre by half the growth. Comparing
		// centres would call this a move as well, which no reader would agree
		// with: the card's top-RIGHT corner never went anywhere.
		const change = classifyPoseChange(at(100, 0, 200, 100), at(60, 0, 240, 100))
		expect(change.kind).toBe('resized')
		expect(change.dw).toBe(40)
		expect(movedEdges(change)).toEqual(['left'])
		// The mirror image: dragging the right edge leaves the top-left fixed.
		const rightward = classifyPoseChange(at(100, 0, 200, 100), at(100, 0, 260, 100))
		expect(rightward.kind).toBe('resized')
		expect(movedEdges(rightward)).toEqual(['right'])
		// Only when NO corner survives is it both.
		expect(classifyPoseChange(at(100, 0, 200, 100), at(300, 80, 240, 130)).kind)
			.toBe('moved-resized')
	})

	it('marks only the edges that moved differently from the card itself', () => {
		// A pure translation moves all four edges and is evidence of nothing
		// about extent, so none of them may be drawn heavier.
		expect(movedEdges(classifyPoseChange(at(0, 0), at(40, 40)))).toEqual([])
	})

	it('withholds the leader when the centre barely travelled', () => {
		// A block that only got wider shifts its centre by half the growth; a
		// leader there would read as movement that did not happen.
		const widened = classifyPoseChange(at(0, 0, 200, 100), at(0, 0, 210, 100))
		expect(widened.kind).toBe('resized')
		expect(poseWantsLeader(widened)).toBe(false)
		expect(poseWantsLeader(classifyPoseChange(at(0, 0), at(90, 0)))).toBe(true)
	})

	it('says the delta in the two nouns the change actually is', () => {
		expect(describePoseChange(classifyPoseChange(at(0, 0), at(40, -12)))).toBe('↔ +40, −12')
		expect(describePoseChange(classifyPoseChange(at(0, 0), at(0, 0, 240, 88))))
			.toBe('⤢ +40, −12')
	})
})
