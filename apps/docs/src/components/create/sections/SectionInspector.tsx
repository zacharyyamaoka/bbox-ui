"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SectionPanelVariant } from "@bbox-ui/panel";
import { TIER_META, TIER_ORDER, loadStoredTier, storeTier, type Tier } from "@bbox-ui/panel";
import { buildSections, listIdsIn, type BuildSectionsInput } from "./build-sections";

/**
 * The sections host: owns the three pieces of state a section design must
 * NOT own — the detail tier, the filter query and which member lists are
 * folded — builds the sections once, and hands them to whichever design is
 * selected.
 *
 * WHY tier/filter/fold live here and not in each design: they are filters
 * over the same content, orthogonal to how a section is drawn (the exact
 * argument `fieldTiers.ts` already makes for itself). Five designs owning
 * five copies is how this repo previously ended up with six implementations
 * of one provenance model and four answers.
 */
export function SectionInspector({
  variant,
  ...rest
}: { variant: SectionPanelVariant } & Omit<BuildSectionsInput, "tier" | "filter" | "foldedLists" | "onToggleFold">) {
  // WHY the stored tier is read in an effect and not in the initialiser,
  // even though `loadStoredTier` is already try/caught: on the server the
  // catch returns "simple", so a client whose localStorage says "expert"
  // renders a different first tree than the HTML it hydrates — React
  // throws "Hydration failed because the server rendered text didn't
  // match", regenerates the tree, and the tier buttons flicker. Same rule
  // workbench.tsx already keeps for its own persisted choices.
  const [tier, setTier] = useState<Tier>("simple");
  const [filter, setFilter] = useState("");
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    setTier(loadStoredTier());
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) storeTier(tier);
  }, [restored, tier]);

  const sections = useMemo(
    () =>
      buildSections({
        ...rest,
        tier,
        filter,
        foldedLists: folded,
        onToggleFold: (listId) =>
          setFolded((prev) => {
            const next = new Set(prev);
            if (next.has(listId)) next.delete(listId);
            else next.add(listId);
            return next;
          }),
      }),
    // `rest` is rebuilt every render by the column above, so the memo keys
    // on the values that actually change what is built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest.subject, rest.subjects, rest.instances, rest.fields, rest.presets, rest.componentName, tier, filter, folded],
  );

  // Fold state for a list that no longer exists is dropped, so reselecting
  // a Block does not reopen with a stale fold from a different subject.
  const liveIds = listIdsIn(sections).join("|");
  useEffect(() => {
    setFolded((prev) => {
      const live = new Set(liveIds.split("|").filter(Boolean));
      const next = new Set(Array.from(prev).filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [liveIds]);

  const searching = filter.trim() !== "";
  const shown = sections.reduce((n, s) => n + s.rows.filter((r) => r.kind !== "list").length, 0);

  const controlBar = (
    <div data-slot="section-control-bar" style={controlBarStyle}>
      <div role="group" aria-label="Detail level" style={tierGroupStyle}>
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            data-slot="tier-button"
            data-tier={t}
            data-active={t === tier && !searching}
            onClick={() => setTier(t)}
            title={TIER_META[t].hint}
            style={tierButtonStyle(t === tier, searching)}
          >
            {TIER_META[t].label}
          </button>
        ))}
      </div>
      <input
        data-slot="field-filter"
        type="search"
        value={filter}
        placeholder="Filter…"
        aria-label="Filter fields"
        onChange={(e) => setFilter(e.target.value)}
        style={filterInputStyle}
      />
    </div>
  );

  const notice = searching ? (
    <div data-slot="filter-note" style={noticeStyle}>
      {shown === 0 ? `Nothing matches “${filter.trim()}”.` : `${shown} row${shown === 1 ? "" : "s"} match “${filter.trim()}” — all tiers searched.`}
    </div>
  ) : null;

  return (
    <variant.Panel
      componentName={rest.componentName}
      subjectCount={rest.subjects.length}
      sections={sections}
      controlBar={controlBar}
      notice={notice}
    />
  );
}

const controlBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px 8px",
};
const tierGroupStyle: CSSProperties = {
  display: "flex",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 5,
  overflow: "hidden",
  flexShrink: 0,
};
function tierButtonStyle(active: boolean, dimmed: boolean): CSSProperties {
  return {
    padding: "2px 8px",
    fontSize: 10.5,
    border: "none",
    cursor: "pointer",
    background: active && !dimmed ? "var(--bbox-panel-fg, #222)" : "transparent",
    color: active && !dimmed ? "var(--bbox-panel-surface, #fff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
    opacity: dimmed ? 0.6 : 1,
  };
}
const filterInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 11,
  padding: "3px 7px",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 5,
  background: "var(--bbox-panel-surface, #fff)",
  color: "var(--bbox-panel-fg, #222)",
};
const noticeStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-muted, #6a6a75)", padding: "0 12px 6px" };
