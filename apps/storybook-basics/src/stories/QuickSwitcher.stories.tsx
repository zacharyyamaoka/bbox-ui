import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { BoxIcon, FileIcon, TerminalIcon } from "lucide-react";

import { QuickSwitcher } from "../components/quickSwitcher";
import { quickSwitcherKeyDecision, type QuickSwitcherItem } from "../components/commandModel";
import type { SearchableText, TextSourceUpdate } from "../components/boardSearch";

/**
 * Press **S**.
 *
 * Zach, `PROJECT - System Sketch.md`, 2026-09-19: *"Press S and it should open
 * the quick switcher / See system sketch from source code reference / WE
 * likely need a new editor component for this. / Please search for shadcn
 * reference I belive there are lots!!!"*
 *
 * The donor is SystemSketch's 504-line `SystemSketchCommandPalette.tsx`; the
 * stock part is shadcn's `command` (cmdk inside Base UI's Dialog) out of the
 * `base-nova` registry. What this component adds to the stock part is the
 * matching rule and — the part that actually needed designing — the rule that
 * decides whether a BARE LETTER is allowed to open anything at all.
 *
 * Every story here drives the real keyboard through a host as thin as the real
 * one will be: a `window` capture listener that asks
 * `quickSwitcherKeyDecision` and does nothing else. A DOM-presence assertion
 * would prove none of it, because the whole question is what happens to the
 * keystroke.
 */
const meta = {
  title: "Basics/QuickSwitcher",
  tags: ["area:basics", "lane:devtools-2026-09-19"],
  component: QuickSwitcher,
  args: { open: false, onOpenChange: () => {} },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof QuickSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

const P = "quick-switcher";
const node = (suffix: string) => document.querySelector<HTMLElement>(`[data-testid="${P}-${suffix}"]`);
const rows = () => [...document.querySelectorAll<HTMLElement>(`[data-testid^="${P}-item-"]`)];
const selectedRow = () =>
  document.querySelector<HTMLElement>(`[data-testid^="${P}-item-"][data-selected="true"]`);

function items(log: string[]): QuickSwitcherItem[] {
  return [
    { id: "arm", label: "arm.systemsketch", detail: "~/boards", group: "Boards", icon: <FileIcon />, run: () => { log.push("open arm"); } },
    { id: "belt", label: "belt.systemsketch", detail: "~/boards", group: "Boards", icon: <FileIcon />, run: () => { log.push("open belt"); } },
    { id: "gripper", label: "Gripper", description: "Block · 3 ports", group: "On this board", icon: <BoxIcon />, run: () => { log.push("go gripper"); } },
    { id: "grip-frame", label: "Grip sequence", description: "Frame · 6 blocks", group: "On this board", icon: <BoxIcon />, run: () => { log.push("go grip frame"); } },
    { id: "fit", label: "Zoom to fit", shortcut: "⇧1", keywords: ["camera"], group: "Commands", icon: <TerminalIcon />, run: () => { log.push("fit"); } },
    { id: "undo", label: "Undo", shortcut: "⌘Z", group: "Commands", icon: <TerminalIcon />, disabled: true, run: () => { log.push("undo"); } },
  ];
}

const searchSources: SearchableText<{ page: string }>[] = [
  { sourceId: "b1", group: "Page 1", field: "Block title", text: "Grip the bottle", meta: { page: "1" } },
  { sourceId: "f1", group: "Page 1", field: "Frame name", text: "Bottle sorting", meta: { page: "1" } },
  { sourceId: "n1", group: "Page 2", field: "Shape text", text: "a bottle, then another bottle", meta: { page: "2" } },
  { sourceId: "l1", group: "Page 2", field: "Shape text", text: "bottle (locked)", replaceBlocker: "Locked shape", meta: { page: "2" } },
];

/**
 * The host, exactly as thin as `apps/systemsketch`'s will be: it owns the open
 * flag and a `window` capture listener, and every decision inside that listener
 * belongs to `quickSwitcherKeyDecision`.
 */
function Host({
  log,
  withFind = false,
  withTextField = false,
  updates,
}: {
  log: string[];
  withFind?: boolean;
  withTextField?: boolean;
  updates?: Array<TextSourceUpdate<{ page: string }>>;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState(searchSources);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const decision = quickSwitcherKeyDecision(event, { open: openRef.current });
      if (!decision.open) return;
      event.preventDefault();
      event.stopPropagation();
      log.push(`opened by ${decision.source}`);
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [log]);

  return (
    <div style={{ height: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="text-sm text-muted-foreground">
        Press <kbd>S</kbd> anywhere on this surface, or <kbd>Ctrl</kbd>+<kbd>K</kbd>.
      </p>
      {withTextField ? (
        <>
          <input data-testid="host-title" aria-label="Board title" defaultValue="" className="w-64 rounded border px-2 py-1" />
          <div data-testid="host-shape-text" contentEditable suppressContentEditableWarning className="w-64 rounded border px-2 py-1">
            shape text
          </div>
        </>
      ) : null}
      <div data-testid="host-canvas" style={{ flex: 1, background: "var(--muted, #eee)" }} />
      <QuickSwitcher
        open={open}
        onOpenChange={setOpen}
        items={items(log)}
        searchSources={withFind ? sources : undefined}
        onSelectMatch={(match) => log.push(`match ${match.sourceId}#${match.occurrence}`)}
        onReplaceAll={(next) => {
          updates?.push(...next);
          setSources((current) =>
            current.map((source) => next.find((update) => update.sourceId === source.sourceId) ?? source),
          );
        }}
      />
    </div>
  );
}

/**
 * The whole ask, driven: **S** opens it, typing narrows it, the arrow keys walk
 * it, Enter runs the row that is actually selected, and the switcher closes.
 */
export const PressS: Story = {
  render: function Render() {
    const log: string[] = [];
    (globalThis as { __qsLog?: string[] }).__qsLog = log;
    return <Host log={log} />;
  },
  play: async ({ canvasElement }) => {
    const log = (globalThis as { __qsLog?: string[] }).__qsLog!;

    // 1. Bare S over the canvas opens it. `findByTestId` first, by the repo
    // rule: a synchronous query on a story that has not finished mounting
    // makes every later negative assertion vacuously true.
    await userEvent.click(await within(canvasElement).findByTestId("host-canvas"));
    await userEvent.keyboard("s");
    await waitFor(() => expect(node("input")).toBeInTheDocument());
    expect(log).toContain("opened by letter");
    // The letter did NOT also land in the search box — that is the guard's
    // whole job, and an empty input is the only proof of it.
    expect(node("input")).toHaveValue("");
    expect(rows().length).toBe(6);

    // 2. Typing narrows it, across label AND description.
    await userEvent.keyboard("grip");
    await waitFor(() => expect(rows().length).toBe(2));
    expect(rows().map((row) => row.dataset.itemId)).toEqual(["gripper", "grip-frame"]);
    expect(node("status")).toHaveTextContent("2 results");

    // 3. The arrow key moves the SELECTION, not the caret.
    await waitFor(() => expect(selectedRow()?.dataset.itemId).toBe("gripper"));
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(selectedRow()?.dataset.itemId).toBe("grip-frame"));

    // 4. Enter runs the selected row and closes.
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(node("input")).not.toBeInTheDocument());
    expect(log).toContain("go grip frame");
    expect(log).not.toContain("go gripper");
  },
};

/**
 * S · Escape · S. This is the sequence a jump surface is actually used in, and
 * it is the one that catches a closing dialog still sitting in the DOM: Base UI
 * keeps a popup mounted through its exit transition, so a layer probe that does
 * not exclude `[data-closed]` refuses the second S.
 */
export const ReopensAfterEscape: Story = {
  render: function Render() {
    const log: string[] = [];
    (globalThis as { __qsLog?: string[] }).__qsLog = log;
    return <Host log={log} />;
  },
  play: async ({ canvasElement }) => {
    const log = (globalThis as { __qsLog?: string[] }).__qsLog!;
    await userEvent.click(await within(canvasElement).findByTestId("host-canvas"));

    await userEvent.keyboard("s");
    await waitFor(() => expect(node("input")).toBeInTheDocument());

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(node("input")).not.toBeInTheDocument());

    await userEvent.keyboard("s");
    await waitFor(() => expect(node("input")).toBeInTheDocument());
    expect(log.filter((entry) => entry === "opened by letter")).toHaveLength(2);
    expect(node("input")).toHaveValue("");
  },
};

/**
 * The guard, from the other side. With a text field focused, **S** is a letter
 * and nothing else happens; **Ctrl+K** is not a character, so it still opens —
 * which is why VS Code's palette opens from inside the editor.
 */
export const RefusesWhileTyping: Story = {
  render: function Render() {
    const log: string[] = [];
    (globalThis as { __qsLog?: string[] }).__qsLog = log;
    return <Host log={log} withTextField />;
  },
  play: async ({ canvasElement }) => {
    const log = (globalThis as { __qsLog?: string[] }).__qsLog!;

    // An <input> — the chrome bar's board-title field.
    const title = await within(canvasElement).findByTestId<HTMLInputElement>("host-title");
    await userEvent.click(title);
    await userEvent.keyboard("sorting");
    expect(title).toHaveValue("sorting");
    expect(node("input")).not.toBeInTheDocument();

    // A contenteditable — tldraw's shape text editor.
    const shapeText = await within(canvasElement).findByTestId("host-shape-text");
    await userEvent.click(shapeText);
    await userEvent.keyboard("s");
    expect(node("input")).not.toBeInTheDocument();
    expect(log).toEqual([]);

    // The chord still works from inside the field.
    await userEvent.click(title);
    await userEvent.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(node("input")).toBeInTheDocument());
    expect(log).toContain("opened by chord");
    expect(title).toHaveValue("sorting");
  },
};

/**
 * The Find half — the donor's second tab, kept, but searching text the host
 * hands in rather than an `Editor`. The locked source is listed and says why it
 * cannot be replaced, and Replace All skips it.
 */
export const FindAndReplace: Story = {
  render: function Render() {
    const log: string[] = [];
    const updates: Array<TextSourceUpdate<{ page: string }>> = [];
    (globalThis as { __qsLog?: string[]; __qsUpdates?: unknown[] }).__qsLog = log;
    (globalThis as { __qsUpdates?: Array<TextSourceUpdate<{ page: string }>> }).__qsUpdates = updates;
    return <Host log={log} withFind updates={updates} />;
  },
  play: async ({ canvasElement }) => {
    const updates = (globalThis as { __qsUpdates?: Array<TextSourceUpdate<{ page: string }>> }).__qsUpdates!;
    await userEvent.click(await within(canvasElement).findByTestId("host-canvas"));
    await userEvent.keyboard("s");
    await waitFor(() => expect(node("modes")).toBeInTheDocument());

    await userEvent.click(node("mode-find")!);
    await waitFor(() => expect(node("find-controls")).toBeInTheDocument());
    expect(node("status")).toHaveTextContent("Searches every word the host exposes");

    await userEvent.click(node("input")!);
    await userEvent.keyboard("bottle");
    await waitFor(() => expect(node("status")).toHaveTextContent("5 matches"));
    expect(document.querySelector(`[data-testid="${P}-match-l1|Shape text|0"]`)).toHaveAttribute(
      "data-replaceable",
      "false",
    );

    await userEvent.click(node("replacement")!);
    await userEvent.keyboard("can");
    await userEvent.click(node("replace-all")!);
    await waitFor(() => expect(node("status")).toHaveTextContent("Replaced 4 matches; skipped 1"));
    expect(updates.map((update) => update.text)).toEqual([
      "Grip the can",
      "can sorting",
      "a can, then another can",
    ]);
    // The blocked source is untouched, and its payload survived the round trip.
    expect(updates.some((update) => update.sourceId === "l1")).toBe(false);
    expect(updates[0].meta?.page).toBe("1");
  },
};

/** The plain visual: grouped rows, a disabled row, shortcuts, details. */
export const Grouped: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return <QuickSwitcher open={open} onOpenChange={setOpen} items={items([])} />;
  },
  play: async () => {
    await waitFor(() => expect(node("input")).toBeInTheDocument());
    const headings = [...document.querySelectorAll("[cmdk-group-heading]")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Boards", "On this board", "Commands"]);
    expect(node("item-undo")).toHaveAttribute("data-disabled", "true");
    expect(node("item-fit")).toHaveTextContent("⇧1");
    expect(node("item-arm")).toHaveTextContent("~/boards");
    // A disabled row is not reachable by the arrow keys — cmdk skips it.
    // WHY the click first: this story mounts already-open, so there is no open
    // transition for the Dialog to move focus on, and cmdk's key handling
    // lives on its own root. Every other story here opens by keystroke and is
    // focused for free.
    await userEvent.click(node("input")!);
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(selectedRow()?.dataset.itemId).toBe("fit"));
  },
};
