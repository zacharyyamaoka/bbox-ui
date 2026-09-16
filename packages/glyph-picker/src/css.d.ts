// A plain CSS side-effect import (`import "./glyph-picker.css"`) has no
// exports `tsc` can type — Vite/Storybook (and any consumer's own bundler)
// handle the actual asset; this just keeps `tsc -p tsconfig.json` from
// erroring on a module specifier it has no declaration for. No other
// package here imports a `.css` file from `.tsx` (panel.css is exported,
// never imported internally), so there was no existing declaration to
// reuse.
declare module "*.css";
