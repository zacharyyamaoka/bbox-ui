/**
 * packages/bbox-ui/src/block.presets.ts
 *
 * `BLOCK_PRESETS` is Block's first real preset family (P2 "views are
 * presets", reports/view-switching-proposals-2026-09-11.html): `view`
 * (`block.fields.ts`'s `VIEW_FIELD`) selects one of three mutually
 * exclusive alternatives, each governing a CLOSED set of eight fields —
 * header/ports/members/description/typePlacement/footer, plus width and
 * height — through the SAME `resolveField` cascade Pill's `state` already
 * runs (`pill.presets.ts`). `blockFace.tsx`'s renderer resolves every
 * governed field through this cascade and is a TOTAL LOOKUP over the
 * result; it never branches on `view` directly, so a panel tracing "why
 * does this field have this value" is tracing the exact computation that
 * produced the pixels, not a second, informal description of it.
 *
 * `state`/`tone` are UNAFFECTED by any of this: `Block` still forwards
 * them to its internal `<BlockChip>` (a `<Pill>` wrapper), which resolves
 * its OWN `PILL_PRESETS` — chip paint stays there, exactly as
 * `block.fields.ts`'s own module doc already describes. `view`'s governed
 * set never touches a paint field, so the two preset families (`"view"`
 * here, `"state"` inside the chip's own `Pill`) never collide —
 * `assertDisjointPresets` only ever sees this file's own selector.
 */
import type { PresetSpec } from "./schema";
import { BLOCK_VIEWS, BLOCK_VIEW_DEFAULT_SIZES, BLOCK_VIEW_LABELS, type BlockView } from "./block.view";
import type {
  BlockHeaderMode,
  BlockMembersMode,
  BlockPortsMode,
  BlockTypePlacement,
} from "./block.fields";

export const BLOCK_PRESET_GOVERNS = [
  "header",
  "ports",
  "members",
  "description",
  "typePlacement",
  "footer",
  "width",
  "height",
];

// WHY a total Record and not a ternary/switch: same defensive shape as
// pill.presets.ts's own PRESET_PAINT and port.presets.ts's own
// PRESET_SIZE — a loose index signature would let a fourth view typecheck
// clean and throw at render time reading a governed field off `undefined`.
//
// WHY the value type is an inline object literal and not a separate named
// `interface` (as a first pass here had it): `PresetSpec.values` is typed
// `Partial<Record<string, FieldValue>>`, and TypeScript only extends the
// implicit-index-signature allowance that makes an object type assignable
// there to FRESH object-literal types — a separately named `interface`
// does not get it, and fails with "index signature is missing" even
// though every member is structurally a `FieldValue`. `pill.presets.ts`'s
// own `PRESET_PAINT` and `port.presets.ts`'s own `PRESET_SIZE` are both
// inline for the same reason.
const PRESET_FACE: Record<
  BlockView,
  {
    header: BlockHeaderMode;
    ports: BlockPortsMode;
    members: BlockMembersMode;
    description: boolean;
    typePlacement: BlockTypePlacement;
    footer: boolean;
    width: number;
    height: number;
  }
> = {
  simple: {
    header: "centered",
    ports: "anonymous",
    members: "hidden",
    description: true,
    typePlacement: "bottom",
    footer: false,
    width: BLOCK_VIEW_DEFAULT_SIZES.simple.w,
    height: BLOCK_VIEW_DEFAULT_SIZES.simple.h,
  },
  port: {
    header: "band",
    ports: "rows",
    members: "hidden",
    description: false,
    typePlacement: "header",
    footer: true,
    width: BLOCK_VIEW_DEFAULT_SIZES.port.w,
    height: BLOCK_VIEW_DEFAULT_SIZES.port.h,
  },
  expanded: {
    header: "band",
    ports: "walls",
    members: "shown",
    description: false,
    typePlacement: "header",
    footer: false,
    width: BLOCK_VIEW_DEFAULT_SIZES.expanded.w,
    height: BLOCK_VIEW_DEFAULT_SIZES.expanded.h,
  },
};

export const BLOCK_PRESETS: PresetSpec[] = BLOCK_VIEWS.map((view) => ({
  id: view,
  label: BLOCK_VIEW_LABELS[view],
  selector: "view",
  governs: BLOCK_PRESET_GOVERNS,
  values: PRESET_FACE[view],
}));
