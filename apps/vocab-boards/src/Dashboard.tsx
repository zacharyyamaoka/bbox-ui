import { useMemo, useState, type CSSProperties, type JSX } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { SITE, isRefusal } from "./site";
import {
  buildHomeHash,
  loadDashboardOpen,
  parseQuery,
  serializeQuery,
  storeDashboardOpen,
} from "./state";

/* -------------------------------------------------------- the stat strip */

function Stat({
  value,
  label,
  hint,
  note,
}: {
  value: string | number;
  label: string;
  /** Rendered under the number, clamped to two lines, complete on hover. */
  hint?: string;
  /** Hover-only. WHY the distinction exists: the refusal rule is one sentence
   *  that belongs beside its number, but the section strip repeats that number
   *  nine times, and nine copies of the same sentence is 18 lines of dashboard
   *  saying one thing. The rule is stated once, visibly, on the summary tile;
   *  the nine section tiles carry it in `title` where a reader who wonders can
   *  still reach it. */
  note?: string;
}) {
  return (
    <Card data-testid="stat-tile" className="min-w-0 gap-0.5 rounded-lg py-1.5 shadow-xs" title={note ?? hint}>
      <CardHeader className="gap-0 px-2.5">
        {/* Wraps rather than truncates. A grid row stretches to its tallest
            tile, so a two-line label costs the row it is already in — and a
            clipped label is the silent-abbreviation failure. */}
        <CardTitle className="text-[10px] leading-tight font-bold tracking-widest text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-2.5">
        <div className="text-base leading-none font-semibold">{value}</div>
        {hint ? (
          <div className="line-clamp-2 text-[10px] leading-tight text-muted-foreground" title={hint}>
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------- the agreement matrix */

/**
 * The headline finding, drawn: eleven visual languages collapsing into a few
 * families. Cell (a,b) is how many of the 235 mechanisms both tools are in.
 *
 * WHY the wash is normalised by `min(appears[a], appears[b])` rather than by
 * the global maximum: the tools do not appear equally often (measured, 61 to
 * 70 buckets each), so a raw count makes a pair look close simply because both
 * are prolific. The denominator is the most buckets they COULD have shared, so
 * the colour reads as "how much of the smaller tool's vocabulary is the same
 * one" — which is the question. The 0..0.8 range rather than 0..1 is because
 * no pair reaches 1 and stretching to an unreachable top would wash the whole
 * grid out; 0.8 puts the strongest pairs at full saturation.
 *
 * The diagonal is dashed and empty on purpose: a tool agrees with itself in
 * every bucket, which is true and says nothing, and a saturated diagonal is
 * the loudest thing on a matrix that is about the OFF-diagonal.
 */
const WASH_CEILING = 0.8;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function AgreementMatrix({ query }: { query: string }): JSX.Element {
  const order = SITE.vocabOrder;
  const { together, appears } = SITE.agreement;
  // The matrix's one link back into the list carries the list's own state, or
  // clicking it would silently drop whatever was already filtered.
  const filters = useMemo(() => parseQuery(query), [query]);

  return (
    <figure className="m-0 grid gap-1.5">
      <figcaption className="text-[11px] leading-snug text-muted-foreground">
        How often two languages land in the SAME mechanism, across all{" "}
        {SITE.stats.buckets} of them. Darker is more agreement; each cell is
        washed by how many buckets the pair could have shared at most, so a
        prolific tool does not look close to everything by volume alone.
      </figcaption>
      {/* `pr-32` is the horizontal reach of the LAST column's rotated label
          ("Blender Geometry Nodes" is ~108px of text, and at 60 degrees that
          is ~54px of run past its own column). Without it the label extends
          past the table's box and the `overflow-x-auto` here turns it into a
          scroll nobody asked for. */}
      <div className="overflow-x-auto pr-16">
        <table data-testid="agreement-matrix" className="border-separate border-spacing-0 text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card" />
              {order.map((b) => (
                // WHY the label is absolutely positioned at `left-1/2` with
                // `origin-bottom-left`: a rotated span CENTRED in a 26px cell
                // starts ~42px to the LEFT of the cell (its unrotated width is
                // ~110px), so it ran under the sticky row-header column, which
                // paints over it — measured, the first two names read
                // "...eprints" and "...y Visual Scripting". Anchored at the
                // cell's own midpoint it can only travel up and to the right.
                // The 132px height is that same 110px label's vertical reach
                // at 60 degrees, so the scroll container cannot clip its top.
                <th key={b} className="relative h-[132px] w-[26px] p-0 align-bottom">
                  <span
                    className="absolute bottom-1.5 left-1/2 origin-bottom-left -rotate-60 whitespace-nowrap text-muted-foreground"
                    title={SITE.vocabName[b]}
                  >
                    {SITE.vocabName[b]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((a) => (
              <tr key={a}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card pr-2 text-right font-normal whitespace-nowrap text-muted-foreground"
                >
                  <a className="hover:text-foreground hover:underline" href={`#/vocab/${a}`}>
                    {SITE.vocabName[a]}
                  </a>
                </th>
                {order.map((b) => {
                  if (a === b) {
                    return (
                      <td
                        key={b}
                        data-cell="diagonal"
                        className="size-[26px] border border-dashed border-border/70"
                        title={`${SITE.vocabName[a]} — in ${appears[a] ?? 0} of ${SITE.stats.buckets} mechanisms`}
                      />
                    );
                  }
                  const n = together[pairKey(a, b)] ?? 0;
                  const denom = Math.min(appears[a] ?? 0, appears[b] ?? 0) || 1;
                  const wash = Math.min(1, n / denom / WASH_CEILING);
                  return (
                    <td
                      key={b}
                      data-cell="pair"
                      data-a={a}
                      data-b={b}
                      data-n={n}
                      className="size-[26px] border border-border/40 text-center align-middle"
                      style={{
                        // The board's own accent, so the matrix is painted in
                        // the same ink as the figures it summarises.
                        backgroundColor: `color-mix(in oklab, var(--primary) ${(wash * 100).toFixed(1)}%, transparent)`,
                        color: wash > 0.55 ? "#0e0f12" : undefined,
                      }}
                      title={`${SITE.vocabName[a]} + ${SITE.vocabName[b]} — ${n} of ${denom} possible mechanisms`}
                    >
                      {n || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Click a name to open that language's grammar sheet, or a{" "}
        <a
          className="underline hover:text-foreground"
          href={buildHomeHash(serializeQuery({ ...filters, vocab: [order[0]] }))}
        >
          vocabulary chip
        </a>{" "}
        above to narrow the gallery to one.
      </p>
    </figure>
  );
}

/* ---------------------------------------------------------- the dashboard */

/**
 * WHY this label says "named as" rather than "is", and why the rule travels
 * with the number: the narrative above these tiles states a refusal count of
 * its own ("40 of the 235 buckets, touching 38 of the 57 scenarios") that no
 * rule derivable from the shipped data reproduces — it predates the redraw the
 * narrative itself describes. Rather than reverse-engineer a regex until it
 * hits 40 (which would be fitting a definition to a number), this tile counts
 * only what is mechanically checkable in the data on screen and SAYS what it
 * counted, so a reader who notices the two numbers differ can see why in one
 * hover instead of concluding the page contradicts itself.
 */
const REFUSAL_RULE =
  'counted from the mechanism\'s own name — the ones opening "Not drawn", "Nothing drawn", "Refused" or "No drawing"';

/** Per-section metric cards — the reference viewer's `EVERYDAY CODE` /
 *  `HARD CODE` pattern: a category label down the left, its numbers to the
 *  right, one row per section. */
function SectionRows(): JSX.Element {
  const rows = SITE.sectionOrder.map((sectionId) => {
    const scenarios = SITE.scenarios.filter((s) => s.section_id === sectionId);
    const buckets = scenarios.flatMap((s) => s.buckets);
    return {
      sectionId,
      label: SITE.sectionShort[sectionId] ?? sectionId,
      scenarios: scenarios.length,
      buckets: buckets.length,
      boards: buckets.reduce((n, b) => n + b.boards.length, 0),
      refusals: buckets.filter(isRefusal).length,
    };
  });
  return (
    <div className="grid gap-y-2">
      {rows.map((row) => (
        <div
          key={row.sectionId}
          data-testid="section-row"
          data-section={row.sectionId}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3"
        >
          <div className="pt-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            {row.label}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            <Stat value={row.scenarios} label="scenarios" />
            <Stat value={row.buckets} label="mechanisms" />
            <Stat value={row.boards} label="boards" />
            <Stat value={row.refusals} label="named as a refusal" note={REFUSAL_RULE} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard({ query }: { query: string }): JSX.Element {
  const [open, setOpen] = useState(() => loadDashboardOpen());
  const stats = SITE.stats;
  const refusals = SITE.scenarios.flatMap((s) => s.buckets).filter(isRefusal).length;

  return (
    <div data-testid="dashboard" className="border-b bg-card px-4 pt-2 pb-2">
      {/*
        The dashboard leads, and it is a Collapsible open by default: the
        agreement matrix IS the finding, so a first visit should land on the
        picture. Shutting it is one click and is remembered, because someone
        working through 705 cards wants the list back on every return from a
        scenario — not once per visit.
      */}
      <Collapsible open={open} onOpenChange={(next: boolean) => { setOpen(next); storeDashboardOpen(next); }}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              data-testid="dashboard-toggle"
              className="h-6 w-fit px-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              <ChevronDown
                className="transition-transform"
                style={{ transform: open ? undefined : "rotate(-90deg)" } as CSSProperties}
              />
              Dashboard
            </Button>
          }
        />
        <CollapsibleContent className="grid gap-3 pt-2">
          {/* Side by side from 1280px up: the matrix is the finding and the
              lede is the sentence that explains it, so they belong on one
              screen. Stacked below that, because the matrix has a floor width
              (11 columns x 26px plus its labels) and cannot share a narrow
              row without one of them scrolling. */}
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_32rem]">
          {SITE.narrative.lede ? (
            <div
              data-testid="narrative-lede"
              className="narrative max-w-[86ch]"
              // The narrative is authored HTML from narrative.json — the same
              // trusted, hand-written source as every quote on the page, and
              // it carries inline emphasis and links that would be lost as
              // plain text. Nothing here is user input.
              dangerouslySetInnerHTML={{ __html: SITE.narrative.lede }}
            />
          ) : null}

          <AgreementMatrix query={query} />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            <Stat value={stats.scenarios} label="Python scenarios" hint="one per construct the language has" />
            <Stat value={stats.vocabs} label="visual languages" hint="each read against its own documentation" />
            <Stat value={stats.buckets} label="mechanisms" hint={`${stats.perScenario} per scenario on average`} />
            <Stat value={stats.boards} label="boards drawn" hint="three worked examples per mechanism" />
            <Stat value={stats.examples} label="Python examples" hint="the code each board is drawing" />
            <Stat
              value={refusals}
              label="mechanisms named as a refusal"
              hint={REFUSAL_RULE}
            />
          </div>

          <SectionRows />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
