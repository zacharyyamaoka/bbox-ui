export * from "./layout";
export * from "./blockLayout";

// The cascade's shared appearance vocabulary (Lane A) — imported by
// Port/Pill/Block below, exported here so a consumer never has to reach
// past the barrel for a bundle field. See docs/T1-SPEC.md §2.
export * from "./appearance";
export * from "./appearance.fields";

// The shape language (skin.css's companion) — orthogonal to both the
// appearance ladder above and theme.css's colours. No React, no host
// import, no DOM: a vocabulary plus one attribute name. See skin.ts.
export * from "./skin";
// The one part of a skin that cannot be CSS — a drawn line is geometry.
// sketchPath.ts is pure math (no React, no DOM); sketchOutline.tsx is the
// layer Block and Region both mount. See sketchPath.ts's header for what
// tldraw actually does and why none of it is a stylesheet.
export * from "./sketchPath";
export * from "./sketchOutline";

export * from "./badge.fields";
export * from "./badge";

export * from "./glyph.layout";
export * from "./glyph.fields";
export * from "./glyph";

export * from "./textBox.layout";
export * from "./textBox.fields";
export * from "./textBox";

export * from "./pill.fields";
export * from "./pill.presets";
export * from "./pill";

export * from "./flex.fields";
export * from "./flex";

export * from "./bar.presets";
export * from "./bar.fields";
export * from "./bar";

export * from "./stack.fields";
export * from "./stack";

// PortEdge imports its BlockSide/PortTextLayout vocabulary from
// port.layout.ts (not the frozen layout.ts — see port.layout.ts's own
// header and portEdge.fields.ts's deviation note), so it has no ordering
// dependency on Port below beyond that shared import.
export * from "./portEdge.fields";
export * from "./portEdge";

// The generic code text box Port's label slot now mounts (see port.tsx's
// module doc) — grammar-free by default, React-hook-bearing (unlike every
// other file this barrel exports), but still zero canvas assumptions: no
// host import here at all. `codeField.css` ships alongside `theme.css` as
// its own package.json export (a consumer imports it once, same as the
// theme).
export * from "./caretGeometry";
export * from "./fieldGesture";
export * from "./codeFieldGuards";
export * from "./codeGrammar";
export * from "./codeFieldRows";
export * from "./codeField.fields";
export * from "./codeField";

// port.layout.ts intentionally shares names with layout.ts's now-deleted
// old Port section (docs/T1-SPEC.md §0) — nothing left to collide with.
export * from "./port.layout";
export * from "./port.fields";
export * from "./port.presets";
export * from "./port";

export * from "./block.fields";
export * from "./block.presets";
export * from "./block";

// P2 "views are presets" (reports/view-switching-proposals-2026-09-11.html):
// the view vocabulary/bookkeeping, then the face renderer built on top of
// block.fields.ts's/block.presets.ts's new view preset family, above.
export * from "./block.view";
export * from "./blockFace";

// A Region composes a Block into its corner rather than being a Block
// preset (region.presets.ts's own WHY) — no ordering dependency beyond
// that shared import.
export * from "./region.fields";
export * from "./region.presets";
export * from "./region";

// The zero-dependency Port placement model (Zach, 2026-09-12) — no React,
// no DOM, no host imports; see portPlacement.ts's own header.
export * from "./portPlacement";

// The autocomplete menu — a CodeMirror extension any code field mounts
// (e.g. as a CodeField grammar's `language`); no React, no host import.
// `completionMenu.css` ships as its own package.json export, like theme.css.
export * from "./completionMenu";

// Trace — the edge primitive. Path math is host-owned (getBezierPath,
// tldraw's arrow info); this is the paint, plus the pure dash-cadence
// geometry it's built from. See trace.fields.ts's own header for the one
// deviation from reports/trace-edge-primitive-proposal-2026-09-14.html.
export * from "./trace.layout";
export * from "./trace.fields";
export * from "./trace";

export { cn } from "./lib/utils";
