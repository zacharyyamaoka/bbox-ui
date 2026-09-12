import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: [
    "@takumi-rs/core",
    "@takumi-rs/image-response",
    "takumi-js",
  ],
  output: "export",
  reactStrictMode: true,
  // WHY: Next 16 refuses its own dev resources (/_next/hmr and friends) when
  // the page is opened by IP instead of by "localhost". The HTML still serves,
  // so the page LOOKS fine and silently never hydrates - no click handler
  // responds and no error is printed. Cost a headless journey an hour on
  // 2026-09-11. Allowing the loopback IP makes both spellings behave alike.
  allowedDevOrigins: ["127.0.0.1"],
};

export default withMDX(config);
