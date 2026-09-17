import { useEffect, useState } from "react";

import {
  BBOX_SKIN_ATTR,
  BBOX_SKIN_BLURBS,
  BBOX_SKIN_LABELS,
  BBOX_SKINS,
  type BboxSkin,
} from "@bbox-ui/core";

/**
 * The skin switcher, shared by every demo for the same reason the scene
 * itself is shared: if each host hand-rolled its own picker, a visual
 * difference between hosts could be the picker rather than the skin, which
 * is exactly the ambiguity `@bbox-ui/demo-scene` exists to remove.
 *
 * It is a LIVE control in the corner of the app, not a `?skin=` URL flag —
 * a review surface you have to type a query string to reach is one nobody
 * looks at twice (Zach, 2026-09-09).
 *
 * WHY it stamps `document.documentElement` and not a wrapper div: that is
 * the honest demonstration of the mechanism. A skin is one inherited
 * attribute, so it reaches a React Flow node and a tldraw shape — both
 * mounted deep inside their engine's own DOM, neither reachable from a
 * wrapper this component could render — without either adapter knowing
 * skins exist. Neither adapter was edited to make this work.
 */
const STORAGE_KEY = "bbox-demo-skin";

function readStoredSkin(): BboxSkin {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  // A total check against the real vocabulary, not a cast: a stale value
  // from an older build (or a hand-edited devtools entry) would otherwise
  // stamp an attribute no stylesheet matches, which renders as "the
  // default" and reads as the switcher being broken.
  return BBOX_SKINS.includes(stored as BboxSkin) ? (stored as BboxSkin) : "default";
}

export function SkinPicker() {
  const [skin, setSkin] = useState<BboxSkin>(readStoredSkin);

  useEffect(() => {
    document.documentElement.setAttribute(BBOX_SKIN_ATTR, skin);
    window.localStorage.setItem(STORAGE_KEY, skin);
  }, [skin]);

  return (
    <div
      data-testid="skin-picker"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 1000,
        display: "flex",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        background: "rgba(24,24,24,0.92)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        // The picker is chrome, not content: it must never inherit the skin
        // it is switching, or the sketch skin makes its own labels wobble.
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      {BBOX_SKINS.map((option) => (
        <button
          key={option}
          type="button"
          data-skin-option={option}
          title={BBOX_SKIN_BLURBS[option]}
          onClick={() => setSkin(option)}
          style={{
            padding: "4px 10px",
            cursor: "pointer",
            borderRadius: 5,
            border: "1px solid " + (skin === option ? "#f0f0f0" : "#555"),
            background: skin === option ? "#f0f0f0" : "transparent",
            color: skin === option ? "#151515" : "#ddd",
            font: "inherit",
          }}
        >
          {BBOX_SKIN_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
