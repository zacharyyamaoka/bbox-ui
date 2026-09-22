// statusEndpoint.ts — a same-origin `GET /api/health` for `storybook dev`,
// so anything probing this port (this product's own manager-head.html
// badge, or the SystemSketch whiteboard's burger-menu rows) can learn what
// commit/branch is being served here — including on Zach's own persistent
// review Storybook (:5421), not just the Stable/Preview pair this pass
// added (:5430/:5431). Same contract, same reasoning as
// apps/systemsketch/statusEndpoint.ts (duplicated rather than shared for
// the same reason — see that file's own WHY).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";

// WHY `fileURLToPath(new URL(...))` and not `path.resolve(__dirname, ...)`:
// this file is `type: module` and Storybook's own main-config loader
// evaluates it through Node's native ESM loader rather than Vite's
// esbuild-bundled config transform (which is what lets
// apps/systemsketch/vite.config.ts get away with a bare `__dirname`) —
// `__dirname` is simply undefined here, confirmed by a real `storybook dev`
// run throwing `ReferenceError: __dirname is not defined in ES module
// scope` before this fix. `import.meta.url` is the portable ESM-native
// equivalent, already used the same way in devFileHost.ts.
// Trailing-slash stripped to match bbox_release.py's PROJECT_ROOT spelling
// (a Python Path, never slash-terminated) — see
// apps/systemsketch/statusEndpoint.ts's identical WHY.
const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "");
const PRODUCT = "bbox-ui-storybook";
const DISPLAY_NAME = "bbox-ui Storybook";

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
  // WHY "*": read-only git metadata, no mutation route on this server at
  // all (promote/start-preview live on the Python Stable server, a
  // different port) — see apps/systemsketch/statusEndpoint.ts's own WHY.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(body);
};

/** Dev-only — never runs against `storybook build`'s static output, which
 *  is why bboxui_server.py (serving that output) needs its own /api/health
 *  route instead; this plugin only ever answers for `storybook dev`. */
export function statusEndpointPlugin(): Plugin {
  return {
    name: "bbox-status-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/health", handleHealth);
    },
  };
}
