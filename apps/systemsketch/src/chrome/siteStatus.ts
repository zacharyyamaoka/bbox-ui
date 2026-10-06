// src/chrome/siteStatus.ts — probes what a burger-menu "open another
// surface" row actually points at right now, so the row can say so instead
// of leaving Zach to assume.
//
// Zach, 2026-09-22, on ./sites.ts's "Open bbox-ui.com" / "Open Storybook"
// rows: "When I open storybook and bbox-ui, I assume that they will be on
// the same version as the whiteboard? as they are all being served from the
// same repo right?" They are not, necessarily — bbox-ui.com is whatever is
// deployed, Storybook is whatever checkout started that dev server, and the
// whiteboard is a third. This module answers "what IS that, right now" by
// asking each candidate's own `/api/health` (the same path
// scripts/bboxui_server.py's Stable servers answer, the same shape the
// dev-server status plugins — apps/systemsketch/statusEndpoint.ts,
// apps/storybook-basics/.storybook/statusEndpoint.ts — answer for Preview,
// and the same shape scripts/launch_systemsketch.py's dock server answers
// for the pinned Stable whiteboard).
//
// WHY this lives apart from sites.ts rather than folding into it:
// `siteActionsFor` is a plain, synchronous function with an existing test
// (`sites.test.ts`) pinning its exact labels — turning it into something
// that polls and re-renders would break that contract for no reason. This
// module is the live layer; `useSiteActionsWithStatus` (bottom of
// sites.ts) is the seam that composes the two.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type SiteStatus =
  | { kind: "remote" }
  | { kind: "unknown" }
  | { kind: "dead" }
  | { kind: "unsupported"; reason: string }
  | {
      kind: "live";
      product: string;
      channel: "preview" | "stable";
      commit: string | null;
      branch: string | null;
      dirty: boolean | null;
      checkoutId: string | null;
      build: string | null;
    };

function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * What `url` is serving right now. A non-loopback URL is always `"remote"`
 * without a network call — bbox-ui.com is the deployed site by definition,
 * and there's nothing local to go stale, so probing it would just be a
 * wasted request on every menu poll.
 *
 * Four outcomes for a loopback URL, and the distinction between the middle
 * two is the judge's 2026-09-22 finding:
 *
 * - `live` — a health document that names one of `expectProducts` AND a
 *   channel this app understands. Anything less is NOT live: the old body
 *   accepted ANY JSON object and coerced every channel that was not the
 *   literal `"stable"` into `"preview"`, so an unrelated dev server on the
 *   port was reported as a Storybook Preview, `product` unread.
 * - `unsupported` — something IS listening and answered over HTTP, but not
 *   with a health document this app can read: a static `storybook build`
 *   behind a plain file server (no `/api/health` at all), a different
 *   product, a newer channel vocabulary. The row must stay ENABLED — the
 *   surface works, pressing it opens it, we simply cannot name its version.
 *   The old code called this `dead` and DISABLED the row, which is the
 *   inverse mistake: it took away a working door.
 * - `dead` — nothing answered. Connection refused, or no answer before the
 *   timeout. Only this disables a row.
 * - `unknown` — no probe has resolved yet. Never disables anything.
 *
 * Never throws, so a caller can render it in a row without a try/catch of
 * its own, and never a silent success, per
 * `feedback_verify_before_asserting`'s "absence IS the finding."
 */
export async function probeSiteStatus(
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; expectProducts?: readonly string[] } = {},
): Promise<SiteStatus> {
  if (!isLoopbackUrl(url)) return { kind: "remote" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const expected = options.expectProducts;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);
  try {
    const response = await fetchImpl(new URL("/api/health", url).toString(), { signal: controller.signal });
    // WHY any HTTP response at all counts as "reachable": a 404 is a server
    // saying "I am here and I have no such route" — that is a working
    // surface without this protocol, not a dead port. Only a transport
    // failure means nothing is listening.
    if (!response.ok) return { kind: "unsupported", reason: `HTTP ${response.status}` };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { kind: "unsupported", reason: "response was not JSON" };
    }
    if (typeof payload !== "object" || payload === null) return { kind: "unsupported", reason: "not a health document" };
    const record = payload as Record<string, unknown>;
    const product = typeof record.product === "string" ? record.product : null;
    if (product === null) return { kind: "unsupported", reason: "no product named" };
    if (expected && !expected.includes(product)) {
      return { kind: "unsupported", reason: `serving ${product}` };
    }
    if (record.channel !== "preview" && record.channel !== "stable") {
      return { kind: "unsupported", reason: `unknown channel ${String(record.channel)}` };
    }
    return {
      kind: "live",
      product,
      channel: record.channel,
      commit: typeof record.commit === "string" ? record.commit : null,
      branch: typeof record.branch === "string" ? record.branch : null,
      dirty: typeof record.dirty === "boolean" ? record.dirty : null,
      checkoutId: typeof record.checkoutId === "string" ? record.checkoutId : null,
      build: typeof record.build === "string" ? record.build : null,
    };
  } catch {
    // AbortError (timed out) and TypeError (refused) alike: nothing answered.
    return { kind: "dead" };
  } finally {
    clearTimeout(timeout);
  }
}

/** The row-label suffix, e.g. `"(preview · lane-x@a1b2c3d)"`. `""` while
 *  still probing (`kind: "unknown"`) so a row shows its plain label rather
 *  than flash a placeholder on first render. */
export function describeStatus(status: SiteStatus): string {
  switch (status.kind) {
    case "unknown":
      return "";
    case "remote":
      return "(remote)";
    case "dead":
      return "(not running)";
    case "unsupported":
      // Honest about the limit rather than about the surface: it is there,
      // it just does not say what it is built from.
      return "(static/unknown)";
    case "live": {
      const sha = status.commit ? status.commit.slice(0, 7) : status.build ? status.build.slice(0, 7) : null;
      const parts = [status.channel as string];
      if (status.branch) parts.push(status.branch);
      if (sha) parts.push(sha);
      if (status.dirty) parts.push("+uncommitted");
      return `(${parts.join(" · ")})`;
    }
  }
}

/**
 * True when `target` is demonstrably a different checkout/commit than
 * `own` — the whiteboard window's own status, from the SAME probe against
 * `window.location.origin`. True when EITHER known signal disagrees: a
 * different `checkoutId` (a different worktree is a mismatch even at the
 * same commit — the whole point of worktree isolation is that two of them
 * CAN share a commit and still be different trees to look at), or the same
 * checkout with a different `commit` (the tree moved between probes).
 *
 * A signal missing on either side is skipped, not treated as a mismatch: an
 * honest "can't tell" beats a false alarm. That degradation used to swallow
 * the ONE case that matters, because the dock's Stable whiteboard answered
 * with neither field — see `scripts/launch_systemsketch.py`'s
 * `health_document`, which now carries both, and the test below that pins it.
 */
export function statusMismatchesOwn(target: SiteStatus, own: SiteStatus): boolean {
  if (target.kind !== "live" || own.kind !== "live") return false;
  if (target.checkoutId && own.checkoutId && target.checkoutId !== own.checkoutId) return true;
  if (target.commit && own.commit && target.commit !== own.commit) return true;
  return false;
}
