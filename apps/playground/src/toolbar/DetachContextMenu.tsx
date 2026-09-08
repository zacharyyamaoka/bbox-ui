/**
 * Right-click surface for detach: "Detach to primitives" on a selection
 * holding bbox-ui shapes, "Rebuild Block/Port" on one holding detached
 * groups that still remember what they were.
 *
 * WHY the selection reads live inside a child of DefaultContextMenu rather
 * than in the wrapper: the ContextMenu component override WRAPS the canvas
 * (tldraw renders the canvas inside the menu trigger), so a subscription in
 * the wrapper body would re-render the whole canvas subtree on every
 * selection change. Menu content only mounts while the menu is open, which
 * is exactly the window the read needs to be fresh in.
 */
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from "tldraw";

import {
  detachSelectedShapes,
  rebuildDetachedShapes,
  selectedDetachableIds,
  selectedRebuildableIds,
} from "@bbox-ui/adapter-tldraw";

function DetachMenuItems() {
  const editor = useEditor();
  const detachableCount = useValue(
    "bbox detachable",
    () => selectedDetachableIds(editor).length,
    [editor],
  );
  const rebuildableCount = useValue(
    "bbox rebuildable",
    () => selectedRebuildableIds(editor).length,
    [editor],
  );
  if (detachableCount === 0 && rebuildableCount === 0) return null;
  return (
    <TldrawUiMenuGroup id="bbox-detach">
      {detachableCount > 0 && (
        <TldrawUiMenuItem
          id="bbox-detach-to-primitives"
          label={
            detachableCount === 1
              ? "Detach to primitives"
              : `Detach ${detachableCount} to primitives`
          }
          readonlyOk={false}
          onSelect={() => {
            detachSelectedShapes(editor);
          }}
        />
      )}
      {rebuildableCount > 0 && (
        <TldrawUiMenuItem
          id="bbox-rebuild-from-primitives"
          label={
            rebuildableCount === 1
              ? "Rebuild Block/Port"
              : `Rebuild ${rebuildableCount} Blocks/Ports`
          }
          readonlyOk={false}
          onSelect={() => {
            rebuildDetachedShapes(editor);
          }}
        />
      )}
    </TldrawUiMenuGroup>
  );
}

export function PlaygroundContextMenu(props: TLUiContextMenuProps) {
  return (
    <DefaultContextMenu {...props}>
      <DetachMenuItems />
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}
