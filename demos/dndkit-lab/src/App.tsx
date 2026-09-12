import { useState } from "react";

import { GroupingBoard } from "./GroupingBoard";
import { PortBoard } from "./PortBoard";
import { SortableColumn } from "./SortableColumn";
import { SortableRow } from "./SortableRow";

const STAGES = [
  { id: 1, label: "1 · Row" },
  { id: 2, label: "2 · Column" },
  { id: 3, label: "3 · Combined" },
  { id: 4, label: "4 · Grouping" },
] as const;

export function App() {
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);

  return (
    <div className="app">
      <header className="app__header">
        <h1>dnd-kit lab</h1>
        <p>
          Prototype for the port-dragging interaction — plain DOM, @dnd-kit/core +
          @dnd-kit/sortable, no React Flow or tldraw. See <code>PROJECT - Black Box UI.md</code>{" "}
          → "Prototype of dnd kit".
        </p>
      </header>

      <nav className="tabs">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tabs__tab${stage === s.id ? " is-active" : ""}`}
            onClick={() => setStage(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {stage === 1 ? <SortableRow /> : null}
      {stage === 2 ? <SortableColumn /> : null}
      {stage === 3 ? <PortBoard /> : null}
      {stage === 4 ? <GroupingBoard /> : null}
    </div>
  );
}
