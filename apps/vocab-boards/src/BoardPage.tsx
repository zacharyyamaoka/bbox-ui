import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import { ReactFlow, Background, Controls, ViewportPortal, type ReactFlowInstance } from "@xyflow/react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { buildGraph } from "./Board";
import { BOARD_BY_ID } from "./boards";
import { EdgeDefs, edgeTypes } from "./edge";
import { nodeTypes } from "./nodes";
import { CARD_BY_BOARD_ID, boardSize } from "./site";
import { buildHomeHash, buildScenarioHash, filterQueryOf } from "./state";

/**
 * One board alone, full viewport, pan and zoom ON.
 *
 * WHY this mounts its own `<ReactFlow>` rather than reusing `<Board>`: `Board`
 * is the FIGURE renderer — it pins the viewport at {0,0,1} and turns off every
 * interaction on purpose, because a figure in a report that pans is a figure
 * that ends up screenshotted half-scrolled. This route is the opposite: the
 * whole point is getting into a 3,900-px-wide board and reading a wire label.
 * Everything else is shared — the same `buildGraph`, the same node and edge
 * types, the same per-board `EdgeDefs` prefix — so what is drawn here is drawn
 * by the code `scripts/verify.mjs` gates. Only the camera differs, and `Board`
 * itself is untouched.
 */
export function BoardPage({ id, query }: { id: string; query: string }): JSX.Element {
  const entry = BOARD_BY_ID.get(id);
  const card = CARD_BY_BOARD_ID.get(id);
  const listQuery = filterQueryOf(query);
  const graph = useMemo(() => (entry ? buildGraph(entry.spec, entry.id) : null), [entry]);
  const { w, h } = boardSize(id);
  const defs = `vb-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  /*
   * WHY the opening camera is placed by hand instead of `fitView`:
   *
   * These boards are extremely wide and short — the widest is 3,927 x 120,
   * an aspect ratio of 33:1 against a viewport's 2:1. `fitView` on that solves
   * for WIDTH, lands on zoom 0.4, and paints a 48px-tall thread of unreadable
   * text across the middle of an otherwise empty screen. Measured on
   * P3__b3__ex2 before this: the board was on screen and nothing on it could
   * be read, which is the opposite of what this route is for.
   *
   * So: never below 1:1 (a wire label is the reason to open a board alone),
   * up to 2x for a small board so it is not a stamp in the corner, and a board
   * too wide for the pane starts at its LEFT edge rather than centred —
   * every one of these reads left to right, so the middle is not the start.
   * Zooming out for the overview is one click on the Controls cluster.
   */
  const pane = useRef<HTMLDivElement | null>(null);
  const flow = useRef<ReactFlowInstance | null>(null);
  const placeCamera = useCallback(() => {
    const el = pane.current;
    const instance = flow.current;
    if (!el || !instance || !w || !h) return;
    const PAD = 24;
    const paneW = el.clientWidth;
    const paneH = el.clientHeight;
    const fit = Math.min((paneW - 2 * PAD) / w, (paneH - 2 * PAD) / h);
    const zoom = Math.min(2, Math.max(1, fit));
    const fitsX = w * zoom <= paneW - 2 * PAD;
    const fitsY = h * zoom <= paneH - 2 * PAD;
    instance.setViewport({
      x: fitsX ? (paneW - w * zoom) / 2 : PAD,
      y: fitsY ? (paneH - h * zoom) / 2 : PAD,
      zoom,
    });
  }, [w, h]);

  // WHY the camera is also placed from an effect keyed on the board, not from
  // `onInit` alone: `#/board/A` -> `#/board/B` is a hash change, and the app
  // re-renders rather than remounting — `<ReactFlow>` stays the same instance
  // and `onInit` never fires again. Measured before this line: opening the
  // widest board and then a small one left the small one at the wide one's
  // camera (`translate(24px, 401px) scale(1)` for a board that wanted
  // `translate(413px, 301px) scale(2)`), i.e. the second board opened in the
  // wrong place with no way to tell.
  useEffect(placeCamera, [placeCamera, id]);

  if (!entry || !graph) {
    return (
      <div className="p-8 text-sm text-destructive">
        no board with id {id} —{" "}
        <a className="underline" href={buildHomeHash(listQuery)}>
          back to the gallery
        </a>
      </div>
    );
  }

  return (
    <div data-testid="board-page" data-board={id} className="flex h-screen flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <Button variant="ghost" size="sm" className="text-xs" nativeButton={false} render={<a href={buildHomeHash(listQuery)} />}>
          <ArrowLeft />
          gallery
        </Button>
        {card ? (
          <a href={buildScenarioHash(card.scenario.id, listQuery, card.bucketIndex)} className="inline-flex items-center gap-2">
            <Badge className="font-mono">{card.scenario.id}</Badge>
            <span className="text-xs font-semibold hover:underline">{card.scenario.title}</span>
          </a>
        ) : null}
        {card ? <span className="text-xs text-primary">{card.bucket.name}</span> : null}
        <code className="ml-auto font-mono text-[10px] text-muted-foreground">{id}</code>
        <span className="font-mono text-[10px] text-muted-foreground">
          {Math.round(w)} × {Math.round(h)} px
        </span>
      </header>

      <div className="min-h-0 flex-1 bg-[#0e0f12]">
        <div ref={pane} className="vb-board size-full" data-board-id={id}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flow.current = instance;
              placeCamera();
            }}
            minZoom={0.1}
            maxZoom={4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#1b1e25" />
            <Controls showInteractive={false} />
            <ViewportPortal>
              <EdgeDefs prefix={defs} />
            </ViewportPortal>
          </ReactFlow>
        </div>
      </div>

      {card?.cap ? (
        <footer className="shrink-0 border-t bg-card px-3 py-2">
          <p className="text-[11.5px] leading-snug text-muted-foreground">{card.cap}</p>
          {card.dropped.length ? (
            <ul data-testid="dropped-tags" className="mt-1 grid gap-0.5 text-[10px] text-ink-gold/90">
              {card.dropped.map((d, i) => (
                <li key={`${d.node}:${i}`}>
                  the <span className="font-mono">{d.node}</span> node: {d.tag}
                </li>
              ))}
            </ul>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
