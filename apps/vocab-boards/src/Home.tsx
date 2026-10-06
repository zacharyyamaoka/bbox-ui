import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dashboard } from "./Dashboard";
import { FilterBar } from "./FilterBar";
import { BoardThumb, useTrackWidth } from "./LazyBoard";
import { CARDS, SITE, type Card as CardData } from "./site";
import {
  buildScenarioHash,
  buildHomeHash,
  clampColumns,
  loadColumns,
  matchesFilters,
  parseQuery,
  serializeQuery,
  storeColumns,
  type FilterState,
} from "./state";

/* ----------------------------------------------------------------- sorting */

function compareDefault(a: CardData, b: CardData): number {
  if (a.scenario.id !== b.scenario.id) return a.scenario.id < b.scenario.id ? -1 : 1;
  if (a.bucketIndex !== b.bucketIndex) return a.bucketIndex - b.bucketIndex;
  return a.exampleIndex - b.exampleIndex;
}

/** Sorts are computed here rather than trusted from array order, so the list's
 *  ordering is self-consistent whatever order the generator happened to emit. */
function sortCards(cards: CardData[], mode: FilterState["sort"]): CardData[] {
  const copy = [...cards];
  const sectionRank = (c: CardData) => SITE.sectionOrder.indexOf(c.scenario.section_id);
  if (mode === "section") {
    copy.sort((a, b) => sectionRank(a) - sectionRank(b) || compareDefault(a, b));
  } else if (mode === "mechanism") {
    copy.sort((a, b) => a.bucket.name.localeCompare(b.bucket.name) || compareDefault(a, b));
  } else if (mode === "vocabulary") {
    // By the FIRST member in the canonical vocabulary order, so "sort by
    // vocabulary" groups a language's mechanisms together rather than sorting
    // by an alphabetised name nobody asked about.
    const rank = (c: CardData) =>
      Math.min(...c.bucket.members.map((m) => SITE.vocabOrder.indexOf(m)).filter((i) => i >= 0), 99);
    copy.sort((a, b) => rank(a) - rank(b) || compareDefault(a, b));
  } else {
    copy.sort(compareDefault);
  }
  return copy;
}

/* ------------------------------------------------------------------ pieces */

function VocabChips({ card, max = 4 }: { card: CardData; max?: number }) {
  const shown = card.bucket.memberNames.slice(0, max);
  const rest = card.bucket.memberNames.slice(max);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((name) => (
        <Badge key={name} variant="outline" className="px-1 py-0 text-[9.5px] font-normal text-muted-foreground">
          {name}
        </Badge>
      ))}
      {/* An explicit, countable "+N" with the complete list one hover away —
          never a silent clip (feedback_truthful_property_rendering). */}
      {rest.length ? (
        <Badge
          variant="outline"
          className="px-1 py-0 text-[9.5px] font-normal text-muted-foreground"
          title={card.bucket.memberNames.join(", ")}
        >
          +{rest.length}
        </Badge>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- gallery */

// gap-3's actual length: the floor math below has to match the grid's real gap
// or the arithmetic that decides "does column N+1 still fit" is off by the gap.
const GALLERY_GAP_REM = 0.75;
// Below this a card's board thumbnail and its two text rows stop being legible
// at all. Browser zoom is the text-size control, so this is a PHYSICAL floor in
// px — never vw/cqw/% — and reflow drops a column instead of shrinking a card
// past it. Straight from the reference viewer's `GALLERY_MIN_TRACK_PX`, raised
// because a board needs more width than a screenshot thumbnail to read at all.
const GALLERY_MIN_TRACK_PX = 230;

function Gallery({
  cards,
  columns,
  listQuery,
}: {
  cards: CardData[];
  columns: number;
  listQuery: string;
}): JSX.Element {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const trackWidth = useTrackWidth(gridRef, [columns, cards.length]);

  // WHY `auto-fill` + a computed per-track floor instead of `repeat(N, 1fr)`:
  // a plain N-column track lets a column shrink to nothing, so at zoom the
  // cards stay N wide and simply get squashed. The floor below is "columns'
  // fair share of the current row, but never under GALLERY_MIN_TRACK_PX", so
  // the grid degrades by DROPPING a column, never by shrinking a card below
  // readable. `columns` is still the number the slider shows; this only changes
  // how many of them the current viewport gets to honour.
  const trackFloor = `min(max(${GALLERY_MIN_TRACK_PX}px, calc((100% - ${
    (columns - 1) * GALLERY_GAP_REM
  }rem) / ${columns})), 100%)`;
  const style = { "--vb-track-min": trackFloor } as CSSProperties;

  return (
    <div
      ref={gridRef}
      style={style}
      data-testid="gallery"
      className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(var(--vb-track-min),1fr))] content-start gap-3 p-4"
    >
      {cards.map((card) => (
        // min-w-0: this `<a>` is a grid item, whose default min-width is `auto`
        // (its subtree's min-content) — the classic automatic-minimum-size
        // trap. Without it a `truncate` label two levels down can never shrink
        // below its longest unbreakable word, so the track never reaches the
        // floor and the card spills past the viewport. Every ancestor between
        // the grid item and the truncating text needs the same override.
        <a
          key={card.boardId}
          data-testid="board-card"
          data-board={card.boardId}
          className="group block min-w-0"
          href={buildScenarioHash(card.scenario.id, listQuery, card.bucketIndex)}
        >
          <div className="min-w-0 overflow-hidden rounded-xl border bg-card transition-shadow group-hover:border-primary/60 group-hover:shadow-md">
            {trackWidth > 0 ? (
              <BoardThumb boardId={card.boardId} width={trackWidth} className="border-b" />
            ) : (
              // Before the first measurement: a box of the right shape, so the
              // page does not jump when the real thumbnail lands.
              <div className="border-b bg-[#0e0f12]" style={{ aspectRatio: "2.6" }} />
            )}
            <div className="grid min-w-0 gap-1 px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge className="px-1 py-0 font-mono text-[10px]">{card.scenario.id}</Badge>
                <span className="min-w-0 truncate text-xs font-semibold" title={card.scenario.title}>
                  {card.scenario.title}
                </span>
              </div>
              <div
                className="min-w-0 truncate text-[11px] text-primary/90"
                title={card.bucket.name}
              >
                {card.bucket.name}
              </div>
              <VocabChips card={card} />
              {/* The board's own authored caption. Two lines, then a visible
                  ellipsis with the whole string still in the DOM and on hover. */}
              <div className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground" title={card.cap}>
                {card.cap}
              </div>
            </div>
          </div>
        </a>
      ))}
      {cards.length === 0 ? (
        <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
          Nothing matches. Clear a chip or the search box.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- table */

const COLUMNS: { label: string; width: string }[] = [
  { label: "scenario", width: "w-[7%]" },
  { label: "title", width: "w-[18%]" },
  { label: "mechanism", width: "w-[22%]" },
  { label: "members", width: "w-[21%]" },
  { label: "caption", width: "w-[32%]" },
];

/** Ellipsis-truncate a cell and keep the complete value one hover away — never
 *  a silent clip. */
function Truncated({ text }: { text: string }) {
  const display = text === "" ? "—" : text;
  return (
    <span className="block truncate" title={display}>
      {display}
    </span>
  );
}

function CardTable({
  cards,
  listQuery,
  headerTop,
}: {
  cards: CardData[];
  listQuery: string;
  headerTop: number;
}): JSX.Element {
  return (
    // `sticky` computes its offset against the nearest ancestor whose overflow
    // is not `visible`, even one that never grows a scrollbar — so shadcn's own
    // `table-container` (default `overflow-x-auto`) is neutralised here, or it
    // would silently become that ancestor and the header would stick to a box
    // that scrolls WITH the page instead of to the viewport.
    <div data-testid="table" className="[&_[data-slot=table-container]]:overflow-visible">
      <Table className="table-fixed text-xs">
        <TableHeader
          style={{ "--vb-header-top": `${headerTop}px` } as CSSProperties}
          className="[&_th]:sticky [&_th]:top-[var(--vb-header-top)] [&_th]:z-10 [&_th]:h-8 [&_th]:bg-card [&_th]:text-[10px] [&_th]:font-bold [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:uppercase"
        >
          <TableRow>
            {COLUMNS.map(({ label, width }) => (
              <TableHead key={label} className={`${width} truncate`}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((card) => (
            <TableRow key={card.boardId} data-testid="board-row" data-board={card.boardId} className="[&>td]:py-1">
              <TableCell className={COLUMNS[0].width + " font-mono"}>
                <a
                  className="text-primary hover:underline"
                  href={buildScenarioHash(card.scenario.id, listQuery, card.bucketIndex)}
                >
                  {card.scenario.id}
                </a>
              </TableCell>
              <TableCell className={COLUMNS[1].width + " font-medium"}>
                <Truncated text={card.scenario.title} />
              </TableCell>
              <TableCell className={COLUMNS[2].width}>
                <Truncated text={card.bucket.name} />
              </TableCell>
              <TableCell className={COLUMNS[3].width + " text-muted-foreground"}>
                <Truncated text={card.bucket.memberNames.join(", ")} />
              </TableCell>
              <TableCell className={COLUMNS[4].width + " text-muted-foreground"}>
                <Truncated text={card.cap} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------------- home */

export function Home({ query }: { query: string }): JSX.Element {
  const [columns, setColumns] = useState(() => loadColumns());
  function updateColumns(next: number) {
    const clamped = clampColumns(next);
    setColumns(clamped);
    storeColumns(clamped);
  }

  // WHY this is measured rather than a fixed guess: the filter bar's own height
  // moves — it wraps to a second line at a narrow width or under browser zoom,
  // and the removed-filter badges beside the search box grow with the active
  // filter count. The table header's sticky `top` has to land exactly at the
  // bottom of whatever the bar is rendering right now, or it either leaves a
  // gap or sits underneath it.
  const filterBarRef = useRef<HTMLDivElement | null>(null);
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setFilterBarHeight(rect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const filters = useMemo(() => parseQuery(query), [query]);
  const filtered = useMemo(
    () =>
      sortCards(
        CARDS.filter((card) =>
          matchesFilters(
            {
              haystack: card.haystack,
              members: card.bucket.members,
              sectionId: card.scenario.section_id,
              kind: card.scenario.kind,
            },
            filters,
          ),
        ),
        filters.sort,
      ),
    [filters],
  );

  const listQuery = serializeQuery(filters);

  function updateFilters(patch: Partial<FilterState>) {
    window.location.hash = buildHomeHash(serializeQuery({ ...filters, ...patch }));
  }

  return (
    // WHY there is no `h-full overflow-hidden` shell: that pair forces the app
    // to exactly the viewport's height and clips anything past it, which is
    // what makes a gallery carry its OWN `overflow-auto` — an inner scroller
    // squeezed between the dashboard and a hard edge, whose bottom row is
    // scrolled out of a pane most of the viewport never shows. A long list page
    // scrolls as ONE document: the dashboard scrolls away, the list gets the
    // full height, and the browser's own scrollbar is the only one. (The
    // reference viewer's 2026-09-21 fix, for exactly this bug.)
    <div className="flex flex-col" data-testid="home">
      <Dashboard query={query} />
      {/* Sticky, and explicitly so: now that the document scrolls, the bar has
          to opt back in or it would scroll away with the dashboard. z-20 keeps
          it above the cards (no z) and the table header (z-10) passing under. */}
      <div ref={filterBarRef} className="sticky top-0 z-20">
        <FilterBar
          filters={filters}
          filteredCount={filtered.length}
          total={CARDS.length}
          onUpdate={updateFilters}
          columns={columns}
          onColumnsChange={updateColumns}
        />
      </div>
      {filters.view === "table" ? (
        <CardTable cards={filtered} listQuery={listQuery} headerTop={filterBarHeight} />
      ) : (
        <Gallery cards={filtered} columns={columns} listQuery={listQuery} />
      )}
      {SITE.narrative.tail ? (
        <div
          data-testid="narrative-tail"
          className="narrative max-w-[86ch] border-t px-4 py-6"
          // Authored HTML from narrative.json, the same trusted hand-written
          // source as every quote on this page. Nothing here is user input.
          dangerouslySetInnerHTML={{ __html: SITE.narrative.tail }}
        />
      ) : null}
    </div>
  );
}
