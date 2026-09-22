// src/chrome/sites.ts — the burger's two doors OUT of the board: the deployed
// component site (bbox-ui.com) and the local Storybook.
//
// Zach, 2026-09-21: "please connect the bbox whiteboard app to open when I
// press bbox-ui, and then somewhere in that whiteboard app in a drop down
// menu somewhere give the option to open the bbox-ui.com site and the
// storybook site". The dock icon is the first half (assets/bbox-ui.desktop
// now runs scripts/launch_systemsketch.py); these rows are the second.
//
// WHY they open a NEW window instead of navigating this one — the opposite
// of ./legacyApp.ts, deliberately: the archived app is the SAME artifact one
// version back, so stepping the window across and coming home with Alt+← is
// right there. The docs site and Storybook are different things entirely,
// and navigating away would put a board with unsaved work behind a Back
// button. `noopener` because a `window.opener` handle on this app from a
// deployed origin buys nothing and costs a same-process tab.
//
// WHY the Storybook row is loopback-only while bbox-ui.com is not: the site
// is deployed and reachable from any origin; Storybook is a dev server on
// this machine, so from anywhere else the row would point at nothing. Absent
// beats broken — the same rule, for the same reason, as ./legacyApp.ts.
//
// WHY the LAUNCHER is what starts Storybook and not this row: a page cannot
// start a process. `scripts/launch_systemsketch.py --open` brings :5421 up
// before the window opens, exactly as it already does for the archived app's
// Stable server. Press the row without that launcher (a bare `vite dev`, say)
// and you get a connection-refused tab — which is why the launcher, not this
// file, is the thing that had to change.
import { createElement, useEffect, useMemo, useState } from "react";
import { BookOpen, Globe } from "lucide-react";

import type { MenuAction } from "@trunk/editor/chromeBar";

import { describeStatus, probeSiteStatus, statusMismatchesOwn, type SiteStatus } from "./siteStatus";

/** The deployed component site. Redeploys itself on every push to `main`. */
export const BBOX_UI_SITE_URL: string =
  (import.meta.env.VITE_BBOX_UI_SITE_URL as string | undefined) ?? "https://bbox-ui.com/";

/**
 * The Storybook Zach reviews — `apps/storybook-basics` on its own port
 * (its package.json: `storybook dev -p ${STORYBOOK_PORT:-5421}`).
 *
 * WHY a dev server and not a pinned build like this app's Stable channel:
 * Storybook here IS the live trunk by design — it is the surface lanes
 * deliver into and he watches change — so pinning it would show him the one
 * thing it exists not to show.
 */
export const STORYBOOK_URL: string =
  (import.meta.env.VITE_STORYBOOK_URL as string | undefined) ?? "http://127.0.0.1:5421/";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const openInNewWindow = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

/** The "open another bbox-ui surface" rows for `hostname`. */
export function siteActionsFor(
  hostname: string,
  open: (url: string) => void = openInNewWindow,
): MenuAction[] {
  const rows: MenuAction[] = [
    {
      id: "open-bbox-ui-site",
      label: "Open bbox-ui.com",
      icon: createElement(Globe),
      run: () => open(BBOX_UI_SITE_URL),
    },
  ];
  if (LOOPBACK_HOSTS.has(hostname)) {
    rows.push({
      id: "open-storybook",
      label: "Open Storybook",
      icon: createElement(BookOpen),
      run: () => open(STORYBOOK_URL),
    });
  }
  return rows;
}

const STATUS_POLL_MS = 5000;

/**
 * `siteActionsFor`, live: same rows, same order, same ids — `sites.test.ts`
 * keeps asserting the plain function's exact labels — but each row's
 * `label` grows a status suffix (`describeStatus`) and a dead loopback row
 * is `disabled` rather than left to open a connection-refused tab (Zach,
 * 2026-09-22: "Rows must degrade honestly... if nothing is listening on the
 * port, say so in the row rather than opening a connection-refused tab").
 *
 * WHY a hook and not a wrapper around the plain function: the label has to
 * change as `/api/health` answers come back and 5s later go stale, which
 * needs state and an effect — `siteActionsFor` itself stays synchronous and
 * untouched (see siteStatus.ts's own header for why the two are split).
 */
export function useSiteActionsWithStatus(
  hostname: string,
  open: (url: string) => void = openInNewWindow,
): readonly MenuAction[] {
  const baseRows = useMemo(() => siteActionsFor(hostname, open), [hostname, open]);
  const urls = useMemo(() => baseRows.map((row) => rowUrl(row)), [baseRows]);
  const [ownStatus, setOwnStatus] = useState<SiteStatus>({ kind: "unknown" });
  const [statuses, setStatuses] = useState<readonly SiteStatus[]>(() => urls.map(() => ({ kind: "unknown" })));

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      probeSiteStatus(window.location.origin).then((status) => {
        if (!cancelled) setOwnStatus(status);
      });
      Promise.all(urls.map((url) => probeSiteStatus(url))).then((next) => {
        if (!cancelled) setStatuses(next);
      });
    };
    poll();
    const interval = setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // `urls` is derived from `baseRows`, which is itself memoized on
    // `hostname`/`open` — including it directly would re-subscribe every
    // render since arrays are never `===`-equal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, open]);

  return useMemo(
    () =>
      baseRows.map((row, index) => {
        const status = statuses[index] ?? { kind: "unknown" };
        const suffix = describeStatus(status);
        const mismatch = statusMismatchesOwn(status, ownStatus);
        return {
          ...row,
          label: suffix ? `${row.label} ${suffix}${mismatch ? " — different from this board" : ""}` : row.label,
          disabled: row.disabled || status.kind === "dead",
        };
      }),
    [baseRows, statuses, ownStatus],
  );
}

function rowUrl(row: MenuAction): string {
  // WHY re-derive the URL from the row's id rather than have siteActionsFor
  // expose it: MenuAction has no url field (MENU-KIT-DESIGN §5 — a row is
  // id/label/icon/run, run is opaque), and adding one would be a trunk
  // contract change for a need only this app-wiring hook has.
  if (row.id === "open-bbox-ui-site") return BBOX_UI_SITE_URL;
  if (row.id === "open-storybook") return STORYBOOK_URL;
  return BBOX_UI_SITE_URL;
}
