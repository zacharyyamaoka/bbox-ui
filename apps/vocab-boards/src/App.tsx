/**
 * Two entry points in one app:
 *  - `?board=<id>` draws that one board alone, and the capture hooks in
 *    main.tsx read it back.
 *  - no query draws all 705 in a scrolling list with their ids, so the whole
 *    corpus can be looked at in one pass.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Board, buildGraph, type BoardGraph } from "./Board";
import { BOARDS, BOARD_BY_ID } from "./boards";
import { layout } from "./layout";
import type { BoardEntry } from "./types";

/* ------------------------------------------------------------ single board */

export function SingleBoard({ id }: { id: string }): JSX.Element {
  const entry = BOARD_BY_ID.get(id);
  const graph = useMemo(() => (entry ? buildGraph(entry.spec, entry.id) : null), [entry]);

  useEffect(() => {
    if (!graph) {
      document.body.dataset.boardError = id;
      return;
    }
    // Two frames: one for React to commit, one for the browser to lay the
    // nodes out. Only then is the viewport markup safe to read back.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.body.dataset.boardReady = id;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      delete document.body.dataset.boardReady;
    };
  }, [graph, id]);

  if (!entry || !graph) {
    return <div className="vb-missing">no board with id {id}</div>;
  }
  return (
    <div className="vb-single">
      <Board spec={entry.spec} boardId={entry.id} graph={graph} />
    </div>
  );
}

/* ----------------------------------------------------------------- gallery */

/**
 * WHY the board mounts only when it is near the viewport: 705 React Flow
 * instances at once is tens of thousands of DOM nodes and the page stops
 * scrolling. The placeholder is the board's REAL size (layout is pure maths and
 * runs without React Flow), so the scrollbar never lies and nothing reflows
 * when a board swaps in.
 */
function LazyBoard({ entry }: { entry: BoardEntry }): JSX.Element {
  const size = useMemo(() => {
    const b = layout(entry.spec);
    return { w: b.W, h: b.H, errors: b.errors };
  }, [entry]);
  const ref = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState(false);
  const [graph, setGraph] = useState<BoardGraph | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setLive(e.isIntersecting);
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (live && !graph) setGraph(buildGraph(entry.spec, entry.id));
  }, [live, graph, entry]);

  return (
    <section className="vb-card" ref={ref}>
      <header className="vb-card-head">
        <code className="vb-id">{entry.id}</code>
        {entry.bucket ? <span className="vb-bucket">{entry.bucket}</span> : null}
        {size.errors.length ? (
          <span className="vb-err">{size.errors.length} unresolved</span>
        ) : null}
      </header>
      <div className="vb-slot" style={{ width: size.w, height: size.h }}>
        {live && graph ? <Board spec={entry.spec} boardId={entry.id} graph={graph} /> : null}
      </div>
      {entry.spec.cap ? <p className="vb-cap">{entry.spec.cap}</p> : null}
    </section>
  );
}

export function Gallery(): JSX.Element {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return BOARDS;
    return BOARDS.filter((b) =>
      `${b.id} ${b.scenario ?? ""} ${b.bucket ?? ""}`.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className="vb-gallery">
      <header className="vb-top">
        <h1>vocab-boards</h1>
        <input
          className="vb-filter"
          placeholder="filter by id, scenario or bucket…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="vb-count">
          {shown.length} / {BOARDS.length}
        </span>
      </header>
      {shown.map((b) => (
        <LazyBoard key={b.id} entry={b} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- app */

export function App(): JSX.Element {
  const id = new URLSearchParams(window.location.search).get("board");
  return id ? <SingleBoard id={id} /> : <Gallery />;
}
