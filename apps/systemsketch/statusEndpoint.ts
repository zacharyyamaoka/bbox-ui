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
// instead of assuming.
//
// WHY a duplicate of apps/storybook-basics/.storybook's own status plugin
// rather than a shared module: the two live in different Vite configs with no
// existing cross-app import path (sites.ts and legacyApp.ts already
// duplicate their own LOOPBACK_HOSTS set for the same reason). Duplication
// here is the cheaper, more legible choice than inventing a workspace
// package. The parts that MUST agree byte-for-byte across the copies —
// `checkoutId`'s digest and the Origin gate — each carry a test that pins a
// shared literal, so drift is caught rather than assumed away.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
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
// until fixed the same way.
// WHY `realpathSync`: `checkoutId` has to match Python's
// `bbox_release.checkout_id`, which hashes `Path.resolve()` — and that
// resolves symlinks. Without this, one tree reached through a symlinked
// spelling would hash as a second, different checkout and every
// cross-surface "same checkout?" answer would read "no" forever.
const PROJECT_ROOT = realpathSync(fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, ""));
const PRODUCT = "bbox-ui-systemsketch";
const DISPLAY_NAME = "bbox studio";

/**
 * The opaque id for WHICH checkout this is — sha256 of the resolved absolute
 * path, first 12 hex chars, byte-identical to `bbox_release.checkout_id`.
 *
 * WHY this replaced the absolute `projectRoot` this endpoint used to return
 * (judge finding, 2026-09-22): a comparison only ever needs equality, and
 * the path was the one field here that told a page where a private project
 * lives on disk. The digest answers the question and leaks nothing.
 */
export function checkoutId(projectRoot: string): string {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type OriginDecision = { allow: true; echo: string | null } | { allow: false; reason: string };

/**
 * Whether a request carrying this `Origin` may read the health document.
 *
 * WHY this gate exists (judge finding, 2026-09-22 — HIGH): this endpoint
 * answered every caller with `Access-Control-Allow-Origin: *`, handing out
 * the checkout's branch, commit and dirty state to ANY page in the browser.
 * Binding the listener to loopback does not help at all: a tab open on a
 * public site is itself on this machine, so the page becomes the bridge and
 * reads localhost on the attacker's behalf. Loopback binding stops the
 * network from reaching in; only an Origin check stops a page from doing it.
 *
 * - No `Origin` at all → allowed, and no CORS header is emitted. A
 *   same-origin GET sends none, and neither does curl or a Node probe.
 * - A loopback `Origin` → allowed, and echoed back exactly. Echoing the
 *   single requesting origin (with `Vary: Origin`) is what keeps a shared
 *   cache from serving one origin's allowance to another.
 * - Anything else, including a duplicated header a browser would never
 *   send → refused. `https://evil.example` gets a 403 and no header.
 */
export function decideOrigin(raw: string | string[] | undefined): OriginDecision {
  if (raw === undefined) return { allow: true, echo: null };
  if (Array.isArray(raw)) return { allow: false, reason: "duplicated Origin header" };
  // Some browsers send the literal "null" for opaque origins (a sandboxed
  // iframe, a file:// page). That is not loopback and must not be allowed.
  if (raw === "null" || raw === "") return { allow: false, reason: "opaque origin" };
  let hostname: string;
  let protocol: string;
  try {
    ({ hostname, protocol } = new URL(raw));
  } catch {
    return { allow: false, reason: "unparseable Origin" };
  }
  if (protocol !== "http:" && protocol !== "https:") return { allow: false, reason: "non-http origin" };
  if (!LOOPBACK_HOSTNAMES.has(hostname)) return { allow: false, reason: "non-loopback origin" };
  return { allow: true, echo: raw };
}

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

/** The health document this dev server serves. Exported so a test can assert
 *  the shape without standing up a Vite server. */
export function healthDocument(): Record<string, unknown> {
  const provenance = readProvenance(PROJECT_ROOT);
  return {
    product: PRODUCT,
    displayName: DISPLAY_NAME,
    channel: "preview",
    commit: provenance.commit,
    branch: provenance.branch,
    dirty: provenance.dirty,
    checkoutId: checkoutId(PROJECT_ROOT),
  };
}

const handleHealth: Connect.SimpleHandleFunction = (req, res) => {
  const decision = decideOrigin(req.headers?.origin);
  // WHY `Vary: Origin` on BOTH branches: the response body is identical
  // either way, but the allow-header is not, and a cache that ignored Origin
  // could hand one origin's allowance to the next caller.
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "application/json");
  if (!decision.allow) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: `health is loopback-only (${decision.reason})` }));
    return;
  }
  if (decision.echo !== null) res.setHeader("Access-Control-Allow-Origin", decision.echo);
  res.statusCode = 200;
  res.end(JSON.stringify(healthDocument()));
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
