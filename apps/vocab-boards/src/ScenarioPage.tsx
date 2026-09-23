import { useEffect, useRef, useState, type JSX } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Maximize2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { BoardFigure } from "./LazyBoard";
import { PyCode } from "./pycode";
import {
  boardSize,
  CARD_BY_BOARD_ID,
  SCENARIOS_IN_ORDER,
  SCENARIO_BY_ID,
  SITE,
  isRefusal,
  type Bucket,
  type Evidence,
  type Scenario,
} from "./site";
import { anchoredBucket, buildBoardHash, buildHomeHash, buildScenarioHash, filterQueryOf } from "./state";

/** One colour per kind, so a scenario's chip says what sort of thing it is
 *  before the title is read. The set is closed and lives in the data (see
 *  `KINDS`); an unknown kind falls back to the neutral outline rather than
 *  silently borrowing another kind's colour. */
const KIND_TONE: Record<string, string> = {
  Block: "border-ink-accent/50 text-ink-accent",
  Data: "border-ink-ok/50 text-ink-ok",
  Wire: "border-primary/50 text-primary",
  Region: "border-ink-purple/50 text-ink-purple",
  Mark: "border-ink-gold/50 text-ink-gold",
  Sink: "border-ink-dim2 text-muted-foreground",
  Transform: "border-ink-accent/40 text-ink-accent/90",
  "Not drawn": "border-ink-warn/50 text-ink-warn",
};

function KindChip({ kind }: { kind: string }) {
  return (
    <Badge variant="outline" data-testid="kind-chip" className={KIND_TONE[kind] ?? ""}>
      {kind}
    </Badge>
  );
}

/* ---------------------------------------------------------------- evidence */

/**
 * The proof row. Zach, 2026-09-23: "Yes very important please include thoose
 * proof screen shots."
 *
 * Each entry is the tool's OWN documentation: a screenshot of the page, the
 * name that page gives the thing, a link to it, and the sentence quoted
 * verbatim. That is what makes the three boards below a claim about a shipping
 * product rather than a drawing. Never substitute one of our own boards for one
 * of these, and never drop the thumbnail — the picture is the part that cannot
 * be paraphrased.
 */
function EvidenceRow({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <div data-testid="evidence-row" className="grid gap-2">
      <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        From each tool's own documentation
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {evidence.map((item) => (
          <div
            key={`${item.vocab}:${item.url}`}
            data-testid="evidence"
            data-vocab={item.vocab}
            className="flex min-w-0 gap-2 rounded-lg border bg-card p-2"
          >
            {item.img ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0" title="open the page this is from">
                <img
                  data-testid="evidence-thumb"
                  src={item.img}
                  alt={`${item.name} documentation: ${item.named_thing}`}
                  loading="lazy"
                  width={92}
                  height={60}
                  className="h-[60px] w-[92px] rounded border border-border/60 bg-[#0e0f12] object-cover object-left-top"
                />
              </a>
            ) : (
              <div
                data-testid="evidence-thumb-missing"
                className="flex h-[60px] w-[92px] shrink-0 items-center justify-center rounded border border-dashed text-[9px] tracking-wider text-muted-foreground uppercase"
              >
                no capture
              </div>
            )}
            <div className="min-w-0 grid content-start gap-0.5">
              <div className="truncate text-[10px] tracking-wider text-muted-foreground uppercase" title={item.name}>
                {item.name}
              </div>
              {/* 26 of 576 citations came back from the sheets with no URL or no
                  quote — that vocabulary genuinely has no page saying it. An
                  <a href=""> reloads the page and a bare pair of curly quotes
                  reads as a missing value, so each is omitted rather than
                  printed empty. The name still shows, so the claim is still
                  attributed. */}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 text-[11.5px] font-semibold hover:text-primary hover:underline"
                  title={item.url}
                >
                  <span className="truncate">{item.named_thing}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-60" />
                </a>
              ) : (
                <span className="truncate text-[11.5px] font-semibold" title={item.named_thing}>
                  {item.named_thing || item.name}
                </span>
              )}
              {/* The quote is a stored value and stays literal — line-clamped
                  with the complete sentence in the DOM and on hover, never
                  paraphrased and never silently cut. */}
              {item.quote ? (
                <p className="line-clamp-3 text-[10.5px] leading-snug text-muted-foreground italic" title={item.quote}>
                  “{item.quote}”
                </p>
              ) : (
                <p className="text-[10px] tracking-wide text-muted-foreground/70 uppercase">no quotable line on that page</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- buckets */

/** gap-3, in px — the row arithmetic below has to match the grid's real gap. */
const BOARD_GAP = 12;

function BucketBlock({
  scenario,
  bucket,
  index,
  listQuery,
}: {
  scenario: Scenario;
  bucket: Bucket;
  index: number;
  listQuery: string;
}) {
  /*
   * WHY the three boards go side by side only when they ACTUALLY fit, and
   * stack full width otherwise — measured, not a taste call:
   *
   * A board's width is authored, and across all 705 they run 110px to 3,927px
   * (median 524). Three-up in a 1680px window gives each board ~512px, and
   * only 45 of the 235 mechanisms (19%) have all three boards inside that —
   * so a fixed `xl:grid-cols-3` leaves FOUR FIFTHS of the corpus showing
   * half a board with no sign the rest exists. Stacked full width, 224 of 235
   * (95%) fit with no scroll at all.
   *
   * So the row asks the real question — does the widest of these three fit in
   * a third of the width I actually have — and answers it from its own
   * measured box rather than a breakpoint, which cannot know how wide THESE
   * boards are. Shrinking the boards to fit was the other option and is worse:
   * the geometry is the thing under review, and a wire label at 0.28 scale is
   * not a label.
   */
  const row = useRef<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const read = () => setRowWidth(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const widest = Math.max(...bucket.boards.map((id) => boardSize(id).w), 0);
  const threeUp = rowWidth > 0 && widest <= (rowWidth - 2 * BOARD_GAP) / 3;

  return (
    <section
      id={`b${index}`}
      data-testid="bucket"
      data-bucket={index}
      className="grid gap-3 rounded-xl border bg-card/40 p-4"
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">{bucket.name}</h3>
          {isRefusal(bucket) ? (
            <Badge variant="outline" className="border-ink-warn/50 text-[10px] text-ink-warn">
              draws nothing
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {bucket.members.map((key, i) => (
            <a key={key} href={`#/vocab/${key}`}>
              <Badge variant="secondary" className="text-[10px] hover:bg-primary hover:text-primary-foreground">
                {bucket.memberNames[i] ?? key}
              </Badge>
            </a>
          ))}
        </div>
        <p className="max-w-[90ch] text-[12.5px] leading-relaxed text-muted-foreground">{bucket.mechanism}</p>
      </div>

      <EvidenceRow evidence={bucket.evidence} />

      <div
        ref={row}
        data-testid="boards-row"
        data-layout={threeUp ? "three-up" : "stacked"}
        className={`grid gap-3 ${threeUp ? "grid-cols-3" : "grid-cols-1"}`}
      >
        {bucket.boards.map((boardId, exampleIndex) => {
          const card = CARD_BY_BOARD_ID.get(boardId);
          const example = scenario.examples[exampleIndex];
          return (
            <figure key={boardId} data-testid="bucket-board" data-board={boardId} className="m-0 grid min-w-0 content-start gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                  {example?.caption ?? `example ${exampleIndex + 1}`}
                </span>
                <a
                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                  href={buildBoardHash(boardId, listQuery)}
                  title="open this board alone, with pan and zoom"
                >
                  <Maximize2 className="size-3" />
                  open
                </a>
              </div>
              <BoardFigure boardId={boardId} />
              <figcaption className="text-[11px] leading-snug text-muted-foreground">{card?.cap}</figcaption>
              {/* Captions the renderer deliberately does not draw, printed
                  rather than dropped — see `droppedTagsOf` in site.ts. Every
                  authored character stays visible somewhere on the page. */}
              {card?.dropped.length ? (
                <ul data-testid="dropped-tags" className="grid gap-0.5 text-[10px] text-ink-gold/90">
                  {card.dropped.map((d, i) => (
                    <li key={`${d.node}:${i}`}>
                      the <span className="font-mono">{d.node}</span> node: {d.tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- page */

export function ScenarioPage({ id, query }: { id: string; query: string }): JSX.Element {
  const scenario = SCENARIO_BY_ID.get(id);
  const listQuery = filterQueryOf(query);
  const anchor = anchoredBucket(query);

  // The anchor is carried in the query (see `buildScenarioHash`), so the scroll
  // is ours to perform: a browser-native `#id` jump cannot live inside a hash
  // route. Runs after the buckets are in the DOM.
  useEffect(() => {
    if (anchor === null) return;
    const el = document.getElementById(`b${anchor}`);
    if (el) el.scrollIntoView({ block: "start" });
  }, [anchor, id]);

  if (!scenario) {
    return (
      <div className="p-8 text-sm text-destructive">
        no scenario with id {id} — <a className="underline" href={buildHomeHash(listQuery)}>back to the gallery</a>
      </div>
    );
  }

  const position = SCENARIOS_IN_ORDER.indexOf(scenario);
  const prev = SCENARIOS_IN_ORDER[position - 1];
  const next = SCENARIOS_IN_ORDER[position + 1];

  return (
    <div data-testid="scenario" data-scenario={scenario.id} className="grid gap-5 p-4 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href={buildHomeHash(listQuery)} />} className="text-xs">
          <ArrowLeft />
          {listQuery ? "back to the filtered list" : "back to the gallery"}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {prev ? (
            <Button variant="ghost" size="sm" className="text-xs" nativeButton={false} render={<a href={buildScenarioHash(prev.id, listQuery)} />}>
              <ChevronLeft />
              {prev.id}
            </Button>
          ) : null}
          {next ? (
            <Button variant="ghost" size="sm" className="text-xs" nativeButton={false} render={<a href={buildScenarioHash(next.id, listQuery)} />}>
              {next.id}
              <ChevronRight />
            </Button>
          ) : null}
        </div>
      </div>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="font-mono">{scenario.id}</Badge>
          <h1 className="text-xl font-semibold">{scenario.title}</h1>
          <KindChip kind={scenario.kind} />
          <span className="text-xs text-muted-foreground">{scenario.section}</span>
        </div>
        {scenario.note ? (
          <p className="max-w-[90ch] text-[12.5px] leading-relaxed text-muted-foreground">{scenario.note}</p>
        ) : null}
      </header>

      <section className="grid gap-2 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start xl:gap-5">
        <div className="grid gap-1.5">
          <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            the construct
          </div>
          <PyCode code={scenario.canonical} />
          {scenario.ports ? (
            <p className="text-[11px] leading-snug text-muted-foreground">{scenario.ports}</p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            the three worked examples every board below draws
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {scenario.examples.map((example, i) => (
              <div key={i} className="grid min-w-0 gap-1">
                <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{example.caption}</div>
                <PyCode code={example.code} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        {scenario.buckets.map((bucket, index) => (
          <BucketBlock
            key={`${bucket.name}:${index}`}
            scenario={scenario}
            bucket={bucket}
            index={index}
            listQuery={listQuery}
          />
        ))}
      </div>

      {/*
        The quieter row. The spec asks for it when `none` is non-empty; measured
        across the corpus `none` is empty in all 57 scenarios while `noneNote`
        is authored in all 57 — so gating on `none` alone would silently drop 57
        authored sentences, which is the one thing this page may not do. The
        names appear when there are names; the note appears whenever it exists.
      */}
      {scenario.none.length || scenario.noneNote ? (
        <p data-testid="none-note" className="max-w-[90ch] border-t pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
          {scenario.none.length ? (
            <>
              <span className="text-foreground">No drawing at all — </span>
              {scenario.none.map((key) => SITE.vocabName[key] ?? key).join(", ")}.{" "}
            </>
          ) : null}
          {scenario.noneNote}
        </p>
      ) : null}
    </div>
  );
}
