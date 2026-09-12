"use client";

import { useState } from "react";
import type { FieldSpec } from "@bbox-ui/schema";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { CanvasPosition, Render } from "../contract";

/**
 * The code that reproduces what the chosen render is showing.
 *
 * One view, three renders: the JSX for the DOM, the node array for React
 * Flow, the shape records for tldraw. Every one is derived from the real
 * instances and, for the canvases, their real positions — nothing here is a
 * template with the values pasted in.
 *
 * WHY a prop equal to its declared default is omitted: the code should read
 * like something a person would paste, and a person does not write
 * `state="empty"` on a Port whose default is empty. The declaration says
 * what the default is, so the omission is exact, not a guess.
 */

function ownProps(entry: ComponentEntry, inst: Instance): Record<string, unknown> {
  const byId = new Map<string, FieldSpec>(entry.fields.map((f) => [f.id, f]));
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(inst.props)) {
    if (raw === undefined) continue;
    const spec = byId.get(key);
    if (spec && spec.defaultValue === raw) continue;
    out[key] = raw;
  }
  return out;
}

function jsxAttr(key: string, raw: unknown): string {
  if (typeof raw === "string") return `${key}=${JSON.stringify(raw)}`;
  if (typeof raw === "boolean") return raw ? key : `${key}={false}`;
  return `${key}={${JSON.stringify(raw)}}`;
}

/**
 * One instance as JSX. Members print NESTED, one per line and indented, the
 * way a person would write a Stack of Blocks — `members` is never printed as
 * an attribute, because it is not a prop (members/contract.ts).
 */
export function instanceToJsx(entry: ComponentEntry, inst: Instance, byId?: Map<string, Instance>, entries?: ComponentEntry[], indent = ""): string {
  const props = ownProps(entry, inst);
  const text = "children" in props ? String(props.children) : null;
  delete props.children;
  const head = [entry.name, ...Object.entries(props).map(([k, v]) => jsxAttr(k, v))].join(" ");
  // Members AND slot fills print nested: a slotted Block prints its seven
  // Flex fills in slot order, each with the props its slot gave it.
  const memberIds = entry.members || entry.slots ? (inst.members ?? []) : [];
  const nested = memberIds
    .map((id) => byId?.get(id))
    .filter((c): c is Instance => !!c)
    .map((c) => {
      const e = entries?.find((x) => x.name === c.type);
      return e ? instanceToJsx(e, c, byId, entries, indent + "  ") : null;
    })
    .filter((l): l is string => l !== null);
  if (nested.length > 0) {
    const inner = text === null ? nested : [`${indent}  ${text}`, ...nested];
    return `${indent}<${head}>\n${inner.join("\n")}\n${indent}</${entry.name}>`;
  }
  return text === null ? `${indent}<${head} />` : `${indent}<${head}>${text}</${entry.name}>`;
}

function literal(value: unknown, indent: string): string {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  const inner = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${indent}  ${k}: ${literal(v, indent + "  ")},`)
    .join("\n");
  return `{\n${inner}\n${indent}}`;
}

/**
 * React Flow: the Port has a real adapter node (`bboxStandalonePort`). Every
 * other component rides a generic content node, and the code says so out
 * loud rather than inventing a node type that does not exist.
 */
function reactFlowCode(entries: ComponentEntry[], shown: Instance[], positions: Record<string, CanvasPosition>, byId: Map<string, Instance>): string {
  const hasPort = shown.some((i) => i.type === "Port");
  const others = Array.from(new Set(shown.filter((i) => i.type !== "Port").map((i) => i.type))).sort();
  const nodes = shown.map((inst) => {
    const entry = entries.find((e) => e.name === inst.type)!;
    const pos = positions[inst.id] ?? { x: 0, y: 0 };
    const props = ownProps(entry, inst);
    if (inst.type === "Port") {
      const data = {
        state: (props.state as string) ?? "empty",
        size: (props.diameter as string) ?? "md",
        label: String(props.children ?? ""),
        textLayout: (props.textLayout as string) ?? "right",
      };
      return `  { id: ${JSON.stringify(inst.id)}, type: "bboxStandalonePort", position: { x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)} }, data: ${literal(data, "  ")} },`;
    }
    return `  { id: ${JSON.stringify(inst.id)}, type: "bench", position: { x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)} }, data: { element: ${instanceToJsx(entry, inst, byId, entries).replace(/\n/g, "\n    ")} } },`;
  });
  const lines = [
    `import { ReactFlow, Background } from "@xyflow/react";`,
    hasPort ? `import { BBoxPortNode } from "@/components/bbox-ui/adapter-reactflow";` : null,
    others.length ? `import { ${others.join(", ")} } from "@/components/bbox-ui";` : null,
    ``,
    `const nodeTypes = {`,
    hasPort ? `  bboxStandalonePort: BBoxPortNode,` : null,
    others.length ? `  // ${others.join(", ")} ${others.length === 1 ? "has" : "have"} no React Flow adapter yet; a generic node renders the element.` : null,
    others.length ? `  bench: ({ data }) => data.element,` : null,
    `};`,
    ``,
    `const nodes = [`,
    ...nodes,
    `];`,
    ``,
    `<ReactFlow nodes={nodes} nodeTypes={nodeTypes} fitView>`,
    `  <Background />`,
    `</ReactFlow>`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/**
 * tldraw: the Port has a real shape util (`bbox-port`). Other components are
 * shown as the generic bench shape the canvas actually uses, with the
 * element they render, so the code matches the pixels.
 */
function tldrawCode(entries: ComponentEntry[], shown: Instance[], positions: Record<string, CanvasPosition>, byId: Map<string, Instance>): string {
  const hasPort = shown.some((i) => i.type === "Port");
  const shapes = shown.map((inst) => {
    const entry = entries.find((e) => e.name === inst.type)!;
    const pos = positions[inst.id] ?? { x: 0, y: 0 };
    const props = ownProps(entry, inst);
    if (inst.type === "Port") {
      const p = {
        state: (props.state as string) ?? "empty",
        size: (props.diameter as string) ?? "md",
        label: String(props.children ?? ""),
        textLayout: (props.textLayout as string) ?? "right",
      };
      return `  { id: createShapeId(${JSON.stringify(inst.id)}), type: "bbox-port", x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)}, props: ${literal(p, "  ")} },`;
    }
    return `  { id: createShapeId(${JSON.stringify(inst.id)}), type: "bbox-bench", x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)}, props: { instanceId: ${JSON.stringify(inst.id)} } }, // renders ${instanceToJsx(entry, inst, byId, entries).replace(/\n\s*/g, " ")}`;
  });
  const lines = [
    `import { Tldraw, createShapeId } from "tldraw";`,
    hasPort ? `import { BBoxPortShapeUtil } from "@/components/bbox-ui/adapter-tldraw";` : null,
    ``,
    `<Tldraw`,
    `  shapeUtils={[${hasPort ? "BBoxPortShapeUtil" : ""}${hasPort && shown.some((i) => i.type !== "Port") ? ", " : ""}${shown.some((i) => i.type !== "Port") ? "BenchShapeUtil" : ""}]}`,
    `  onMount={(editor) => {`,
    `    editor.createShapes([`,
    ...shapes.map((s) => "    " + s),
    `    ]);`,
    `  }}`,
    `/>`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

function domCode(entries: ComponentEntry[], shown: Instance[], byId: Map<string, Instance>, all: Instance[]): string {
  // Imports cover every type that will print, members included.
  const printed = new Set<string>();
  const walk = (i: Instance) => {
    printed.add(i.type);
    for (const id of i.members ?? []) {
      const c = byId.get(id);
      if (c) walk(c);
    }
  };
  shown.forEach(walk);
  void all;
  const imports = Array.from(printed).sort();
  const lines = shown.map((inst) => instanceToJsx(entries.find((e) => e.name === inst.type)!, inst, byId, entries));
  return [`import { ${imports.join(", ")} } from "@/components/bbox-ui";`, "", ...lines].join("\n");
}

export function CodeView({
  render,
  entries,
  instances,
  roots,
  selectedIds,
  positions,
}: {
  render: Render;
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
}) {
  const [copied, setCopied] = useState(false);
  const byId = new Map(instances.map((i) => [i.id, i]));
  // A selected MEMBER prints on its own, as the thing you are looking at;
  // otherwise the roots print with their members nested.
  const shown = selectedIds.length > 0 ? instances.filter((i) => selectedIds.includes(i.id)) : roots;
  const code =
    render === "dom" ? domCode(entries, shown, byId, instances) : render === "reactflow" ? reactFlowCode(entries, shown, positions, byId) : tldrawCode(entries, shown, positions, byId);

  return (
    <div data-slot="code-view" data-render={render} className="relative h-full min-h-0 overflow-auto">
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
        <code data-slot="code-text">{code}</code>
      </pre>
      {selectedIds.length > 0 && selectedIds.length < roots.length && (
        <div className="px-6 pb-4 text-[11px] text-muted-foreground">Showing the {selectedIds.length} selected of {roots.length}. Clear the selection to see all.</div>
      )}
    </div>
  );
}
