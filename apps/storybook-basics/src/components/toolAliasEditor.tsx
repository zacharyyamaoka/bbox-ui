// src/components/toolAliasEditor.tsx — the alias half of Settings ▸ Hotkeys
// and aliases: a search box over the host's tools, and one row per tool
// carrying its current aliases as removable chips plus a box to add another.
//
// Ported as BEHAVIOUR (not markup) from
// `/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:224-346` —
// `ToolAliasRow` (:224-291) and `ToolAliasesPanel` (:298-346). The donor's
// hand-rolled `systemsketch-tool-alias-*` CSS does not travel; this rebuilds
// it on the stock shadcn parts the trunk already carries (`Input`, `Button`,
// `Badge`), the same way `settingsView.tsx` rebuilt the dialog shell.
//
// WHY this lives in the trunk rather than in apps/systemsketch: Zach,
// 2026-09-19 — "all of the feedback regarding the chrome should be made in
// bbox-ui editor-components, not in system sketch, system sketch should just
// be kinda like importing these stock menus and doing a light bit of
// configuration" (`.claude/feedback.md`). WHICH tools exist is the host's;
// how a row, a chip and the add form look and behave is this file's.
//
// WHY the component is controlled (`aliases` in, `onAliasesChange` out) with
// only the draft text kept locally: `toolAliases.ts` is pure — the donor's
// module-level `useSyncExternalStore` store did not travel — so the one owner
// of the alias map is whoever persists it. Keeping a second copy here is how
// an editor and its storage silently disagree.
"use client";

import { useState } from "react";

import { Badge } from "./badge";
import { Button } from "./button";
import { FieldDescription } from "./field";
import { Input } from "./input";
import {
  addToolAlias,
  filterToolAliasItems,
  MAX_TOOL_ALIAS_LENGTH,
  normalizeToolAlias,
  removeToolAlias,
  type ToolAliasItem,
  type ToolAliases,
} from "./toolAliases";

export interface ToolAliasEditorProps {
  /** Every tool an alias may be attached to. The host names its own tools. */
  items: readonly ToolAliasItem[];
  aliases: ToolAliases;
  onAliasesChange(next: ToolAliases): void;
  /** Namespaces the ids/test hooks when two editors share a page. */
  idPrefix?: string;
}

/** One tool: its name, its chips, and the box that adds another alias. */
function ToolAliasRow({
  item,
  aliases,
  onAliasesChange,
  idPrefix,
}: {
  item: ToolAliasItem;
  aliases: ToolAliases;
  onAliasesChange(next: ToolAliases): void;
  idPrefix: string;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const itemAliases = aliases[item.id] ?? [];
  const inputId = `${idPrefix}-alias-input-${item.id}`;

  // Donor `InterfaceSettings.tsx:230-241`: the two refusals are spelled out
  // rather than silently dropping the keystroke — an alias that is too long
  // and an alias that already exists fail for different reasons, and the
  // author needs to know which.
  function add() {
    const normalized = normalizeToolAlias(draft);
    if (!normalized) {
      setMessage(`Enter a name up to ${MAX_TOOL_ALIAS_LENGTH} characters.`);
      return;
    }
    const next = addToolAlias(aliases, item.id, normalized);
    if (next === null) {
      setMessage(`${normalized} is already an alias for ${item.label}.`);
      return;
    }
    onAliasesChange(next);
    setDraft("");
    setMessage(null);
  }

  return (
    <div
      data-slot="tool-alias-row"
      data-tool-id={item.id}
      className="border-border flex flex-col gap-2 border-b py-3 last:border-b-0"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{item.label}</span>
        <FieldDescription>{item.detail}</FieldDescription>
      </div>
      <div className="flex flex-wrap items-center gap-1" aria-label={`Aliases for ${item.label}`}>
        {itemAliases.length > 0 ? (
          itemAliases.map((alias) => (
            <Badge key={alias} variant="secondary" data-slot="tool-alias-chip" data-alias={alias} className="gap-1 pr-1">
              <span aria-hidden="true">↪</span>
              {alias}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${alias} from ${item.label}`}
                onClick={() => onAliasesChange(removeToolAlias(aliases, item.id, alias))}
              >
                ×
              </Button>
            </Badge>
          ))
        ) : (
          <FieldDescription>No custom aliases</FieldDescription>
        )}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Add an alias for {item.label}
        </label>
        <Input
          id={inputId}
          data-slot="tool-alias-input"
          value={draft}
          placeholder="Add an alias, e.g. @datatype"
          maxLength={MAX_TOOL_ALIAS_LENGTH}
          className="h-8 max-w-64"
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setMessage(null);
          }}
        />
        <Button type="submit" size="sm" variant="outline" data-slot="tool-alias-add" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
      {message ? (
        <p role="status" data-slot="tool-alias-message" className="text-destructive text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * DOM contract (what the stories measure):
 *   - `[data-slot="tool-alias-editor"]` wraps a search `[data-slot=
 *     "tool-alias-search"]` and one `[data-slot="tool-alias-row"]
 *     [data-tool-id=<id>]` per VISIBLE tool;
 *   - each row: its aliases as `[data-slot="tool-alias-chip"][data-alias=…]`
 *     each with a `Remove <alias> from <tool>` button, an add box
 *     `[data-slot="tool-alias-input"]` and an `[data-slot="tool-alias-add"]`
 *     submit disabled while the draft is blank;
 *   - a refused add leaves `[data-slot="tool-alias-message"]`
 *     (`role="status"`) and does NOT call `onAliasesChange`;
 *   - an empty search result renders `[data-slot="tool-alias-empty"]`.
 */
export function ToolAliasEditor({ items, aliases, onAliasesChange, idPrefix = "tool-aliases" }: ToolAliasEditorProps) {
  const [query, setQuery] = useState("");
  // Donor `InterfaceSettings.tsx:293-296, 302-304`: the search matches a
  // tool's own name OR any alias already on it, so the name you invented is
  // as findable as the one we shipped.
  const visible = filterToolAliasItems(items, query, aliases);

  return (
    <div data-slot="tool-alias-editor" className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`${idPrefix}-search`}>
        Search tools or aliases
      </label>
      <Input
        id={`${idPrefix}-search`}
        data-slot="tool-alias-search"
        type="search"
        value={query}
        placeholder="Search tools or aliases"
        className="h-8"
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {visible.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          {visible.map((item) => (
            <ToolAliasRow
              key={item.id}
              item={item}
              aliases={aliases}
              onAliasesChange={onAliasesChange}
              idPrefix={idPrefix}
            />
          ))}
        </div>
      ) : (
        <p role="status" data-slot="tool-alias-empty" className="text-muted-foreground py-3 text-sm">
          No tools or aliases match “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
