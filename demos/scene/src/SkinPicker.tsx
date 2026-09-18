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
const THEME_KEY = "bbox-demo-theme";

const THEMES = ["light", "dark"] as const;
type DemoTheme = (typeof THEMES)[number];

/**
 * WHY the demos got a theme toggle at the same time the sketch skin lost
 * its fill: with a surface painted, what sits behind a Block never
 * mattered. A sketch Block is a line on the canvas, so it does — and these
 * demos run on tldraw's and React Flow's own LIGHT canvases while headless
 * Chrome reports `prefers-color-scheme: dark`, which meant dark-theme
 * tokens over a light canvas. Opaque, nobody noticed. Transparent, the
 * text was near-white on near-white.
 *
 * That mismatch was always there; transparency only exposed it. So the
 * demos default to `light` to match the canvas they actually sit on, and
 * the toggle stays so the orthogonality claim (skin x theme, 3 x 2, no
 * axis knowing the other) is something you can click rather than read.
 */
function readStoredTheme(): DemoTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  return THEMES.includes(stored as DemoTheme) ? (stored as DemoTheme) : "light";
}

function readStoredSkin(): BboxSkin {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  // A total check against the real vocabulary, not a cast: a stale value
  // from an older build (or a hand-edited devtools entry) would otherwise
  // stamp an attribute no stylesheet matches, which renders as "the
  // default" and reads as the switcher being broken.
  return BBOX_SKINS.includes(stored as BboxSkin) ? (stored as BboxSkin) : "default";
}

function chipStyle(active: boolean) {
  return {
    padding: "4px 10px",
    cursor: "pointer",
    borderRadius: 5,
    border: "1px solid " + (active ? "#f0f0f0" : "#555"),
    background: active ? "#f0f0f0" : "transparent",
    color: active ? "#151515" : "#ddd",
    font: "inherit",
  } as const;
}

export function SkinPicker() {
  const [skin, setSkin] = useState<BboxSkin>(readStoredSkin);
  const [theme, setTheme] = useState<DemoTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute(BBOX_SKIN_ATTR, skin);
    window.localStorage.setItem(STORAGE_KEY, skin);
  }, [skin]);

  // A SEPARATE attribute, written by a separate effect, read by a separate
  // block of theme.css. Nothing here coordinates the two — that is the
  // orthogonality, demonstrated rather than asserted.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

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
          style={chipStyle(skin === option)}
        >
          {BBOX_SKIN_LABELS[option]}
        </button>
      ))}
      <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          data-theme-option={option}
          onClick={() => setTheme(option)}
          style={chipStyle(theme === option)}
        >
          {option === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
