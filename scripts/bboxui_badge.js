// Floating corner control for the Stable channel only. Never shipped to the
// real bbox-ui.com — bboxui_server.py injects this into pages it serves from
// a local build. Its only job: show what Stable is pinned to, and get you
// looking at Preview (the local dev server) — the actual "build Stable from
// Preview" action lives on Preview's own badge now
// (apps/docs/src/components/dev/preview-channel-badge.tsx), since that's
// where "does Stable already match Preview" can be answered without a
// cross-origin round trip on every keystroke.
(function () {
  var state = window.__BBOXUI_STABLE__ || {};

  function formatTime(iso) {
    if (!iso) return "unknown";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  }

  var badge = document.createElement("div");
  badge.id = "bboxui-channel-badge";
  badge.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
    "font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "background:rgba(20,20,22,0.92)", "color:#e8e8ea",
    "border:1px solid rgba(255,255,255,0.14)", "border-radius:10px",
    "padding:10px 12px", "box-shadow:0 6px 24px rgba(0,0,0,0.35)",
    "display:flex", "align-items:center", "gap:10px", "pointer-events:auto"
  ].join(";");

  var shortSha = state.commit ? state.commit.slice(0, 7) : "unknown";
  var dirtySuffix = state.dirty ? " +uncommitted" : "";
  var label = document.createElement("span");
  label.textContent = "bbox-ui · Stable · " + shortSha + dirtySuffix + " · built " + formatTime(state.builtAt);
  label.title = (state.branch ? "branch " + state.branch : "") +
    (state.dirtyPaths && state.dirtyPaths.length ? "\nuncommitted: " + state.dirtyPaths.join(", ") : "");
  label.style.opacity = "0.85";

  var button = document.createElement("button");
  button.type = "button";
  button.textContent = "Switch to Preview";
  button.style.cssText = [
    "appearance:none", "border:1px solid rgba(255,255,255,0.2)", "background:#2b6cff",
    "color:#fff", "font:inherit", "font-weight:600", "padding:6px 10px",
    "border-radius:7px", "cursor:pointer"
  ].join(";");

  // WHY navigate the same window instead of opening a new one: Zach already
  // gets one --app window per channel from launch_bboxui.py's own
  // open_app() convention — "switch to" reads as replacing what this window
  // shows, not spawning a second one.
  button.addEventListener("click", function () {
    button.disabled = true;
    button.textContent = "Starting Preview…";
    fetch("/api/start-preview", { method: "POST" })
      .then(function (response) {
        if (!response.ok) throw new Error("start-preview failed: " + response.status);
        return response.json();
      })
      .then(function (payload) {
        window.location.href = payload.url;
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = "Switch failed — retry";
      });
  });

  badge.appendChild(label);
  badge.appendChild(button);
  document.body.appendChild(badge);
})();
