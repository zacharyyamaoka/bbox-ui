import { describe, expect, it } from 'vitest'
import { PRIMITIVE_OVERRIDE_META_KEY as KEY } from './overrides'
import { isNonStock, stockifyShape, stockifyShapes } from './toStock'

const rect = (props: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
	id: 'shape:a',
	type: 'geo',
	props: { geo: 'rectangle', color: 'black', labelColor: 'black', ...props },
	meta,
})

describe('stockifyShape', () => {
	it('returns null for a shape that is already stock, so no write is pushed', () => {
		expect(stockifyShape(rect())).toBeNull()
		expect(isNonStock(rect())).toBe(false)
	})

	it('clears this app’s paint sidecar', () => {
		const partial = stockifyShape(rect({}, { [KEY]: { cornerRadius: 24, fillColor: '#ff0000' } }))
		expect(partial?.meta?.[KEY]).toBeNull()
		// Props are untouched when only meta was non-stock — a stock record must
		// not be rewritten just because it was inspected.
		expect(partial?.props).toBeUndefined()
	})

	it('repairs a legacy record carrying the custom rounded geo', () => {
		// Boards written before the radius moved into meta carry this, and stock
		// tldraw REFUSES such a record outright rather than degrading.
		const partial = stockifyShape(rect({ geo: 'rounded-rect' }, { [KEY]: { cornerRadius: 12 } }))
		expect(partial?.props?.geo).toBe('rectangle')
		expect(partial?.meta?.[KEY]).toBeNull()
	})

	it('repairs a custom colour the Theme tab can still register', () => {
		const partial = stockifyShape(rect({ color: 'custom-7744cc', labelColor: 'custom-7744cc' }))
		expect(partial?.props?.color).toBe('black')
		expect(partial?.props?.labelColor).toBe('black')
	})

	it('keeps stock values that happen to sit beside non-stock ones', () => {
		const partial = stockifyShape(rect({ color: 'custom-7744cc', labelColor: 'blue' }))
		expect(partial?.props?.color).toBe('black')
		// `blue` is stock, so it survives — stockify repairs, it does not reset.
		expect(partial?.props).not.toHaveProperty('labelColor')
	})

	it('preserves other meta keys, which belong to other features', () => {
		const partial = stockifyShape(rect({}, { [KEY]: { cornerRadius: 4 }, somethingElse: { keep: true } }))
		expect(partial?.meta?.somethingElse).toEqual({ keep: true })
	})

	it('stockifyShapes returns only the shapes that need writing', () => {
		const partials = stockifyShapes([
			rect(),
			rect({}, { [KEY]: { cornerRadius: 8 } }),
			rect({ geo: 'rounded-rect' }),
		])
		expect(partials).toHaveLength(2)
	})
})
