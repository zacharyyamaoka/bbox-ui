import { useState } from "react";
import { Port, type PortProps } from "@bbox-ui/core";
import { PortInspectorPanel, type PortSubject } from "./PortInspectorPanel";

interface PortInstance {
  id: string;
  selected: boolean;
  props: Record<string, unknown>;
}

const INITIAL: PortInstance[] = [
  {
    id: "a",
    selected: true,
    props: { state: "empty", size: "md", textLayout: "right", textSize: "md", children: "Port A" },
  },
  {
    id: "b",
    selected: true,
    props: { state: "wired", size: "md", textLayout: "right", textSize: "md", children: "Port B" },
  },
];

export default function App() {
  const [ports, setPorts] = useState<PortInstance[]>(INITIAL);
  const selected: PortSubject[] = ports
    .filter((port) => port.selected)
    .map((port) => ({ id: port.id, props: port.props }));

  function toggleSelected(id: string) {
    setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  }

  function applyToSelected(fieldId: string, value: string) {
    setPorts((prev) =>
      prev.map((p) => (p.selected ? { ...p, props: { ...p.props, [fieldId]: value } } : p)),
    );
  }

  return (
    <div data-slot="port-inspector-demo" style={{ display: "flex", gap: 32, padding: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {ports.map((port) => (
          <label
            key={port.id}
            data-slot="port-instance"
            data-port-id={port.id}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <input type="checkbox" checked={port.selected} onChange={() => toggleSelected(port.id)} />
            <Port {...(port.props as PortProps)}>{String(port.props.children)}</Port>
          </label>
        ))}
      </div>
      <PortInspectorPanel subjects={selected} onChange={applyToSelected} />
    </div>
  );
}
