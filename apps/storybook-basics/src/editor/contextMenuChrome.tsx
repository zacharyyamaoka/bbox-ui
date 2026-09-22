"use client";

// src/editor/contextMenuChrome.tsx — the React surface over
// `contextMenuModel.ts`'s pure `MenuSpec`s: a recursive renderer through the
// stock `context-menu.tsx` parts, and `ComponentContextMenu`, the wrapper a
// host drops around ANY rendered subtree (a `Block`, a `BlockPort`, a
// `Trace`, a `Region`) to make right-clicking it open the right menu.
//
// WHY this reuses `MenuAction`/`MenuGroupSpec`/`MenuSpec` and mirrors
// `chromeBar.tsx`'s `BurgerMenuGroups`/`BurgerMenuEntry` almost line for
// line, over `ContextMenu*` parts instead of `DropdownMenu*`: MENU-KIT-
// DESIGN.md §5 names exactly one place menu-as-data belongs — a surface
// whose items come from the HOST rather than from an authored JSX site.
// `ChromeBarProps.fileActions` is one such surface (fed by a whole scene's
// worth of files); a right-click menu built from a resolved `Target` is the
// same situation at object scale, so the same data shape and the same
// recursive-renderer idiom apply, over the sibling stock part.
//
// WHY the target resolution and the menu opening live in ONE component
// rather than two: `ComponentContextMenu` is the only place that has BOTH
// the real DOM event (`onContextMenu`, needed to resolve WHAT was pressed)
// and Base UI's own open/close lifecycle (`ContextMenu`'s `onOpenChange`,
// needed to know when to forget the last resolution) — splitting them would
// mean passing a DOM event handle across a component boundary for no reason.
import { Fragment, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../components/context-menu";
import type { MenuAction, MenuGroupSpec, MenuSpec } from "./contextMenuModel";
import { resolveContextMenuTarget, type ContextMenuTarget } from "./contextMenuTarget";

function isSubmenuEntry(item: MenuAction | { submenu: MenuSpec }): item is { submenu: MenuSpec } {
  return "submenu" in item;
}

/** One row — mirrors `chromeBar.tsx`'s `BurgerMenuEntry` exactly, over
 *  `ContextMenuItem`/`ContextMenuCheckboxItem`/`ContextMenuSub` instead of
 *  the dropdown's siblings. Same `checked !== undefined` protocol: a row
 *  that never sets `checked` renders as a plain item, one that does — even
 *  `checked: false` — renders as a real (un)checked checkbox row. */
function ContextMenuEntry({ item }: { item: MenuAction | { submenu: MenuSpec } }) {
  if (isSubmenuEntry(item)) {
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger data-testid={`context-menu-submenu-${item.submenu.id}`}>
          <span className="truncate">{item.submenu.label}</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuGroups groups={item.submenu.groups} />
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }
  const action = item;
  if (action.checked !== undefined) {
    return (
      <ContextMenuCheckboxItem
        checked={action.checked}
        disabled={action.disabled}
        title={action.title}
        onCheckedChange={action.run}
        data-testid={`context-menu-item-${action.id}`}
      >
        {action.icon}
        <span className="truncate">{action.label}</span>
      </ContextMenuCheckboxItem>
    );
  }
  return (
    <ContextMenuItem
      disabled={action.disabled}
      variant={action.destructive ? "destructive" : "default"}
      title={action.title}
      onClick={action.run}
      data-testid={`context-menu-item-${action.id}`}
    >
      {action.icon}
      <span className="truncate">{action.label}</span>
    </ContextMenuItem>
  );
}

/** Same "separator BETWEEN groups only" rule as `chromeBar.tsx`'s
 *  `BurgerMenuGroups` — a one-group menu (`buildRegionFrameMenu`) renders
 *  zero separators, not a dangling one. */
function ContextMenuGroups({ groups }: { groups: readonly MenuGroupSpec[] }) {
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? <ContextMenuSeparator /> : null}
          <ContextMenuGroup>
            {group.items.map((item) => (
              <ContextMenuEntry key={isSubmenuEntry(item) ? item.submenu.id : item.id} item={item} />
            ))}
          </ContextMenuGroup>
        </Fragment>
      ))}
    </>
  );
}

export interface ComponentContextMenuProps {
  /** The real, rendered component(s) — a `Block`, a `BlockPort`, a `Trace`
   *  inside its own `<svg>`, a `Region` — this wraps without changing their
   *  DOM contract (Base UI's `ContextMenuTrigger` renders one plain `<div>`
   *  around `children`, the same "renders a `<div>`" contract every other
   *  stock trigger in this kit carries). */
  children: ReactNode;
  /**
   * Resolve WHAT was pressed, from the real `contextmenu` event, and build
   * its `MenuSpec` — or `null` to open no menu at all (a press that hit
   * none of this kit's canvas objects; `contextMenuTarget.ts`'s own
   * `null` case). Called synchronously inside the trigger's own
   * `onContextMenu`, before Base UI's internal open/close state settles —
   * both are set from the same native event, so React batches them into
   * one render with the menu content already correct the first time it
   * mounts (see this file's header WHY).
   */
  resolveTarget(event: ReactMouseEvent<HTMLDivElement>, target: ContextMenuTarget | null): MenuSpec | null;
  className?: string;
  testId?: string;
}

/**
 * The generic wrapper: right-click anywhere inside `children`, get the menu
 * for whatever was actually under the pointer. `resolveTarget` receives
 * BOTH the raw event (so a caller can read `clientX`/`clientY` if it ever
 * needs to) and the already-resolved `ContextMenuTarget` (via
 * `resolveContextMenuTarget(event.target)`), so most callers never touch
 * `contextMenuTarget.ts` directly — they just switch on `target.kind`.
 */
export function ComponentContextMenu({ children, resolveTarget, className, testId }: ComponentContextMenuProps) {
  const [spec, setSpec] = useState<MenuSpec | null>(null);

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const element = event.target;
    if (!(element instanceof Element)) {
      setSpec(null);
      return;
    }
    const target = resolveContextMenuTarget(element);
    setSpec(resolveTarget(event, target));
  };

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // Forget the last resolution once the menu closes — the NEXT
        // right-click always re-resolves from a fresh event rather than
        // reusing a stale target, so a menu can never open pre-populated
        // for the wrong element for even one frame.
        if (!open) setSpec(null);
      }}
    >
      <ContextMenuTrigger data-testid={testId} className={className} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      {spec ? (
        <ContextMenuContent aria-label={spec.label} data-testid={testId ? `${testId}-content` : undefined}>
          <ContextMenuGroups groups={spec.groups} />
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
}
