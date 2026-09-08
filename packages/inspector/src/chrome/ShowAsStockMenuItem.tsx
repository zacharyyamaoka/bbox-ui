import {
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	useEditor,
	useValue,
	type TLShapePartial,
} from 'tldraw'
import { stockifyShapes } from '../inspector/toStock'

/**
 * "Show as stock" strips a shape's `meta.primitiveOverride` — every exact
 * colour, width, radius and typography value this inspector paints — leaving
 * the record exactly as it already was and the shape rendering exactly as
 * stock tldraw would render it.
 *
 * WHY this is worth a menu item rather than "just clear the fields in the
 * panel": Zach's own reason — "this is helpful for seeing what stock would look
 * like within the current board". The Stock check answers that question for the
 * WHOLE board in a separate view; this answers it for one shape, in place,
 * beside the shapes it is being compared against. It is also the honest inverse
 * of the architecture: if all our richness lives in meta, then removing meta
 * has to be one action, not a tour of the inspector.
 *
 * WHY the label changed from the lab's "Detach to primitive": bbox-ui already
 * ships a "Detach to primitives" item that LOWERS a Block into actual stock
 * shapes (@bbox-ui/adapter-tldraw). Two unrelated operations cannot share one
 * label in one menu — "Show as stock" is this one's own stated purpose, and
 * "Detach to primitives" stays the structural lowering.
 *
 * It is deliberately UNDOABLE and deliberately not a "reset" of anything else —
 * props, position and geometry are untouched, because those were always stock.
 *
 * This is a menu GROUP, not a whole ContextMenu: the host app owns the menu
 * root (bbox-ui's ReliableContextMenu controls Radix so a canvas click can't
 * wedge stock's two-owner open state shut) and composes this item into it. Do
 * not resurrect the lab's LabContextMenu — mounting stock DefaultContextMenu
 * reintroduces the ignored-right-click bug ReliableContextMenu exists to fix.
 */
export function ShowAsStockMenuItems() {
	const editor = useEditor()

	// `useValue` so the item appears and disappears with the selection rather
	// than only when the menu is remounted.
	// Counted with the SAME function that performs the operation, so the item
	// can never offer to do something that turns out to be a no-op — and never
	// hide when there is something to do.
	const stockifiableCount = useValue(
		'stockifiable shapes',
		() => stockifyShapes(editor.getSelectedShapes() as unknown as Parameters<typeof stockifyShapes>[0]).length,
		[editor],
	)

	if (stockifiableCount === 0) return null
	return (
		<TldrawUiMenuGroup id="lab-show-as-stock">
			<TldrawUiMenuItem
				id="show-as-stock"
				label={stockifiableCount > 1 ? `Show ${stockifiableCount} as stock` : 'Show as stock'}
				onSelect={() => {
					const partials = stockifyShapes(editor.getSelectedShapes() as unknown as Parameters<typeof stockifyShapes>[0])
					if (partials.length === 0) return
					editor.markHistoryStoppingPoint('show as stock')
					// The cast mirrors inspectorModel.ts's own `updateShapes` helper:
					// tldraw's partial is discriminated on `type`, and a write over a
					// heterogeneous selection cannot be expressed in that union.
					editor.updateShapes(partials as unknown as TLShapePartial[])
				}}
			/>
		</TldrawUiMenuGroup>
	)
}
