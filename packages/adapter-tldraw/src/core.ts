// REPO-ONLY SHIM (lane L-REG, 2026-10-06) — `block-shape-util.tsx` imports the
// v1 core through this relative sibling instead of `@bbox-ui/core`.
//
// WHY: `shadcn add` copies source verbatim, and `@bbox-ui/core` is
// `private: true` and unpublished, so a shipped file naming it could never
// install (CLAUDE.md, "The registry is the product"). A relative specifier is
// one a consumer CAN resolve: the registry lands the real v1 module here.
// The `block-shape-tldraw` item does NOT ship this file; it declares a
// registryDependency on `bbox-v1-core`, which installs
// `packages/bbox-ui/src/index.ts` at `components/bbox/v1/core.ts` — beside
// `block-shape-util.tsx` — with the whole frozen-v1 closure around it. In this
// repo the same specifier resolves through the workspace package instead.
export * from "@bbox-ui/core";
