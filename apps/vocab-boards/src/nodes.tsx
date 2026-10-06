/**
 * The node types. Each one paints its own box as an inline <svg> in node-local
 * coordinates — the same coordinates docs/vocab_board.py's draw_node uses, so
 * every baseline, tint and radius here is that file's number — and mounts a
 * real React Flow <Handle> for every port.
 *
 * WHY the handle element is zero-size with the mark as its child: React Flow
 * resolves a Left handle to its box's LEFT edge and a Right handle to its RIGHT
 * edge, so a handle sized like the port dot would attach the wire to the dot's
 * rim, not its centre. At width/height 0 every position resolves to the
 * element's own point, which is exactly the anchor layout.ts computed — the DOM
 * and the declared `handles` array then agree by construction instead of by
 * luck, and no re-measure can move a cable.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { JSX } from "react";
import {
  ACCENT2,
  AMBER,
  BG,
  DIM,
  DIM2,
  FG,
  LINE2,
  OK,
  PANEL,
  PANEL2,
  PORT_H,
  PURPLE,
  TITLE_H,
  WARN,
  accentOf,
  textW,
  type HandleSpec,
  type PlacedFrame,
  type PlacedNode,
} from "./layout";

/** How far a node's ink may reach outside its own box: tags, titles, labels. */
const OVER = { l: 36, t: 32, r: 36, b: 36 };

export interface VNodeData extends Record<string, unknown> {
  n: PlacedNode;
  handles: HandleSpec[];
}
export interface VFrameData extends Record<string, unknown> {
  f: PlacedFrame;
  handles: HandleSpec[];
}

const POS: Record<HandleSpec["position"], Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

/** The mark a port wears, drawn by the handle element itself. */
function Mark({ h }: { h: HandleSpec }): JSX.Element | null {
  switch (h.mark) {
    case "dot-in":
    case "dot-out":
      // r 3.4 stroked 1.6 == an 8.4px box with a 1.6px border, centred on the wall.
      return <span className="vb-dot" style={{ borderColor: h.colour }} />;
    case "tri-in":
      return <span className="vb-tri vb-tri-in" />;
    case "tri-out":
      return <span className="vb-tri vb-tri-out" />;
    case "tab-in":
      return <span className="vb-tab vb-tab-in" style={{ background: h.colour }} />;
    case "tab-out":
      return <span className="vb-tab vb-tab-out" style={{ background: h.colour }} />;
    case "tunnel":
      return <span className="vb-tunnel" />;
    default:
      return null;
  }
}

function Ports({ handles }: { handles: HandleSpec[] }): JSX.Element {
  return (
    <>
      {handles.map((h, i) => (
        <Handle
          key={`${h.type}:${h.id}:${i}`}
          id={h.id}
          type={h.type}
          position={POS[h.position]}
          isConnectable={false}
          className="vb-h"
          style={{ left: h.x, top: h.y }}
        >
          <Mark h={h} />
        </Handle>
      ))}
    </>
  );
}

function Ink({ w, h, children }: { w: number; h: number; children: React.ReactNode }): JSX.Element {
  const vw = w + OVER.l + OVER.r;
  const vh = h + OVER.t + OVER.b;
  return (
    <svg
      className="vb-ink"
      width={vw}
      height={vh}
      viewBox={`${-OVER.l} ${-OVER.t} ${vw} ${vh}`}
      style={{ left: -OVER.l, top: -OVER.t }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * WHY only box/round/tb draw a tag: `_size` reserves no vertical room for one,
 * so on a pill, badge, terminal, note or diamond the caption is drawn into
 * whatever happens to be below it — measured running over a neighbour node and
 * off the right edge of the board on 62 of the 705 boards. The Python renderer
 * these specs were hand-checked against returned before its tag branch for
 * exactly those five shapes, which is why nobody ever reviewed them.
 *
 * The text is NOT discarded: `droppedTags(spec)` collects it and the page prints
 * it under the board's caption, so every authored character stays visible and
 * complete rather than being silently clipped.
 */
const NodeTag = ({ n }: { n: PlacedNode }) =>
  n.tag ? (
    <text x={n.w / 2} y={n.h + 10} fill={DIM2} fontSize={8.8} textAnchor="middle" className="vb-s">
      {n.tag}
    </text>
  ) : null;

/* --------------------------------------------------------------- vnode/vround */

function BoxNode({ data, round }: { data: VNodeData; round: boolean }): JSX.Element {
  const n = data.n;
  const { w, h } = n;
  const acc = accentOf(n.accent);
  const rx = round ? Math.min(h / 2, 14) : 5;
  const base = TITLE_H + (n.sub ? 11 : 0);
  const outs = n.out ?? [];
  return (
    <>
      <Ink w={w} h={h}>
        <rect x={0} y={0} width={w} height={h} rx={rx} fill={PANEL2} stroke={LINE2} strokeWidth={1.2} />
        {/* title band, tinted by the node's accent */}
        <path
          d={`M 0 ${rx} a ${rx} ${rx} 0 0 1 ${rx} ${-rx} h ${w - 2 * rx} a ${rx} ${rx} 0 0 1 ${rx} ${rx} v ${TITLE_H - rx} h ${-w} Z`}
          fill={acc}
          opacity={0.16}
        />
        <line x1={0} y1={TITLE_H} x2={w} y2={TITLE_H} stroke={LINE2} strokeWidth={1} />
        <text x={w / 2} y={14.5} fill={FG} fontSize={10.8} textAnchor="middle" fontWeight={600} className="vb-m">
          {n.t}
        </text>
        {n.sub ? (
          <text x={w / 2} y={TITLE_H + 9} fill={DIM2} fontSize={8.6} textAnchor="middle" className="vb-s">
            {n.sub}
          </text>
        ) : null}
        {(n.in ?? []).map((p, i) => (
          <text key={`i${i}`} x={8} y={base + PORT_H * i + PORT_H / 2 + 3.2} fill={DIM} fontSize={9.4} className="vb-m">
            {p}
          </text>
        ))}
        {outs.map((p, i) => (
          <text
            key={`o${i}`}
            x={w - 8}
            y={base + PORT_H * i + PORT_H / 2 + 3.2}
            fill={DIM}
            fontSize={9.4}
            textAnchor="end"
            className="vb-m"
          >
            {p}
          </text>
        ))}
        {(n.xout ?? []).map((p, i) => (
          <text
            key={`x${i}`}
            x={w - 11}
            y={base + PORT_H * (outs.length + i) + PORT_H / 2 + 3.2}
            fill="#cfd4de"
            fontSize={9.4}
            textAnchor="end"
            className="vb-m"
          >
            {p}
          </text>
        ))}
        <NodeTag n={n} />
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

export const VNode = ({ data }: NodeProps & { data: VNodeData }) => <BoxNode data={data} round={false} />;
export const VRound = ({ data }: NodeProps & { data: VNodeData }) => <BoxNode data={data} round={true} />;

/* ------------------------------------------------------------------- vpill */

export function VPill({ data }: NodeProps & { data: VNodeData }): JSX.Element {
  const n = data.n;
  const acc = accentOf(n.accent);
  return (
    <>
      <Ink w={n.w} h={n.h}>
        <rect x={0} y={0} width={n.w} height={n.h} rx={n.h / 2} fill="#10233a" stroke={acc} strokeWidth={1.3} />
        <text x={n.w / 2} y={n.h / 2 + 3.6} fill={FG} fontSize={10.5} textAnchor="middle" className="vb-m">
          {n.t}
        </text>
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

/* --------------------------------------------------------- vbadge/vterminal */

function ChipNode({ data, terminal }: { data: VNodeData; terminal: boolean }): JSX.Element {
  const n = data.n;
  const fill = terminal ? "#2a1a16" : "#221d2f";
  const col = terminal ? WARN : PURPLE;
  return (
    <>
      <Ink w={n.w} h={n.h}>
        <rect x={0} y={0} width={n.w} height={n.h} rx={5} fill={fill} stroke={col} strokeWidth={1.2} />
        <text x={n.w / 2} y={n.h / 2 + 3.6} fill={col} fontSize={10} textAnchor="middle" className="vb-m">
          {n.t}
        </text>
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

export const VBadge = ({ data }: NodeProps & { data: VNodeData }) => <ChipNode data={data} terminal={false} />;
export const VTerminal = ({ data }: NodeProps & { data: VNodeData }) => <ChipNode data={data} terminal={true} />;

/* ------------------------------------------------------------------- vnote */

export function VNote({ data }: NodeProps & { data: VNodeData }): JSX.Element {
  const n = data.n;
  return (
    <>
      <Ink w={n.w} h={n.h}>
        <text x={0} y={n.h / 2 + 3.6} fill={DIM2} fontSize={10} className="vb-s vb-i">
          {n.t}
        </text>
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

/* ---------------------------------------------------------------- vdiamond */

export function VDiamond({ data }: NodeProps & { data: VNodeData }): JSX.Element {
  const n = data.n;
  const { w, h } = n;
  const acc = accentOf(n.accent);
  return (
    <>
      <Ink w={w} h={h}>
        <path
          d={`M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`}
          fill={PANEL2}
          stroke={acc}
          strokeWidth={1.3}
        />
        <text x={w / 2} y={h / 2 + 3.6} fill={FG} fontSize={10} textAnchor="middle" className="vb-m">
          {n.t}
        </text>
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

/* --------------------------------------------------------------------- vtb */

export function VTb({ data }: NodeProps & { data: VNodeData }): JSX.Element {
  const n = data.n;
  const { w, h } = n;
  const acc = accentOf(n.accent);
  // WHY the whole box is tinted and not just the nubs: a Max object often
  // declares no inlets or outlets at all, so an accent that lived only on the
  // port marks would render an accent:"err" node identical to a grey one — and
  // a whole bucket of this report claims that failure IS a repaint.
  const hot = n.accent != null && n.accent !== ("" as unknown) && n.accent !== "dim";
  const ins = n.in ?? [];
  const outs = n.out ?? [];
  return (
    <>
      <Ink w={w} h={h}>
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={3}
          fill={PANEL2}
          stroke={hot ? acc : LINE2}
          strokeWidth={hot ? 1.7 : 1.2}
        />
        {hot ? <rect x={0} y={0} width={w} height={h} rx={3} fill={acc} opacity={0.13} /> : null}
        <text x={w / 2} y={h / 2 + 3.8} fill={FG} fontSize={10.8} textAnchor="middle" className="vb-m">
          {n.t}
        </text>
        {/* WHY unlabelled by default: a Max patch does not label its inlets or
            outlets — position IS the name. Opt in per node with plabels. */}
        {n.plabels
          ? ins.map((p, i) =>
              p ? (
                <text
                  key={`pi${i}`}
                  x={(w / (ins.length + 1)) * (i + 1)}
                  y={-7}
                  fill={DIM2}
                  fontSize={8.4}
                  textAnchor="middle"
                  className="vb-m"
                >
                  {p}
                </text>
              ) : null,
            )
          : null}
        {n.plabels
          ? outs.map((p, i) =>
              p ? (
                <text
                  key={`po${i}`}
                  x={(w / (outs.length + 1)) * (i + 1)}
                  y={h + 13}
                  fill={DIM2}
                  fontSize={8.4}
                  textAnchor="middle"
                  className="vb-m"
                >
                  {p}
                </text>
              ) : null,
            )
          : null}
        {n.tag ? (
          <text x={w / 2} y={h + 26} fill={DIM2} fontSize={8.8} textAnchor="middle" className="vb-s">
            {n.tag}
          </text>
        ) : null}
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

/* ------------------------------------------------------------------ vframe */

export function VFrame({ data }: NodeProps & { data: VFrameData }): JSX.Element | null {
  const f = data.f;
  if (!f.box) return null;
  const [, , w, h] = f.box;
  const st = f.style ?? "plain";
  const title = f.t ?? "";
  const tag = f.tag ?? "";
  // A narrow frame cannot carry its name AND its case label on the same line —
  // they overlap into unreadable mush. Drop the tag below the box rather than
  // truncating it: the case label is often the payload.
  const tagFits = textW(title, 10) + textW(tag, 9.2) + 26 <= w;
  return (
    <>
      <Ink w={w} h={h}>
        {st === "wall" ? (
          <>
            <rect x={0} y={0} width={w} height={h} rx={7} fill="none" stroke={AMBER} strokeWidth={4.5} opacity={0.85} />
            <rect x={3} y={3} width={w - 6} height={h - 6} rx={5} fill={AMBER} opacity={0.045} />
          </>
        ) : null}
        {st === "paired" ? (
          <>
            <rect x={0} y={0} width={w} height={h} rx={9} fill={OK} opacity={0.07} />
            <rect x={0} y={0} width={w} height={h} rx={9} fill="none" stroke={OK} strokeWidth={1.4} opacity={0.5} />
          </>
        ) : null}
        {st === "subsystem" ? (
          <rect x={0} y={0} width={w} height={h} rx={2} fill="#0c1520" stroke={ACCENT2} strokeWidth={1.6} />
        ) : null}
        {st === "dashed" ? (
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={8}
            fill="none"
            stroke={DIM2}
            strokeWidth={1.3}
            strokeDasharray="6 4"
          />
        ) : null}
        {st === "plain" ? (
          <rect x={0} y={0} width={w} height={h} rx={8} fill={PANEL} stroke={LINE2} strokeWidth={1.3} />
        ) : null}
        {title ? (
          <text x={9} y={-5} fill={DIM} fontSize={10} fontWeight={600} className="vb-m">
            {title}
          </text>
        ) : null}
        {tag ? (
          tagFits ? (
            <text x={w - 6} y={-5} fill={DIM2} fontSize={9.2} textAnchor="end" className="vb-s">
              {tag}
            </text>
          ) : (
            <text x={2} y={h + 13} fill={DIM2} fontSize={9.2} className="vb-s">
              {tag}
            </text>
          )
        ) : null}
        {(["lt", "rt"] as const).flatMap((side) => {
          const lst = (side === "lt" ? f.ltun : f.rtun) ?? [];
          const step = h / (lst.length + 1);
          return lst.map((p, i) =>
            p ? (
              <text
                key={`${side}${i}`}
                x={side === "lt" ? 0 : w}
                y={step * (i + 1) - 9}
                fill={DIM}
                fontSize={8.8}
                textAnchor="middle"
                className="vb-m"
              >
                {p}
              </text>
            ) : null,
          );
        })}
      </Ink>
      <Ports handles={data.handles} />
    </>
  );
}

export const nodeTypes = {
  vnode: VNode,
  vround: VRound,
  vpill: VPill,
  vbadge: VBadge,
  vterminal: VTerminal,
  vnote: VNote,
  vdiamond: VDiamond,
  vtb: VTb,
  vframe: VFrame,
} as const;

export { BG };
