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

export function instanceToJsx(entry: ComponentEntry, inst: Instance): string {
  const props = ownProps(entry, inst);
  const children = "children" in props ? String(props.children) : null;
  delete props.children;
  const head = [entry.name, ...Object.entries(props).map(([k, v]) => jsxAttr(k, v))].join(" ");
  return children === null ? `<${head} />` : `<${head}>${children}</${entry.name}>`;
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
function reactFlowCode(entries: ComponentEntry[], shown: Instance[], positions: Record<string, CanvasPosition>): string {
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
    return `  { id: ${JSON.stringify(inst.id)}, type: "bench", position: { x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)} }, data: { element: ${instanceToJsx(entry, inst)} } },`;
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
function tldrawCode(entries: ComponentEntry[], shown: Instance[], positions: Record<string, CanvasPosition>): string {
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
    return `  { id: createShapeId(${JSON.stringify(inst.id)}), type: "bbox-bench", x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)}, props: { instanceId: ${JSON.stringify(inst.id)} } }, // renders ${instanceToJsx(entry, inst)}`;
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

function domCode(entries: ComponentEntry[], shown: Instance[]): string {
  const imports = Array.from(new Set(shown.map((i) => i.type))).sort();
  const lines = shown.map((inst) => instanceToJsx(entries.find((e) => e.name === inst.type)!, inst));
  return [`import { ${imports.join(", ")} } from "@/components/bbox-ui";`, "", ...lines].join("\n");
}

export function CodeView({
  render,
  entries,
  instances,
  selectedIds,
  positions,
}: {
  render: Render;
  entries: ComponentEntry[];
  instances: Instance[];
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
}) {
  const [copied, setCopied] = useState(false);
  const shown = selectedIds.length > 0 ? instances.filter((i) => selectedIds.includes(i.id)) : instances;
  const code =
    render === "dom" ? domCode(entries, shown) : render === "reactflow" ? reactFlowCode(entries, shown, positions) : tldrawCode(entries, shown, positions);

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
      {selectedIds.length > 0 && selectedIds.length < instances.length && (
        <div className="px-6 pb-4 text-[11px] text-muted-foreground">Showing the {selectedIds.length} selected of {instances.length}. Clear the selection to see all.</div>
      )}
    </div>
  );
}
