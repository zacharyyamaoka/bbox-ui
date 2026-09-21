/**
 * src/magnet/magnetProposalLayer.tsx — the paint: a magnet proposal drawn as
 * a dotted `Trace`, plus every fact a play function needs stamped onto
 * `data-magnet-*` attributes.
 *
 * OURS, ad hoc (class (c)) — but it invents no renderer. The dotted line is
 * `components/trace.tsx`'s existing `variant="delayed"`, and the dev overlay
 * reuses `components/hitRegion.ts`'s tokens, so a magnet radius reads as the
 * same class of dev chrome as a hit region rather than introducing a second
 * visual language.
 *
 * WHY `variant="delayed"` and not a new `"proposed"` variant: `TRACE_VARIANTS`
 * has exactly three members (`trace.layout.ts:72`), `TraceProps` exposes no
 * `strokeDasharray` escape hatch (`trace.tsx:162-215`), and
 * `src/components/**` is another lane's write set right now. `delayed`'s
 * stroke IS the dotted form — `traceStrokeStyle` returns
 * `{strokeDasharray: "0.1 6", strokeLinecap: "round"}` for it
 * (`trace.tsx:322-326`, from `DELAY_DOT_PX`/`DELAY_DOT_GAP_PX` at
 * `trace.layout.ts:307-308`) and `TRACE_VARIANT_LABELS.delayed` is literally
 * `"Dotted"`, which is Zach's own word for what he asked for. This is honest
 * BORROWING of a semantically wrong name: a future reader will reasonably
 * assume a magnet proposal *is* a delayed connection, so it is owed upstream
 * (docs/MAGNET-WIRES-SPEC.md §8.4). `splitAtLabel` is left OFF so the
 * single-path branch is taken (`trace.tsx:552`) and the WHOLE line is dotted
 * rather than solid-then-dotted — and the story's A9 reads the real computed
 * `strokeDasharray` off the DOM rather than trusting the prop name.
 *
 * WHY the layer stamps resolved ENDPOINTS: a `Trace`'s bounding rect spans
 * both ends and only one end moves, so its rect delta is about half the
 * dragged node's. `data-magnet-from-at` / `data-magnet-to-at` make "the
 * proposal tracks the drag" measurable at the granularity the claim is
 * actually about. Mirrors `wireLayer.tsx:189`'s own
 * `data-unresolved-wires` idiom: the layer publishes what it resolved.
 */

import { HIT_REGION_FILL, HIT_REGION_LINE } from "../components/hitRegion";
import { Trace } from "../components/trace";
import { portKey } from "../scene/scene";
import { effectiveMagnetRadius, MAGNET_DEFAULT_RADIUS, type MagnetPort, type MagnetProposal, type MagnetScan } from "./magnetProposals";

export interface MagnetProposalLayerProps {
  enabled: boolean;
  scan: MagnetScan;
  /** `"top"` paints the winner alone (the default — one proposal is what
   *  Zach described); `"all"` paints every legal one, for the dev overlay. */
  show?: "top" | "all";
  /** Dev chrome: draw each candidate's magnet circle. Off by default. */
  showRadius?: boolean;
  /** Candidate ports for the radius overlay. Ignored unless `showRadius`. */
  ports?: readonly MagnetPort[];
  zoom?: number;
  width: number;
  height: number;
}

const point = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;

export function MagnetProposalLayer({ enabled, scan, show = "top", showRadius = false, ports, zoom = 1, width, height }: MagnetProposalLayerProps) {
  const shown: MagnetProposal[] = !enabled ? [] : show === "all" ? scan.proposals : scan.proposals.slice(0, 1);
  // `toKey:code` pairs — a refusal with no message is maxGraph's silent
  // case, and `silent` is the honest spelling of that rather than an empty
  // slot a test could read as "absent".
  const refusals = enabled ? scan.refused.map((r) => `${portKey(r.to.nodeId, r.to.portId)}:${r.refusal?.code ?? "silent"}`).join(",") : "";

  return (
    <svg
      data-slot="magnet-layer"
      data-magnet-enabled={String(enabled)}
      data-magnet-proposals={String(shown.length)}
      data-magnet-refusals={refusals}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {showRadius &&
        ports?.map((p) => (
          <circle
            key={`radius:${portKey(p.ref.nodeId, p.ref.portId)}`}
            data-slot="magnet-radius"
            data-magnet-port={portKey(p.ref.nodeId, p.ref.portId)}
            cx={p.at.x}
            cy={p.at.y}
            r={effectiveMagnetRadius(p.radius ?? MAGNET_DEFAULT_RADIUS, zoom)}
            fill={HIT_REGION_FILL}
            stroke={HIT_REGION_LINE}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}
      {shown.map((proposal) => (
        <g
          key={proposal.id}
          data-magnet-proposal=""
          data-magnet-id={proposal.id}
          data-magnet-from={portKey(proposal.from.nodeId, proposal.from.portId)}
          data-magnet-to={portKey(proposal.to.nodeId, proposal.to.portId)}
          data-magnet-distance={proposal.distance.toFixed(2)}
          data-magnet-from-at={point(proposal.fromAt)}
          data-magnet-to-at={point(proposal.toAt)}
        >
          <Trace
            id={proposal.id}
            from={{ x: proposal.fromAt.x, y: proposal.fromAt.y, dir: proposal.fromDir }}
            to={{ x: proposal.toAt.x, y: proposal.toAt.y, dir: proposal.toDir }}
            routing="curved"
            variant="delayed"
            terminals={false}
            markerEnd="none"
          />
        </g>
      ))}
    </svg>
  );
}
