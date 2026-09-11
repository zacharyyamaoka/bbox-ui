export * from "./layout";
export * from "./blockLayout";

// The cascade's shared appearance vocabulary (Lane A) — imported by
// Port/Pill/Block below, exported here so a consumer never has to reach
// past the barrel for a bundle field. See docs/T1-SPEC.md §2.
export * from "./appearance";
export * from "./appearance.fields";

export * from "./glyph.layout";
export * from "./glyph.fields";
export * from "./glyph";

export * from "./textBox.layout";
export * from "./textBox.fields";
export * from "./textBox";

export * from "./pill.fields";
export * from "./pill.presets";
export * from "./pill";

export * from "./rowContainer.fields";
export * from "./rowContainer";

export * from "./stack.fields";
export * from "./stack";

// PortEdge imports its BlockSide/PortTextLayout vocabulary from
// port.layout.ts (not the frozen layout.ts — see port.layout.ts's own
// header and portEdge.fields.ts's deviation note), so it has no ordering
// dependency on Port below beyond that shared import.
export * from "./portEdge.fields";
export * from "./portEdge";

// port.layout.ts intentionally shares names with layout.ts's now-deleted
// old Port section (docs/T1-SPEC.md §0) — nothing left to collide with.
export * from "./port.layout";
export * from "./port.fields";
export * from "./port.presets";
export * from "./port";

export * from "./block.fields";
export * from "./block.presets";
export * from "./block";

export { cn } from "./lib/utils";
