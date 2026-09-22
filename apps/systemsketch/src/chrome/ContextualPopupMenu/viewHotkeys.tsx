// src/chrome/ContextualPopupMenu/viewHotkeys.tsx — 1/2/3/4 switch the
// selected Block's face, through tldraw's own `overrides.actions` seam.
//
// Zach, 2026-09-22, verbatim: "add feature where clicking 1 or 2 or 3 or 4
// when the block/region is expanded will switch it between simple, port,
// expanded, expanded opaque (if/when thoose views are support)".
//
// WHY THE TRIGGER IS "SELECTED", NOT "EXPANDED" (dispatcher's fixed
// interpretation, recorded here because it changes what the handler does):
// gating on "already expanded" would make 1/2/3/4 unable to switch INTO
// expanded from simple or port, which defeats the point of a face-cycling
// hotkey. The trigger is a block/region being selected; the keys switch
// between views, including away from expanded.
//
// WHAT "4 — expanded opaque" MAPS TO TODAY: nothing, on purpose, and that is
// the discovered answer, not a shortcut taken. `ss-block.props.view` is
// `simple | port | expanded` only (BlockShapeUtil.tsx:45,152) — no fourth
// enum value exists to write. `ss-region` has no `view` prop AT ALL
// (RegionShapeUtil.tsx's schema); the opaque/expanded toggle exists only as
// a scene-level PROJECTION in the trunk (`@trunk/scene/regionView`'s
// `regionViewOf`/`toggleRegionView`) that `RegionFace.tsx` explicitly has
// not wired up yet ("Owed: wiring ... through L4's floating toolbar" —
// RegionFace.tsx:124-128). Zach's own ask hedged this exact case ("if/when
// thoose views are support[ed]"), and the brief this lane works from is
// explicit: do not invent a fourth `BlockView` value to make 4 do
// something. So `4` is bound, and discoverable, and its handler is a
// deliberate no-op until a real view exists for it to write.
import type { Editor, TLUiActionsContextType, TLUiKeyboardShortcutsDialogProps } from "tldraw";
import { DefaultKeyboardShortcutsDialog, DefaultKeyboardShortcutsDialogContent, TldrawUiMenuActionItem, TldrawUiMenuGroup } from "tldraw";

import type { BlockShape } from "../../shapes/block";
import { BLOCK_SHAPE_TYPE } from "../../shapes/types";
import { setBlockView, type BlockView } from "./selectionActions";

interface ViewHotkey {
  /** tldraw action id — this app's own, not one of tldraw's stock ones. */
  id: string;
  /** Bare digit, no modifier — verified free against stock tldraw's own
   *  action/tool tables and this app's `shapes/registry.ts` toolUi (see the
   *  conflict-check note in the handoff; nothing else here answers to a
   *  bare 1/2/3/4). */
  key: "1" | "2" | "3" | "4";
  /** What the shortcuts dialog and the action's own tooltip call it. */
  label: string;
  /** The `ss-block` view this key writes, or `null` for the one key with
   *  nowhere to write yet (see the module header on "4"). */
  view: BlockView | null;
}

/** One entry per key, in the order Zach named them. `label` doubles as the
 *  pill's tooltip text (`BLOCK_VIEW_HOTKEY` below) and the shortcuts
 *  dialog's row — both read off THIS array so the two surfaces cannot
 *  quietly disagree about what a key does. */
export const VIEW_HOTKEYS: readonly ViewHotkey[] = [
  { id: "view-hotkey-simple", key: "1", label: "Simple", view: "simple" },
  { id: "view-hotkey-port", key: "2", label: "Ports", view: "port" },
  { id: "view-hotkey-expanded", key: "3", label: "Expanded", view: "expanded" },
  { id: "view-hotkey-expanded-opaque", key: "4", label: "Expanded opaque", view: null },
];

/** `BlockView` → its key, for the selection pill's tooltip
 *  (`floatingToolbar.tsx`'s `title={...}`, "Simple · 1"). Derived from
 *  `VIEW_HOTKEYS` rather than a second hand-written table. */
export const BLOCK_VIEW_HOTKEY: Record<BlockView, ViewHotkey["key"]> = Object.fromEntries(
  VIEW_HOTKEYS.filter((hotkey): hotkey is ViewHotkey & { view: BlockView } => hotkey.view !== null).map((hotkey) => [hotkey.view, hotkey.key]),
) as Record<BlockView, ViewHotkey["key"]>;

/**
 * Every SELECTED Block that does not already wear `view`, switched to it —
 * through `setBlockView`, the SAME setter the selection pill's toggle group
 * calls (`floatingToolbar.tsx`'s `onView`). A second setter here would mean
 * a key press and a pill click could drift: different resizing, different
 * member-layout side effects, the thing requirement #2 forbids.
 *
 * ONE UNDO STEP for however many shapes this touches:
 * `markHistoryStoppingPoint` flushes whatever was pending BEFORE this key
 * press into ITS OWN entry, so the writes that follow — however many
 * `setBlockView` calls run with no mark in between — accumulate into one
 * fresh pending diff and one Ctrl+Z. Shapes already at `view` are filtered
 * out first so a press that changes nothing does not open an undo entry it
 * has nothing to put in.
 */
function applyViewHotkey(editor: Editor, view: BlockView): void {
  const targets = editor
    .getSelectedShapes()
    .filter((shape): shape is BlockShape => shape.type === BLOCK_SHAPE_TYPE && (shape as BlockShape).props.view !== view);
  if (targets.length === 0) return;
  editor.markHistoryStoppingPoint("view hotkey");
  for (const shape of targets) setBlockView(editor, shape.id, view);
}

/**
 * The `overrides.actions` seam (App.tsx's `OVERRIDES`). Binding through
 * tldraw's own action table, rather than a raw `window` keydown listener,
 * is what buys requirement #4 for free: `useKeyboardShortcuts`' own
 * `shouldSkipEvent` refuses any `contentEditable`, non-readonly `<textarea>`
 * or non-readonly `<input>` target, and `areShortcutsDisabled` additionally
 * refuses every action while `editor.getEditingShapeId()` is set — so the
 * Inspector's description textarea, a block's name editor and a port's
 * CodeMirror editor (a `contentEditable` div) all already swallow 1-4
 * before this file is ever asked to run. Nothing extra to write for it.
 */
export function withViewHotkeys(editor: Editor, actions: TLUiActionsContextType): TLUiActionsContextType {
  const next = { ...actions };
  for (const hotkey of VIEW_HOTKEYS) {
    next[hotkey.id] = {
      id: hotkey.id,
      label: `View: ${hotkey.label}`,
      kbd: hotkey.key,
      onSelect: () => {
        if (hotkey.view) applyViewHotkey(editor, hotkey.view);
      },
    };
  }
  return next;
}

/**
 * Requirement #5's other half: tldraw's `DefaultKeyboardShortcutsDialogContent`
 * is a hand-written list of fixed action ids (its own module — none of them
 * ours), so a custom action with a `kbd` does not appear there for free the
 * way it does in `useKeyboardShortcuts`. The documented seam for ADDING a
 * row is `components.KeyboardShortcutsDialog`: render the stock content and
 * append a group. Wired in App.tsx's `COMPONENTS`.
 */
export function SystemSketchKeyboardShortcutsDialog(props: TLUiKeyboardShortcutsDialogProps) {
  return (
    <DefaultKeyboardShortcutsDialog {...props}>
      <DefaultKeyboardShortcutsDialogContent />
      <TldrawUiMenuGroup id="view" label="View">
        {VIEW_HOTKEYS.map((hotkey) => (
          <TldrawUiMenuActionItem key={hotkey.id} actionId={hotkey.id} />
        ))}
      </TldrawUiMenuGroup>
    </DefaultKeyboardShortcutsDialog>
  );
}
