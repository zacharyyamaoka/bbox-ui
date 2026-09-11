import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // WHY a relative base: this demo is published beside the Storybook on GitHub
  // Pages under /bbox-ui/inspector/, so absolute asset paths would 404 there.
  base: "./",
  server: { port: 5421, strictPort: true },
});
