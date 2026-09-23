// src/editor/chromeBar.tsx — the top-left bar (docs/menus/screenshots/
// 05-chrome-bar.png, 09-draft-title-bar.png's bottom row). Ported from
// /home/bam/systemsketch/src/chrome/TitleBar.tsx:1-630 — the burger →
// back/forward → breadcrumb → draft chip → depth badge cluster, minus every
// tldraw/editor/depth-model dependency the donor pulls in (`useEditor`,
// `subscribeDepthNavigation`, `useDepthHistoryInputs`, `useDocumentIdentity`).
// The bar's own shape — one `Toolbar.Root` owning the separators and roving
// focus, `FileAction[]` feeding both the dropdown AND the context menu so
// they cannot drift, `data-active` as a presence test on the draft chip, the
// ellipsis-is-a-real-menu breadcrumb — travels verbatim; only the state that
// travelled through tldraw hooks becomes plain props (docs/menus/
// MENU-KIT-DESIGN.md §4, "Chrome bar" host contract).
//
// `segmentBreadcrumbs`/`compactDepthBreadcrumbs` (the character-budget
// elision behind the `…` disclosure) are lane E's `breadcrumbCompact.ts`,
// itself ported from /home/bam/systemsketch/src/depth/depthBreadcrumbs.ts and
// TitleBar.tsx:130-160 — not reimplemented here.
"use client";

import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FolderOpen,
  Home,
  Menu as MenuIcon,
  PencilLine,
  Save,
  Trash2,
} from "lucide-react";

import { cn } from "../lib/utils";
import { badgeVariants } from "../components/badge";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";
import { segmentBreadcrumbs, type DepthBreadcrumbItem } from "./breadcrumbCompact";
import { Button } from "../components/button";
import { ButtonGroup } from "../components/button-group";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../components/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";
import { InlineRename } from "../components/inlineRename";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "./toolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/tooltip";

/** One row of the file crumb's menu. `icon` is a `ReactNode`, never a string
 *  id (MENU-KIT-DESIGN.md §5: "no string→asset registry; a host passes
 *  elements") — the donor's `FileActionIcon` id-switch does not travel. */
export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  /** A toggle row (Preferences ▸ Snap mode). Present → the burger renders a
   *  `DropdownMenuCheckboxItem` with `aria-checked`; absent → a plain item.
   *  CONTRACT (docs/CHROME-FILES-SETTINGS-PLAN.md, lane chrome-rename-burger):
   *  adds-only, every current consumer omits it. */
  checked?: boolean;
  /** The row's full text on hover, e.g. an Open recent row's absolute path —
   *  truthful rendering: a truncated label keeps its whole value one hover
   *  away. Adds-only, same plan. */
  title?: string;
  /** A small trailing status chip — e.g. a "which channel does this row
   *  actually open" badge (Zach, 2026-09-22: "a little badge there saying
   *  like (preview) or (stable)"). Rendered as its OWN element after the
   *  label (`data-slot="menu-action-badge"`), never folded into `label`
   *  itself — a consumer that mutated `label` to carry this broke
   *  `apps/systemsketch/src/sites.smoke.test.tsx`, which keys a row by its
   *  exact rendered name; the row's name must survive a badge changing
   *  underneath it. Adds-only, every current consumer omits it. */
  badge?: ReactNode;
  run(): void;
}

export interface MenuGroupSpec {
  id: string;
  label?: string;
  items: readonly (MenuAction | { submenu: MenuSpec })[];
}

export interface MenuSpec {
  id: string;
  label: string;
  groups: readonly MenuGroupSpec[];
}

export type StatusTone = "ok" | "pending" | "error";

/** A single breadcrumb level. Structurally a `DepthBreadcrumbItem`
 *  (`breadcrumbCompact.ts`) plus the two fields the depth badge/menu need
 *  that the elision math itself doesn't: whether the level can be jumped to
 *  at all, and its raw depth number for the shortcut column. */
export interface Crumb extends DepthBreadcrumbItem {
  canFocus: boolean;
  depth: number;
}

export interface ChromeBarProps {
  /** The burger (leftmost icon). One `MenuSpec` of nested groups/submenus —
   *  the one place this design allows menu-as-data on a command surface,
   *  because a file/settings menu's items genuinely come from the host and
   *  are never "contribute an item without editing a file" (MENU-KIT-DESIGN
   *  §1). Every other menu in this kit is JSX the consumer owns. */
  menu: MenuSpec;
  history: {
    canGoBack: boolean;
    canGoForward: boolean;
    onBack(): void;
    onForward(): void;
  };
  identity: {
    title: string;
    statusTone: StatusTone;
    statusLabel: string;
    /** Shown on the title's `title=` tooltip, never truncated (truthful
     *  rendering) — omit when the document has never been saved. */
    path?: string;
  };
  /** The file title's rename lifecycle. Controlled: no F2 keybinding lives
   *  here (host-contract §4 — F2 is a global gesture the host wires onto
   *  `onBegin`, the same way mouse-buttons-3/4 are host gestures for
   *  `history`). */
  rename: {
    active: boolean;
    onBegin(): void;
    onCommit(next: string): void;
    onCancel(): void;
    error?: string | null;
    busy?: boolean;
  };
  /** Levels below the root (the file title IS the root crumb — see
   *  `identity.title`, not a `Crumb` of its own; GitHub puts the branch
   *  selector beside the repo name for the same reason the donor gives no
   *  separator between the title and `draftChip` below). */
  crumbs: readonly Crumb[];
  /** Total depth, shown on the trailing badge and its "structural path"
   *  menu — independent of how many `crumbs` the character budget elides. */
  depth: number;
  onReturnToRoot(): void;
  onJumpToLevel(id: string): void;
  /** Feeds BOTH the file title's dropdown and its right-click context menu —
   *  one list so the two cannot drift (MENU-KIT-DESIGN §5, §9). */
  fileActions: readonly MenuAction[];
  /** The `<BranchChip/>` slot (docs/menus/screenshots/05, 09). A `ReactNode`
   *  rather than a fixed prop shape: `branchChip.tsx` owns its own props,
   *  this bar only reserves the seat GitHub reserves beside the repo name. */
  draftChip?: ReactNode;
  /** Portal target inside the host's token scope (host-contract §4).
   *  Forwarded to the context menu and to nested `draftChip` popovers that
   *  accept it; `dropdown-menu.tsx`'s own `Positioner` does not yet expose a
   *  `container` Pick (only `anchor` was widened for this build — see its
   *  header) so the burger/file/ellipsis/depth dropdowns still portal to
   *  `document.body` until that file grows the same Pick context-menu.tsx
   *  already has. Not this lane's file to edit. */
  container?: HTMLElement | null;
  /** Host CSS on the rendered popup's own `[data-slot=…]` — stacking/
   *  z-order. The kit ships zero z-index (host-contract §4). */
  popupClassName?: string;
  testIdPrefix?: string;
}

/** The little status dot beside the file title (green in both screenshots —
 *  `ok`). Exported standalone: the donor's `<i data-state={...}/>` is styled
 *  entirely in `title-bar.css`, which does not travel; this is the same
 *  presence-as-data-attribute idea over a real element with an accessible
 *  label instead of a stylesheet-only glyph. */
export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      data-slot="chrome-bar-status-dot"
      data-tone={tone}
      aria-label={label}
      title={label}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        tone === "ok" && "bg-green-600 dark:bg-green-400",
        tone === "pending" && "bg-amber-500 dark:bg-amber-400",
        tone === "error" && "bg-destructive",
      )}
    />
  );
}

function isSubmenuEntry(item: MenuAction | { submenu: MenuSpec }): item is { submenu: MenuSpec } {
  return "submenu" in item;
}

/** Recursive burger renderer — the only menu in this kit built from data
 *  instead of JSX (see `ChromeBarProps.menu`'s WHY). `DropdownMenuSub`
 *  handles arbitrary nesting depth even though neither screenshot shows one;
 *  `MenuSpec.groups` already models it and a host file menu commonly grows a
 *  "Recent files" or "Export as" submenu later. */
function BurgerMenuEntry({ item }: { item: MenuAction | { submenu: MenuSpec } }) {
  if (isSubmenuEntry(item)) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="truncate">{item.submenu.label}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <BurgerMenuGroups groups={item.submenu.groups} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  const action = item;
  // WHY `checked !== undefined` (not `action.checked`) picks the checkbox
  // renderer: `MenuAction.checked`'s own CONTRACT (this file's header) is
  // adds-only and "every current consumer omits it" — a row that never sets
  // it must render exactly as before. `checked: false` (Preferences ▸ Show
  // grid, unset) still has to render as a REAL unchecked checkbox row, not
  // fall through to a plain item, so testing truthiness would silently
  // un-render half of `AppMenu.stories.tsx`'s own toggle pair.
  if (action.checked !== undefined) {
    return (
      <DropdownMenuCheckboxItem
        checked={action.checked}
        disabled={action.disabled}
        title={action.title}
        onCheckedChange={action.run}
      >
        {action.icon}
        <span className="truncate">{action.label}</span>
        {action.badge ? <span data-slot="menu-action-badge" className="text-muted-foreground shrink-0 truncate text-xs">{action.badge}</span> : null}
        {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
      </DropdownMenuCheckboxItem>
    );
  }
  return (
    <DropdownMenuItem
      disabled={action.disabled}
      variant={action.destructive ? "destructive" : "default"}
      title={action.title}
      onClick={action.run}
    >
      {action.icon}
      <span className="truncate">{action.label}</span>
      {action.badge ? <span data-slot="menu-action-badge" className="text-muted-foreground shrink-0 truncate text-xs">{action.badge}</span> : null}
      {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  );
}

// WHY a separator sits BETWEEN groups only (never leading/trailing): the
// plan's "no stray separator ever renders" rule for the groups themselves
// (`appMenu.ts`'s header) extends to the dividers between them — a host
// that ends up with one group (e.g. `bare` in `appMenu.test.ts`) gets zero
// separators, not a dangling one before or after it.
function BurgerMenuGroups({ groups }: { groups: readonly MenuGroupSpec[] }) {
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuGroup>
            {group.label ? <DropdownMenuLabel>{group.label}</DropdownMenuLabel> : null}
            {group.items.map((item) => (
              <BurgerMenuEntry key={isSubmenuEntry(item) ? item.submenu.id : item.id} item={item} />
            ))}
          </DropdownMenuGroup>
        </Fragment>
      ))}
    </>
  );
}

function BurgerMenu({
  menu,
  container,
  popupClassName,
  testIdPrefix,
}: {
  menu: MenuSpec;
  container?: HTMLElement | null;
  popupClassName?: string;
  testIdPrefix?: string;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<ToolbarButton render={<Button variant="ghost" size="icon-sm" className="text-inherit" />} />}
              aria-label={menu.label}
              data-testid={testIdPrefix ? `${testIdPrefix}-burger` : undefined}
            />
          }
        >
          <MenuIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{menu.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent className={cn("w-64", popupClassName)} align="start">
        <BurgerMenuGroups groups={menu.groups} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The file crumb: a Home target, the document's name, and its save state.
 *
 * WHY the name is a menu trigger and not a link or a straight-to-edit button
 * (ported verbatim, TitleBar.tsx:186-192): Zach picked Figma's file-name
 * pattern — one click opens the file menu, a very fast double click drops
 * into an inline editor, and right-click offers Rename at the top. The
 * tempting alternative (click = rename) makes the most common gesture the
 * destructive-ish one and leaves the file commands reachable only from the
 * hamburger.
 *
 * WHY the Home icon and not the name is the root target (TitleBar.tsx:
 * 194-198): "click it returns you there" — the name's own click is already
 * spoken for by the menu, so return-to-root gets its own hit area. The
 * name's menu still carries "Return to board root" as `fileActions[0]` for
 * anyone who reaches for the name instead.
 */
function FileCrumb({
  identity,
  rename,
  fileActions,
  atRoot,
  onReturnToRoot,
  container,
  popupClassName,
  testIdPrefix,
}: {
  identity: ChromeBarProps["identity"];
  rename: ChromeBarProps["rename"];
  fileActions: readonly MenuAction[];
  atRoot: boolean;
  onReturnToRoot(): void;
  container?: HTMLElement | null;
  popupClassName?: string;
  testIdPrefix?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const homeLabel = `Board root · ${identity.title}`;

  // WHY the field's exact box is MEASURED, not styled to match (Zach,
  // 2026-09-19, screenshot `Pasted image 20260919135024.png`: "I don't like
  // how this textbox moves up when I click it… please don't show the
  // control hints"): the title button's width comes from its truncated
  // text content plus the status dot, a size no fixed CSS rule reproduces
  // for an arbitrary title. A `useLayoutEffect` that runs on every
  // non-active render keeps the LAST real box in a ref (not state — this
  // must never itself cause a render), so the swap to `InlineRename` reads
  // the exact rect the button just had, however it got there (double
  // click, the context menu's Rename, or a future F2 handler the host
  // wires onto `rename.onBegin`).
  const titleRef = useRef<HTMLButtonElement | null>(null);
  const titleBoxRef = useRef<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!rename.active && titleRef.current) {
      const rect = titleRef.current.getBoundingClientRect();
      titleBoxRef.current = { width: rect.width, height: rect.height };
    }
  });

  // WHY the double click is handled here rather than left to the menu
  // (ported, TitleBar.tsx:218-225): the first click of a double click has
  // already opened the dropdown by the time the second lands, so the rename
  // has to close it explicitly — otherwise the editor mounts underneath an
  // open menu still holding focus.
  const onDoubleClick = useCallback(() => {
    setMenuOpen(false);
    rename.onBegin();
  }, [rename]);

  const renameAction = fileActions.find((action) => action.id === "rename");
  const contextActions = renameAction
    ? [renameAction, ...fileActions.filter((action) => action.id !== "rename")]
    : fileActions;

  return (
    <BreadcrumbItem className="min-w-0 gap-0.5">
      {atRoot ? (
        // WHY `aria-label`, not a literal `sr-only` span repeating
        // `identity.title` (fixed 2026-09-18): the file name is ALREADY
        // rendered as visible text a few pixels to the right by the
        // unconditional name/dropdown block below — `atRoot` only chooses
        // between this static root icon and the clickable "back to root"
        // button, it never hides that name. A literal text node here
        // duplicated it, so `getByText(identity.title)` (and a screen
        // reader visiting both nodes) found it twice. `aria-label` gives
        // this icon its own accessible name without adding a second
        // visible-text copy — same pattern the non-atRoot branch already
        // uses on its `TooltipTrigger` below.
        <BreadcrumbPage
          className="flex size-6 shrink-0 items-center justify-center"
          data-testid={testIdPrefix ? `${testIdPrefix}-root` : undefined}
          title={homeLabel}
          aria-label={homeLabel}
        >
          <Home className="size-3.5" aria-hidden="true" />
        </BreadcrumbPage>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <BreadcrumbLink
                render={<ToolbarButton render={<Button variant="ghost" size="icon-xs" className="text-inherit" />} />}
              />
            }
            className="shrink-0"
            data-testid={testIdPrefix ? `${testIdPrefix}-root` : undefined}
            aria-label={homeLabel}
            onClick={onReturnToRoot}
          >
            <Home aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Board root</TooltipContent>
        </Tooltip>
      )}
      {rename.active ? (
        // WHY a wrapper carries `busy` rather than a prop on `InlineRename`
        // itself: that field ships zero disabled/busy affordance (its own
        // props are `value`/`onCommit`/`onCancel`/`validate`/`error`/`size`
        // only) — an async commit that round-trips through the host (a
        // server rename) still needs to freeze input while it's in flight,
        // so this wraps rather than forking the shared field a second time.
        <span
          data-slot="chrome-bar-rename-busy"
          aria-busy={rename.busy || undefined}
          className={cn(rename.busy && "pointer-events-none opacity-60")}
        >
          <InlineRename
            value={identity.title}
            onCommit={rename.onCommit}
            onCancel={rename.onCancel}
            error={rename.error}
            size="bar"
            style={titleBoxRef.current ?? undefined}
            aria-label={`Rename ${identity.title}`}
          />
        </span>
      ) : (
        // WHY the context trigger is a `display: contents` wrapper and not
        // the button itself (ported verbatim, TitleBar.tsx:267-274): both
        // `Menu.Trigger` and `ContextMenu.Trigger` resolve their store from
        // the NEAREST `MenuRootContext`, so composing them onto one element
        // via `render` silently binds both to the inner root — measured: a
        // left click toggled the context menu's store, which has no click
        // anchor, and the file menu never opened. Nesting the dropdown
        // INSIDE the context trigger gives each its own root while
        // `contextmenu` still bubbles up from the button.
        <ContextMenu>
          <ContextMenuTrigger render={<span className="contents" />}>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                ref={titleRef}
                render={<ToolbarButton render={<button type="button" className="text-inherit" />} />}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 text-sm hover:bg-muted"
                data-testid={testIdPrefix ? `${testIdPrefix}-title` : undefined}
                aria-label={`${identity.title} ${identity.statusLabel}. Click for file menu, double-click to rename.`}
                title={`${identity.path ?? ""} · ${identity.statusLabel}`}
                onDoubleClick={onDoubleClick}
              >
                <span className="max-w-56 truncate">{identity.title}</span>
                <StatusDot tone={identity.statusTone} label={identity.statusLabel} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className={cn("w-64", popupClassName)}
                data-testid={testIdPrefix ? `${testIdPrefix}-file-menu` : undefined}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{identity.title}</DropdownMenuLabel>
                  {fileActions.map((action) => (
                    <DropdownMenuItem
                      key={action.id}
                      disabled={action.disabled}
                      variant={action.destructive ? "destructive" : "default"}
                      onClick={action.run}
                    >
                      {action.icon}
                      <span className="truncate">{action.label}</span>
                      {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ContextMenuTrigger>
          <ContextMenuContent
            container={container}
            positionerClassName={popupClassName}
            className="min-w-56"
            data-testid={testIdPrefix ? `${testIdPrefix}-file-context-menu` : undefined}
          >
            <ContextMenuGroup>
              {contextActions.map((action) => (
                <ContextMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  variant={action.destructive ? "destructive" : "default"}
                  onClick={action.run}
                >
                  {action.icon}
                  <span className="truncate">{action.label}</span>
                  {action.shortcut ? <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut> : null}
                </ContextMenuItem>
              ))}
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </BreadcrumbItem>
  );
}

export function ChromeBar({
  menu,
  history,
  identity,
  rename,
  crumbs,
  depth,
  onReturnToRoot,
  onJumpToLevel,
  fileActions,
  draftChip,
  container,
  popupClassName,
  testIdPrefix,
}: ChromeBarProps) {
  const atRoot = crumbs.length === 0;
  const segments = segmentBreadcrumbs(identity.title, crumbs);
  const currentCrumb = crumbs.find((crumb) => crumb.isCurrent);
  const levelWord = depth === 1 ? "level" : "levels";

  // WHY this bar owns its own `TooltipProvider` rather than leaving it to
  // the host the way `Bar`'s slot content does (see `Block.stories.tsx`'s
  // footer, which wraps its OWN tooltip): every tooltip in this bar (Home,
  // Back, Forward, the burger) is fixed internal chrome, never host-composed
  // slot content, so there is no call site outside this file that could
  // supply the provider. Base UI's `Tooltip.Root` reads the provider via
  // plain `useContext` (no throw if absent), so nesting this one under a
  // host's own `TooltipProvider` — e.g. a page that also renders `Toolbar`s
  // elsewhere — is harmless; the nearer provider simply wins.
  return (
    <TooltipProvider delay={350}>
    <Toolbar
      aria-label="Board and depth navigation"
      data-testid={testIdPrefix}
      data-depth={depth}
      className="w-fit rounded-full border border-border bg-card px-2 py-1 text-card-foreground"
    >
      <BurgerMenu menu={menu} container={container} popupClassName={popupClassName} testIdPrefix={testIdPrefix} />
      <ToolbarSeparator orientation="vertical" />
      {/* WHY Back/Forward sit LEFT of the path rather than after it (ported,
          TitleBar.tsx:405-410) — Zach's call: "like Chrome — it makes it
          clear they are related to the depth levels." Chrome's arrows
          precede the address they act on, and these act on exactly the
          levels drawn to their right; parking them after the trail made
          them read as a fourth segment of the path instead of a control
          over it. */}
      <ButtonGroup className="shrink-0" aria-label="Navigation history">
        <Tooltip>
          {/* WHY `disabled` is set TWICE (fixed 2026-09-18): Base UI's own
              `TooltipTrigger` type docs it plainly — "this doesn't apply
              the disabled attribute to the trigger element... pass the
              disabled prop to the trigger element via the render prop" —
              `TooltipTrigger`'s `disabled` only gates whether ITS OWN
              tooltip is allowed to open, never whether the button beneath
              it is disabled or clickable. Passing only the first (as this
              file did until now) left Back/Forward always enabled and
              always clickable regardless of `history.canGoBack/Forward` —
              `aria-disabled` stayed `"false"` and no native `disabled`
              attribute ever appeared. The second `disabled`, on the actual
              `Button` in the `render` chain, is the one that disables the
              element itself. */}
          <TooltipTrigger
            render={
              <ToolbarButton
                render={<Button variant="ghost" size="icon-sm" className="text-inherit" disabled={!history.canGoBack} />}
              />
            }
            aria-label="Back"
            disabled={!history.canGoBack}
            onClick={history.onBack}
          >
            <ArrowLeft aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Back to previous view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <ToolbarButton
                render={
                  <Button variant="ghost" size="icon-sm" className="text-inherit" disabled={!history.canGoForward} />
                }
              />
            }
            aria-label="Forward"
            disabled={!history.canGoForward}
            onClick={history.onForward}
          >
            <ArrowRight aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Forward to next view</TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <ToolbarSeparator orientation="vertical" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap gap-1 text-xs">
          <FileCrumb
            identity={identity}
            rename={rename}
            fileActions={fileActions}
            atRoot={atRoot}
            onReturnToRoot={onReturnToRoot}
            container={container}
            popupClassName={popupClassName}
            testIdPrefix={testIdPrefix}
          />
          {/* WHY no separator between the file crumb and the draft chip
              (ported, TitleBar.tsx:458-462): a draft is not a level of the
              path, it is which VERSION of the whole path you're looking at
              — GitHub puts its branch selector beside the repo name for the
              same reason. A `›` here would claim the draft sits inside the
              board, one step down. */}
          {draftChip ? <BreadcrumbItem className="shrink-0">{draftChip}</BreadcrumbItem> : null}
          {segments.map((segment, index) => (
            <Fragment key={segment.kind === "elision" ? `elision-${index}` : segment.entry.id}>
              <BreadcrumbSeparator className="shrink-0" />
              {segment.kind === "elision" ? (
                <BreadcrumbItem className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <ToolbarButton render={<Button variant="ghost" size="icon-xs" className="text-inherit" />} />
                      }
                      aria-label={`${segment.hidden.length} intermediate ${segment.hidden.length === 1 ? "level" : "levels"} hidden`}
                      data-testid={testIdPrefix ? `${testIdPrefix}-ellipsis` : undefined}
                    >
                      <BreadcrumbEllipsis className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className={cn("w-64", popupClassName)}
                      data-testid={testIdPrefix ? `${testIdPrefix}-hidden-levels` : undefined}
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Hidden levels</DropdownMenuLabel>
                        {segment.hidden.map((hidden) => (
                          <DropdownMenuItem
                            key={hidden.id}
                            disabled={!hidden.canFocus}
                            title={hidden.canFocus ? `Jump to ${hidden.name}` : `${hidden.name} is not Expanded`}
                            onClick={() => onJumpToLevel(hidden.id)}
                          >
                            <span className="truncate">{hidden.name}</span>
                            <DropdownMenuShortcut>{hidden.depth}</DropdownMenuShortcut>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
              ) : segment.entry.isCurrent ? (
                <BreadcrumbItem className="min-w-0">
                  {/* The ellipsis lives on an inner span: `truncate` on the
                      flex box itself clips mid-glyph with no "…" (measured
                      by the donor), and the raw name stays on `title`
                      either way, so nothing is silently lost. */}
                  <BreadcrumbPage
                    className="flex h-6 max-w-56 items-center px-2 font-medium"
                    data-testid={testIdPrefix ? `${testIdPrefix}-crumb` : undefined}
                    title={segment.entry.name}
                  >
                    <span className="truncate">{segment.entry.name}</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbLink
                    render={<ToolbarButton render={<Button variant="ghost" size="xs" className="text-inherit" />} />}
                    className="max-w-40 truncate"
                    data-testid={testIdPrefix ? `${testIdPrefix}-crumb` : undefined}
                    title={segment.entry.name}
                    onClick={() => onJumpToLevel(segment.entry.id)}
                  >
                    <span className="truncate">{segment.entry.name}</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              )}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {/* WHY the depth count is the structural-path trigger (ported,
          TitleBar.tsx:572-577): a menu anchored to its own trigger recovers
          the same affordance as a hand-positioned popover with none of the
          outside-click/Escape/collision-padding code that requires — and
          the count is already the only thing in the bar that says how deep
          the path is. */}
      <DropdownMenu>
        {/* WHY a `ToolbarButton` styled with `badgeVariants` rather than
            composing the real `Badge` (donor: `<Badge render={<Toolbar.
            Button/>}/>`): this kit's `badge.tsx` deliberately ships no
            `render`/Slot support ("this app has no reason yet to render a
            Badge as a link" — its own header) — a trigger has to be a real
            focusable, clickable element regardless, so borrowing the badge's
            classes onto the element that actually needs to BE one keeps the
            "no asChild on Badge" decision intact instead of quietly
            re-adding composition through a second door. */}
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              className={cn(badgeVariants({ variant: "secondary" }), "ml-1 shrink-0 cursor-default tabular-nums")}
            />
          }
          data-testid={testIdPrefix ? `${testIdPrefix}-depth-badge` : undefined}
          aria-label={`Show structural path at depth ${depth}`}
          title="Show structural path"
        >
          {depth}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn("w-72", popupClassName)}
          align="end"
          data-testid={testIdPrefix ? `${testIdPrefix}-path` : undefined}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>{`Structural path · ${depth} ${levelWord}`}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={atRoot}
              aria-current={atRoot ? "page" : undefined}
              // WHY a tint replaces the trailing check (sibling of the same
              // fix in toolDock.tsx, Zach 2026-09-21): the check sat right
              // beside this row's own shortcut column (`0`), the same
              // "indicator borrows the shortcut's space" shape. `aria-current`
              // already carries the accessible state, so nothing but the
              // visible check-mark is removed.
              data-current={atRoot || undefined}
              className="data-current:bg-primary/15"
              title={`Board root · ${identity.title}`}
              onClick={onReturnToRoot}
            >
              <Home aria-hidden="true" />
              <span className="truncate">{identity.title}</span>
              <DropdownMenuShortcut>0</DropdownMenuShortcut>
            </DropdownMenuItem>
            {crumbs.map((crumb) => (
              <DropdownMenuItem
                key={crumb.id}
                disabled={crumb.isCurrent || !crumb.canFocus}
                aria-current={crumb.isCurrent ? "page" : undefined}
                data-current={crumb.isCurrent || undefined}
                className="data-current:bg-primary/15"
                title={crumb.canFocus ? `Jump to ${crumb.name}` : `${crumb.name} is not Expanded`}
                onClick={() => onJumpToLevel(crumb.id)}
              >
                <span className="truncate">{crumb.name}</span>
                <DropdownMenuShortcut>{crumb.depth}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" aria-live="polite">
        {`Current scope: ${currentCrumb?.name ?? identity.title}, depth ${depth}`}
      </span>
    </Toolbar>
    </TooltipProvider>
  );
}

// Re-exported so a host building `fileActions`/`menu` from a fixed set of
// verbs (Rename, Save As, Copy Path, Show in Files, Move to Trash) doesn't
// have to import `lucide-react` a second time just to match this bar's own
// icon choices (TitleBar.tsx:172-181's `FileActionIcon`, generalized: the
// host now passes the element directly instead of an id this component
// switches on).
export const ChromeBarIcons = {
  rename: <PencilLine aria-hidden="true" />,
  saveAs: <Save aria-hidden="true" />,
  copyPath: <Copy aria-hidden="true" />,
  reveal: <FolderOpen aria-hidden="true" />,
  trash: <Trash2 aria-hidden="true" />,
  root: <Home aria-hidden="true" />,
} satisfies Record<string, ReactElement>;
