import {
  DefaultToolbar,
  GeoShapeGeoStyle,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiButtonLabel,
  TldrawUiDropdownMenuContent,
  TldrawUiDropdownMenuItem,
  TldrawUiDropdownMenuRoot,
  TldrawUiDropdownMenuTrigger,
  TldrawUiToolbarButton,
  useEditor,
  useTools,
  useValue,
  type TLUiIconJsx,
  type TLUiToolItem,
  type TLUiToolsContextType,
} from "tldraw";
import { useId, type ReactNode } from "react";

import { BBOX_BLOCK_TOOL_ID, BBOX_PORT_TOOL_ID } from "@bbox-ui/adapter-tldraw";

import { BlockToolIcon, PortToolIcon } from "./icons";
import {
  useToolbarPreferences,
  type BlackBoxFamilyTool,
  type DrawFamilyTool,
  type ShapeFamilyTool,
} from "./toolbarModel";
import "./playground-toolbar.css";

interface FamilyMenuItem<Id extends string> {
  id: Id;
  label: string;
  icon: string | TLUiIconJsx;
  shortcut?: string;
}

/**
 * The bbox-ui family. Adding a primitive later is one entry here (plus its
 * tool registration in overrides.tsx) — this list grows every iteration.
 */
const BLACK_BOX_MENU_ITEMS: readonly FamilyMenuItem<BlackBoxFamilyTool>[] = [
  { id: BBOX_BLOCK_TOOL_ID, label: "Block", icon: <BlockToolIcon />, shortcut: "B" },
  { id: BBOX_PORT_TOOL_ID, label: "Port", icon: <PortToolIcon />, shortcut: "P" },
];

const SHAPE_MENU_ITEMS: readonly FamilyMenuItem<ShapeFamilyTool>[] = [
  { id: "rectangle", label: "Rectangle", icon: "geo-rectangle", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", icon: "geo-ellipse", shortcut: "O" },
  { id: "triangle", label: "Triangle", icon: "geo-triangle" },
  { id: "diamond", label: "Diamond", icon: "geo-diamond" },
  { id: "line", label: "Line", icon: "tool-line", shortcut: "L" },
  { id: "arrow", label: "Arrow", icon: "tool-arrow", shortcut: "A" },
];

const DRAW_MENU_ITEMS: readonly FamilyMenuItem<DrawFamilyTool>[] = [
  { id: "draw", label: "Pen", icon: "tool-pencil", shortcut: "D" },
  { id: "highlight", label: "Highlighter", icon: "tool-highlight", shortcut: "⇧ D" },
];

const SHAPE_BY_ID = Object.fromEntries(
  SHAPE_MENU_ITEMS.map((item) => [item.id, item]),
) as Record<ShapeFamilyTool, FamilyMenuItem<ShapeFamilyTool>>;

function isSupportedShapeTool(
  value: string | undefined,
): value is ShapeFamilyTool {
  return value !== undefined && value in SHAPE_BY_ID;
}

function selectTool(tools: TLUiToolsContextType, id: string): void {
  tools[id]?.onSelect("toolbar");
}

function ToolMenuItem({
  icon,
  label,
  shortcut,
  selected,
  onSelect,
}: {
  icon: string | TLUiIconJsx;
  label: string;
  shortcut?: string;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <TldrawUiDropdownMenuItem>
      <TldrawUiButton
        type="menu"
        className="bbox-tool-menu__item"
        data-isactive={selected}
        onClick={onSelect}
      >
        <TldrawUiButtonIcon icon={icon} small />
        <TldrawUiButtonLabel>{label}</TldrawUiButtonLabel>
        {shortcut ? <kbd>{shortcut}</kbd> : null}
        <span className="bbox-tool-menu__check" aria-hidden="true">
          {selected ? "✓" : ""}
        </span>
      </TldrawUiButton>
    </TldrawUiDropdownMenuItem>
  );
}

function SimpleToolSlot({
  tool,
  fallbackIcon,
  title,
  active,
}: {
  tool: TLUiToolItem | undefined;
  fallbackIcon: string;
  title: string;
  active: boolean;
}) {
  const disabled = !tool;
  return (
    <TldrawUiToolbarButton
      type="tool"
      className="bbox-toolbar-tool"
      title={disabled ? `${title} is unavailable` : title}
      data-value={`bbox-${title.toLowerCase()}`}
      data-testid={`bbox-tool-${title.toLowerCase()}`}
      aria-pressed={active}
      isActive={active}
      disabled={disabled}
      onClick={() => tool?.onSelect("toolbar")}
    >
      <TldrawUiButtonIcon icon={tool?.icon ?? fallbackIcon} />
    </TldrawUiToolbarButton>
  );
}

/**
 * A family slot is one toolbar button that both selects and opens: pressing
 * it arms the family's current tool and drops its menu at once.
 */
function FamilyToolSlot({
  family,
  icon,
  label,
  active,
  currentToolId,
  onSelect,
  children,
}: {
  family: "blackbox" | "shape" | "draw";
  icon: string | TLUiIconJsx;
  label: string;
  active: boolean;
  currentToolId: string;
  onSelect(): void;
  children: ReactNode;
}) {
  const menuId = `bbox-${family}-${useId()}`;
  return (
    <TldrawUiDropdownMenuRoot id={menuId}>
      <TldrawUiDropdownMenuTrigger>
        <TldrawUiToolbarButton
          type="tool"
          className="bbox-family-tool"
          title={`${label} · Open ${family} tools`}
          data-family={family}
          data-value={`bbox-${family}`}
          data-current-tool={currentToolId}
          aria-pressed={active}
          isActive={active}
          data-testid={`bbox-tool-${family}`}
          onPointerDown={(event) => {
            if (event.button === 0) onSelect();
          }}
          onClick={(event) => {
            // Pointer activation already happened before Radix opened the menu,
            // which lets the menu keep focus and preserve one-press Escape.
            if (event.detail === 0) onSelect();
          }}
        >
          <TldrawUiButtonIcon icon={icon} />
          <span className="bbox-family-tool__chevron" aria-hidden="true">
            <TldrawUiButtonIcon icon="chevron-down" small />
          </span>
        </TldrawUiToolbarButton>
      </TldrawUiDropdownMenuTrigger>
      <TldrawUiDropdownMenuContent
        side="top"
        align="center"
        sideOffset={11}
        alignOffset={0}
        collisionPadding={12}
        className="bbox-tool-menu"
      >
        {children}
      </TldrawUiDropdownMenuContent>
    </TldrawUiDropdownMenuRoot>
  );
}

function BlackBoxFamilySlot({ activeToolId }: { activeToolId: string }) {
  const tools = useTools();
  const preferences = useToolbarPreferences();
  const current: BlackBoxFamilyTool =
    activeToolId === BBOX_BLOCK_TOOL_ID || activeToolId === BBOX_PORT_TOOL_ID
      ? activeToolId
      : preferences.lastBlackBoxTool;
  const currentItem =
    BLACK_BOX_MENU_ITEMS.find((item) => item.id === current) ??
    BLACK_BOX_MENU_ITEMS[0];
  const isActive = BLACK_BOX_MENU_ITEMS.some((item) => item.id === activeToolId);

  return (
    <FamilyToolSlot
      family="blackbox"
      icon={currentItem.icon}
      label={
        currentItem.shortcut
          ? `${currentItem.label} · ${currentItem.shortcut}`
          : currentItem.label
      }
      active={isActive}
      currentToolId={current}
      onSelect={() => selectTool(tools, current)}
    >
      <div className="bbox-tool-menu__heading">Black box</div>
      {BLACK_BOX_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          selected={current === item.id}
          onSelect={() => selectTool(tools, item.id)}
        />
      ))}
    </FamilyToolSlot>
  );
}

function ShapeFamilySlot({
  activeToolId,
  geo,
}: {
  activeToolId: string;
  geo?: string;
}) {
  const tools = useTools();
  const preferences = useToolbarPreferences();
  let current: ShapeFamilyTool = preferences.lastShapeTool;
  if (activeToolId === "line") current = "line";
  if (activeToolId === "arrow") current = "arrow";
  if (activeToolId === "geo" && isSupportedShapeTool(geo)) current = geo;
  const currentItem = SHAPE_BY_ID[current];
  const isActive =
    activeToolId === "geo" || activeToolId === "line" || activeToolId === "arrow";

  return (
    <FamilyToolSlot
      family="shape"
      icon={currentItem.icon}
      label={
        currentItem.shortcut
          ? `${currentItem.label} · ${currentItem.shortcut}`
          : currentItem.label
      }
      active={isActive}
      currentToolId={current}
      onSelect={() => selectTool(tools, current)}
    >
      <div className="bbox-tool-menu__heading">Shapes</div>
      {SHAPE_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          selected={current === item.id}
          onSelect={() => selectTool(tools, item.id)}
        />
      ))}
    </FamilyToolSlot>
  );
}

function DrawFamilySlot({ activeToolId }: { activeToolId: string }) {
  const tools = useTools();
  const preferences = useToolbarPreferences();
  const current: DrawFamilyTool =
    activeToolId === "highlight" ? "highlight" : preferences.lastDrawTool;
  const currentItem =
    DRAW_MENU_ITEMS.find((item) => item.id === current) ?? DRAW_MENU_ITEMS[0];
  const isActive = activeToolId === "draw" || activeToolId === "highlight";

  return (
    <FamilyToolSlot
      family="draw"
      icon={currentItem.icon}
      label={`${currentItem.label} · ${currentItem.shortcut}`}
      active={isActive}
      currentToolId={current}
      onSelect={() => selectTool(tools, current)}
    >
      <div className="bbox-tool-menu__heading">Drawing</div>
      {DRAW_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          selected={current === item.id}
          onSelect={() => selectTool(tools, item.id)}
        />
      ))}
    </FamilyToolSlot>
  );
}

/**
 * Stock tldraw's DefaultToolbar with the tools compacted into families —
 * the SystemSketch pattern, kept as bare bones as the goal allows: access
 * to the new primitives without a crazy long toolbar.
 */
export function PlaygroundToolbar() {
  const editor = useEditor();
  const tools = useTools();
  const activeToolId = useValue(
    "playground active tool",
    () => editor.getCurrentToolId(),
    [editor],
  );
  const geo = useValue(
    "playground active geo",
    () => editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle),
    [editor],
  );

  return (
    <DefaultToolbar minItems={4} maxItems={8} minSizePx={255} maxSizePx={400}>
      <SimpleToolSlot
        tool={tools.select}
        fallbackIcon="tool-pointer"
        title="Cursor"
        active={activeToolId === "select"}
      />
      <SimpleToolSlot
        tool={tools.hand}
        fallbackIcon="tool-hand"
        title="Hand"
        active={activeToolId === "hand"}
      />
      <SimpleToolSlot
        tool={tools.frame}
        fallbackIcon="tool-frame"
        title="Frame"
        active={activeToolId === "frame"}
      />
      {/* Block and Port share this slot, the way the stock shapes share theirs. */}
      <BlackBoxFamilySlot activeToolId={activeToolId} />
      <ShapeFamilySlot activeToolId={activeToolId} geo={geo} />
      <DrawFamilySlot activeToolId={activeToolId} />
      <SimpleToolSlot
        tool={tools.text}
        fallbackIcon="tool-text"
        title="Text"
        active={activeToolId === "text"}
      />
      <SimpleToolSlot
        tool={tools.note}
        fallbackIcon="tool-note"
        title="Note"
        active={activeToolId === "note"}
      />
    </DefaultToolbar>
  );
}
