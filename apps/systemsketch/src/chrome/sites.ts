// src/chrome/sites.ts — the burger's two doors OUT of the board: the deployed
// component site (bbox-ui.com) and the local Storybook.
//
// Zach, 2026-09-21: "please connect the bbox whiteboard app to open when I
// press bbox-ui, and then somewhere in that whiteboard app in a drop down
// menu somewhere give the option to open the bbox-ui.com site and the
// storybook site". The dock icon is the first half (the `bbox-ui` entry
// `sps install-desktop` writes from apps/systemsketch/stable-preview.json);
// these rows are the second.
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
// WHY this row does not start Storybook: a page cannot start a process.
// The retired dock launcher (`scripts/launch_systemsketch.py`, deleted
// 2026-09-29) brought :5421 up on every press; the shared
// stable-preview-switcher runtime that replaced it runs only this app. With
// nothing on :5421 the row is probed dead and disabled (below) rather than
// opening a connection-refused tab.
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
 * Which `product` a probe of each row's URL is allowed to accept — the
 * judge's 2026-09-22 finding was that `product` was read off the health
 * document and then ignored, so any JSON on the port was reported as that
 * row's surface.
 *
 * WHY the whiteboard's OWN origin names two products and that is not a bug:
 * this app is served by two different things depending on the channel —
 * `apps/systemsketch/statusEndpoint.ts` (the `vite dev` Preview) says
 * `bbox-ui-systemsketch`, and the retired dock launcher
 * (`scripts/launch_systemsketch.py`, deleted 2026-09-29) said
 * `systemsketch-next` for the pinned Stable build. The Stable server that
 * replaced it (the shared stable-preview-switcher runtime) answers no
 * `/api/health` at all, so on Stable this probe reads "unsupported" and the
 * rows show no mismatch — the chip in the corner carries Stable's commit and
 * relation instead. `systemsketch-next` stays accepted for a window still
 * served by the old launcher until its server is stopped.
 */
const OWN_PRODUCTS = ["bbox-ui-systemsketch", "systemsketch-next"] as const;
const STORYBOOK_PRODUCTS = ["bbox-ui-storybook"] as const;

/** The products a row's URL may legitimately be serving. */
export function expectedProductsFor(rowId: string): readonly string[] | undefined {
  if (rowId === "open-storybook") return STORYBOOK_PRODUCTS;
  // bbox-ui.com is remote and never probed; anything else is unknown to us,
  // so no expectation is asserted rather than a wrong one.
  return undefined;
}

/**
 * `siteActionsFor`, live: same rows, same order, same ids, and — since
 * 2026-09-22's regression — the exact same `label` string, always.
 * `sites.smoke.test.tsx` keys a row by its rendered name and clicks it by
 * that name; folding the channel badge into `label` broke both assertions
 * ("the row is no longer named 'Open Storybook'"). The badge is instead a
 * separate `MenuAction.badge` node — its own `data-slot="site-channel-badge"`
 * element, rendered by the trunk AFTER the label
 * (`apps/storybook-basics/src/editor/chromeBar.tsx`'s `BurgerMenuEntry`) —
 * so nothing about the row's name changes no matter what the badge says.
 *
 * A dead loopback row is `disabled` rather than left to open a
 * connection-refused tab (Zach, 2026-09-22), but ONLY once a probe has
 * POSITIVELY reported it dead — every row starts (and stays, while a probe
 * is slow or never resolves) enabled, because "unknown" is not "dead" and a
 * stalled network call must never make a row unclickable.
 *
 * WHY a hook and not a wrapper around the plain function: the badge has to
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
  const products = useMemo(() => baseRows.map((row) => expectedProductsFor(row.id)), [baseRows]);
  const [ownStatus, setOwnStatus] = useState<SiteStatus>({ kind: "unknown" });
  const [statuses, setStatuses] = useState<readonly SiteStatus[]>(() => urls.map(() => ({ kind: "unknown" })));

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      probeSiteStatus(window.location.origin, { expectProducts: OWN_PRODUCTS }).then((status) => {
        if (!cancelled) setOwnStatus(status);
      });
      Promise.all(
        urls.map((url, index) => probeSiteStatus(url, { expectProducts: products[index] })),
      ).then((next) => {
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
          badge: suffix
            ? createElement(
                "span",
                { "data-slot": "site-channel-badge" },
                mismatch ? `${suffix} · different from this board` : suffix,
              )
            : undefined,
          // `status.kind === "dead"` is the ONLY thing that disables a row.
          // "unknown" (no probe answer yet, or none in flight) is never
          // treated as dead — and neither is "unsupported": something IS
          // answering there, it just does not say what it is built from, so
          // the door still works and taking it away would be the inverse of
          // the bug this probe exists to fix.
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
