import type { Metadata } from "next";
import { Workbench } from "@/components/create/workbench";

export const metadata: Metadata = {
  title: "Create — bbox-ui",
  description:
    "Configure bbox-ui components live: one inspector over one schema, previewed as plain DOM, as code, and on React Flow and tldraw canvases.",
};

/**
 * /create — bbox-ui's own version of ui.shadcn.com/create.
 *
 * WHY a page in the site and not a separate demo: Zach, 2026-09-11 — "to
 * avoid having to duplicate a lot of work, let's migrate this into our
 * bbox-ui.com website." The engine lives in @bbox-ui/panel; this route is the
 * site's shell around it, the same way demos/inspector is Vite's.
 */
export default function CreatePage() {
  return <Workbench />;
}
