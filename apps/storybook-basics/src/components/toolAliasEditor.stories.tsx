// src/components/toolAliasEditor.stories.tsx — the alias editing surface on
// its own, colocated with the component.
//
// WHY this is not a duplicate of `SettingsCategories.stories.tsx`'s
// `AliasesAddRefuseAndRemove`: that story drives the editor THROUGH the
// settings shell — it is the categories acceptance, and it reaches the
// aliases by opening a category first. This one is the component's own
// page: the states a host sees when it mounts `ToolAliasEditor` directly
// (empty, populated, mid-edit), including the two it is easy to ship
// broken — the search's own empty result, and the refusal that must NOT
// reach the host.
//
// WHY every story mounts a `Harness` rather than passing a frozen
// `aliases` prop: the component is controlled by design (`toolAliases.ts`
// is pure — "keeping a second copy here is how an editor and its storage
// silently disagree"), so a story that never applies the callback would
// prove the labels render and nothing about whether a change lands. The
// harness IS the host: it owns the map, applies whatever comes back, and
// PRINTS it — so each play function can assert what the host actually
// received as rendered output, not as a spy nobody can see in the gallery.

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ToolAliasEditor } from "./toolAliasEditor";
import { EMPTY_TOOL_ALIASES, type ToolAliasItem, type ToolAliases } from "./toolAliases";

/* ------------------------------------------------------------------ */
/* Fixture — a host's own tools. The kit never names one.               */
/* ------------------------------------------------------------------ */

const TOOLS: readonly ToolAliasItem[] = [
  { id: "block", label: "Block", detail: "Toolbar tool" },
  { id: "text", label: "Text", detail: "Toolbar tool" },
  { id: "arrow-elbow", label: "Elbow arrow", detail: "Toolbar tool" },
];

const SEEDED: ToolAliases = {
  block: ["@node", "@box"],
  "arrow-elbow": ["@wire"],
};

/**
 * A real host: it owns the map, applies every patch the editor hands back,
 * and renders the result. The readout is part of the deliverable — an
 * editor that shows a chip while its host holds something else is exactly
 * the failure the component's controlled design exists to prevent, and a
 * printed state is how a play function (and Zach) can see the difference.
 */
function Harness({
  items = TOOLS,
  initial = EMPTY_TOOL_ALIASES,
}: {
  items?: readonly ToolAliasItem[];
  initial?: ToolAliases;
}) {
  const [aliases, setAliases] = useState<ToolAliases>(initial);
  const [changes, setChanges] = useState(0);
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
      <ToolAliasEditor
        items={items}
        aliases={aliases}
        onAliasesChange={(next) => {
          setAliases(next);
          setChanges((count) => count + 1);
        }}
      />
      <pre
        data-testid="host-state"
        data-changes={changes}
        style={{
          margin: 0,
          padding: 8,
          borderRadius: 6,
          background: "var(--muted)",
          fontSize: 11,
          color: "var(--muted-foreground)",
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(aliases)}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el;
}

function editorOf(canvasElement: HTMLElement): HTMLElement {
  return requireEl<HTMLElement>(canvasElement, '[data-slot="tool-alias-editor"]');
}

function rowOf(editor: HTMLElement, toolId: string): HTMLElement {
  return requireEl<HTMLElement>(editor, `[data-slot="tool-alias-row"][data-tool-id="${toolId}"]`);
}

/** The chips on one row, in the order they are painted — the model keeps
 * insertion order, so the rendered order is a claim worth checking. */
function chipsOf(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll('[data-slot="tool-alias-chip"]')).map(
    (chip) => chip.getAttribute("data-alias") ?? "",
  );
}

function hostState(canvasElement: HTMLElement): { aliases: ToolAliases; changes: number } {
  const readout = requireEl<HTMLElement>(canvasElement, '[data-testid="host-state"]');
  return {
    aliases: JSON.parse(readout.textContent ?? "{}") as ToolAliases,
    changes: Number(readout.getAttribute("data-changes")),
  };
}

const meta = {
  title: "Components/Panels & Dialogs/ToolAliasEditor",
  tags: ["object:chrome", "lane:settings-pages"],
  component: ToolAliasEditor,
  // Placeholders: every story renders its own stateful `Harness` and never
  // reads `args` (the same idiom `SettingsView.stories.tsx` uses).
  args: { items: TOOLS, aliases: EMPTY_TOOL_ALIASES, onAliasesChange: () => {} },
} satisfies Meta<typeof ToolAliasEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* 1. Empty — nothing named yet                                          */
/* ==================================================================== */

export const Empty: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const editor = editorOf(canvasElement);

    // One row per tool, in the host's own order — the editor does not sort.
    const rows = Array.from(editor.querySelectorAll('[data-slot="tool-alias-row"]'));
    await expect(rows).toHaveLength(TOOLS.length);
    await expect(rows.map((row) => row.getAttribute("data-tool-id"))).toEqual([
      "block",
      "text",
      "arrow-elbow",
    ]);

    // No chips anywhere, and the fallback line on every row.
    await expect(editor.querySelectorAll('[data-slot="tool-alias-chip"]')).toHaveLength(0);
    for (const tool of TOOLS) {
      const row = rowOf(editor, tool.id);
      await expect(row).toHaveTextContent(tool.label);
      await expect(row).toHaveTextContent("No custom aliases");
      // The add box is present but its submit is refused while blank.
      await expect(requireEl<HTMLInputElement>(row, '[data-slot="tool-alias-input"]').value).toBe("");
      await expect(requireEl<HTMLButtonElement>(row, '[data-slot="tool-alias-add"]').disabled).toBe(true);
    }

    // Nothing has been reported to the host, and no empty-search state is
    // showing — "no aliases" is not "no tools".
    await expect(editor.querySelector('[data-slot="tool-alias-empty"]')).toBeNull();
    await expect(hostState(canvasElement)).toEqual({ aliases: {}, changes: 0 });
  },
};

/* ==================================================================== */
/* 2. Populated — chips, in order, with their own remove affordance      */
/* ==================================================================== */

export const Populated: Story = {
  render: () => <Harness initial={SEEDED} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = editorOf(canvasElement);

    // Insertion order is preserved and rendered as authored — `@node` was
    // added before `@box`, and neither is case-folded or re-sorted.
    await expect(chipsOf(rowOf(editor, "block"))).toEqual(["@node", "@box"]);
    await expect(chipsOf(rowOf(editor, "arrow-elbow"))).toEqual(["@wire"]);
    // A tool with no aliases still gets its row, with the fallback.
    await expect(chipsOf(rowOf(editor, "text"))).toEqual([]);
    await expect(rowOf(editor, "text")).toHaveTextContent("No custom aliases");

    // The chip prints the alias verbatim beside its ↪ marker...
    const chip = requireEl<HTMLElement>(rowOf(editor, "block"), '[data-alias="@node"]');
    await expect(chip).toHaveTextContent("@node");
    // ...and carries its own labelled remove button, named for both the
    // alias and the tool it belongs to.
    await expect(canvas.getByRole("button", { name: "Remove @node from Block" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Remove @box from Block" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Remove @wire from Elbow arrow" })).toBeInTheDocument();

    // The rendered chips and the host's map agree, exactly.
    await expect(hostState(canvasElement).aliases).toEqual(SEEDED);
  },
};

/* ==================================================================== */
/* 3. AddAndRefuse — the two refusals are spelled out, and only the      */
/*    accepted one reaches the host                                      */
/* ==================================================================== */

export const AddAndRefuse: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const editor = editorOf(canvasElement);
    const row = rowOf(editor, "text");
    const input = requireEl<HTMLInputElement>(row, '[data-slot="tool-alias-input"]');
    const add = requireEl<HTMLButtonElement>(row, '[data-slot="tool-alias-add"]');

    // Whitespace is not a name: the submit stays disabled, so the blank
    // refusal never even reaches the handler.
    await userEvent.type(input, "   ");
    await expect(add.disabled).toBe(true);
    await userEvent.clear(input);

    /* ---- accepted -------------------------------------------------- */
    await userEvent.type(input, "@datatype");
    await expect(add.disabled).toBe(false);
    await userEvent.click(add);

    await waitFor(() => expect(chipsOf(rowOf(editor, "text"))).toEqual(["@datatype"]));
    // The host got exactly one change, carrying exactly that map.
    await expect(hostState(canvasElement)).toEqual({ aliases: { text: ["@datatype"] }, changes: 1 });
    // The draft is cleared on success, and the submit falls back to disabled.
    const afterAdd = requireEl<HTMLInputElement>(rowOf(editor, "text"), '[data-slot="tool-alias-input"]');
    await expect(afterAdd.value).toBe("");
    await expect(requireEl<HTMLButtonElement>(rowOf(editor, "text"), '[data-slot="tool-alias-add"]').disabled).toBe(true);
    await expect(rowOf(editor, "text").querySelector('[data-slot="tool-alias-message"]')).toBeNull();

    /* ---- refused: same name, different case ------------------------ */
    // De-duplication is case-INsensitive (and accent-sensitive), so this is
    // the same alias — and the refusal names which rule it broke.
    await userEvent.type(afterAdd, "@DataType");
    await userEvent.click(requireEl<HTMLButtonElement>(rowOf(editor, "text"), '[data-slot="tool-alias-add"]'));

    const message = await waitFor(() =>
      requireEl<HTMLElement>(rowOf(editor, "text"), '[data-slot="tool-alias-message"]'),
    );
    await expect(message).toHaveAttribute("role", "status");
    await expect(message.textContent).toBe("@DataType is already an alias for Text.");
    // The refusal changed nothing: still one chip, still ONE host change.
    await expect(chipsOf(rowOf(editor, "text"))).toEqual(["@datatype"]);
    await expect(hostState(canvasElement)).toEqual({ aliases: { text: ["@datatype"] }, changes: 1 });

    // Typing again clears the message — it belongs to the last attempt, not
    // to the row.
    await userEvent.type(requireEl<HTMLInputElement>(rowOf(editor, "text"), '[data-slot="tool-alias-input"]'), "x");
    await waitFor(() =>
      expect(rowOf(editor, "text").querySelector('[data-slot="tool-alias-message"]')).toBeNull(),
    );
  },
};

/* ==================================================================== */
/* 4. RemoveAlias — the last one out takes the tool's key with it        */
/* ==================================================================== */

export const RemoveAlias: Story = {
  render: () => <Harness initial={SEEDED} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = editorOf(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Remove @node from Block" }));
    await waitFor(() => expect(chipsOf(rowOf(editor, "block"))).toEqual(["@box"]));
    await expect(hostState(canvasElement)).toEqual({
      aliases: { block: ["@box"], "arrow-elbow": ["@wire"] },
      changes: 1,
    });

    // Removing the LAST alias on a tool drops that tool's key entirely
    // rather than leaving an empty array behind — and the row falls back to
    // the "no aliases" line, not to a blank strip.
    await userEvent.click(canvas.getByRole("button", { name: "Remove @wire from Elbow arrow" }));
    await waitFor(() => expect(chipsOf(rowOf(editor, "arrow-elbow"))).toEqual([]));
    await expect(rowOf(editor, "arrow-elbow")).toHaveTextContent("No custom aliases");
    const state = hostState(canvasElement);
    await expect(state.aliases).toEqual({ block: ["@box"] });
    await expect(Object.keys(state.aliases)).not.toContain("arrow-elbow");
    await expect(state.changes).toBe(2);
  },
};

/* ==================================================================== */
/* 5. SearchByNameOrAlias — including the empty result                   */
/* ==================================================================== */

export const SearchByNameOrAlias: Story = {
  render: () => <Harness initial={SEEDED} />,
  play: async ({ canvasElement }) => {
    const editor = editorOf(canvasElement);
    const search = requireEl<HTMLInputElement>(editor, '[data-slot="tool-alias-search"]');
    const visibleIds = () =>
      Array.from(editor.querySelectorAll('[data-slot="tool-alias-row"]')).map((row) =>
        row.getAttribute("data-tool-id"),
      );

    await expect(visibleIds()).toEqual(["block", "text", "arrow-elbow"]);

    // By the tool's own name, case-insensitively.
    await userEvent.type(search, "elbow");
    await waitFor(() => expect(visibleIds()).toEqual(["arrow-elbow"]));

    // By an alias already on it — "the name you invented is as findable as
    // the one we shipped". `@node` is on Block, whose LABEL does not match.
    await userEvent.clear(search);
    await userEvent.type(search, "@node");
    await waitFor(() => expect(visibleIds()).toEqual(["block"]));
    await expect(rowOf(editor, "block")).toHaveTextContent("Block");

    // No match: the empty state, quoting the TRIMMED query back verbatim,
    // curly quotes and all — and no rows beside it.
    await userEvent.clear(search);
    await userEvent.type(search, "  zzz  ");
    const empty = await waitFor(() => requireEl<HTMLElement>(editor, '[data-slot="tool-alias-empty"]'));
    await expect(empty).toHaveAttribute("role", "status");
    await expect(empty.textContent).toBe("No tools or aliases match “zzz”.");
    await expect(visibleIds()).toEqual([]);

    // Clearing the box brings every tool back, in the host's order.
    await userEvent.clear(search);
    await waitFor(() => expect(visibleIds()).toEqual(["block", "text", "arrow-elbow"]));
    await expect(editor.querySelector('[data-slot="tool-alias-empty"]')).toBeNull();
    // The search never touched the data — it is a filter, not an edit.
    await expect(hostState(canvasElement)).toEqual({ aliases: SEEDED, changes: 0 });
  },
};
