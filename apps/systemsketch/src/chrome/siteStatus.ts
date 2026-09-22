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
// scripts/bboxui_server.py's Stable servers answer, and the same shape the
// dev-server status plugins — apps/systemsketch/statusEndpoint.ts,
// apps/storybook-basics/.storybook/statusEndpoint.ts — answer for Preview).
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
  | {
      kind: "live";
      channel: "preview" | "stable";
      commit: string | null;
      branch: string | null;
      dirty: boolean | null;
      projectRoot: string | null;
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
 * A loopback URL that never answers `/api/health` (nothing listening, or a
 * server that doesn't speak this protocol) comes back `"dead"` — never an
 * exception, so a caller can render it in a row without a try/catch of its
 * own, and never a silent success, per `feedback_verify_before_asserting`'s
 * "absence IS the finding."
 */
export async function probeSiteStatus(
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SiteStatus> {
  if (!isLoopbackUrl(url)) return { kind: "remote" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);
  try {
    const response = await fetchImpl(new URL("/api/health", url).toString(), { signal: controller.signal });
    if (!response.ok) return { kind: "dead" };
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) return { kind: "dead" };
    const record = payload as Record<string, unknown>;
    const channel = record.channel === "stable" ? "stable" : "preview";
    return {
      kind: "live",
      channel,
      commit: typeof record.commit === "string" ? record.commit : null,
      branch: typeof record.branch === "string" ? record.branch : null,
      dirty: typeof record.dirty === "boolean" ? record.dirty : null,
      projectRoot: typeof record.projectRoot === "string" ? record.projectRoot : null,
      build: typeof record.build === "string" ? record.build : null,
    };
  } catch {
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
 * different `projectRoot` (a different worktree is a mismatch even at the
 * same commit — the whole point of worktree isolation is that two of them
 * CAN share a commit and still be different trees to look at), or the same
 * `projectRoot` with a different `commit` (the tree moved between probes).
 * A signal missing on either side is simply skipped, not treated as a
 * mismatch — the dock's existing thin /api/health, which carries `build`
 * but not `projectRoot` or `commit`, degrades to "can't tell" (`false`)
 * rather than a false alarm.
 */
export function statusMismatchesOwn(target: SiteStatus, own: SiteStatus): boolean {
  if (target.kind !== "live" || own.kind !== "live") return false;
  if (target.projectRoot && own.projectRoot && target.projectRoot !== own.projectRoot) return true;
  if (target.commit && own.commit && target.commit !== own.commit) return true;
  return false;
}
