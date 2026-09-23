/**
 * The app has TWO entry points, and the split is load-bearing.
 *
 *  - `?board=<id>` in the SEARCH query draws that one board alone with every
 *    interaction off, and sets `document.body.dataset.boardReady` when the
 *    layout has settled. This is the capture surface: `scripts/verify.mjs`
 *    drives it for all 705 boards (geometry, the Python oracle, the standalone
 *    pixel diff and the bleed check) and `main.tsx`'s `__BOARD_*` hooks read it
 *    back. It is checked FIRST, before the hash is even looked at, so no
 *    routing change can move it.
 *  - anything else is the browser: a hash route over the same 705 boards.
 *
 * WHY the browser lives in the HASH and the capture in the SEARCH: they are
 * different kinds of address. `?board=` is a fixed, machine-driven contract
 * that predates this UI and is quoted in README.md; the hash is the part a
 * human navigates, so Back, a bookmark and a shared filtered link all work
 * without a router or a server rewrite.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Board, buildGraph } from "./Board";
import { BOARD_BY_ID } from "./boards";
import { BoardPage } from "./BoardPage";
import { Home } from "./Home";
import { ScenarioPage } from "./ScenarioPage";
import { VocabPage } from "./VocabPage";
import { useHashRoute } from "./useHashRoute";

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

/* -------------------------------------------------------------- the router */

/**
 * WHY scroll position is reset on a route change rather than left alone: the
 * document scrolls (there is no inner scrollport — see Home.tsx), so arriving
 * at a scenario from card 600 would otherwise land 9,000 px down a page that is
 * only four screens tall, i.e. at the very bottom, with the header off-screen.
 * The one exception is a scenario opened at a bucket anchor, which does its own
 * `scrollIntoView` — resetting there would fight it.
 */
function useScrollReset(key: string, skip: boolean) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current !== null && previous.current !== key && !skip) window.scrollTo(0, 0);
    previous.current = key;
  }, [key, skip]);
}

function Browser(): JSX.Element {
  const route = useHashRoute();
  const anchored = route.kind === "scenario" && /(?:^|&)b=/.test(route.query);
  useScrollReset(`${route.kind}:${"id" in route ? route.id : "key" in route ? route.key : ""}`, anchored);

  if (route.kind === "scenario") return <ScenarioPage id={route.id} query={route.query} />;
  if (route.kind === "board") return <BoardPage id={route.id} query={route.query} />;
  if (route.kind === "vocab") return <VocabPage vocabKey={route.key} query={route.query} />;
  return <Home query={route.query} />;
}

/* --------------------------------------------------------------------- app */

export function App(): JSX.Element {
  const [captureId] = useState(() => new URLSearchParams(window.location.search).get("board"));
  return captureId ? <SingleBoard id={captureId} /> : <Browser />;
}
