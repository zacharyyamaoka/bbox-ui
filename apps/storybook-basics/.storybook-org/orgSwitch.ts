/**
 * The in-app proposal switch: a toolbar dropdown that jumps to the SAME story
 * in another proposal's Storybook (or today's, on :5421).
 *
 * WHY a toolbar tool, not a URL to retype: each proposal is its own server
 * (the sidebar is built server-side, so it cannot be swapped live), and
 * comparing them means flipping back and forth on one story. The story id's
 * name half (after `--`) never depends on the title, so only the title half
 * is recomputed from the table.
 */
import React from "react";
import { addons, types, type API } from "storybook/manager-api";
import { sanitize } from "storybook/internal/csf";
import data from "./story-org.json";

type Target = "today" | "a" | "b" | "c";
const PORTS: Record<Target, number> = { today: 5421, a: 5423, b: 5424, c: 5425 };
const LABELS: Record<Target, string> = {
  today: "Today (:5421)",
  a: "A · Mirror the repo",
  b: "B · Kits, then families",
  c: "C · Objects first",
};

type Row = { path: string; today: string; a: string; b: string; c: string };
const BY_PATH = new Map<string, Row>((data.rows as Row[]).map((row) => [row.path, row]));

function hrefFor(api: API, target: Target): string {
  const base = `${window.location.protocol}//${window.location.hostname}:${PORTS[target]}/`;
  const story = api.getCurrentStoryData();
  if (!story) return base;
  const row = BY_PATH.get(story.importPath.replace(/^\.\/src\//, ""));
  const namePart = story.id.split("--")[1];
  if (!row || !namePart) return base;
  return `${base}?path=/${story.type === "docs" ? "docs" : "story"}/${sanitize(row[target])}--${namePart}`;
}

function OrgSwitch({ api, current }: { api: API; current: Target }) {
  return React.createElement(
    "select",
    {
      "aria-label": "Sidebar organisation proposal",
      value: current,
      onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
        window.location.href = hrefFor(api, event.target.value as Target);
      },
      style: { font: "inherit", fontSize: 12, padding: "2px 6px", margin: "auto 6px", borderRadius: 4 },
    },
    (Object.keys(LABELS) as Target[]).map((target) =>
      React.createElement("option", { key: target, value: target }, LABELS[target]),
    ),
  );
}

export function registerOrgSwitch(current: Target) {
  addons.register("bbox-story-org", (api) => {
    addons.add("bbox-story-org/switch", {
      type: types.TOOL,
      title: "Sidebar proposal",
      render: () => React.createElement(OrgSwitch, { api, current }),
    });
  });
}
