import type { Decorator, Preview } from "@storybook/react-vite";

import { DomHost, ReactFlowHost, TldrawHost } from "@bbox-ui/story-hosts";

import "./preview.css";

/**
 * THE MECHANISM UNDER TEST (component-proposal report, Section 5): one
 * Storybook global ("host") driven by a toolbar dropdown, read by one
 * decorator that picks a host component from this map and wraps the story
 * in it. The host wrappers themselves live in @bbox-ui/story-hosts
 * (demos/story-hosts) — never here, never in packages/bbox-ui.
 */
const HOSTS = {
  dom: DomHost,
  reactflow: ReactFlowHost,
  tldraw: TldrawHost,
} as const;

type HostName = keyof typeof HOSTS;

const withHost: Decorator = (Story, context) => {
  const hostName = (context.globals.host as HostName | undefined) ?? "dom";
  const Host = HOSTS[hostName];
  // `key={hostName}` forces a full remount on switch — a live tldraw Editor
  // or React Flow instance from the PREVIOUS host must not survive into the
  // next one, or the "did tldraw actually mount" question goes unanswered
  // the second time you flip the dropdown.
  return (
    <Host key={hostName}>
      <Story />
    </Host>
  );
};

const preview: Preview = {
  decorators: [withHost],
  globalTypes: {
    host: {
      name: "Host",
      description: "Where the story is mounted",
      toolbar: {
        icon: "browser",
        items: [
          { value: "dom", title: "Plain DOM" },
          { value: "reactflow", title: "React Flow node" },
          { value: "tldraw", title: "tldraw shape" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    host: "dom",
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
