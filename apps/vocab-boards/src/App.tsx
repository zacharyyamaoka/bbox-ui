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
 * WHY scroll position is reset when ENTERING a detail page but never when
 * returning to the gallery: the document scrolls (there is no inner scrollport
 * — see Home.tsx), so arriving at a scenario from card 600 would otherwise land
 * 9,000 px down a page only four screens tall. Going BACK is the opposite case
 * — the browser restores your place in the 50,000 px list, and resetting threw
 * that away, so Back from card 600 dumped you at the top. The reference app has
 * no scrollTo at all, and that is why Back keeps your place there.
 * The other exception is a scenario opened at a bucket anchor, which does its
 * own `scrollIntoView` — resetting there would fight it.
 */
const LIST_SCROLL_KEY = "vocab.listScroll";

/**
 * WHY manual scroll restoration: the browser restores a hash navigation's scroll
 * offset before the 705 lazy cards have laid out, so Back from a scenario landed
 * at 1,203px for a saved 18,000px — and then overwrote our own correct restore a
 * frame later. Taking the wheel means exactly one thing sets the offset, and it
 * is the one that waits for the list to have height.
 */
if (typeof history !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function useScrollReset(key: string, skip: boolean) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const from = previous.current;
    const leavingList = from !== null && from.startsWith("home:");
    const enteringDetail = !key.startsWith("home:");
    if (from !== null && from !== key && !skip && enteringDetail && leavingList) {
      window.scrollTo(0, 0);
    }
    if (from !== null && from !== key && !enteringDetail) {
      // Returning to the gallery. The browser's own restoration fires before the
      // 705 lazy cards have laid out, so it lands short — measured 2,673px for a
      // saved 18,000px. Re-apply our own saved offset once the list has height.
      let raf = 0;
      let tries = 0;
      const want = Number(sessionStorage.getItem(LIST_SCROLL_KEY) ?? "0");
      const apply = () => {
        if (!want) return;
        if (document.body.scrollHeight - window.innerHeight >= want) {
          window.scrollTo(0, want);
          // keep re-applying briefly: lazy cards mounting below can still nudge it
          if (tries > 20) return;
        }
        tries += 1;
        raf = requestAnimationFrame(apply);
      };
      raf = requestAnimationFrame(apply);
      previous.current = key;
      return () => cancelAnimationFrame(raf);
    }
    previous.current = key;
  }, [key, skip]);

  // WHY a live listener and not a save on the way out: a route-change effect runs
  // AFTER the incoming page has mounted and scrolled, so reading window.scrollY
  // there recorded 1,361px for a gallery sitting at 18,000. The only moment the
  // list's own offset is knowable is while the list is still the route.
  const onList = !key.startsWith("home:") ? false : true;
  useEffect(() => {
    if (!onList) return;
    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try { sessionStorage.setItem(LIST_SCROLL_KEY, String(Math.round(window.scrollY))); } catch { /* private mode */ }
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => { window.removeEventListener("scroll", save); cancelAnimationFrame(raf); };
  }, [onList]);
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
