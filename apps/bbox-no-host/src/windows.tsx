// apps/bbox-no-host/src/windows.tsx — every shell window, on the fake host.
//
// The SAME windows `apps/systemsketch` mounts over tldraw (B-SHELL-P1), seated
// where the studio seats them — chrome bar top-left, dock bottom-centre, strip
// bottom-right, rail on the right — and given only what an in-memory host can
// honestly supply. Nothing here reaches past the port: if a window needed an
// engine to work, it would have to fail here first.
import { useId, useMemo, useState } from "react";
import { Box, Hand, MousePointer2, Workflow } from "lucide-react";

import type { DiagnosticGroup, Severity } from "@trunk/editor/problemsPanel";
import type { FamilyDeclaration } from "@trunk/editor/toolDock";
import { lintScene } from "@trunk/scene/lint";
import type { BlockScene } from "@trunk/scene/scene";
import { useHostValue } from "@trunk/shell/BboxShell";
import { ShellChromeBar } from "@trunk/shell/shellChromeBar";
import { ShellPanelRail, useShellPanel, type ShellFramesContent, type ShellProblemsContent } from "@trunk/shell/shellPanelRail";
import { ShellSelectionPill } from "@trunk/shell/shellSelectionPill";
import { ShellStatusStrip } from "@trunk/shell/shellStatusStrip";
import { ShellToolDock } from "@trunk/shell/shellToolDock";

const EMPTY_SCENE: BlockScene = { nodes: [], edges: [] };

const SEVERITIES: readonly Severity[] = [
  { id: "error", label: "Errors", glyph: "×", tone: "error" },
  { id: "warning", label: "Warnings", glyph: "!", tone: "warning" },
];

/** A fake host has no regions and no expanded blocks: an honest empty list. */
const NO_FRAMES: ShellFramesContent = {
  items: [],
  kinds: {},
  onFocus: () => undefined,
  onRename: () => ({ ok: false, reason: "this host has no frames" }),
  notices: ["This host has no frames: it has no regions or expanded blocks."],
};

/** The fake host's catalogue (`FAKE_HOST_TOOLS`) as dock cells: select and
 *  hand stand alone; Block is a one-member family; the two arrows are
 *  variants of `arrow`, the way the studio's presets are. */
const SIMPLE_TOOLS = [
  { id: "select", label: "Select", icon: <MousePointer2 /> },
  { id: "hand", label: "Hand", icon: <Hand /> },
];

const FAMILIES: readonly FamilyDeclaration[] = [
  {
    id: "system",
    label: "System design",
    sections: [{ items: [{ id: "block", label: "Block", icon: <Box />, shortcutHint: "B" }] }],
    prefKey: "lastSystemTool",
    isMember: (toolId) => toolId === "block",
  },
  {
    id: "arrow",
    label: "Arrows",
    sections: [
      {
        items: [
          { id: "arrow:elbow", label: "Elbow arrow", icon: <Workflow />, shortcutHint: "A" },
          { id: "arrow:curve", label: "Curved arrow", icon: <Workflow /> },
        ],
      },
    ],
    prefKey: "lastArrow",
    isMember: (toolId) => toolId === "arrow:elbow" || toolId === "arrow:curve",
  },
];

/** Problems from the trunk's own rule engine over the port's scene — the same
 *  `lintScene` the studio's findings come from, without its vocabulary. */
function useProblems(): { content: ShellProblemsContent; total: number } {
  const scene = useHostValue((port) => port.scene(), EMPTY_SCENE);
  return useMemo(() => {
    const findings = lintScene(scene);
    const groups: DiagnosticGroup[] =
      findings.length === 0
        ? []
        : [
            {
              id: "board",
              label: "Board",
              diagnostics: findings.map((finding) => ({
                id: finding.id,
                code: finding.code ?? finding.ruleId,
                severity: finding.severity,
                message: finding.message ?? finding.ruleId,
                detail: finding.ruleId,
              })),
            },
          ];
    const counts: Record<string, number> = { all: findings.length };
    for (const finding of findings) counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return {
      content: { groups, counts, severities: SEVERITIES, onActivate: () => undefined },
      total: findings.length,
    };
  }, [scene]);
}

export function NoHostWindows() {
  const panelId = useId();
  const panel = useShellPanel();
  const problems = useProblems();
  const [preferences, setPreferences] = useState<Record<string, string>>({});

  return (
    <>
      <div style={{ position: "absolute", top: 8, left: 8 }}>
        <ShellChromeBar label="bbox — no host" platform="other" />
      </div>
      <ShellSelectionPill />
      <ShellPanelRail
        open={panel.open}
        onClose={panel.close}
        onSurfaceChange={panel.switchSurface}
        id={panelId}
        frames={NO_FRAMES}
        problems={problems.content}
      />
      <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div className="pointer-events-auto">
          <ShellToolDock
            families={FAMILIES}
            simpleTools={SIMPLE_TOOLS}
            preferences={preferences}
            onPreferencesChange={setPreferences}
            appName="bbox — no host"
          />
        </div>
      </div>
      <div className="pointer-events-auto" style={{ position: "absolute", right: 8, bottom: 8 }}>
        <ShellStatusStrip panel={panel.open} onTogglePanel={panel.toggle} panelId={panelId} problemCount={problems.total} />
      </div>
    </>
  );
}
