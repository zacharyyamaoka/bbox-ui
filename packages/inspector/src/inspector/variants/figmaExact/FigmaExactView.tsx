/**
 * V7's mount point — the same shape as `FigmaAnatomyView` (header, scroll
 * area, remount-on-selection key) so the dock chrome around it is unchanged
 * and only the BODY differs.
 *
 * WHY it keeps `data-testid="inspector-panel"` and the `key={shapeIds}`
 * remount: both are load-bearing contracts the rest of the app already
 * relies on — the drawer's own journey finds the panel by that id, and the
 * key is judge-round-2 finding 7's fix (a stale `useAnatomyCtx` ref carrying
 * one shape's fill style into another's eye toggle). A new variant is not a
 * reason to re-derive either.
 */
import type { Editor } from 'tldraw'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { cn } from 'cn'
import type { InspectorValue, PrimitiveInspectorModel } from '../../inspectorModel'
import { setPanelMode, usePanelMode, type PanelMode } from '../../panelMode'
import { stockifyShapes } from '../../toStock'
import { useAnatomyCtx } from '../figmaKit'
import { IconButton } from './atoms'
import * as Fig from './icons'
import { FigmaExactPanel } from './FigmaExactPanel'

/**
 * The words Figma prints as the node type. tldraw's own shape types map onto
 * Figma's vocabulary almost one-for-one; `geo` is the one that does not,
 * because tldraw calls every closed primitive `geo` and puts the real name in
 * `props.geo` ("rectangle", "ellipse", …). Figma would print that inner name,
 * so this does too — Title Case, its own convention.
 */
/**
 * The panel's own heading — and, when it applies, the honest warning attached
 * to it.
 *
 * WHY a shape carrying overrides says so, in Zach's own words: "when you add
 * meta data to make it render I do think it makes sense to say
 * non-stock-rectangle or something so its clear to us." The record IS still a
 * stock rectangle — that is the whole architecture, and what lets a board open
 * in plain tldraw — but what he is LOOKING at is not what plain tldraw would
 * paint. Naming that at the top of the panel is the difference between a
 * deliberate trade-off and a nasty surprise when a board is opened elsewhere.
 * The Stock check button beside it is the detail view; this is the flag.
 */
function nodeTypeLabel(model: PrimitiveInspectorModel, mode: PanelMode): string {
	const flag = mode === 'figma' && model.hasOverrides
	if (model.shapeIds.length > 1) {
		return `${model.shapeIds.length} layers${flag ? ' · Non-Stock' : ''}`
	}
	const raw = model.title || 'Layer'
	const name = raw.charAt(0).toUpperCase() + raw.slice(1)
	// Title Case, Zach's own call: "Please change formating from Non-stock
	// rectangle to Non-Stock Rectangle".
	//
	// Only flagged in FIGMA mode: stock mode cannot create an override, so a
	// shape seen through it is being shown as stock tldraw would paint it. The
	// marker belongs to the panel that can make the difference.
	return flag ? `Non-Stock ${name}` : name
}

/**
 * The panel's mode switch and its reset, both in the header.
 *
 * WHY here rather than in a menu: Zach pointed at this exact strip — "you can
 * put that stock, vs non stock toggle up here" — and it is the right place. The
 * heading already answers "what am I looking at"; the toggle answers "through
 * which lens", and the reset answers "put it back". All three are the same
 * question about the selected shape.
 */
function ModeSwitch({ mode, canReset, onReset }: {
	mode: PanelMode
	canReset: boolean
	onReset(): void
}) {
	return (
		<div className="flex items-center gap-1">
			<div role="radiogroup" aria-label="Inspector mode" className="flex items-center rounded-[5px] bg-[var(--fig-bg-secondary,rgba(127,127,127,0.12))] p-0.5">
				{(['stock', 'figma'] as const).map((option) => (
					<button
						key={option}
						type="button"
						role="radio"
						aria-checked={mode === option}
						data-testid={`inspector-mode-${option}`}
						data-state={mode === option ? 'on' : 'off'}
						onClick={() => setPanelMode(option)}
						className={cn(
							'h-5 rounded-[4px] border-0 bg-transparent px-2 text-[10px] font-medium capitalize outline-none',
							mode === option
								? 'bg-[var(--fig-bg)] text-[var(--fig-text)] shadow-sm'
								: 'text-[var(--fig-text-secondary)] hover:text-[var(--fig-text)]',
						)}
					>
						{option}
					</button>
				))}
			</div>
			<IconButton
				label={canReset ? 'Reset to stock' : 'Already stock'}
				testId="inspector-reset-to-stock"
				disabled={!canReset}
				onClick={onReset}
			>
				<Fig.ResetToStock />
			</IconButton>
		</div>
	)
}

export function FigmaExactView({ model, editor, onChange, onClear }: {
	model: PrimitiveInspectorModel | null
	editor: Editor
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	return (
		<div data-testid="inspector-panel" data-figma-exact="" className="flex h-full flex-col">
			<ScrollArea className="min-h-0 flex-1">
				{model ? (
					<FigmaExactBody key={model.shapeIds.join(',')} model={model} editor={editor} onChange={onChange} onClear={onClear} />
				) : (
					<p className="p-4 text-[11px] text-[var(--fig-text-secondary)]">Select something to inspect it.</p>
				)}
			</ScrollArea>
		</div>
	)
}

function FigmaExactBody({ model, editor, onChange, onClear }: {
	model: PrimitiveInspectorModel
	editor: Editor
	onChange(id: string, value: InspectorValue, gestureStart: boolean): void
	onClear(id: string): void
}) {
	const mode = usePanelMode()

	// STOCK mode drops every control this app backs with its `meta` sidecar, so
	// what remains is exactly what a real tldraw can change. That is the whole
	// definition — "Stock just shows you exactly what you can change and works
	// like stock" — and it falls out of the model already labelling each control
	// with its provenance, rather than needing a second hand-maintained list.
	const shown = mode === 'stock'
		? {
			...model,
			groups: model.groups
				.map((group) => ({ ...group, controls: group.controls.filter((control) => control.source !== 'paint') }))
				.filter((group) => group.controls.length > 0),
			// A stock reading cannot be carrying overrides, by construction.
			hasOverrides: false,
		}
		: model

	const ctx = useAnatomyCtx(shown, editor, onChange, onClear)

	// The cast mirrors inspectorModel.ts's own `updateShapes` helper: tldraw's
	// shape union is discriminated on `type`, and a function that works across a
	// heterogeneous selection cannot be expressed in it.
	const selected = editor.getSelectedShapes() as unknown as Parameters<typeof stockifyShapes>[0]
	const pending = stockifyShapes(selected)

	return (
		<FigmaExactPanel
			ctx={ctx}
			nodeType={nodeTypeLabel(model, mode)}
			headerExtra={(
				<ModeSwitch
					mode={mode}
					canReset={pending.length > 0}
					onReset={() => {
						if (pending.length === 0) return
						editor.markHistoryStoppingPoint('reset to stock')
						editor.updateShapes(pending as never)
					}}
				/>
			)}
		/>
	)
}
