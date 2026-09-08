import { useCallback } from 'react'
import {
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TldrawUiMenuSubmenu,
	getSnapshot,
	loadSnapshot,
	useEditor,
} from 'tldraw'
import { getDocumentName, setDocumentName } from './documentName'

/**
 * The File menu group, built from `TldrawUiMenu*` primitives so it keeps
 * stock tldraw's own styling (submenu chevrons, kbd column, hover/focus).
 * Ported from the styling lab's LabMainMenu.tsx; the lab's V1 menu component
 * and its Gesture-control submenu did not survive the merge — V3 (MainMenu.tsx)
 * is the shipped menu and its Settings dialog owns every gesture tunable.
 */
function downloadSnapshot(editor: ReturnType<typeof useEditor>, filename: string) {
	const snapshot = getSnapshot(editor.store)
	const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	// Revoking on the next frame rather than immediately: Safari has been seen
	// cancelling the download when the URL dies in the same tick as the click.
	requestAnimationFrame(() => URL.revokeObjectURL(url))
}

export function FileMenu() {
	const editor = useEditor()

	const onNew = useCallback(() => {
		const ids = [...editor.getCurrentPageShapeIds()]
		if (ids.length === 0) return
		editor.markHistoryStoppingPoint('new document')
		// Deleting the shapes rather than resetting the store: an undo has to
		// bring the board back. A store reset is not undoable, and losing a
		// board to a mis-click on New is the worst bug this menu could have.
		editor.deleteShapes(ids)
	}, [editor])

	const onOpen = useCallback(() => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.tldr,.json,application/json'
		input.onchange = async () => {
			const file = input.files?.[0]
			if (!file) return
			try {
				const snapshot = JSON.parse(await file.text())
				editor.markHistoryStoppingPoint('open document')
				loadSnapshot(editor.store, snapshot)
			} catch {
				// No toast API on the editor, and inventing chrome for this would be
				// a second UI kit. `alert` is ugly but it is HONEST — the alternative
				// people actually ship is a silent no-op, which looks like the app
				// ignoring the file it was just handed.
				window.alert('Could not open that file — it is not a tldraw snapshot.')
			}
		}
		input.click()
	}, [editor])

	return (
		<TldrawUiMenuGroup id="lab-file">
			<TldrawUiMenuSubmenu id="file" label="File">
				<TldrawUiMenuGroup id="file-new-open">
					<TldrawUiMenuItem id="new-document" label="New" kbd="cmd+n" onSelect={onNew} />
					<TldrawUiMenuItem
						id="new-window"
						label="New window"
						kbd="cmd+shift+n"
						onSelect={() => {
							// A real second window of this app, which is all "New window"
							// ever meant. `noopener` so the child cannot reach back through
							// `window.opener` — the default is a genuine security footgun.
							window.open(window.location.href, '_blank', 'noopener,noreferrer')
						}}
					/>
					<TldrawUiMenuItem id="open-document" label="Open…" kbd="cmd+o" onSelect={onOpen} />
					<TldrawUiMenuItem id="open-recent" label="Open recent" disabled onSelect={() => {}} />
				</TldrawUiMenuGroup>
				<TldrawUiMenuGroup id="file-save">
					<TldrawUiMenuItem
						id="save-document"
						label="Save"
						kbd="cmd+s"
						onSelect={() => downloadSnapshot(editor, `${getDocumentName()}.tldr`)}
					/>
					<TldrawUiMenuItem
						id="save-as-document"
						label="Save As…"
						kbd="cmd+shift+s"
						onSelect={() => {
							// A prompt, not a file dialog: the browser will not tell a page
							// where a download went, so "Save As" here means "name it", and
							// the rest is the browser's own download UI. Pretending otherwise
							// with a fake path would be the dishonest version.
							const name = window.prompt('Save board as', getDocumentName())
							if (name === null) return
							const trimmed = name.trim() || getDocumentName()
							setDocumentName(trimmed)
							downloadSnapshot(editor, `${trimmed}.tldr`)
						}}
					/>
					<TldrawUiMenuItem
						id="export-tldraw"
						label="Export to tldraw…"
						onSelect={() => downloadSnapshot(editor, `${getDocumentName()}.tldr`)}
					/>
					<TldrawUiMenuItem
						id="rename-document"
						label="Rename"
						kbd="f2"
						onSelect={() => {
							const name = window.prompt('Rename board', getDocumentName())
							if (name === null) return
							setDocumentName(name.trim() || getDocumentName())
						}}
					/>
				</TldrawUiMenuGroup>
				{/* WHY only these two stay disabled: Zach asked why New window was
				    greyed — it should not have been. A browser opens a window with
				    `window.open`, and Save As and Rename only ever needed a document
				    NAME, which this app can now hold. What is left genuinely needs a
				    filesystem this page cannot reach: there is no path to reveal and
				    no trash to move a downloaded file into. Those two stay visible
				    and greyed rather than hidden — the same disabled-not-inert rule
				    the inspector uses — so the menu never implies it is complete. */}
				<TldrawUiMenuGroup id="file-host-only">
					<TldrawUiMenuItem id="reveal-document" label="Show in Files" disabled onSelect={() => {}} />
					<TldrawUiMenuItem id="trash-document" label="Move to Trash…" disabled onSelect={() => {}} />
				</TldrawUiMenuGroup>
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}
