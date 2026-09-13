"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Density, FoldState } from "@bbox-ui/panel";
import { SectionPanel, TIER_META, TIER_ORDER, loadStoredTier, storeTier, type Tier } from "@bbox-ui/panel";
import { buildSections, listIdsIn, type BuildSectionsInput } from "./build-sections";

/**
 * The sections host: owns the four pieces of state a section design must
 * NOT own — the detail tier, the filter query, the density rung, and which
 * sections and member lists are folded — builds the sections once, and hands
 * them to the panel.
 *
 * WHY all four live here and not in the panel: they are filters and settings
 * over the same content, orthogonal to how a section is drawn (the exact
 * argument `fieldTiers.ts` already makes for itself). While three designs
 * were on the table this also kept your folds and density across a switch;
 * that reason expired with the switch, the first one did not.
 */
const DENSITY_KEY = "bbox-ui.create.inspectorDensity";

export function SectionInspector(rest: Omit<BuildSectionsInput, "tier" | "filter">) {
  // WHY the stored tier is read in an effect and not in the initialiser,
  // even though `loadStoredTier` is already try/caught: on the server the
  // catch returns "simple", so a client whose localStorage says "expert"
  // renders a different first tree than the HTML it hydrates — React throws
  // "Hydration failed because the server rendered text didn't match",
  // regenerates the tree, and the tier buttons flicker. Same rule
  // workbench.tsx already keeps for its own persisted choices.
  const [tier, setTier] = useState<Tier>("simple");
  const [density, setDensity] = useState<Density>("comfortable");
  const [filter, setFilter] = useState("");
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    setTier(loadStoredTier());
    try {
      const stored = window.localStorage.getItem(DENSITY_KEY);
      if (stored === "compact" || stored === "comfortable") setDensity(stored);
    } catch {
      /* private window: the choice still works, it just forgets */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    storeTier(tier);
    try {
      window.localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* see above */
    }
  }, [restored, tier, density]);

  /**
   * Fold state as a set of ids the user has explicitly flipped AWAY from
   * their default.
   *
   * WHY flips and not open/closed ids: the default is recomputed from each
   * section's own content on every render, so a section that gains its
   * first member (or loses its last) re-derives its state instead of being
   * stuck wherever it happened to land when the panel first mounted. A set
   * of absolute states cannot do that.
   */
  const fold: FoldState = useMemo(
    () => ({
      isOpen: (id, defaultOpen) => (flipped.has(id) ? !defaultOpen : defaultOpen),
      toggle: (id) =>
        setFlipped((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [flipped],
  );

  const sections = useMemo(
    // WHY no `renderer` argument any more: the host-owned section is built
    // whenever the subject has host facts, for every design. It stopped
    // being a design's feature on 2026-09-12 — "its just another header and
    // fields".
    () => buildSections({ ...rest, tier, filter }),
    // `rest` is rebuilt every render by the column above, so the memo keys
    // on the values that actually change what is built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest.subject, rest.subjects, rest.instances, rest.fields, rest.presets, rest.componentName, rest.render, rest.positions, tier, filter],
  );

  // Fold state for a list that no longer exists is dropped, so reselecting a
  // Block does not reopen with a stale fold from a different subject.
  const liveIds = listIdsIn(sections).join("|");
  useEffect(() => {
    setFlipped((prev) => {
      const live = new Set(liveIds.split("|").filter(Boolean));
      const next = new Set(Array.from(prev).filter((id) => !id.startsWith("list:") || live.has(id.slice(5))));
      return next.size === prev.size ? prev : next;
    });
  }, [liveIds]);

  const searching = filter.trim() !== "";
  const shown = sections.reduce((n, s) => n + s.rows.filter((r) => r.kind !== "list").length, 0);

  const setDensityChecked = useCallback((next: Density) => setDensity(next), []);

  const controlBar = (
    <div data-slot="section-control-bar" style={controlBarStyle}>
      <div role="group" aria-label="Detail level" style={groupStyle}>
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            data-slot="tier-button"
            data-tier={t}
            data-active={t === tier && !searching}
            onClick={() => setTier(t)}
            title={TIER_META[t].hint}
            style={segmentStyle(t === tier, searching)}
          >
            {TIER_META[t].label}
          </button>
        ))}
      </div>
      {/* Zach asked for this one directly, 2026-09-12: "like you can make it
          way more compact." */}
      <div role="group" aria-label="Density" style={groupStyle}>
        {(["comfortable", "compact"] as const).map((d) => (
          <button
            key={d}
            type="button"
            data-slot="density-button"
            data-density={d}
            data-active={d === density}
            onClick={() => setDensityChecked(d)}
            title={d === "compact" ? "Tighter headers and less air between sections" : "Roomier headers"}
            style={segmentStyle(d === density, false)}
          >
            {d === "comfortable" ? "Roomy" : "Compact"}
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
    <SectionPanel
      componentName={rest.componentName}
      subjectCount={rest.subjects.length}
      sections={sections}
      density={density}
      fold={fold}
      controlBar={controlBar}
      notice={notice}
    />
  );
}

const controlBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  padding: "4px 12px 8px",
};
const groupStyle: CSSProperties = {
  display: "flex",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 5,
  overflow: "hidden",
  flexShrink: 0,
};
function segmentStyle(active: boolean, dimmed: boolean): CSSProperties {
  return {
    padding: "2px 7px",
    fontSize: 10.5,
    border: "none",
    cursor: "pointer",
    // WHY emphasis and not fg/surface: fg is ink and flips near-white in
    // dark mode, so a chip filled with it became a bright pill in an
    // all-dark bar — the same class of bug FigmaDense's own tier buttons
    // were fixed for.
    background: active && !dimmed ? "var(--bbox-panel-emphasis, #16161a)" : "transparent",
    color: active && !dimmed ? "var(--bbox-panel-emphasis-fg, #ffffff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
    opacity: dimmed ? 0.6 : 1,
  };
}
const filterInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 80,
  fontSize: 11,
  padding: "3px 7px",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 5,
  background: "var(--bbox-panel-surface, #fff)",
  color: "var(--bbox-panel-fg, #222)",
};
const noticeStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-muted, #6a6a75)", padding: "0 12px 6px" };
