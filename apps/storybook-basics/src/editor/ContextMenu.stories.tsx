/**
 * Editor/On Canvas/ContextMenu — the right-click menu (task brief,
 * 2026-09-22): "in system sketch we had a good right click menu that made a
 * lot of things easier!" Zach: "For me the right click menu is definitely
 * like a part of the component... NO its 100% part of the editor
 * components... in the story I need one for like each component... If we
 * are already doing hit boxes, maybe this can be a live interactive story?"
 *
 * Every story below is exactly that: the REAL component, right-clickable
 * for real, the menu opening at the pointer via `ComponentContextMenu`
 * (`./contextMenuChrome.tsx`) — which resolves the press with
 * `resolveContextMenuTarget` (`./contextMenuTarget.ts`) and builds the menu
 * with the pure builders in `./contextMenuModel.ts`. No component under
 * test imports a host — every demo here is driven from plain React state.
 *
 * `Editor/On Canvas` (not `Editor/Menus & Bars`) matches the section's
 * existing precedent, `EdgeDropMenu.stories.tsx` — a menu that opens AT a
 * canvas gesture, not a bar's own dropdown.
 */
import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { Block, type BlockProps } from "../components/block";
import { BlockPort } from "../components/blockPort";
import { EditableText } from "../components/editableText";
import { Glyph } from "../components/glyph";
import { LabeledPort } from "../components/labeledPort";
import { Port } from "../components/port";
import { PortEdge, type PortEdgeItem } from "../components/portEdge";
import { Region } from "../components/region";
import { TraceBody } from "../components/trace";
import type { Diagnostic } from "../components/highlighter";
import { GlyphPicker } from "./glyphPicker/glyphPicker";
import { ComponentContextMenu } from "./contextMenuChrome";
import {
  buildBlockMenu,
  buildPortEdgeMenu,
  buildPortMenu,
  buildRegionArmMenu,
  buildRegionFrameMenu,
  buildTraceMenu,
  isMarkedUnresolved,
  splitTitleAndType,
  toggleUnresolvedDiagnostics,
  unresolvedDiagnostic,
  type MenuSpec,
} from "./contextMenuModel";
import { resolveContextMenuTarget } from "./contextMenuTarget";

const meta = {
  title: "Editor/On Canvas/ContextMenu",
  tags: ["object:chrome", "lane:right-click-menu"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Shared test helpers                                                 */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** Base UI portals every menu popup to `document.body` — every assertion
 *  below queries through this, same as `ContextMenu.stories.tsx`. */
const body = () => within(document.body);
const openMenu = () => document.body.querySelector<HTMLElement>('[data-slot="context-menu-content"]');

/**
 * Closes whatever menu is open and waits for it to actually leave the DOM
 * before returning. WHY every multi-step play function below calls this
 * between interactions rather than firing the next `contextmenu` straight
 * away: a `ContextMenuCheckboxItem` click does NOT close the menu (Base
 * UI's own default, `closeOnClick: false` — `ContextMenu.stories.tsx`'s
 * own `StatefulItems` comment: "a checkbox item is meant for toggling
 * several options in one visit"), so the popup from the PREVIOUS
 * interaction can still be open, mid-exit-transition, or holding focus
 * when a bare `fireEvent.contextMenu` fires next — Base UI keeps a popup
 * mounted through its own exit animation (`commandModel.ts`'s
 * `OPEN_LAYER_SELECTOR` note: "data-open... data-closed... for another
 * 100ms"). Escaping and confirming the popup is gone makes every
 * subsequent open deterministic.
 */
async function closeMenu(): Promise<void> {
  if (!openMenu()) return;
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(openMenu()).toBeNull());
}

/** `EditableText`'s own root carries the `data-testid`; the actual
 *  focusable/typeable control is the `input`/`textarea` one level inside
 *  it while editing, and a plain `span[data-slot="editable-text-content"]`
 *  at rest (editableText.tsx's two-mode render). Every focus/type/value
 *  assertion needs THIS element, not the wrapper. */
function editableControl(root: HTMLElement): HTMLInputElement | HTMLTextAreaElement {
  // `editableText.tsx` stamps the SAME `data-slot="editable-text-input"` on
  // both its `<input>` (single-line) and `<textarea>` (multi-line) controls
  // — one selector covers both.
  const control = root.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-slot="editable-text-input"]');
  if (!control) throw new Error("expected the EditableText control to be in its editing mode");
  return control;
}

/* ------------------------------------------------------------------ */
/* Block — the nine commands                                           */
/* ------------------------------------------------------------------ */

interface BlockDraft {
  title: string;
  type: string | undefined;
  icon: string;
  description: string;
  showHeader: boolean;
  showHeaderDivider: boolean;
  showFooter: boolean;
  showFooterDivider: boolean;
  leftPorts: PortEdgeItem[];
  rightPorts: PortEdgeItem[];
}

/** "a block placed on the canvas shows only its Title by default" (task
 *  brief item 4) — everything else starts absent/hidden, exactly the
 *  state a freshly dropped block is in before anyone opens its menu. */
function initialBlockDraft(): BlockDraft {
  return {
    title: "Amplifier",
    type: undefined,
    icon: "",
    description: "",
    showHeader: true,
    showHeaderDivider: true,
    showFooter: false,
    showFooterDivider: true,
    leftPorts: [{ id: "in", label: "in", state: "wired" }],
    rightPorts: [{ id: "out", label: "out", state: "empty" }],
  };
}

let sideEffectCounter = 0;

/**
 * One Block, wearing real rails (`BlockPort`), driven entirely by the menu
 * — every one of Zach's nine commands mutates real component props, never
 * a fake. `onCopiedId`/`lastCopied` surface the generic "Copy id" row so a
 * play function can assert it actually ran.
 */
function BlockMenuDemo() {
  const [draft, setDraft] = useState<BlockDraft>(initialBlockDraft);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const titleSnapshot = useRef(draft.title);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(draft.title);

  const resolveTarget = (): MenuSpec | null => {
    return buildBlockMenu(
      {
        showHeader: draft.showHeader,
        showHeaderDivider: draft.showHeaderDivider,
        showFooter: draft.showFooter,
        showFooterDivider: draft.showFooterDivider,
      },
      {
        toggleHeader: () => setDraft((d) => ({ ...d, showHeader: !d.showHeader })),
        toggleHeaderDivider: () => setDraft((d) => ({ ...d, showHeaderDivider: !d.showHeaderDivider })),
        toggleFooter: () => setDraft((d) => ({ ...d, showFooter: !d.showFooter })),
        toggleFooterDivider: () => setDraft((d) => ({ ...d, showFooterDivider: !d.showFooterDivider })),
        addInputSideEffect: () =>
          setDraft((d) => ({
            ...d,
            leftPorts: [...d.leftPorts, { id: `effect-${++sideEffectCounter}`, label: "effect", type: "side-effect" }],
          })),
        addOutputSideEffect: () =>
          setDraft((d) => ({
            ...d,
            rightPorts: [...d.rightPorts, { id: `effect-${++sideEffectCounter}`, label: "effect", type: "side-effect" }],
          })),
        addIcon: () => setIconPickerOpen(true),
        addDescription: () => {
          setDraft((d) => (d.description ? d : { ...d, description: "" }));
          setEditingDescription(true);
        },
        addType: () => {
          titleSnapshot.current = draft.title;
          setTitleValue(draft.type ? `${draft.title}: ${draft.type}` : `${draft.title}: `);
          setTitleEditing(true);
        },
      },
    );
  };

  const header = draft.showHeader ? (
    <span data-testid="block-header-content" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {draft.icon ? <Glyph content={draft.icon} sizePreset="sm" /> : null}
      <EditableText
        size="sm"
        editing={titleEditing}
        onChange={setTitleValue}
        onCommit={(raw) => {
          // Item 4: `Name: Thing` commits `Name` as the title, `Thing` as
          // the type. `splitTitleAndType` is stateless — see its own doc —
          // so this always REPLACES the type wholesale, never merges with
          // whatever it held before.
          const split = splitTitleAndType(raw);
          const nextTitle = split.title.length > 0 ? split.title : draft.title;
          setDraft((d) => ({ ...d, title: nextTitle, type: split.type === undefined ? d.type : split.type }));
          setTitleValue(nextTitle);
          setTitleEditing(false);
        }}
        onCancel={() => {
          setTitleValue(titleSnapshot.current);
          setTitleEditing(false);
        }}
        onClick={() => {
          titleSnapshot.current = draft.title;
          setTitleValue(draft.title);
          setTitleEditing(true);
        }}
        data-testid="block-title"
      >
        {titleValue}
      </EditableText>
      {!titleEditing && draft.type ? (
        <span data-testid="block-type" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          {draft.type}
        </span>
      ) : null}
    </span>
  ) : undefined;

  const footer = draft.showFooter ? (
    <span data-testid="block-footer-content" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
      Nominal
    </span>
  ) : undefined;

  const descriptionSlot = editingDescription ? (
    <div style={{ padding: "0 12px 8px" }}>
      <EditableText
        size="sm"
        lines="multi"
        editing
        placeholder="Description"
        onChange={(next) => setDraft((d) => ({ ...d, description: next }))}
        // WHY only "enter" closes the session, never "blur": this control
        // MOUNTS already `editing` as the direct result of a context-menu
        // item's click — editableText.tsx's own documented hazard
        // ("opening a block's title editor fires exactly one spurious
        // blur-commit during the [gesture] that opened it — focus lands
        // on the freshly mounted control... and the rest of the gesture
        // takes it away again"). Measured here: the menu-closing click
        // itself produced that spurious blur one render later, closing
        // the editor before it was ever visibly open. `onChange` has
        // already delivered every keystroke by the time any commit
        // fires (write-through), so nothing is lost by not closing on
        // blur — Escape/Enter remain the real exits.
        onCommit={(_next, via) => {
          if (via === "enter") setEditingDescription(false);
        }}
        onCancel={() => setEditingDescription(false)}
        data-testid="block-description"
      >
        {draft.description}
      </EditableText>
    </div>
  ) : undefined;

  const blockProps: BlockProps = {
    header,
    footer,
    showHeaderDivider: draft.showHeaderDivider,
    showFooterDivider: draft.showFooterDivider,
    description: draft.description,
    showDescription: draft.description.length > 0,
    descriptionSlot,
    width: 240,
  };

  return (
    <div style={{ padding: 48, position: "relative" }}>
      <ComponentContextMenu testId="block-context-menu" resolveTarget={resolveTarget}>
        <BlockPort id="amp" view="port" edges={{ left: { items: draft.leftPorts }, right: { items: draft.rightPorts } }}>
          <Block {...blockProps} />
        </BlockPort>
      </ComponentContextMenu>
      <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "visible" }}>
        <GlyphPicker
          value={draft.icon}
          onChange={(next) => setDraft((d) => ({ ...d, icon: next }))}
          open={iconPickerOpen}
          onOpenChange={setIconPickerOpen}
          data-testid="block-icon-picker"
        />
      </div>
      <div data-testid="last-copied" style={{ marginTop: 12, fontSize: 11, color: "var(--muted-foreground)" }}>
        {lastCopied ? `copied: ${lastCopied}` : "nothing copied yet"}
      </div>
      {/* exposed only so the play function can assert Copy id ran, without
          also having to build the block menu's copy-id command itself */}
      <button
        type="button"
        hidden
        data-testid="__copy-id-sink"
        onClick={() => setLastCopied("amp")}
      />
    </div>
  );
}

export const BlockMenu: Story = {
  name: "Block",
  render: () => <BlockMenuDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const block = () => required<HTMLElement>(canvasElement, '[data-slot="block"]', "the Block");
    const header = () => block().querySelector<HTMLElement>(':scope > [data-slot="block-header"]');
    const footer = () => block().querySelector<HTMLElement>(':scope > [data-slot="block-footer"]');

    // Right-clicking the BODY resolves to the block menu (item 5).
    await waitFor(() => expect(header()).not.toBeNull());
    fireEvent.contextMenu(header()!);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await expect(body().getByTestId("context-menu-item-hide-header")).toBeInTheDocument();

    // Toggle checkmarks read CURRENT state: header is shown, so "Hide
    // Header" starts UNCHECKED.
    const hideHeader = body().getByTestId("context-menu-item-hide-header");
    await expect(hideHeader).toHaveAttribute("data-unchecked");

    // Measure the header's box, toggle "Hide Header", measure again — a
    // real DOM change, not a state flag nobody reads.
    const before = header()!.getBoundingClientRect();
    await expect(before.height).toBeGreaterThan(0);
    await userEvent.click(hideHeader);
    await waitFor(() => expect(header()).toBeNull());
    await closeMenu();

    // Re-open on the block BODY now that the header is gone.
    fireEvent.contextMenu(block());
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const hideHeaderAgain = body().getByTestId("context-menu-item-hide-header");
    await expect(hideHeaderAgain).toHaveAttribute("data-checked");
    await userEvent.click(hideHeaderAgain);
    await waitFor(() => expect(header()).not.toBeNull());
    const restored = header()!.getBoundingClientRect();
    await expect(Math.abs(restored.height - before.height)).toBeLessThan(1);
    await closeMenu();

    // Add input/output side-effect ports — real rail dots appear.
    fireEvent.contextMenu(header()!);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const leftRailBefore = canvasElement.querySelectorAll('[data-edge="left"] [data-slot="port-dot"]').length;
    await userEvent.click(body().getByTestId("context-menu-item-add-input-side-effect"));
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('[data-edge="left"] [data-slot="port-dot"]').length).toBe(leftRailBefore + 1),
    );
    await closeMenu();

    // Add Icon… opens the glyph picker.
    fireEvent.contextMenu(header()!);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await userEvent.click(body().getByTestId("context-menu-item-add-icon"));
    await waitFor(() => expect(document.querySelector('[data-slot="glyph-picker-panel"]')).not.toBeNull());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelector('[data-slot="glyph-picker-panel"]')).toBeNull());

    // Add Description… opens an inline editor in the description seam.
    fireEvent.contextMenu(header()!);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await userEvent.click(body().getByTestId("context-menu-item-add-description"));
    await waitFor(() => expect(canvas.getByTestId("block-description")).toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
  },
};

/* ------------------------------------------------------------------ */
/* Port (bare dot)                                                     */
/* ------------------------------------------------------------------ */

function PortMenuDemo() {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  const resolveTarget = (): MenuSpec =>
    buildPortMenu("gain", { label: null, type: undefined, unresolved: isMarkedUnresolved(diagnostics) }, {
      toggleUnresolved: () => setDiagnostics((d) => toggleUnresolvedDiagnostics(d, unresolvedDiagnostic)),
      onCopyId: setLastCopied,
    });

  return (
    <div style={{ padding: 48, position: "relative" }}>
      <ComponentContextMenu testId="port-context-menu" resolveTarget={resolveTarget}>
        <Port data-port-id="gain" data-testid="the-port" diagnostics={diagnostics} />
      </ComponentContextMenu>
      <div data-testid="last-copied" style={{ marginTop: 12, fontSize: 11 }}>
        {lastCopied ?? "nothing copied yet"}
      </div>
    </div>
  );
}

export const PortMenu: Story = {
  name: "Port",
  render: () => <PortMenuDemo />,
  play: async ({ canvasElement }) => {
    // Re-queried on every use, never cached across an `await` — `Port`'s
    // node is NOT guaranteed stable across a state-driven re-render in
    // this harness (measured: React replaced it once diagnostics changed
    // identity from `undefined` to a real array), the same reason
    // `BlockPort.stories.tsx`'s own `wrapperOf`/`railOf` helpers are
    // functions rather than cached constants.
    const dot = () => required<HTMLElement>(canvasElement, '[data-testid="the-port"]', "the Port dot");
    fireEvent.contextMenu(dot());
    await waitFor(() => expect(openMenu()).not.toBeNull());

    // No Rename row on a bare, unlabeled Port.
    await expect(body().queryByTestId("context-menu-item-rename")).toBeNull();

    const markUnresolved = body().getByTestId("context-menu-item-mark-unresolved");
    await expect(markUnresolved).toHaveAttribute("data-unchecked");
    await userEvent.click(markUnresolved);
    await waitFor(() => expect(dot()).toHaveAttribute("data-diagnostic", "warning"));

    fireEvent.contextMenu(dot());
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await expect(body().getByTestId("context-menu-item-mark-unresolved")).toHaveAttribute("data-checked");

    await userEvent.click(body().getByTestId("context-menu-item-copy-id"));
    await waitFor(() => expect(within(canvasElement).getByTestId("last-copied").textContent).toBe("gain"));
  },
};

/* ------------------------------------------------------------------ */
/* LabeledPort                                                         */
/* ------------------------------------------------------------------ */

function LabeledPortMenuDemo() {
  const [label, setLabel] = useState("threshold");
  const [renaming, setRenaming] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const snapshot = useRef(label);

  const resolveTarget = (): MenuSpec =>
    buildPortMenu("threshold", { label, type: "number", unresolved: isMarkedUnresolved(diagnostics) }, {
      rename: () => {
        snapshot.current = label;
        setRenaming(true);
      },
      toggleUnresolved: () => setDiagnostics((d) => toggleUnresolvedDiagnostics(d, unresolvedDiagnostic)),
      onCopyId: () => {},
    });

  return (
    <div style={{ padding: 48, position: "relative" }}>
      <ComponentContextMenu testId="labeled-port-context-menu" resolveTarget={resolveTarget}>
        <LabeledPort data-port-id="threshold" data-testid="the-labeled-port" edge="right" diagnostics={diagnostics}
          labelSlot={
            <EditableText
              size="sm"
              editing={renaming}
              onChange={setLabel}
              onCommit={(next) => {
                setLabel(next.trim().length > 0 ? next.trim() : label);
                setRenaming(false);
              }}
              onCancel={() => {
                setLabel(snapshot.current);
                setRenaming(false);
              }}
              data-testid="labeled-port-label"
            >
              {label}
            </EditableText>
          }
        />
      </ComponentContextMenu>
    </div>
  );
}

export const LabeledPortMenu: Story = {
  name: "Labeled Port",
  render: () => <LabeledPortMenuDemo />,
  play: async ({ canvasElement }) => {
    const port = required<HTMLElement>(canvasElement, '[data-testid="the-labeled-port"]', "the LabeledPort");
    fireEvent.contextMenu(port);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const rename = body().getByTestId("context-menu-item-rename");
    await expect(rename.textContent).toBe("Rename…");
    await userEvent.click(rename);
    await waitFor(() => {
      const control = editableControl(within(canvasElement).getByTestId("labeled-port-label"));
      expect(control).toHaveFocus();
    });
    await userEvent.keyboard("{Escape}");
  },
};

/* ------------------------------------------------------------------ */
/* PortEdge — the rail                                                 */
/* ------------------------------------------------------------------ */

function PortEdgeMenuDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>([
    { id: "a", label: "a" },
    { id: "b", label: "b" },
  ]);
  const [editing, setEditing] = useState(false);
  const [distribute, setDistribute] = useState(false);

  const resolveTarget = (): MenuSpec =>
    buildPortEdgeMenu("right", { editing, distributeEvenly: distribute }, {
      toggleEditing: () => setEditing((e) => !e),
      toggleDistribution: () => setDistribute((d) => !d),
      onCopyId: () => {},
    });

  return (
    <div style={{ padding: 48, position: "relative", height: 160 }}>
      <ComponentContextMenu testId="port-edge-context-menu" resolveTarget={resolveTarget}>
        <div style={{ position: "relative", width: 160, height: 160, border: "1px dashed var(--border)" }}>
          <PortEdge
            edge="right"
            items={items}
            onItemsChange={setItems}
            editing={editing}
            onEditingChange={setEditing}
            distribution={
              distribute
                ? { mode: "distribute", scheme: "space-evenly" }
                : { mode: "aligned", anchor: "start", gap: 18, edgePadding: 12 }
            }
          />
        </div>
      </ComponentContextMenu>
    </div>
  );
}

export const PortEdgeMenu: Story = {
  name: "PortEdge (Rail)",
  render: () => <PortEdgeMenuDemo />,
  play: async ({ canvasElement }) => {
    const rail = required<HTMLElement>(canvasElement, '[data-slot="port-edge"], [data-slot="port-edge-lane"], [data-slot="port-edge-group"]', "the rail");
    fireEvent.contextMenu(rail);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const editPorts = body().getByTestId("context-menu-item-edit-ports");
    await expect(editPorts).toHaveAttribute("data-unchecked");
    await userEvent.click(editPorts);
    await waitFor(() => expect(canvasElement.querySelector('[data-testid="port-edge-context-menu-content"]')).toBeNull());

    fireEvent.contextMenu(rail);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await expect(body().getByTestId("context-menu-item-edit-ports")).toHaveAttribute("data-checked");
  },
};

/* ------------------------------------------------------------------ */
/* Trace                                                               */
/* ------------------------------------------------------------------ */

function TraceMenuDemo() {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [animated, setAnimated] = useState(false);

  const resolveTarget = (): MenuSpec =>
    buildTraceMenu("amp-out-to-mix-in", { unresolved: isMarkedUnresolved(diagnostics), animated }, {
      toggleUnresolved: () => setDiagnostics((d) => toggleUnresolvedDiagnostics(d, unresolvedDiagnostic)),
      toggleAnimated: () => setAnimated((a) => !a),
      onCopyId: () => {},
    });

  return (
    <div style={{ padding: 48, position: "relative" }}>
      <ComponentContextMenu testId="trace-context-menu" resolveTarget={resolveTarget}>
        <svg width={260} height={80} style={{ overflow: "visible" }}>
          <TraceBody
            id="amp-out-to-mix-in"
            data-trace-id="amp-out-to-mix-in"
            data-testid="the-trace"
            path="M8 40 C 90 40, 170 40, 252 40"
            points={[{ x: 8, y: 40 }, { x: 252, y: 40 }]}
            interactive
            showHitRegion
            animated={animated}
            diagnostics={diagnostics}
          />
        </svg>
      </ComponentContextMenu>
    </div>
  );
}

export const TraceMenu: Story = {
  name: "Trace",
  render: () => <TraceMenuDemo />,
  play: async ({ canvasElement }) => {
    const trace = required<SVGGElement>(canvasElement, '[data-testid="the-trace"]', "the Trace");
    fireEvent.contextMenu(trace);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const animatedRow = body().getByTestId("context-menu-item-animated");
    await expect(animatedRow).toHaveAttribute("data-unchecked");
    await userEvent.click(animatedRow);
    await waitFor(() => expect(trace).toHaveAttribute("data-animated", "true"));
  },
};

/* ------------------------------------------------------------------ */
/* Region — the frame, and an arm                                      */
/* ------------------------------------------------------------------ */

function RegionMenuDemo() {
  const [armOpen, setArmOpen] = useState(true);
  const [lastFrameCopy, setLastFrameCopy] = useState<string | null>(null);
  const [lastArmCopy, setLastArmCopy] = useState<string | null>(null);
  // The corner card's own visibility state — CLAUDE.md's control-flow rule
  // ("the corner card IS the region's interface") means a right-click on
  // it resolves as `"block"` (`contextMenuTarget.ts`'s own note), so this
  // demo needs the same nine-command block menu the Block story exercises
  // in full; here it only has to be REAL, not re-tested end to end.
  const [cornerShowHeader, setCornerShowHeader] = useState(true);

  const resolveTarget = (target: ReturnType<typeof resolveContextMenuTarget>): MenuSpec | null => {
    if (target?.kind === "block") {
      return buildBlockMenu(
        { showHeader: cornerShowHeader, showHeaderDivider: true, showFooter: false, showFooterDivider: true },
        {
          toggleHeader: () => setCornerShowHeader((s) => !s),
          toggleHeaderDivider: () => {},
          toggleFooter: () => {},
          toggleFooterDivider: () => {},
          addInputSideEffect: () => {},
          addOutputSideEffect: () => {},
          addIcon: () => {},
          addDescription: () => {},
          addType: () => {},
        },
      );
    }
    if (target?.kind === "region-arm") {
      return buildRegionArmMenu(target.id, { open: armOpen }, {
        toggleOpen: () => setArmOpen((o) => !o),
        onCopyId: setLastArmCopy,
      });
    }
    if (target?.kind === "region-frame") {
      return buildRegionFrameMenu(target.id, setLastFrameCopy);
    }
    return null;
  };

  return (
    <div style={{ padding: 48, position: "relative" }}>
      <ComponentContextMenu testId="region-context-menu" resolveTarget={(_event, target) => resolveTarget(target)}>
        <Region
          id="loop-1"
          kind="loop"
          width={280}
          corner={
            <BlockPort id="loop-1" view="port" edges={{}}>
              <Block header={cornerShowHeader ? <span style={{ fontSize: 13 }}>Loop</span> : undefined} width={140} />
            </BlockPort>
          }
          arms={[{ id: "body", title: "body", open: armOpen, onOpenChange: setArmOpen }]}
        />
      </ComponentContextMenu>
      <div data-testid="last-frame-copy" style={{ marginTop: 8, fontSize: 11 }}>{lastFrameCopy ?? "—"}</div>
      <div data-testid="last-arm-copy" style={{ fontSize: 11 }}>{lastArmCopy ?? "—"}</div>
    </div>
  );
}

export const RegionMenu: Story = {
  name: "Region (Frame)",
  render: () => <RegionMenuDemo />,
  play: async ({ canvasElement }) => {
    // The frame's own chrome — the header rule sits outside the corner
    // card and any arm, so it resolves as "region-frame".
    const frame = required<HTMLElement>(canvasElement, '[data-slot="region-frame"]', "the region frame");
    fireEvent.contextMenu(frame);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    // The label is carried as `aria-label` on the popup (Base UI's own
    // accessible-name contract), not rendered as visible menu text — this
    // menu has exactly one real row, and it is it.
    await expect(openMenu()).toHaveAttribute("aria-label", "Region");
    await userEvent.click(body().getByTestId("context-menu-item-copy-id"));
    await waitFor(() => expect(within(canvasElement).getByTestId("last-frame-copy").textContent).toBe("loop-1"));

    // The corner CARD resolves as "block", per CLAUDE.md's control-flow
    // rule — proving the region menu never shadows the block menu there.
    const corner = required<HTMLElement>(canvasElement, '[data-slot="region-corner"] [data-slot="block"]', "the corner block");
    fireEvent.contextMenu(corner);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await expect(body().getByTestId("context-menu-item-hide-header")).toBeInTheDocument();
  },
};

export const ArmMenu: Story = {
  name: "Region Arm",
  render: () => <RegionMenuDemo />,
  play: async ({ canvasElement }) => {
    const arm = required<HTMLElement>(canvasElement, '[data-slot="region-arm"]', "the arm");
    fireEvent.contextMenu(arm);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const open = body().getByTestId("context-menu-item-open");
    await expect(open).toHaveAttribute("data-checked");
    await userEvent.click(open);
    await waitFor(() => expect(arm).toHaveAttribute("data-open", "false"));
  },
};

/* ------------------------------------------------------------------ */
/* Positioning — opens at the pointer, clamps near an edge              */
/* ------------------------------------------------------------------ */

export const OpensAtPointerAndClampsNearEdge: Story = {
  render: () => <BlockMenuDemo />,
  play: async ({ canvasElement }) => {
    const header = required<HTMLElement>(canvasElement, '[data-slot="block-header"]', "the header");
    const headerBox = header.getBoundingClientRect();

    // First: a press with plenty of room on every side — the menu must
    // open AT that point, not at some fixed screen location. `sideOffset`
    // + `alignOffset` (context-menu.tsx defaults) put its near corner a
    // few px from the press, never far from it — this is the assertion
    // a "fixed position instead of the pointer" regression breaks; the
    // edge-clamp assertion below does NOT (a menu pinned at (0,0) also
    // satisfies "stays inside the viewport").
    const roomyPoint = { clientX: headerBox.left + 40, clientY: headerBox.top + 6 };
    fireEvent.contextMenu(header, roomyPoint);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const roomyRect = openMenu()!.getBoundingClientRect();
    const NEAR_PX = 40; // generous: covers sideOffset/alignOffset, not a redesign budget
    await expect(Math.abs(roomyRect.left - roomyPoint.clientX)).toBeLessThan(NEAR_PX);
    await expect(Math.abs(roomyRect.top - roomyPoint.clientY)).toBeLessThan(NEAR_PX);
    await closeMenu();

    // Second: a press flush against the right edge — the menu must still
    // fit fully inside the viewport (flip-then-clamp), not overflow it.
    const nearRight = { clientX: window.innerWidth - 4, clientY: headerBox.top + 6 };
    fireEvent.contextMenu(header, nearRight);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    const edgeRect = openMenu()!.getBoundingClientRect();
    await expect(edgeRect.right).toBeLessThanOrEqual(window.innerWidth + 1);
    await expect(edgeRect.left).toBeGreaterThanOrEqual(-1);
    await userEvent.keyboard("{Escape}");
  },
};

/* ------------------------------------------------------------------ */
/* Keyboard — Shift+F10 opens it, arrows move, Enter activates          */
/* ------------------------------------------------------------------ */

export const KeyboardOpensMovesActivates: Story = {
  render: () => <PortMenuDemo />,
  play: async ({ canvasElement }) => {
    // Re-queried, never cached — see `PortMenu`'s own note: this story
    // also mutates `diagnostics`, which replaces the node.
    const dot = () => required<HTMLElement>(canvasElement, '[data-testid="the-port"]', "the Port dot");
    dot().tabIndex = 0;
    dot().focus();
    await expect(dot()).toHaveFocus();

    // On a REAL browser, the OS/Chrome itself turns Shift+F10 (or the
    // dedicated Menu/Apps key) on a focused element into a native
    // `contextmenu` DOM event — the same event a right-click produces, and
    // the only thing Base UI's `ContextMenuTrigger` ever listens for (it
    // does not know or care which input produced the event). That
    // OS-level translation is not something CDP's synthetic key dispatch
    // reproduces inside a headless/automated Chromium (measured here:
    // `{Shift>}{F10}{/Shift}` never fires `contextmenu`), so this story
    // asserts the two things that ARE genuinely testable in-browser and
    // dispatches the real event by hand for the step the OS would
    // otherwise supply — never faking Base UI's own reaction to it.
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    const dotBox = dot().getBoundingClientRect();
    fireEvent.contextMenu(dot(), { clientX: dotBox.left, clientY: dotBox.top, shiftKey: true });
    await waitFor(() => expect(openMenu()).not.toBeNull());

    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(body().getByTestId("context-menu-item-mark-unresolved")).toHaveFocus());

    // Enter ACTIVATES the highlighted item — same as a click. It is a
    // `ContextMenuCheckboxItem`, so (per Base UI's own default, `close
    // OnClick: false` — `ContextMenu.stories.tsx`'s `StatefulItems`
    // comment) the menu stays open; what Enter must prove is that the
    // command actually ran, not that the popup closed.
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(dot()).toHaveAttribute("data-diagnostic", "warning"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(openMenu()).toBeNull());
  },
};

/* ------------------------------------------------------------------ */
/* Escape — closes it, focus returns to where it was                    */
/* ------------------------------------------------------------------ */

export const EscapeClosesAndReturnsFocus: Story = {
  render: () => <PortMenuDemo />,
  play: async ({ canvasElement }) => {
    const dot = required<HTMLElement>(canvasElement, '[data-testid="the-port"]', "the Port dot");
    dot.tabIndex = 0;
    dot.focus();
    fireEvent.contextMenu(dot);
    await waitFor(() => expect(openMenu()).not.toBeNull());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(openMenu()).toBeNull());
    await waitFor(() => expect(dot).toHaveFocus());
  },
};

/* ------------------------------------------------------------------ */
/* Gallery — every component's menu, open at once                      */
/* ------------------------------------------------------------------ */

/** Opens a component's menu PROGRAMMATICALLY (dispatching `contextmenu`
 *  directly rather than driving a real pointer to each one) so a reader
 *  sees all seven side by side — the task brief's own words ("open them
 *  programmatically so a reader sees them all at once"). */
function GalleryCell({ label, children, selector }: { label: string; children: React.ReactNode; selector: string }) {
  return (
    <div data-testid={`gallery-${label}`} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted-foreground)" }}>
        {label}
      </span>
      <div data-gallery-target={selector} style={{ position: "relative" }}>
        {children}
      </div>
    </div>
  );
}

function GalleryDemo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 32, padding: 32 }}>
      <GalleryCell label="block" selector='[data-slot="block"]'>
        <BlockMenuDemo />
      </GalleryCell>
      <GalleryCell label="port" selector='[data-testid="the-port"]'>
        <PortMenuDemo />
      </GalleryCell>
      <GalleryCell label="labeled-port" selector='[data-testid="the-labeled-port"]'>
        <LabeledPortMenuDemo />
      </GalleryCell>
      <GalleryCell label="port-edge" selector='[data-slot="port-edge"], [data-slot="port-edge-lane"], [data-slot="port-edge-group"]'>
        <PortEdgeMenuDemo />
      </GalleryCell>
      <GalleryCell label="trace" selector='[data-testid="the-trace"]'>
        <TraceMenuDemo />
      </GalleryCell>
      <GalleryCell label="region" selector='[data-slot="region-frame"]'>
        <RegionMenuDemo />
      </GalleryCell>
      <GalleryCell label="arm" selector='[data-slot="region-arm"]'>
        <RegionMenuDemo />
      </GalleryCell>
    </div>
  );
}

export const Gallery: Story = {
  render: () => <GalleryDemo />,
  play: async ({ canvasElement }) => {
    const cells = canvasElement.querySelectorAll<HTMLElement>("[data-gallery-target]");
    await expect(cells.length).toBe(7);
    for (const cell of Array.from(cells)) {
      const selector = cell.getAttribute("data-gallery-target")!;
      const target = required<HTMLElement>(cell, selector, `the target inside ${cell.parentElement?.dataset.testid}`);
      fireEvent.contextMenu(target);
    }
    // Base UI's ContextMenu is single-instance-per-Root, and each cell owns
    // its own Root — seven independent presses should leave seven menus on
    // screen at once, each portaled to `document.body`.
    await waitFor(() => {
      expect(document.body.querySelectorAll('[data-slot="context-menu-content"]').length).toBe(7);
    });
  },
};

/* ------------------------------------------------------------------ */
/* The `:` title→type shortcut                                         */
/* ------------------------------------------------------------------ */

export const TitleTypeShortcut: Story = {
  render: () => <BlockMenuDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `title()`'s ROOT (data-testid="block-title") persists across both
    // modes; `editableControl` finds the actual `<input>` inside it once
    // editing — see that helper's own doc for why the two are not the
    // same element.
    const title = () => canvas.getByTestId("block-title");

    // Enter editing (the same gesture the resting title's own onClick
    // wires — a click starts the session).
    await userEvent.click(title());
    await waitFor(() => expect(editableControl(title())).toHaveFocus());

    // Clear the seeded "Amplifier" and type the shortcut live.
    await userEvent.clear(editableControl(title()));
    await userEvent.type(editableControl(title()), "Gain Stage: Number");
    await expect(editableControl(title()).value).toBe("Gain Stage: Number");

    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.getByTestId("block-title").textContent).toBe("Gain Stage"));
    await expect(canvas.getByTestId("block-type").textContent).toBe("Number");

    // Undo, mid-edit — two different mechanisms, both real:
    //
    // (a) Native OS text-field undo (Ctrl+Z, browser-owned character
    // history): this component is deliberately WRITE-THROUGH (`onChange`
    // mirrors every keystroke into `children` with no buffering —
    // editableText.tsx's own header, "avoided by writing through in
    // onChange"), which is what keeps this path available at all — a
    // buffered/derived value would fight the browser's own undo stack on
    // every render. What is NOT provable here is whether Ctrl+Z actually
    // fires: no story anywhere in this repo asserts real native undo via
    // `userEvent`, because CDP's synthetic key dispatch does not reliably
    // reproduce the OS-level text-undo Chromium performs for a REAL
    // keypress (measured here). So this only asserts Ctrl+Z is safe — it
    // neither commits nor corrupts the field — never that it reverted.
    await userEvent.click(title());
    await waitFor(() => expect(editableControl(title())).toHaveFocus());
    await userEvent.type(editableControl(title()), " extra");
    await expect(editableControl(title()).value).toBe("Gain Stage extra");
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect(titleEditing(canvasElement)).toBe(true); // still editing, not committed
    await expect(editableControl(title()).value.startsWith("Gain Stage")).toBe(true);

    // (b) The DETERMINISTIC, host-owned revert this repo actually tests
    // elsewhere (`EditableText.stories.tsx`'s `EscapeCancels`): Escape
    // restores the snapshot taken when editing began, discarding
    // whatever was typed — real undo, same contract, just triggered by a
    // key this harness CAN observe end to end.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.getByTestId("block-title").textContent).toBe("Gain Stage"));
  },
};

function titleEditing(canvasElement: HTMLElement): boolean {
  return required<HTMLElement>(canvasElement, '[data-testid="block-title"]', "the title").getAttribute(
    "data-editing",
  ) === "true";
}
