export const siteConfig = {
  name: "bbox-ui",
  url: "https://bbox-ui.com/",
  description:
    "Presentational components for black-box system design — blocks, ports, edges.",
  links: {
    twitter: "https://github.com/zacharyyamaoka",
    github: "https://github.com/zacharyyamaoka/bbox-ui",
  },
  // WHY these five: the three kits (components / scene / editor) are the
  // project's vocabulary — the nav IS the vocabulary, per ARCHITECTURE.md's
  // "Kits and consumers". Docs fronts the map, Create is the live surface.
  navItems: [
    { href: "/docs", label: "Docs" },
    { href: "/docs/components", label: "Components" },
    { href: "/docs/scene", label: "Scene" },
    { href: "/docs/editor", label: "Editor" },
    { href: "/create", label: "Create" },
  ],
};
