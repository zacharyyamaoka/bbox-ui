// src/editor/recordingControl.tsx — the recorder's ONE interface: a
// split button and the panel its chevron opens.
//
// Zach, 2026-09-19: *"Its interface is that button and then the pop up that
// appears. we should have flexibility to kinda change the locaiton of the
// button or even what the itnerface looks like in the future."*
//
// So this file is deliberately, mechanically ignorant. It holds no state
// machine, no clock, no clipboard, no network and no canvas — every one of
// those lives in `src/recording/recordingCore.ts` behind an injected effects
// seam. What arrives here is a `RecordingState` and four callbacks; what
// leaves is markup. `src/recording/recordingPurity.test.ts` asserts that
// mechanically (type-only imports, no `60_000`, no `setTimeout`, no
// `navigator.clipboard`, no `FlightRecorder`), because the promise "you can
// move this or replace it" is only true while it stays true — and a helpful
// future edit that reached for the core here would look perfectly fine in a
// browser.
//
// The SHAPE is ported from the archive:
// /home/bam/systemsketch/src/recorder/RecorderControls.tsx:39-198 (read on
// disk 2026-09-19) — the section label with its right-hand status caption,
// the status wording, the primary/chevron split, the copy row with the
// folder path beneath it, the policy caption, and the clipboard confirmation.
// Zach's screenshots of that surface (~/zach_brain/Pasted image
// 20260919182230.png and 20260919182508.png) are the visual spec.
//
// What changes, and why:
//   * the donor hand-rolled the split from two raw `<button>`s, its own
//     `pointerdown` outside-dismiss listener and a bare `<div>` menu, over a
//     hand-written recorder.css. Here it is stock `Button` + stock `Popover`
//     (Base UI), which already own Escape, outside-dismiss, focus return and
//     portalling — "as always please be using stock shadcn as much as
//     possible" (feedback ledger, 2026-09-19). The split geometry itself is
//     `splitButton.tsx`'s, the trunk's existing rendering of this shape.
//   * WHY `Popover` and not `DropdownMenu` (which `splitButton.tsx` uses):
//     the panel in Zach's screenshot is not a menu. It carries a two-line row
//     with a monospace path beneath the label, a horizontal rule, a policy
//     caption and a LIVE status line that updates while it is open ("Packet
//     copied"). A menu's roving-focus and close-on-select semantics fight all
//     four; a popover is the primitive for a panel.
//   * "View last recording" is new beside "Copy last recording", because Zach
//     asked for it: *"As part of the drop down. please give the option to
//     'view last recording'"*.
"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Circle, Copy, Eye, Square } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "../components/button";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";
import { Separator } from "../components/separator";
import type { RecordingState } from "../recording/recordingCore";

export interface RecordingControlProps {
  /** The whole machine, read-only. Nothing here derives recording behaviour from it. */
  state: RecordingState;
  /**
   * Milliseconds since the take started, for the running clock.
   *
   * WHY a prop and not a `setInterval` in here: the donor ticked its own
   * 200 ms interval inside the control (RecorderControls.tsx:24-33), which is
   * a second, invisible reason a host could not move or replace this
   * component freely. `useRecordingElapsed` (src/recording/useRecording.ts)
   * is the same five lines, available to whoever mounts this.
   */
  elapsedMs?: number;
  onStart(): void;
  onStop(): void;
  onCopyLast(): void;
  onViewLast(): void;
  /**
   * How much chrome the control draws above the button.
   *
   *   `"full"`        label on the left, live status caption on the right —
   *                   the standalone surface, and Zach's screenshot.
   *   `"status-only"` the donor's `compact` variant (RecorderControls.tsx:
   *                   150-170), for a narrow slot that already has a heading.
   *   `"none"`        the button alone.
   *
   * WHY `"none"` exists — THE SLOT CONTRACT. In the Dev panel this component
   * is the `content` of a `{ kind: "slot" }` row (devPanel.model.ts,
   * `DevPanelSlotRow`), and the panel's own section already paints both
   * halves of that header: `title: "Recording"` and a right-aligned
   * `caption`. Drawing them here too would double them. The live status
   * string the caption wants is `recordingStatusLabel(state, elapsedMs)`,
   * exported below — so the panel still never learns what recording is.
   */
  header?: "full" | "status-only" | "none";
  /** The section label. Default "Recording" (Zach's screenshot: RECORDING). */
  label?: string;
  /** Prefix for every `data-testid` this renders. Default `recording`. */
  testIdPrefix?: string;
  /** Portal target inside the host's own token scope — the kit's host contract. */
  container?: React.ComponentProps<typeof PopoverContent>["container"];
  className?: string;
}

/**
 * "1 min", derived from the state rather than restated.
 *
 * WHY derived: the limit is the core's (`EXPLICIT_RECORDING_LIMIT_MS`), and a
 * control that hard-coded "1 min" beside it would go quietly wrong the day
 * the limit moved — the popover's policy line is a PROMISE about what happens
 * to an unattended recording.
 */
function limitLabel(windowMs: number): string {
  const seconds = Math.round(windowMs / 1000);
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

/** Ported verbatim: RecorderControls.tsx:35-38. */
export function shortRecordingPath(path: string): string {
  const home = path.match(/^\/home\/[^/]+\//)?.[0];
  return home ? `~/${path.slice(home.length)}` : path;
}

/** Ported: RecorderControls.tsx:66-79 — the right-hand caption's wording, exactly. */
export function recordingStatusLabel(state: RecordingState, elapsedMs: number): string {
  const limit = limitLabel(state.windowMs);
  if (state.error || state.clipboard === "failed") return "Needs attention";
  if (state.mode === "take") return `REC · ${(elapsedMs / 1000).toFixed(1)} / ${limit}`;
  if (state.saving) return "Saving…";
  if (state.notice) return "Cancelled · nothing saved";
  if (state.clipboard === "copied") return "Saved · packet copied";
  return `Ready · ${limit} maximum`;
}

export function RecordingControl({
  state,
  elapsedMs = 0,
  onStart,
  onStop,
  onCopyLast,
  onViewLast,
  header = "full",
  label = "Recording",
  testIdPrefix = "recording",
  container,
  className,
}: RecordingControlProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const taking = state.mode === "take";
  const busy = state.saving;
  const limit = limitLabel(state.windowMs);
  const testId = (suffix: string) => `${testIdPrefix}-${suffix}`;

  // The donor closed its menu the moment a take started or a save began
  // (RecorderControls.tsx:60-62); with a popover that is just a controlled
  // `open` that the render forces shut.
  const panelOpen = open && !taking && !busy;

  const status = recordingStatusLabel(state, elapsedMs);

  // WHY the two segments carry `--bbox-accent` instead of riding stock
  // `Button`'s `default` variant: this app's shadcn theme is the NEUTRAL
  // base-nova palette, so `--primary` is achromatic — measured, a stock
  // `default` Button paints this control near-WHITE in dark mode, where
  // Zach's screenshot (~/zach_brain/Pasted image 20260919182230.png) is an
  // unmistakable blue. The blue is the affordance: this is the one control in
  // the panel that starts a capture. `--bbox-accent` is this repo's own
  // accent token (globals.css:153) and `devPanel.tsx:225` already paints its
  // accent tiles with exactly this pair, so the recording row matches the
  // rows above it rather than inventing a colour. Everything else about the
  // button — size, radius, focus ring, disabled opacity, the icon rule —
  // stays stock.
  const accent = "bg-[var(--bbox-accent)] text-white hover:bg-[var(--bbox-accent)]/90";

  const primary = taking ? (
    <Button
      variant="destructive"
      data-testid={testId("stop")}
      data-action="stop-recording"
      disabled={busy}
      onClick={onStop}
      className="h-11 w-full justify-center gap-2 font-mono text-sm tracking-tight"
    >
      <Square className="fill-current" />
      {busy ? "Saving…" : `Stop and save · ${(elapsedMs / 1000).toFixed(1)} s`}
    </Button>
  ) : (
    // The split, in `splitButton.tsx`'s geometry: one rounded shell, the
    // primary flush-left, the chevron segment flush-right with a hairline
    // between them.
    <div
      data-slot="split-button"
      data-testid={testId("split")}
      className="flex items-stretch overflow-hidden rounded-lg"
    >
      <Button
        data-testid={testId("start")}
        data-action="start-recording"
        disabled={busy}
        title={`Start recording · ${limit} maximum`}
        onClick={onStart}
        className={cn(accent, "h-11 flex-1 justify-center gap-2 rounded-r-none font-mono text-sm tracking-tight")}
      >
        <Circle className="fill-current" />
        Start recording
      </Button>
      <PopoverTrigger
        render={
          <Button
            data-testid={testId("more")}
            data-action="more"
            aria-label="More recorder actions"
            aria-controls={panelId}
            disabled={busy}
            className={cn(accent, "h-11 w-11 shrink-0 rounded-l-none border-l border-white/25")}
          >
            {panelOpen ? <ChevronUp /> : <ChevronDown />}
          </Button>
        }
      />
    </div>
  );

  const panel = (
    <PopoverContent
      id={panelId}
      data-testid={testId("panel")}
      container={container}
      side="top"
      align="end"
      sideOffset={8}
      // Wide enough for an absolute recordings path without wrapping it.
      className="w-[min(26rem,calc(100vw-2rem))] gap-0 p-0"
    >
      <Button
        variant="ghost"
        data-testid={testId("copy-last")}
        data-action="copy-last"
        disabled={!state.last}
        onClick={onCopyLast}
        className="h-auto w-full flex-col items-start gap-0.5 rounded-b-none px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Copy />
          Copy last recording
        </span>
        <span
          data-testid={testId("last-path")}
          className="text-muted-foreground w-full truncate pl-6 font-mono text-xs font-normal"
        >
          {state.last ? shortRecordingPath(state.last.path) : "Nothing saved yet"}
        </span>
      </Button>

      <Button
        variant="ghost"
        data-testid={testId("view-last")}
        data-action="view-last"
        disabled={!state.last}
        onClick={onViewLast}
        className="h-auto w-full flex-col items-start gap-0.5 rounded-none px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Eye />
          View last recording
        </span>
        <span className="text-muted-foreground w-full truncate pl-6 text-xs font-normal">
          {state.last
            ? `${state.last.frames} ${state.last.frames === 1 ? "frame" : "frames"} · ${state.last.framesSource} · event trace`
            : "Nothing saved yet"}
        </span>
      </Button>

      <Separator />

      <div className="flex flex-col gap-1 px-3 py-2.5">
        {/* Ported verbatim: RecorderControls.tsx:135-137. This sentence is the
            contract — Stop is the only thing that writes a folder. */}
        <p data-testid={testId("policy")} className="text-muted-foreground font-mono text-xs">
          Stop saves and copies · the {limit} limit cancels without saving
        </p>
        {state.clipboard ? (
          <p
            data-testid={testId("clipboard")}
            data-clipboard={state.clipboard}
            className={cn(
              "font-mono text-xs",
              state.clipboard === "copied" ? "text-emerald-500 dark:text-emerald-400" : "text-destructive",
            )}
          >
            {state.clipboard === "copied" ? "Packet copied" : "Clipboard write failed · folder is safe"}
          </p>
        ) : null}
        {state.error ? (
          <p data-testid={testId("error")} className="text-destructive text-xs">
            {state.error}
          </p>
        ) : null}
        {state.framesSource === "canvas" && state.framesReason ? (
          <p data-testid={testId("frames-hint")} className="text-muted-foreground text-xs">
            {state.framesReason}
          </p>
        ) : null}
      </div>
    </PopoverContent>
  );

  // The donor rendered nothing at all when the recorder was not installed
  // (RecorderControls.tsx:147) — an embedded IDE host has no local host to
  // write to, so the control must not advertise a button that cannot work.
  if (!state.installed) return null;

  return (
    <div
      data-slot="recording-control"
      data-testid={testIdPrefix}
      data-mode={state.mode}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      {header === "none" ? null : (
        <div
          className={cn(
            "flex items-baseline justify-between gap-3",
            header === "status-only" && "justify-start",
          )}
        >
          {header === "full" ? (
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{label}</span>
          ) : null}
          <span
            data-testid={testId("status")}
            className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase"
          >
            {status}
          </span>
        </div>
      )}
      <Popover open={panelOpen} onOpenChange={setOpen}>
        {primary}
        {panel}
      </Popover>
    </div>
  );
}
