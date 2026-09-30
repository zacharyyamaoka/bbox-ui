import type { JSX } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { SITE, VOCAB_BY_KEY, type Construct } from "./site";
import { buildHomeHash, filterQueryOf, parseQuery, serializeQuery } from "./state";

/** `has` is a three-value verdict the sheets authored. The colour is the whole
 *  signal on a 26-row table, so it is stated once here rather than inline. */
const HAS_TONE: Record<string, string> = {
  yes: "border-ink-ok/50 text-ink-ok",
  partial: "border-ink-gold/50 text-ink-gold",
  no: "border-ink-warn/50 text-ink-warn",
};

function HasChip({ has }: { has: string }) {
  const value = (has || "").toLowerCase();
  return (
    <Badge variant="outline" data-has={value} className={`text-[10px] ${HAS_TONE[value] ?? "text-muted-foreground"}`}>
      {/* The authored value, whatever it is — a spelling this page does not
          recognise still shows, in neutral, rather than being blanked. */}
      {has || "—"}
    </Badge>
  );
}

function IdentityRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0 text-[12px] leading-snug">{value}</dd>
    </>
  );
}

export function VocabPage({ vocabKey, query }: { vocabKey: string; query: string }): JSX.Element {
  const vocab = VOCAB_BY_KEY.get(vocabKey);
  const listQuery = filterQueryOf(query);
  // The name every chip, matrix header and filter on the site uses.
  const canonicalName = SITE.vocabName[vocabKey] ?? vocab?.name ?? vocabKey;

  if (!vocab) {
    return (
      <div className="p-8 text-sm text-destructive">
        no vocabulary with key {vocabKey} —{" "}
        <a className="underline" href={buildHomeHash(listQuery)}>
          back to the gallery
        </a>
      </div>
    );
  }

  // "Show me only this language's mechanisms" — the one action a grammar sheet
  // should hand back to the list, carrying whatever else was already filtered.
  const onlyThis = buildHomeHash(serializeQuery({ ...parseQuery(listQuery), vocab: [vocab.key] }));

  return (
    <div data-testid="vocab" data-vocab={vocab.key} className="grid gap-5 p-4 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="text-xs" nativeButton={false}
          render={<a href={buildHomeHash(listQuery)} />}>
          <ArrowLeft />
          {listQuery ? "back to the filtered list" : "back to the gallery"}
        </Button>
        <Button variant="outline" size="sm" className="ml-auto text-xs" nativeButton={false}
          render={<a href={onlyThis} />}>
          show only {canonicalName} in the gallery
        </Button>
      </div>

      <header className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:items-start xl:gap-6">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-xl font-semibold">{canonicalName}</h1>
            {/* The grammar sheet authored its own name for the tool, and it is
                not always the short one the chips use ("NI LabVIEW (G)" vs
                "LabVIEW"). Both are authored values, so both are shown rather
                than one silently standing in for the other. */}
            {vocab.name && vocab.name !== canonicalName ? (
              <span className="text-xs text-muted-foreground">sheet: {vocab.name}</span>
            ) : null}
          </div>
          {vocab.identity.one_line ? (
            <p className="max-w-[80ch] text-[13px] leading-relaxed text-muted-foreground">{vocab.identity.one_line}</p>
          ) : null}
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 rounded-xl border bg-card p-3">
            <IdentityRow label="flow" value={vocab.identity.flow} />
            <IdentityRow label="node shape" value={vocab.identity.node_shape} />
            <IdentityRow label="port style" value={vocab.identity.port_style} />
            <IdentityRow label="wire style" value={vocab.identity.wire_style} />
            <IdentityRow label="execution wire" value={vocab.identity.has_exec_wire} />
          </dl>
          {vocab.docs.length ? (
            <div className="flex flex-wrap gap-1.5">
              {vocab.docs.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:border-primary/60 hover:text-primary"
                  title={url}
                >
                  <ExternalLink className="size-3 shrink-0" />
                  {/* The host + last path segment: enough to tell two pages on
                      one site apart, with the complete URL on hover and in the
                      link itself. */}
                  <span className="truncate">{shortUrl(url)}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {vocab.hero ? (
          <figure className="m-0 grid gap-1">
            <img
              data-testid="vocab-hero"
              src={vocab.hero}
              alt={`${canonicalName}, from its own documentation`}
              loading="lazy"
              className="w-full rounded-xl border bg-[#0e0f12] object-contain"
            />
            <figcaption className="text-[10px] text-muted-foreground">
              From {canonicalName}'s own documentation — not a drawing of ours.
            </figcaption>
          </figure>
        ) : null}
      </header>

      <section className="grid gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">The grammar sheet</h2>
          <span className="text-[11px] text-muted-foreground">
            {vocab.constructs.length} constructs, each read from the page linked beside it
          </span>
        </div>
        <div className="[&_[data-slot=table-container]]:overflow-visible">
          <Table className="table-fixed text-xs">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:h-8 [&_th]:bg-card [&_th]:text-[10px] [&_th]:font-bold [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableRow>
                <TableHead className="w-[11%]">construct</TableHead>
                <TableHead className="w-[6%]">has it</TableHead>
                <TableHead className="w-[19%]">its own name for it</TableHead>
                <TableHead className="w-[26%]">the mark</TableHead>
                <TableHead className="w-[38%]">what the documentation says</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vocab.constructs.map((construct: Construct, i) => (
                <TableRow
                  key={`${construct.construct}:${i}`}
                  data-testid="construct-row"
                  // WHY `whitespace-normal` is forced on every cell: shadcn's TableCell
                  // is `whitespace-nowrap` (ui/table.tsx), and under `table-fixed` a
                  // nowrap cell does not shrink — it OVERFLOWS its column, visibly.
                  // Measured before this line: all 26 rows painted their three prose
                  // columns on top of each other and the sheet was unreadable. These
                  // cells hold sentences, so they wrap.
                  className="[&>td]:py-1.5 [&>td]:align-top [&>td]:whitespace-normal"
                >
                  <TableCell className="font-medium">{construct.construct}</TableCell>
                  <TableCell>
                    <HasChip has={construct.has} />
                  </TableCell>
                  <TableCell className="text-foreground">{construct.named_thing || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{construct.mark || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {construct.quote ? <span className="italic">“{construct.quote}”</span> : "—"}
                    {construct.doc_url ? (
                      <a
                        href={construct.doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap text-primary hover:underline"
                        title={construct.doc_url}
                      >
                        source
                        <ExternalLink className="size-2.5" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <nav className="flex flex-wrap gap-1.5 border-t pt-4">
        {SITE.vocabOrder.map((key) => (
          <a key={key} href={`#/vocab/${key}${listQuery ? `?${listQuery}` : ""}`}>
            <Badge
              variant={key === vocab.key ? "default" : "outline"}
              className="text-[10.5px] hover:border-primary/60"
            >
              {SITE.vocabName[key] ?? key}
            </Badge>
          </a>
        ))}
      </nav>
    </div>
  );
}

/** Host + last path segment. The complete URL stays in `href` and in `title`,
 *  so this abbreviates visibly rather than hiding anything. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? `${parsed.host}/…/${last}` : parsed.host;
  } catch {
    return url;
  }
}
