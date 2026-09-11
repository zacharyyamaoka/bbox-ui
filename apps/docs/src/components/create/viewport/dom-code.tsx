"use client";

import { useState } from "react";
import type { FieldSpec } from "@bbox-ui/schema";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";

/**
 * The JSX that reproduces what is on screen, derived from the real props.
 *
 * WHY a prop equal to its declared default is omitted: the code should read
 * like something a person would paste, and a person does not write
 * `state="empty"` on a Port whose default is empty. The declaration says what
 * the default is, so the omission is exact, not a guess.
 */
export function instanceToJsx(entry: ComponentEntry, inst: Instance): string {
  const byId = new Map<string, FieldSpec>(entry.fields.map((f) => [f.id, f]));
  const attrs: string[] = [];
  let children: string | null = null;
  for (const [key, raw] of Object.entries(inst.props)) {
    if (raw === undefined) continue;
    const spec = byId.get(key);
    if (spec && spec.defaultValue === raw) continue;
    if (key === "children") {
      children = String(raw);
      continue;
    }
    if (typeof raw === "string") attrs.push(`${key}=${JSON.stringify(raw)}`);
    else if (typeof raw === "boolean") attrs.push(raw ? key : `${key}={false}`);
    else attrs.push(`${key}={${JSON.stringify(raw)}}`);
  }
  const head = [entry.name, ...attrs].join(" ");
  return children === null ? `<${head} />` : `<${head}>${children}</${entry.name}>`;
}

export function DomCode({
  entries,
  instances,
  selectedIds,
}: {
  entries: ComponentEntry[];
  instances: Instance[];
  selectedIds: string[];
}) {
  const [copied, setCopied] = useState(false);
  const shown = selectedIds.length > 0 ? instances.filter((i) => selectedIds.includes(i.id)) : instances;
  const lines = shown.map((inst) => instanceToJsx(entries.find((e) => e.name === inst.type)!, inst));
  const imports = Array.from(new Set(shown.map((i) => i.type))).sort();
  const code = [`import { ${imports.join(", ")} } from "@/components/bbox-ui";`, "", ...lines].join("\n");

  return (
    <div data-slot="dom-code" className="relative h-full min-h-0 overflow-auto">
      <button
        type="button"
        data-slot="copy-code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* clipboard blocked: nothing to do but not crash */
          }
        }}
        className="absolute right-3 top-3 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="m-0 p-6 font-mono text-[12.5px] leading-relaxed text-foreground">
        <code data-slot="dom-code-text">{code}</code>
      </pre>
      {selectedIds.length > 0 && selectedIds.length < instances.length && (
        <div className="px-6 pb-4 text-[11px] text-muted-foreground">Showing the {selectedIds.length} selected of {instances.length}. Clear the selection to see all.</div>
      )}
    </div>
  );
}
