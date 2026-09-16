// Desktop-tooling code living inside the real site source — surprising, so
// spelling it out: this only renders for the local `next dev` Preview
// channel spawned by scripts/bbox_release.py's ensure_preview_server(), which
// sets NEXT_PUBLIC_BBOXUI_CHANNEL=preview on that one process's environment.
// Every real build (Stable's static export, and the deployed bbox-ui.com
// Cloudflare build via `pnpm docs:build`) never sets that var, so the guard
// below makes this whole component inert dead code there.
"use client";

import { useEffect, useState } from "react";

// WHY the port is read from the environment rather than pinned to 5194:
// launch_bboxui.py honours BBOXUI_STABLE_PORT, so a Stable server moved off the
// default would otherwise get health-polled and promote-POSTed on a port nothing
// is listening on — the badge would sit there reporting a mismatch forever and
// its one button would fail. bbox_release.py forwards the same value.
const STABLE_PORT = process.env.NEXT_PUBLIC_BBOXUI_STABLE_PORT || "5194";
const STABLE_ORIGIN = `http://127.0.0.1:${STABLE_PORT}`;

type LiveHealth = {
  liveMatchesStable?: boolean;
};

export function PreviewChannelBadge() {
  // WHY two conditions and not just the channel: the channel var is an ordinary
  // NEXT_PUBLIC_* value, which Next inlines at BUILD time from whatever ambient
  // environment the build inherits. One `NEXT_PUBLIC_BBOXUI_CHANNEL=preview
  // pnpm docs:build` — a shell that happens to still carry it, a CI step that
  // exports it — would bake this dev overlay into the deployed bbox-ui.com, and
  // into Stable's static export where bboxui_badge.js already injects its own
  // badge (two overlays, one page). Preview is the only channel that is a `next
  // dev` process, so NODE_ENV separates it from every real build mechanically,
  // independent of what the environment happens to hold.
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.NEXT_PUBLIC_BBOXUI_CHANNEL !== "preview") return null;
  return <PreviewChannelBadgeImpl />;
}

// WHY split into an inner component: the early return above must run before
// any hook, and a bare `if` before hooks in the same component would trip
// the rules-of-hooks lint the moment the guard toggles across renders (it
// never does here, but keeping the hook-bearing component unconditional is
// the locally-obvious, lint-clean shape).
function PreviewChannelBadgeImpl() {
  const [matches, setMatches] = useState<boolean | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHealth = () => {
    fetch(`${STABLE_ORIGIN}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error(`health failed: ${response.status}`);
        return response.json() as Promise<LiveHealth>;
      })
      .then((payload) => setMatches(Boolean(payload.liveMatchesStable)))
      .catch(() => setMatches(null));
  };

  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleBuild = () => {
    setBuilding(true);
    setError(null);
    fetch(`${STABLE_ORIGIN}/api/promote`, { method: "POST" })
      .then((response) => {
        if (!response.ok) throw new Error(`promote failed: ${response.status}`);
        return response.json();
      })
      .then(() => {
        setBuilding(false);
        refreshHealth();
      })
      .catch(() => {
        setBuilding(false);
        setError("Build failed — retry");
      });
  };

  return (
    <div
      style={{
        position: "fixed",
        // WHY bottom-LEFT, offset past Next's own dev indicator: bottom-right is
        // where /create's inspector column ends, and this overlay is 292x53 of
        // opaque chrome at z-index max — scrolled to the bottom of a long
        // inspector, real controls sat underneath it and could not be clicked
        // (measured on 1280x720: badge at x=972,y=651 directly over the
        // inspector's own scroll container). A dev affordance must never eat a
        // control of the app it is monitoring.
        left: 64,
        bottom: 16,
        zIndex: 2147483647,
        font: "12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        background: "rgba(20,20,22,0.92)",
        color: "#e8e8ea",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        // Belt-and-braces for the same reason as the reposition: only the button
        // itself should ever intercept a press, so the badge's own padding and
        // background can never swallow a click meant for whatever is beneath it.
        pointerEvents: "none",
      }}
    >
      <span style={{ opacity: 0.85 }}>bbox-ui · Preview</span>
      {matches ? (
        <span>Stable matches Preview</span>
      ) : (
        <button
          type="button"
          disabled={building}
          onClick={handleBuild}
          style={{
            pointerEvents: "auto",
            appearance: "none",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "#2b6cff",
            color: "#fff",
            font: "inherit",
            fontWeight: 600,
            padding: "6px 10px",
            borderRadius: 7,
            cursor: building ? "default" : "pointer",
          }}
        >
          {error ?? (building ? "Building…" : "Build Stable From Preview")}
        </button>
      )}
    </div>
  );
}
