/**
 * The tldraw styling lab's inspector and chrome, as one workspace package.
 *
 * These are the seams a host app mounts through `<Tldraw components={...}>`:
 *
 *   StylePanel:    Inspector          (the Figma-shaped right dock)
 *   MainMenu:      SettingsDialogVariant  (the lab's V3 — File menu + Settings dialog)
 *   MenuPanel:     MenuPanelWithName  (board name + status dot beside the hamburger)
 *   HelperButtons: HelperButtonsWithTuning (the live gesture-tuning HUD)
 *
 * plus `CONFIGURED_SHAPE_UTILS` for `shapeUtils` (the paint seam that makes
 * every `meta.primitiveOverride` reach pixels), `readStoredThemes()` for the
 * `themes` prop, and `useGestures(editor)` wired from `onMount`.
 *
 * `ShowAsStockMenuItems` composes into the host's own context menu root; the
 * lab's LabContextMenu wrapper deliberately did not survive the merge (its
 * stock DefaultContextMenu root has the two-owners-of-open bug bbox-ui's
 * ReliableContextMenu was just built to fix).
 */
export { Inspector } from './inspector/Inspector'
export { CONFIGURED_SHAPE_UTILS, ROUNDED_RECT_GEO } from './inspector/configuredUtils'
export { readStoredThemes, writeStoredThemes, clearStoredThemes } from './inspector/themeStorage'
export { NATIVE_PANEL_CHROME } from './inspector/nativeChrome'
export { stockifyShapes } from './inspector/toStock'
export { SettingsDialogVariant, useOpenSettings } from './chrome/MainMenu'
export { DocumentNamePanel, MenuPanelWithName } from './chrome/DocumentNamePanel'
export { getDocumentName, setDocumentName, useDocumentName } from './chrome/documentName'
export { HelperButtonsWithTuning } from './chrome/TuningPanel'
export { useGestures } from './chrome/useGestures'
export { ShowAsStockMenuItems } from './chrome/ShowAsStockMenuItem'
