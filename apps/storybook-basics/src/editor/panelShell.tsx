"use client";

// src/editor/panelShell.tsx — the right-panel frame both `FramesPanel`
// and `ProblemsPanel` sit inside (docs/menus/screenshots/06, 07: "RIGHT
// PANEL" eyebrow / title / × in a header, scrollable content below).
//
// Ported from /home/bam/systemsketch/src/chrome/SystemSketchChrome.tsx:1148-1178
// — the donor's own `systemsketch-right-popout` `<aside>` and its
// `.systemsketch-popout__header` (`<header><div><span>Right panel</span>
// <h2>{rightTitle}</h2></div><button>×</button></header>`), restated as a
// standalone, reusable shell instead of one `<aside>` literal wired
// directly to `rightSurface` state. The donor's `--left` variant (the
// Shapes/Behaviors library popout) is the identical shape and could reuse
// this component unchanged; only the right-side surfaces are this lane's
// brief.
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "../lib/utils";

export interface PanelShellProps {
  /** Small caps label above the title, e.g. "RIGHT PANEL". Optional so a
   *  shell embedded somewhere other than the docked right rail (a modal, an
   *  inline preview) can drop it without an empty reserved line. */
  eyebrow?: string;
  title: string;
  onClose(): void;
  /**
   * WHY this is a PROP, never the shell sniffing which body it happens to
   * be showing (ported lesson, SystemSketchChrome.tsx:1156-1164 —
   * `data-inspector-header`, kept verbatim): "Which element draws the
   * header, and the stylesheet obeys it rather than repeating the list...
   * Before this the inspector hid the header for every subject, which left
   * a cable, an ordinary shape and an empty selection in a headerless
   * column with no pointer way out." A body that wants to own its own
   * title/close row sets `hideHeader` explicitly; the shell never guesses
   * from which surface is mounted, because that guess is exactly what
   * stranded three subjects with no way out.
   */
  hideHeader?: boolean;
  children: ReactNode;
  className?: string;
  "data-surface"?: string;
}

export function PanelShell({
  eyebrow,
  title,
  onClose,
  hideHeader,
  children,
  className,
  "data-surface": dataSurface,
}: PanelShellProps) {
  return (
    <div
      data-slot="panel-shell"
      data-surface={dataSurface}
      // WHY `flex h-full w-full` rather than an authored width/height: the
      // design doc's own words for this component are "fills its given
      // box" — the donor's `.systemsketch-popout--right` sizes and
      // positions the `<aside>` (fixed width, `position: absolute`,
      // inset from the chrome edges); that placement is interaction/layout
      // geometry the HOST owns (a docked rail here, a modal there, an
      // inline story cell in this gallery), never something this
      // presentational shell should hardcode for itself.
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
    >
      {hideHeader ? null : (
        <header
          data-slot="panel-shell-header"
          className="flex min-h-[58px] shrink-0 items-start justify-between gap-3 border-b border-border px-3.5 py-3"
        >
          <div className="min-w-0">
            {eyebrow ? (
              <span className="block text-[8px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
                {eyebrow}
              </span>
            ) : null}
            {/* WHY `title` on the heading too (truthful-rendering habit,
                same as every truncating label in this kit): the heading
                itself doesn't truncate today, but a long host-supplied
                title well might in a narrower rail, and the raw text
                should always stay one hover away. */}
            <h2
              className="mt-0.5 truncate text-[15px] leading-tight font-medium text-foreground"
              title={title}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            data-slot="panel-shell-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
          >
            <X className="size-4" />
          </button>
        </header>
      )}
      {/*
       * WHY plain `overflow-y-auto` + `overscroll-contain`, deliberately
       * NOT the shadcn `scroll-area` part (docs/menus/MENU-KIT-DESIGN.md §5,
       * "Panel scroll regions" row — "plain CSS (deliberately not shadcn
       * scroll-area)"): the donor's whole recipe
       * (`.systemsketch-library-body`/`.systemsketch-inspector-placeholder`)
       * is `overflow: auto` + `overscroll-behavior: contain`, and that
       * containment is the entire job — stopping this panel's own
       * exhausted scroll from bleeding into the canvas underneath once it
       * hits the end. `scroll-area` buys custom scrollbar chrome nobody
       * asked for here. Actually keeping the wheel event from reaching the
       * canvas in the first place (`onWheel={stopPropagation}` in the
       * donor) is the HOST's listener, not this component's — the same
       * "interaction geometry stays host-side" line CLAUDE.md draws
       * everywhere else in this kit.
       */}
      {/* WHY `isolate` on the scroll body: every panel that lives in this shell
          has something sticky inside it — Problems' group headers, a table's
          `<thead>` — and sticky needs a z-index to stack above the rows
          scrolling under it. Without a local stacking context those z values
          compete in whatever context the HOST put the panel in, so a host
          overlay at z-index 5 could be pierced by a group header at 10. An
          independent judge raised exactly that (2026-09-18).

          `isolate` (`isolation: isolate`) makes this element a stacking
          context, so every z-index inside the panel is resolved against the
          panel and is invisible outside it. That is what lets the kit keep
          the internal stacking a sticky header genuinely needs while still
          honouring the trunk's rule that the core does not claim z-order
          from its host: the values stay, their REACH does not. Placed on the
          shell rather than in each panel so a panel added later inherits it
          without anyone remembering. */}
      <div data-slot="panel-shell-body" className="isolate min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
