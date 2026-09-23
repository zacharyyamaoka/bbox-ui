/**
 * One edge type for every wire. The kind picks the colour, the width, the dash
 * and the arrowhead; the geometry picks the SHAPE.
 */
import { getBezierPath, Position, type EdgeProps } from "@xyflow/react";
import type { JSX } from "react";
import { BG, DIM, KIND, MARKER, textW } from "./layout";
import type { WireKind } from "./types";

export interface VEdgeData extends Record<string, unknown> {
  kind: WireKind;
  label?: string;
  dash?: boolean;
  /** "tb" boards curve vertically; "lr" boards curve horizontally. */
  tb: boolean;
  /** Board-unique prefix, so 705 inlined boards never share a marker id. */
  defs: string;
}

/**
 * The path.
 *
 * WHY a lifted arc rather than a bezier for a backwards wire: a cable that ends
 * to the LEFT of where it started is feedback, and a plain bezier draws it as a
 * flat S that reads like an ordinary forward wire crossing the board. Lifting
 * it over the top is how LabVIEW, Grasshopper and Simulink all draw a loop
 * carry, and it is the only cue that the value is going back.
 */
export function wirePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  kind: WireKind,
  tb: boolean,
): string {
  if (tb) {
    const my = (sy + ty) / 2;
    return `M ${sx} ${sy} C ${sx} ${my} ${tx} ${my} ${tx} ${ty}`;
  }
  if (kind === "fb" || tx < sx - 4) {
    const lift = Math.max(Math.abs(ty - sy) * 0.5, 34);
    return `M ${sx} ${sy} C ${sx + 30} ${sy - lift} ${tx - 30} ${ty - lift} ${tx} ${ty}`;
  }
  const [d] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });
  return d;
}

export function VEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps & { data?: VEdgeData }): JSX.Element {
  const kind = data?.kind ?? "data";
  const k = KIND[kind];
  const tb = data?.tb ?? false;
  const d = wirePath(sourceX, sourceY, targetX, targetY, kind, tb);
  // The `dash` flag means "dash this one whatever its kind does" — see the
  // README note: docs/vocab_board.py emitted the literal string "None" for it
  // and browsers dropped the attribute, so 17 wires authored dashed drew solid.
  const dash = k.dash ?? (data?.dash ? "5 3" : undefined);

  const label = data?.label;
  // 0.42 along, not the midpoint: a midpoint label lands on top of a frame's
  // tunnel label when the wire terminates on a wall.
  const lx = sourceX + (targetX - sourceX) * 0.42;
  const ly = (sourceY + targetY) / 2 - 8;
  const hw = label ? textW(label, 9) + 8 : 0;

  return (
    <>
      {/* WHY the stroke is an inline style and not an attribute: xyflow's own
          `.react-flow__edge-path { stroke: var(--xy-edge-stroke, ...) }` is a
          class rule, and a class rule outranks a presentation attribute — the
          wire would paint xyflow's default grey in the app and black in the
          report's static markup. An inline style outranks both. */}
      <path
        className="react-flow__edge-path vb-wire"
        d={d}
        markerEnd={`url(#${data?.defs ?? "vb"}-${MARKER[kind]})`}
        style={{
          fill: "none",
          stroke: k.c,
          strokeWidth: k.w,
          strokeDasharray: dash,
          opacity: 0.95,
        }}
      />
      {label ? (
        <>
          {/* A short wire puts its label on top of a node. A halo keeps it
              readable over whatever it lands on, which beats moving it around. */}
          <rect x={lx - hw / 2} y={ly - 8.5} width={hw} height={11.5} rx={3} fill={BG} opacity={0.82} />
          <text x={lx} y={ly} fill={DIM} fontSize={9} textAnchor="middle" className="vb-m">
            {label}
          </text>
        </>
      ) : null}
    </>
  );
}

export const edgeTypes = { vedge: VEdge } as const;

/** Emitted once per board, inside the viewport so the captured markup carries it. */
export function EdgeDefs({ prefix }: { prefix: string }): JSX.Element {
  return (
    <svg className="vb-defs" width={0} height={0} aria-hidden="true">
      <defs>
        {(Object.keys(KIND) as WireKind[]).map((kind) => (
          <marker
            key={kind}
            id={`${prefix}-${MARKER[kind]}`}
            viewBox="0 0 10 10"
            refX={7.4}
            refY={5}
            markerWidth={5.4}
            markerHeight={5.4}
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={KIND[kind].c} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
