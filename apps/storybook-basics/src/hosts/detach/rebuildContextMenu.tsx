/**
 * src/detach/rebuildContextMenu.tsx — the right-click "Rebuild" menu item
 * Zach asked for: "When you do rebuild, it detects if there is rebuild
 * info in the group you selected and displays the option in the right
 * click menu."
 *
 * WIRING, corrected mid-lane: the first pass here concluded there was no
 * `TLUiOverrides` hook for a context menu in this pinned tldraw version —
 * true of `TLUiOverrides` (it carries only `actions`/`tools`/`translations`),
 * but the context menu is a replaceable COMPONENT SLOT instead
 * (`TLUiComponents.ContextMenu`, verified directly against tldraw 5.3.2's
 * own `.d.ts`). tldraw exports both `DefaultContextMenu` and
 * `DefaultContextMenuContent`, so this composes rather than replaces —
 * every stock item (copy/paste/duplicate/arrange/…) stays; this only adds
 * one group after them. A hand-rolled menu that silently dropped those
 * would be a worse regression than the missing Rebuild item.
 *
 * Wired in via `TldrawHost`'s new `components` prop
 * (`../hosts/tldrawHost.tsx`) — `components={{ ContextMenu:
 * RebuildContextMenu }}` — additive, the same seam `onEditorReady` used.
 *
 * INTERACTS WITH F1 (the camera-zoom bug fixed in `./stockShapes.ts`):
 * once this menu exists, detach/rebuild are reachable at whatever zoom the
 * user happens to be at when they right-click — exactly the case F1's own
 * regression test (`DetachToPrimitive.stories.tsx`'s `ZoomInvariance`
 * story) exists for. Land that fix first (it already has, in this lane),
 * then drive THIS menu at a non-1 zoom as the integration check — see
 * `RebuildMenuStates` below.
 */
import { DefaultContextMenu, DefaultContextMenuContent, TldrawUiMenuGroup, TldrawUiMenuItem, useEditor, useValue } from "tldraw";

import { useTldrawHostScene } from "../hosts/tldrawHost";
import { rebuildDetachedShapes, selectedRebuildableIds } from "./rebuild";

/**
 * Only rendered when the CURRENT SELECTION actually carries rebuild info —
 * `rebuild.ts`'s own detection (`selectedRebuildableIds`), read reactively
 * through `useValue` so the item appears/disappears live as the selection
 * changes. An always-present item that no-ops on the wrong selection would
 * be worse than no item at all, which is why this is a conditional render
 * rather than tldraw's `disabled` flag (context-menu items with `disabled`
 * still take a menu row, just greyed out — see `TldrawUiMenuItem`'s own
 * `context-menu` branch; that is the wrong shape for "not applicable here").
 */
function RebuildMenuGroup() {
  const editor = useEditor();
  const host = useTldrawHostScene();
  const canRebuild = useValue("bbox-ui rebuild available", () => selectedRebuildableIds(editor).length > 0, [editor]);
  if (!canRebuild || !host) return null;
  return (
    <TldrawUiMenuGroup id="bbox-ui-rebuild">
      <TldrawUiMenuItem
        id="bbox-ui-rebuild"
        label="Rebuild"
        onSelect={() => {
          rebuildDetachedShapes(editor, host.scene, host.onSceneChange);
        }}
      />
    </TldrawUiMenuGroup>
  );
}

/**
 * Drop-in replacement for tldraw's `ContextMenu` component slot — pass as
 * `<TldrawHost components={{ ContextMenu: RebuildContextMenu }}>`. Renders
 * every stock item (`DefaultContextMenuContent`) plus one conditional
 * group.
 */
export function RebuildContextMenu() {
  return (
    <DefaultContextMenu>
      <DefaultContextMenuContent />
      <RebuildMenuGroup />
    </DefaultContextMenu>
  );
}
