import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";

/**
 * T0 SPIKE config — deliberately minimal. No addon-essentials-equivalent
 * bundle: Storybook 10 folds controls/actions/viewport/backgrounds/docs
 * into the core `storybook` package itself (subpath exports), so the only
 * thing this file adds beyond the framework is the Tailwind v4 Vite plugin
 * — everything the demos' own vite.config.ts files already do.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
    });
  },
};

export default config;
