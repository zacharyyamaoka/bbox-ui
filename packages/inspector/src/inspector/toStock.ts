import { isStockColorValue, isStockGeoValue } from '../compat/stockEnums'
import { PRIMITIVE_OVERRIDE_META_KEY, hasPrimitiveOverride, type OverridableShape } from './overrides'

/**
 * "What would this shape be if it were purely stock?"
 *
 * Zach's own framing, and the reason this is a module rather than a handler:
 * "this function of how do you go from a custom styled object to stock is a
 * useful pure function we can utilize in the detach to primitive function".
 * Exactly so — the Reset button in the inspector and "Detach to primitive" in
 * the context menu are the SAME operation reached two ways, and any future
 * bulk detach is a third. One function, three callers, one definition of what
 * "stock" means.
 *
 * Pure on purpose: it takes a shape and returns the update partial, touching no
 * editor and no store. That makes it unit-testable without a DOM, and it makes
 * the answer to "what does stock mean here" something you can read rather than
 * infer from a click handler.
 *
 * Three things can make a shape non-stock, and it undoes all three:
 *  - `meta.primitiveOverride`, this app's own paint sidecar;
 *  - a `geo` outside tldraw's own vocabulary (a legacy `rounded-rect` record
 *    from before the radius moved into meta — stock tldraw REFUSES those);
 *  - a `color`/`labelColor` outside the stock palette, which the Theme tab can
 *    still introduce by registering a custom colour.
 *
 * Returns `null` when the shape is already stock, so a caller can skip the
 * write entirely rather than pushing a no-op onto the undo stack.
 */
export interface StockifyPartial {
	id: string
	type: string
	props?: Record<string, unknown>
	meta?: Record<string, unknown>
}

/** The stock fallbacks used when a value cannot be kept. Both are tldraw's own
 *  defaults, so a stockified shape looks like one that was never touched. */
const STOCK_GEO_FALLBACK = 'rectangle'
const STOCK_COLOR_FALLBACK = 'black'

export function stockifyShape(shape: OverridableShape & {
	id: string
	type: string
	props?: Record<string, unknown>
}): StockifyPartial | null {
	const props = shape.props ?? {}
	const nextProps: Record<string, unknown> = {}

	const geo = props.geo
	if (typeof geo === 'string' && !isStockGeoValue(geo)) nextProps.geo = STOCK_GEO_FALLBACK

	for (const field of ['color', 'labelColor'] as const) {
		const value = props[field]
		if (typeof value === 'string' && !isStockColorValue(value)) nextProps[field] = STOCK_COLOR_FALLBACK
	}

	const hadOverride = hasPrimitiveOverride(shape)
	const propsChanged = Object.keys(nextProps).length > 0
	if (!hadOverride && !propsChanged) return null

	return {
		id: shape.id,
		type: shape.type,
		...(propsChanged ? { props: nextProps } : {}),
		// `null`, not `undefined`: tldraw merges meta, so a key must be explicitly
		// nulled to clear it — the same contract `writePrimitiveOverride` uses.
		...(hadOverride ? { meta: { ...(shape.meta ?? {}), [PRIMITIVE_OVERRIDE_META_KEY]: null } } : {}),
	}
}

/** Convenience for a selection: the partials that actually need writing. */
export function stockifyShapes(shapes: Array<Parameters<typeof stockifyShape>[0]>): StockifyPartial[] {
	return shapes.map(stockifyShape).filter((partial): partial is StockifyPartial => partial !== null)
}

/** Does this shape currently differ from its stock self? Drives the enabled
 *  state of every "reset" affordance, so the button and the operation can never
 *  disagree about whether there is anything to do. */
export function isNonStock(shape: Parameters<typeof stockifyShape>[0]): boolean {
	return stockifyShape(shape) !== null
}
