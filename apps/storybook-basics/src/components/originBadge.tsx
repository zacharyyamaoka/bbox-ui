"use client";

// src/components/originBadge.tsx — the four-state badge a code cell wears:
// who owns its bytes (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §3). A `Badge`
// (./badge.tsx) with the state published on the DOM, and nothing else — the
// four states and their design data are FROZEN in `src/scene/codeOrigin.ts`
// (`CODE_ORIGIN_STATES`, `ORIGIN_BADGE`) and computed there by
// `codeOriginState`, never here.
//
// WHY the spec ARRIVES as a prop instead of this file importing
// `ORIGIN_BADGE` (the shape the lane brief sketched): `layering.test.ts`'s
// import wall — "no src/components/*.{ts,tsx} file imports from the scene
// kit at all, so a component literally cannot branch on a rule id or a
// scene-side type even if someone tried" — is a green, committed test, and
// an import of `codeOrigin` from the scene kit is exactly the specifier it
// greps for (measured: the wall goes red on that one line, and it greps the
// whole FILE, comments included — so this note may not spell the specifier
// out either). Taking the resolved
// spec as a prop keeps ONE copy of the data (still in codeOrigin.ts, read
// by whoever owns the scene) and leaves this component reason-blind, which
// is the wall's own stated purpose rather than a workaround for it.
// `OriginBadgeSpec` below is structurally identical to codeOrigin.ts's, so
// `ORIGIN_BADGE[state]` assigns with no cast and no adapter.

import { Badge, type BadgeProps } from "./badge";

/** The four `Badge` variants the origin states are allowed to paint in —
 *  quiet for the two calm states, amber for drift, red for orphaned. */
export type OriginBadgeVariant = "secondary" | "outline" | "warning" | "destructive";

/** What one state paints. Mirrors `scene/codeOrigin.ts`'s `OriginBadgeSpec`
 *  structurally; that file stays the one place the four rows are authored. */
export interface OriginBadgeSpec {
  label: string;
  variant: OriginBadgeVariant;
  description: string;
}

export interface OriginBadgeProps {
  /** The computed state — published as `data-state` so a story, a test or a
   *  host stylesheet can address one state without re-deriving it from the
   *  label text. */
  state: string;
  spec: OriginBadgeSpec;
  size?: BadgeProps["size"];
}

export function OriginBadge({ state, spec, size }: OriginBadgeProps) {
  return (
    <Badge data-slot="origin-badge" data-state={state} variant={spec.variant} size={size} title={spec.description}>
      {spec.label}
    </Badge>
  );
}
