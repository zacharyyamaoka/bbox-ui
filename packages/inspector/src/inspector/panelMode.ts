import { useSyncExternalStore } from 'react'

/**
 * Which inspector the panel is: the stock one, or the Figma one.
 *
 * Zach's framing: "I want two settings for the inspector panel, 1 is a stock
 * panel the other is Figma. Stock just shows you exactly what you can change
 * and works like stock. the figma one works like figma."
 *
 * So this is not a skin. STOCK hides every control backed by this app's `meta`
 * sidecar, leaving exactly the properties a real tldraw can change — which
 * makes the panel a truthful answer to "what IS a stock rectangle?". FIGMA
 * shows the full surface: per-paint opacity, exact colours, corner radius.
 *
 * WHY a persisted preference rather than a URL switch like `?variant=`: the
 * variants are prototypes being compared, this is a working mode someone picks
 * once and keeps.
 */
export type PanelMode = 'stock' | 'figma'

const STORAGE_KEY = 'tldraw-lab.panel-mode.v1'
const DEFAULT_MODE: PanelMode = 'figma'

let current: PanelMode | null = null
const listeners = new Set<() => void>()

export function getPanelMode(): PanelMode {
	if (current === null) {
		try {
			const raw = localStorage.getItem(STORAGE_KEY)
			current = raw === 'stock' || raw === 'figma' ? raw : DEFAULT_MODE
		} catch {
			current = DEFAULT_MODE
		}
	}
	return current
}

export function setPanelMode(mode: PanelMode): void {
	current = mode
	try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* private mode */ }
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function usePanelMode(): PanelMode {
	return useSyncExternalStore(subscribe, getPanelMode, getPanelMode)
}
