import type { ComponentProps } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * src/components/foldingChevron.tsx — the standalone trigger built on top of
 * `Collapsible` (collapsible.tsx). A single Lucide `ChevronRight` whose
 * rotation is driven by `open` via inline `transform`: folded (closed)
 * reads as ▶, open rotates 90° to read as ▼ — matching the sketch's plain
 * triangle either way. `Block`'s actual body/footer wiring lives at the
 * STORY level (src/stories/Block.stories.tsx's `CollapsibleHeader`), not
 * here and not as a new `Block` prop — this component only knows how to
 * show its own open/closed state and fire a click.
 */
export interface FoldingChevronProps extends Omit<ComponentProps<"button">, "onClick"> {
  open: boolean;
  onClick: () => void;
  /**
   * WHY this prop exists (Zach: "add a control option to the drop down
   * chevron so that it's borderless and just appears on hover, however
   * when its collapsed then it always shows"): `"always"` is the default
   * so every existing caller (Bar/Block header wiring) is unchanged.
   * `"hover"` starts the chevron invisible and reveals it on `group-hover`
   * of its surrounding region — CSS-only (`group`/`group-hover`), not JS
   * hover state, so reveal never depends on a render round-trip and keeps
   * working under `prefers-reduced-motion` — chosen over a JS
   * `onMouseEnter` on the region because the region (a `Bar`) is a
   * separate component this file doesn't own the JS lifecycle of; the CSS
   * relationship is the only coupling that doesn't require threading hover
   * state as a prop through Bar. The layout box is never removed (only
   * `opacity` toggles), so revealing it never shifts sibling content.
   */
  reveal?: "always" | "hover";
}

export function FoldingChevron({
  open,
  onClick,
  reveal = "always",
  className,
  ...props
}: FoldingChevronProps) {
  // WHY collapsed always wins regardless of `reveal` (Zach's explicit
  // sentence): a folded section has to keep advertising that it can be
  // expanded — hiding its only trigger behind a hover a collapsed user has
  // no reason to attempt would make the section look permanently empty.
  const hoverHidden = reveal === "hover" && open;
  const alwaysForced = reveal === "hover" && !open;
  return (
    <button
      type="button"
      data-slot="folding-chevron"
      aria-expanded={open}
      onClick={onClick}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
        // `reveal="always"` keeps the original hover chip; `"hover"` is
        // borderless in every state (open-collapsed-forced-visible
        // included) — the background pill is what "always" and "hover"
        // actually differ on visually once the glyph itself is showing.
        reveal === "always" && "hover:bg-muted",
        hoverHidden &&
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        alwaysForced && "opacity-100",
        className,
      )}
      {...props}
    >
      <ChevronRight
        className="size-4 transition-transform duration-150"
        style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
      />
    </button>
  );
}
