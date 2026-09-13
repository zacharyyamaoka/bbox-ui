import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";

import { AlignmentControl } from "./AlignmentControl";
import { offsetPaddingFor } from "./layout";
import { PortEdge } from "./PortEdge";
import { SizeControl } from "./SizeControl";
import { DEFAULT_ALIGN_GAP, type Distribution, type Size } from "./types";

type Side = "left" | "right";
const SIDES: Side[] = ["left", "right"];

const INITIAL_ITEMS: Record<Side, string[]> = {
  left: ["P1", "P2", "P3", "P4"],
  right: ["P5", "P6"],
};

const DEFAULT_DISTRIBUTION: Distribution = {
  mode: "aligned",
  anchor: "start",
  gap: DEFAULT_ALIGN_GAP,
  edgePadding: 0,
};

function findSide(items: Record<Side, string[]>, id: string): Side | undefined {
  if (id === "left" || id === "right") return id;
  return SIDES.find((side) => items[side].includes(id));
}

export function PortEdgeStage() {
  const [items, setItems] = useState<Record<Side, string[]>>(INITIAL_ITEMS);
  const [distribution, setDistribution] = useState<Record<Side, Distribution>>({
    left: DEFAULT_DISTRIBUTION,
    right: DEFAULT_DISTRIBUTION,
  });
  const [size, setSize] = useState<Size>({ width: 200, height: 420 });
  const [showPorts, setShowPorts] = useState(false);
  const [showContainer, setShowContainer] = useState(true);
  const [showCenterLine, setShowCenterLine] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function applyPreset(preset: "inline" | "offset") {
    const base: Distribution = {
      mode: "aligned",
      anchor: "start",
      gap: DEFAULT_ALIGN_GAP,
      edgePadding: 0,
    };
    if (preset === "inline") {
      setDistribution({ left: base, right: base });
      return;
    }
    const rightPadding = offsetPaddingFor(items.left.length, base.gap);
    setDistribution({ left: base, right: { ...base, edgePadding: rightPadding } });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCardId = active.id as string;
    const overId = over.id as string;
    const fromSide = findSide(items, activeCardId);
    const toSide = findSide(items, overId);
    if (!fromSide || !toSide) return;

    setItems((prev) => {
      if (fromSide === toSide) {
        const list = prev[fromSide];
        const oldIndex = list.indexOf(activeCardId);
        const newIndex = list.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
        return { ...prev, [fromSide]: arrayMove(list, oldIndex, newIndex) };
      }
      const fromList = prev[fromSide].filter((cardId) => cardId !== activeCardId);
      const overIndex = prev[toSide].indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex : prev[toSide].length;
      const toList = [
        ...prev[toSide].slice(0, insertAt),
        activeCardId,
        ...prev[toSide].slice(insertAt),
      ];
      return { ...prev, [fromSide]: fromList, [toSide]: toList };
    });
  }

  return (
    <section className="stage">
      <header className="stage__header">
        <h2>5 · Port edge</h2>
        <p>
          One edge, standalone — the container a Block's left/right side hosts its ports in.
          "Distribute" is the space-between/evenly/around from stage 3; "Aligned to edge" packs
          cards from one end with an explicit Gap, plus an Edge padding push-in that offsets the
          whole pack further in — the mechanism behind the Inline/Offset layouts in{" "}
          <code>PROJECT - Black Box UI.md</code>. Toggle Show ports to swap the placeholder card
          for the real <code>@bbox-ui/core</code> Port. Show container / Show center line are
          dev-time-only guides — once this integrates into a real Block, the Block draws its own
          outline and the edge IS the line, so both default on here and off there.
        </p>
        <div className="controls-row">
          <div className="segmented">
            <button type="button" className="segmented__option" onClick={() => applyPreset("inline")}>
              Preset: Inline
            </button>
            <button type="button" className="segmented__option" onClick={() => applyPreset("offset")}>
              Preset: Offset
            </button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showPorts} onChange={(e) => setShowPorts(e.target.checked)} />
            Show ports
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showContainer}
              onChange={(e) => setShowContainer(e.target.checked)}
            />
            Show container
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showCenterLine}
              onChange={(e) => setShowCenterLine(e.target.checked)}
            />
            Show center line
          </label>
          <SizeControl label="Edge size" value={size} onChange={setSize} />
        </div>
        <div className="controls-row">
          <AlignmentControl
            label="Left edge"
            value={distribution.left}
            onChange={(next) => setDistribution((prev) => ({ ...prev, left: next }))}
          />
        </div>
        <div className="controls-row">
          <AlignmentControl
            label="Right edge"
            value={distribution.right}
            onChange={(next) => setDistribution((prev) => ({ ...prev, right: next }))}
          />
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="port-edge-board">
          <PortEdge
            id="left"
            edge="left"
            items={items.left}
            distribution={distribution.left}
            size={size}
            showPorts={showPorts}
            showContainer={showContainer}
            showCenterLine={showCenterLine}
          />
          <div className="block">Block</div>
          <PortEdge
            id="right"
            edge="right"
            items={items.right}
            distribution={distribution.right}
            size={size}
            showPorts={showPorts}
            showContainer={showContainer}
            showCenterLine={showCenterLine}
          />
        </div>
      </DndContext>
    </section>
  );
}
