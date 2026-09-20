# apps/systemsketch — the tldraw host

This app is the implementation that mounts bbox-ui in stock tldraw. It is not
where functionality lives — the trunk is (`../storybook-basics/src`, reached
through the one `@trunk/*` alias). Full rule and its reasons:
`../../CLAUDE.md`, "SystemSketch is the tldraw host".

Before adding code here, ask: **would a React Flow host need this too?** Yes →
it goes in the trunk and this app imports and configures it. It stays here only
if it has to name tldraw's API to exist (`ShapeUtil`, binding, tool,
`components` / `overrides`, `onMount`, the store, the licence key), or is pure
composition — which trunk part goes in which slot. Keep it thin, and say in a
`WHY:` comment what forced it to be tldraw-specific.

`README.md` here covers the alias, running the app, and its tests.
