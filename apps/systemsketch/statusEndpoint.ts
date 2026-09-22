// statusEndpoint.ts — a same-origin `GET /api/health` for THIS dev server,
// so the burger menu's site rows (src/chrome/siteStatus.ts) can learn what
// commit/branch the whiteboard window itself is showing, and compare it
// against whatever a row would open.
//
// WHY this exists (Zach, 2026-09-22, on the whiteboard's own burger rows):
// "When I open storybook and bbox-ui, I assume that they will be on the same
// version as the whiteboard? as they are all being served from the same
// repo right?" — the honest answer is no, they can easily be three different
// checkouts/commits, and this is the mechanism that lets the UI say so
// instead of assuming. The dock's pinned Stable server
// (scripts/launch_systemsketch.py) already answers a THIN /api/health
// ({product, build, channel}); this is the same path's richer sibling for
// the live dev server, which has no such endpoint today. Same path,
// superset shape — src/chrome/siteStatus.ts's parser tolerates either.
//
// WHY a duplicate of apps/storybook-basics/.storybook's own status plugin
// rather than a shared module: it is ~25 lines of `git` shelling with zero
// app-specific logic, and the two live in different Vite configs with no
// existing cross-app import path (sites.ts and legacyApp.ts already
// duplicate their own LOOPBACK_HOSTS set for the same reason). Duplication
// here is the cheaper, more legible choice than inventing a workspace
// package for 25 lines.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";

// WHY `fileURLToPath(new URL(...))` and not `path.resolve(__dirname, ...)`:
// this file is `type: module`, and while Vite's OWN config loader bundles
// vite.config.ts through esbuild (which happens to shim `__dirname` back
// in — the reason a bare `__dirname` elsewhere in vite.config.ts works at
// all), that shim is a property of the config loader, not of this module —
// apps/storybook-basics/.storybook/statusEndpoint.ts is the same code
// loaded WITHOUT that shim (Storybook's main-config loader uses Node's
// native ESM loader) and threw `ReferenceError: __dirname is not defined`
// until fixed the same way. Matching it here means one pattern to trust,
// rather than "works here, breaks there."
// WHY the trailing-slash strip: fileURLToPath keeps the trailing "/" a
// directory URL resolves to, but bbox_release.py's PROJECT_ROOT (a Python
// Path) never has one — siteStatus.ts's statusMismatchesOwn compares these
// by plain string equality, so the two sides staying in the same spelling
// is what makes that comparison meaningful at all.
const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const PRODUCT = "bbox-ui-systemsketch";
const DISPLAY_NAME = "SystemSketch";

interface Provenance {
  commit: string | null;
  branch: string | null;
  dirty: boolean | null;
}

function readProvenance(root: string): Provenance {
  try {
    const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const rawBranch = execFileSync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const status = execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
    return {
      commit,
      branch: rawBranch === "HEAD" ? null : rawBranch,
      dirty: status.trim().length > 0,
    };
  } catch {
    // No git, not a checkout, or a shelled command failed — an honest
    // "unknown" (bbox_release.py's SourceProvenance does the same).
    return { commit: null, branch: null, dirty: null };
  }
}

const handleHealth: Connect.SimpleHandleFunction = (_req, res) => {
  const provenance = readProvenance(PROJECT_ROOT);
  const body = JSON.stringify({
    product: PRODUCT,
    displayName: DISPLAY_NAME,
    channel: "preview",
    commit: provenance.commit,
    branch: provenance.branch,
    dirty: provenance.dirty,
    projectRoot: PROJECT_ROOT,
  });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  // WHY "*" and not a specific origin: this is a read-only GET of
  // non-secret git metadata (no promote/mutate route lives here, unlike
  // bboxui_server.py's Stable API), and the caller is any of several
  // loopback dev ports the menu bar itself doesn't get to choose in
  // advance — restricting to one origin would just mean updating it every
  // time a new local consumer shows up.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
};

/** Dev-only — `configureServer` never runs against a production build, so
 *  this plugin has zero effect on what actually ships. */
export function statusEndpointPlugin(): Plugin {
  return {
    name: "bbox-status-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/health", handleHealth);
    },
  };
}
