// Desktop-tooling code living inside the real site source — surprising, so
// spelling it out: this only renders for the local `next dev` Preview
// channel spawned by scripts/bbox_release.py's ensure_preview_server(), which
// sets NEXT_PUBLIC_BBOXUI_CHANNEL=preview on that one process's environment.
// Every real build (Stable's static export, and the deployed bbox-ui.com
// Cloudflare build via `pnpm docs:build`) never sets that var, so the guard
// below makes this whole component inert dead code there.
"use client";

import { useEffect, useState } from "react";

const STABLE_ORIGIN = "http://127.0.0.1:5194";

type LiveHealth = {
  liveMatchesStable?: boolean;
};

export function PreviewChannelBadge() {
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
        right: 16,
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
        pointerEvents: "auto",
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
