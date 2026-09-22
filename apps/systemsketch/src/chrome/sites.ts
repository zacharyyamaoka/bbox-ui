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
import { createElement } from "react";
import { BookOpen, Globe } from "lucide-react";

import type { MenuAction } from "@trunk/components/chromeBar";

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
