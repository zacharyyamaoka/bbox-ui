import { useEffect, useRef, type JSX } from "react";
import { ListFilter, Search, X } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";
import { Slider } from "./ui/slider";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { KINDS, SEARCHED_FIELDS, SITE } from "./site";
import { MAX_COLUMNS, MIN_COLUMNS, type FilterState, type SortMode, type ViewMode } from "./state";

/**
 * WHY the pressed state is re-specified rather than left to shadcn's Toggle:
 * its "on" state is `bg-accent`, a few percent of grey — legible as a hover,
 * invisible as "this chip is removing 600 of the 705 cards from your list". A
 * filter you cannot see is the one that makes the page lie about what it is
 * showing, so the on state gets the primary fill. Copied, with its reason, from
 * the reference viewer's `CHIP_ON` (/home/bam/pyblocks/src/goldens/FilterBar.tsx).
 */
const CHIP_ON = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

/**
 * WHY a native listener instead of a controlled `<input value onChange>`:
 * React's DOM renderer tracks each input's "last known value" to dedupe
 * synthetic change events (a legacy IE compat shim, still present in React 19).
 * When external code sets `el.value` directly and dispatches a plain `input`
 * event — exactly what a Playwright `fill()` and what a browser's own autofill
 * do — that assignment updates React's tracker too, so React decides "nothing
 * changed" and never calls onChange: the box would look cleared while the
 * filter stayed stuck. A plain native listener fires on every dispatched
 * `input` event regardless of the tracker. Verbatim rationale and mechanism
 * from the reference viewer, where a smoke test measured the failure.
 */
function SearchInput({ q, onChange }: { q: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  // WHY the default is frozen at first render: this input is UNCONTROLLED on
  // purpose (see above), and Base UI warns — correctly — when an uncontrolled
  // field's `defaultValue` changes afterwards, because "default" then means
  // two different things. `q` does change on every hash update, so passing it
  // straight through produced that warning on every keystroke. The effect
  // below is what keeps the field in sync after mount; the default only has
  // to be right once.
  const initialQ = useRef(q).current;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleInput = (event: Event) => onChange((event.target as HTMLInputElement).value);
    el.addEventListener("input", handleInput);
    return () => el.removeEventListener("input", handleInput);
  }, [onChange]);
  // Keep the field in sync with externally-driven changes (Back/forward, a
  // direct link) without fighting in-progress typing.
  useEffect(() => {
    if (ref.current && ref.current.value !== q) ref.current.value = q;
  }, [q]);
  return (
    <div className="relative w-72 shrink-0">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        type="search"
        data-testid="search"
        // One compact field with a short placeholder; the full list of searched
        // fields lives in `title` rather than shouting it across the chrome —
        // Zach's note on the reference app ("the searching bar feels quite
        // large and confusing").
        placeholder="search boards…"
        title={SEARCHED_FIELDS}
        defaultValue={initialQ}
        className="h-8 pl-8 text-sm"
      />
    </div>
  );
}

/** One chip group: a multi-select ToggleGroup keeping `filter-<group>-<value>`
 *  testids, so an acceptance run clicks the same target a reader does. */
function ChipToggleGroup({
  label,
  values,
  labelOf,
  active,
  onChange,
  testidPrefix,
}: {
  label: string;
  values: string[];
  labelOf: (value: string) => string;
  active: string[];
  onChange: (next: string[]) => void;
  testidPrefix: string;
}) {
  if (!values.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </div>
      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        spacing={1}
        value={active}
        onValueChange={(next) => onChange(next as string[])}
        className="flex w-full flex-wrap"
      >
        {values.map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            data-testid={`filter-${testidPrefix}-${value}`}
            aria-label={`${label} ${labelOf(value)}`}
            className={`h-7 px-2 text-xs ${CHIP_ON}`}
          >
            {labelOf(value)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export interface FilterBarProps {
  filters: FilterState;
  filteredCount: number;
  total: number;
  onUpdate: (patch: Partial<FilterState>) => void;
  columns: number;
  onColumnsChange: (next: number) => void;
}

const SORT_LABEL: Record<SortMode, string> = {
  scenario: "sort: by scenario",
  section: "sort: by section",
  mechanism: "sort: by mechanism",
  vocabulary: "sort: by vocabulary",
};

export function FilterBar({
  filters,
  filteredCount,
  total,
  onUpdate,
  columns,
  onColumnsChange,
}: FilterBarProps): JSX.Element {
  const vocabLabel = (key: string) => SITE.vocabName[key] ?? key;
  const sectionLabel = (id: string) => SITE.sectionShort[id] ?? id;

  // Everything the popover hides, flattened. The count on its trigger and the
  // removable badges beside the search box are what keep hidden filters honest:
  // the URL says `section=g-loops`, so the page has to say it too, even while
  // the drawer that set it is shut.
  const hidden: Array<{ group: "section" | "kind"; label: string; value: string; text: string }> = [
    ...filters.section.map((value) => ({
      group: "section" as const,
      label: "section",
      value,
      text: sectionLabel(value),
    })),
    ...filters.kind.map((value) => ({
      group: "kind" as const,
      label: "kind",
      value,
      text: value,
    })),
  ];

  function removeHidden(group: "section" | "kind", value: string) {
    onUpdate({ [group]: filters[group].filter((item) => item !== value) } as Partial<FilterState>);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
      <SearchInput q={filters.q} onChange={(value) => onUpdate({ q: value })} />

      {/* WHY vocabulary stays OUT of the popover while section and kind go in:
          "which tools draw it this way" is the question this corpus exists to
          answer, so it is the filter a reading session starts from. A chip
          behind a drawer is two clicks and an invisible target. */}
      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        spacing={1}
        value={filters.vocab}
        onValueChange={(next) => onUpdate({ vocab: next as string[] })}
        aria-label="vocabulary"
        className="flex flex-wrap"
      >
        {SITE.vocabOrder.map((key) => (
          <ToggleGroupItem
            key={key}
            value={key}
            data-testid={`filter-vocab-${key}`}
            aria-label={vocabLabel(key)}
            title={vocabLabel(key)}
            className={`h-8 px-2 text-xs ${CHIP_ON}`}
          >
            {vocabLabel(key)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="text-xs" data-testid="filters-popover">
              <ListFilter />
              Filters
              {hidden.length ? (
                <Badge className="h-4 min-w-4 px-1 text-[10px]">{hidden.length}</Badge>
              ) : null}
            </Button>
          }
        />
        <PopoverContent align="start" className="grid max-h-[60vh] w-[30rem] gap-3 overflow-auto p-3">
          <ChipToggleGroup
            label="section"
            values={SITE.sectionOrder}
            labelOf={sectionLabel}
            active={filters.section}
            testidPrefix="section"
            onChange={(next) => onUpdate({ section: next })}
          />
          <ChipToggleGroup
            label="kind"
            values={KINDS}
            labelOf={(value) => value}
            active={filters.kind}
            testidPrefix="kind"
            onChange={(next) => onUpdate({ kind: next })}
          />
        </PopoverContent>
      </Popover>

      {hidden.map((item) => (
        <Badge key={`${item.group}:${item.value}`} variant="secondary" className="gap-1 pr-1 text-[11px]">
          <span className="text-muted-foreground">{item.label}</span>
          {item.text}
          <button
            type="button"
            aria-label={`remove ${item.label} ${item.text}`}
            onClick={() => removeHidden(item.group, item.value)}
            className="rounded-full p-0.5 hover:bg-background"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      <div className="ml-auto flex items-center gap-2">
        <Select
          value={filters.sort}
          onValueChange={(value) => onUpdate({ sort: value as SortMode })}
          items={SORT_LABEL}
        >
          <SelectTrigger size="sm" data-testid="sort-select" className="w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {SORT_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={1}
          value={[filters.view]}
          // A view of "" is not a thing, so an empty value is dropped rather
          // than written to the hash.
          onValueChange={(value) => {
            const next = (value as string[])[0];
            if (next) onUpdate({ view: next as ViewMode });
          }}
          aria-label="gallery or table"
        >
          <ToggleGroupItem value="gallery" data-testid="view-gallery" className={`h-8 px-2.5 text-xs ${CHIP_ON}`}>
            Gallery
          </ToggleGroupItem>
          <ToggleGroupItem value="table" data-testid="view-table" className={`h-8 px-2.5 text-xs ${CHIP_ON}`}>
            Table
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Gallery-only: a table has no columns to widen, so the control would
            be a no-op there — hiding it beats growing a dead control. */}
        {filters.view === "gallery" ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] whitespace-nowrap text-muted-foreground">columns · {columns}</span>
            <Slider
              data-testid="columns-slider"
              className="w-24 data-[orientation=horizontal]:w-24"
              min={MIN_COLUMNS}
              max={MAX_COLUMNS}
              step={1}
              // Base UI derives its thumbs from the value ARRAY; a scalar falls
              // back to [min, max] and paints two thumbs on one pixel.
              value={[columns]}
              onValueChange={(next) => onColumnsChange(Array.isArray(next) ? next[0] : next)}
              aria-label="gallery columns"
            />
          </div>
        ) : null}

        <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
        <span data-testid="result-count" className="text-[11px] whitespace-nowrap text-muted-foreground">
          {filteredCount} of {total}
        </span>
      </div>
    </div>
  );
}
