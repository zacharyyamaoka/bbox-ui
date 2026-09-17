import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

import { TraceBody } from "@bbox-ui/core";

/**
 * A React Flow edge that paints through the core `TraceBody`.
 *
 * WHY it lives in the demo scene rather than in
 * `@bbox-ui/adapter-reactflow`: there is no Trace adapter yet, and the
 * point of this file is to put the core's own edge paint on a REAL canvas
 * so the sketch skin can be seen reaching it. Promoting it to the adapter
 * package is a separate decision about the product's surface, not about
 * whether the skin works.
 *
 * The split is the same one every bbox-ui adapter makes: the HOST owns the
 * geometry (`getBezierPath` here, tldraw's arrow info there) and the core
 * owns the paint. `TraceBody` is handed a finished `d` and never computes
 * a point.
 */
export function TraceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  void labelX;
  void labelY;
  void BaseEdge;
  return (
    <TraceBody
      id={id}
      path={path}
      // React Flow gives no path length; the core only needs one for the
      // dash cadences (`async`/`delayed`), and this demo draws the plain
      // `data` variant.
      length={0}
      variant="data"
      strokeColor="muted-foreground"
    />
  );
}
