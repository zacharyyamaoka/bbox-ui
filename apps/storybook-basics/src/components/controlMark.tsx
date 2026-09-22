// src/components/controlMark.tsx — a control-exit mark: DP - Break & Continue,
// B5 — "a mark beside the call, never a cable". Drawn as a `Badge`, and
// deliberately given NO port and NO edge: `expectControlMark` asserts no
// wire may originate at one, which only stays true because nothing ever
// mints a handle for it.
//
// Moved here from `hosts/nodeViews.tsx` (2026-09-22) so `BlockRegion` can
// draw a region corner's marks itself from DATA (`RegionHeaderChips`) — see
// `blockRegion.tsx`'s `RegionCornerCard` for why the corner is data.

import { CircleStop, RotateCw } from "lucide-react";

import { Badge } from "./badge";

export type ControlMarkKind = "break" | "continue" | "pass";

export function ControlMark({ mark }: { mark: ControlMarkKind }) {
  return (
    <Badge data-slot="control-mark" data-mark={mark} size="sm" variant="outline">
      {mark === "break" && <CircleStop aria-hidden />}
      {mark === "continue" && <RotateCw aria-hidden />}
      {mark}
    </Badge>
  );
}
