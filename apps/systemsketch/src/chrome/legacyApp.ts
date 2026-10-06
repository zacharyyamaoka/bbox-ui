// src/chrome/legacyApp.ts — the one door back to the archived SystemSketch.
//
// Zach, 2026-09-19: "update my dock app to launch the new system sketch and
// then just have a button to switch to the old one". The dock icon now opens
// this app; this file is that button, as a row in the burger menu.
//
// WHY it navigates the SAME window rather than opening a second one: the
// archived app is the same artifact one version back, and Back (Alt+←) steps
// you home again. A page cannot start processes, so this row only works while
// the archived app's own Stable server is up (its own dock entry,
// systemsketch.desktop, starts it). The retired launcher
// (`scripts/launch_systemsketch.py`, deleted 2026-09-29 for the shared
// stable-preview-switcher runtime) used to start it on every press and share
// the old app's Chrome profile; neither survives the switch.
//
// WHY the row only exists on a loopback origin: the archived app is a local
// install on this machine, never a deployed site. Served from anywhere else,
// the row would point at nothing, so it is absent rather than broken.
// WHY this stays flat rather than moving into `TitleBar/` or `FileMenu/`: it
// is a menu ROW, consumed by `TitleBar/chromeBar.tsx` and by
// `files/session.tsx` alike. See ./README.md.
import { createElement } from "react";
import { History } from "lucide-react";

import type { MenuAction } from "@trunk/editor/chromeBar";

/** The archived SystemSketch's Stable channel (its launcher's default port). */
export const LEGACY_SYSTEMSKETCH_URL: string =
  (import.meta.env.VITE_LEGACY_SYSTEMSKETCH_URL as string | undefined) ?? "http://127.0.0.1:4321/";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The legacy-app rows for `hostname`, or none when the app is not served locally. */
export function legacyAppActionsFor(
  hostname: string,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): MenuAction[] {
  if (!LOOPBACK_HOSTS.has(hostname)) return [];
  return [
    {
      id: "switch-to-old-systemsketch",
      label: "Switch to old SystemSketch",
      icon: createElement(History),
      run: () => navigate(LEGACY_SYSTEMSKETCH_URL),
    },
  ];
}
