import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Badge } from "./badge";
import { Bar } from "./bar";
import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { EditableText } from "./editableText";
import { Glyph } from "./glyph";
import type { ReorderChord } from "./keyboardReorder";

/**
 * src/components/MemberStackKeyboardReorder.stories.tsx — the IDE move-line
 * chord, applied to a STACKED MEMBER while its title is being edited. Zach,
 * 2026-09-21: "it should be able to reorder any members that are organized
 * in a stack ... If you are editing their title and you do the ide hot keys
 * then it should change its order in that stack."
 *
 * The block is `Block.stories.tsx`'s `ClassExample` — the class Component
 * with its five method members. What changed for the prototype, and only
 * this: that story's method titles are plain `<span>`s, so no member title
 * was editable anywhere in the trunk. Each title here is an `EditableText`
 * — the SAME control the class's own title already uses, with the story
 * owning `editing` (click to open, Enter/blur to close) exactly as the
 * component's controlled contract asks. No new editing UI was built.
 */
const meta = {
  title: "Blocks/Member stack",
  tags: ["area:blocks", "lane:ide-hotkey-reorder"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const REORDER_CHORD_STORAGE_KEY = "bbox-ui:keyboard-reorder-chord";

function useStoredReorderChord(): [ReorderChord, (next: ReorderChord) => void] {
  const [chord, setChord] = useState<ReorderChord>(() => {
    try {
      return window.localStorage.getItem(REORDER_CHORD_STORAGE_KEY) === "alt" ? "alt" : "ctrl";
    } catch {
      return "ctrl";
    }
  });
  const choose = (next: ReorderChord) => {
    setChord(next);
    try {
      window.localStorage.setItem(REORDER_CHORD_STORAGE_KEY, next);
    } catch {
      // A blocked store only costs the memory, never the switch.
    }
  };
  return [chord, choose];
}

const METHODS = [
  { id: "init", name: "__init__()" },
  { id: "call", name: "__call__()" },
  { id: "in_1", name: "in_1_cb()" },
  { id: "in_2", name: "in_2_cb()" },
  { id: "in_3", name: "in_3_cb()" },
];

function KeyboardReorderDemo() {
  const [chord, setChord] = useStoredReorderChord();
  const [order, setOrder] = useState(() => METHODS.map((method) => method.id));
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(METHODS.map((method) => [method.id, method.name])));
  const [editingId, setEditingId] = useState<string | null>(null);

  const members: BlockMember[] = order.map((id) => ({
    id,
    content: (
      <Block
        style={{ width: "100%" }}
        header={
          <Bar
            size="sm"
            left={
              <EditableText
                size="sm"
                font="mono"
                editing={editingId === id}
                onClick={() => setEditingId(id)}
                onChange={(value) => setNames((prev) => ({ ...prev, [id]: value }))}
                onCommit={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              >
                {names[id]}
              </EditableText>
            }
          />
        }
      />
    ),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
        Reorder chord
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {(["ctrl", "alt"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setChord(value)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background: chord === value ? "var(--accent)" : "transparent",
                color: chord === value ? "var(--accent-foreground)" : "var(--foreground)",
              }}
            >
              {value === "ctrl" ? "Ctrl + arrows" : "Alt + arrows"}
            </button>
          ))}
        </div>
      </div>
      <Block
        width={320}
        header={
          <Bar
            left={
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Glyph content="lucide:box" />
                <EditableText size="sm">Component</EditableText>
              </div>
            }
            right={<Badge variant="secondary">class</Badge>}
          />
        }
        members={members}
        membersLayout="stack"
        onMembersChange={(next) => setOrder(next.map((member) => member.id))}
        membersReorderChord={chord}
        insetBackground="soft-gray"
        footer={<Bar size="sm" center={`${order.length} methods`} />}
      />
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 420, margin: 0 }}>
        Click a method name to rename it, then {chord === "ctrl" ? "Ctrl" : "Alt"}+↑/↓ moves that method within the stack — you keep typing where you were. Drag still works too; both run the same reorder.
      </p>
    </div>
  );
}

/** The title a member slot is showing right now — the open input's value
 *  while editing, the resting text otherwise. */
function memberTitle(slot: Element): string {
  const input = slot.querySelector<HTMLInputElement>('input[data-slot="editable-text-input"]');
  if (input) return input.value;
  return slot.querySelector('[data-slot="editable-text-content"]')?.textContent ?? "";
}

/** Titles in SCREEN order, by each slot's measured top — never DOM order. */
function titlesOnScreen(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-slot="block-member"]'))
    .map((slot) => ({ title: memberTitle(slot), top: slot.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top)
    .map((entry) => entry.title);
}

/** Still editing the same `<input>`, focused, text and caret intact. */
async function expectStillEditing(input: HTMLInputElement, value: string, caret: number) {
  await expect(input.isConnected).toBe(true);
  await expect(document.activeElement).toBe(input);
  await expect(input.value).toBe(value);
  await expect(input.selectionStart).toBe(caret);
  await expect(input.selectionEnd).toBe(caret);
}

/** The chord hints actually painted — every member carries one, CSS shows
 *  only the one whose title is being edited (keyboardReorder.css). */
function visibleReorderHints(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-slot="block-member-reorder-hint"]')).filter((hint) => getComputedStyle(hint).display !== "none");
}

const settle = () => new Promise((r) => setTimeout(r, 250));

export const KeyboardReorder: Story = {
  render: () => <KeyboardReorderDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Ctrl + arrows" }));

    // Open `in_1_cb()`'s title by a real click, type onto the end of it.
    await userEvent.click(await canvas.findByText("in_1_cb()"));
    const input = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLInputElement>('input[data-slot="editable-text-input"]');
      if (!found) throw new Error("expected the title editor");
      return found;
    });
    await userEvent.keyboard("{End}_v2");
    await expectStillEditing(input, "in_1_cb()_v2", 12);

    // The hint shows inside the member while its title is being edited,
    // to the RIGHT of the title it must not cover.
    const hints = visibleReorderHints(canvasElement);
    await expect(hints).toHaveLength(1);
    const hint = hints[0];
    await expect(hint.closest('[data-slot="block-member"]')).toBe(input.closest('[data-slot="block-member"]'));
    await expect(hint.textContent).toBe("Ctrl ↑↓ reorder");
    await expect(hint.getBoundingClientRect().left).toBeGreaterThanOrEqual(input.getBoundingClientRect().right);

    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    await waitFor(() => expect(titlesOnScreen(canvasElement)).toEqual(["__init__()", "in_1_cb()_v2", "__call__()", "in_2_cb()", "in_3_cb()"]));
    await expectStillEditing(input, "in_1_cb()_v2", 12);

    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    await waitFor(() => expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2", "__init__()", "__call__()", "in_2_cb()", "in_3_cb()"]));
    await expectStillEditing(input, "in_1_cb()_v2", 12);

    // First slot + move-up: a no-op, no wrap, still editing.
    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    await settle();
    await expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2", "__init__()", "__call__()", "in_2_cb()", "in_3_cb()"]);
    await expectStillEditing(input, "in_1_cb()_v2", 12);

    // Ctrl+← is not the stack's axis: the input's own word-jump runs.
    await userEvent.keyboard("{Control>}{ArrowLeft}{/Control}");
    await expect(input.selectionStart).toBeLessThan(12);
    await expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2", "__init__()", "__call__()", "in_2_cb()", "in_3_cb()"]);

    // Still editable: type more, commit, the rename and the order stick.
    await userEvent.keyboard("{End}x{Enter}");
    await waitFor(() => expect(canvasElement.querySelector('input[data-slot="editable-text-input"]')).toBeNull());
    await expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2x", "__init__()", "__call__()", "in_2_cb()", "in_3_cb()"]);
    await expect(visibleReorderHints(canvasElement)).toHaveLength(0);

    // Last slot + move-down: a no-op.
    await userEvent.click(await canvas.findByText("in_3_cb()"));
    const lastInput = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLInputElement>('input[data-slot="editable-text-input"]');
      if (!found) throw new Error("expected the title editor");
      return found;
    });
    await userEvent.keyboard("{End}");
    await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");
    await settle();
    await expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2x", "__init__()", "__call__()", "in_2_cb()", "in_3_cb()"]);
    await expectStillEditing(lastInput, "in_3_cb()", 9);
    await userEvent.keyboard("{Enter}");

    // The Alt variant, switched live: Alt+↓ moves, Ctrl+↓ no longer does.
    await userEvent.click(await canvas.findByRole("button", { name: "Alt + arrows" }));
    await userEvent.click(await canvas.findByText("__call__()"));
    const altInput = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLInputElement>('input[data-slot="editable-text-input"]');
      if (!found) throw new Error("expected the title editor");
      return found;
    });
    await userEvent.keyboard("{End}");
    await expect(visibleReorderHints(canvasElement).map((h) => h.textContent)).toEqual(["Alt ↑↓ reorder"]);
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() => expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2x", "__init__()", "in_2_cb()", "__call__()", "in_3_cb()"]));
    await expectStillEditing(altInput, "__call__()", 10);
    await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");
    await settle();
    await expect(titlesOnScreen(canvasElement)).toEqual(["in_1_cb()_v2x", "__init__()", "in_2_cb()", "__call__()", "in_3_cb()"]);
    await userEvent.keyboard("{Enter}");

    await userEvent.click(await canvas.findByRole("button", { name: "Ctrl + arrows" }));
  },
};
