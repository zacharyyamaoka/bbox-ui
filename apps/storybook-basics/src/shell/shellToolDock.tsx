// src/shell/shellToolDock.tsx — the shell's tool dock window: the trunk's
// FigJam-style `ToolDock` driven by `tools()` / `setTool()`.
//
// PROVENANCE: lifted from apps/systemsketch/src/chrome/Toolbar/dock.tsx at
// 75991ce (B-SHELL-P1 §4.2 row 2). What moved: which tool is live, what a
// press arms, the remembered member per family (handed through, the host owns
// its storage) and the library cell. What stayed with the host: the catalogue
// rows and their icons (`families.tsx`, the kit registry), the A-key arrow
// cycle, and the variant → engine translation, which now lives inside the
// port's `setTool` (HOST-PORT.md "a variant is just a tool id").
//
// WHY the dock is handed the port's ONE active id as its tool id: the
// trunk's `ToolDock` resolves each family's face from an engine tool id plus a
// live sub-variant (`resolveCurrentTool`), which is how the app used to read
// tldraw directly (`geo` + its geo style). The port already resolved that
// pair — `tools().active` IS the variant (`ellipse`, `arrow-curve`) — so a
// host's `FamilyDeclaration.isMember` names its variant ids as members, and
// the face shows exactly what the port says is armed. One concept, not two
// (HOST-PORT.md).
import { useState, type ReactNode } from "react";

import { ToolDock, type FamilyDeclaration, type LibrarySlotProps, type SimpleToolItem } from "../editor/toolDock";

import { useAffordance, useHostPort, useHostValue } from "./BboxShell";

export interface ShellToolDockProps {
  /** The host's popout families, as data (`FamilyDeclaration`). A family's
   *  `isMember` answers for the VARIANT ids the port reports as active. */
  families: readonly FamilyDeclaration[];
  /** Cells with no popout. `active`/`onSelect` are the shell's — it reads and
   *  arms them through the port. */
  simpleTools: readonly { id: string; label: string; icon: ReactNode }[];
  /** `prefKey → remembered member`, controlled — the kit never touches
   *  storage (MENU-KIT-DESIGN.md §7), and neither does the shell. */
  preferences: Readonly<Record<string, string>>;
  onPreferencesChange(next: Record<string, string>): void;
  /** Names the app in the library cell's honest placeholder. */
  appName?: string;
  testIdPrefix?: string;
}

const NO_TOOLS = { catalogue: [], active: "" } as const;

export function ShellToolDock({ families, simpleTools, preferences, onPreferencesChange, appName = "This app", testIdPrefix }: ShellToolDockProps) {
  const port = useHostPort();
  const showDock = useAffordance("dock.tools");
  const tools = useHostValue((p) => p.tools(), NO_TOOLS);

  const activeToolId = tools.active;

  /**
   * The dock's trailing "+" (Zach's reference screenshot). `ToolDock` omits
   * the cell entirely when `librarySlot` is `undefined` — "never a disabled
   * row for a feature that does not exist" — so mounting it here is itself
   * the honest claim that pressing it opens SOMETHING, even though no host
   * has a shape/component library surface to open yet. WHY a placeholder
   * popover rather than inventing one: a library (saved shapes, a symbol
   * palette, importable blocks) is real, unbuilt product work with its own
   * design questions, not a one-line stub to improvise. The placeholder says
   * exactly that instead of faking a feature — a future lane replaces
   * `children` here with the real surface and this comment comes out.
   */
  const [libraryOpen, setLibraryOpen] = useState(false);
  const librarySlot: LibrarySlotProps = {
    title: "Library",
    eyebrow: "Coming soon",
    open: libraryOpen,
    onOpenChange: setLibraryOpen,
    children: (
      <p className="text-muted-foreground text-sm">
        {`Nothing here yet — ${appName} has no saved-shape or component library surface to open.`}
      </p>
    ),
  };

  if (!port || !showDock) return null;

  const cells: SimpleToolItem[] = simpleTools.map((tool) => ({
    ...tool,
    active: activeToolId === tool.id,
    onSelect: () => port.setTool(tool.id),
  }));

  return (
    <ToolDock
      activeToolId={activeToolId}
      families={families}
      simpleTools={cells}
      preferences={preferences}
      onPreferencesChange={onPreferencesChange}
      // Press-arms-then-menu-keeps-focus: the face fires `onArm` with the tool
      // it is currently SHOWING, off the same press that opens its popout.
      onArm={(toolId) => port.setTool(toolId)}
      onSelectItem={(toolId) => port.setTool(toolId)}
      librarySlot={librarySlot}
      testIdPrefix={testIdPrefix}
    />
  );
}
