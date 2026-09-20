// src/components/recordingViewer.tsx — the recording player, as a modal.
//
// Zach, 2026-09-19: *"that should open the viewer in a modal in the app. I
// feel you already designed that somewhere it was cool it showed the screen
// shots and the event trace, etc.."* — he is remembering
// /home/bam/systemsketch/scripts/recording_store.py:605-630
// (`playback_html()`), the self-contained page the host writes into every
// recording folder beside the frames. Its own one-line description, from the
// module docstring at recording_store.py:20: *"the viewer: slow frames, fast
// lanes, one scrubber"*.
//
// This is that page, rebuilt as React over the stock `Dialog`. Nothing about
// the design is invented; the donor's PLAYBACK_TEMPLATE
// (recording_store.py:436-598) is the spec, element for element:
//
//   donor                                    here
//   ---------------------------------------  --------------------------------
//   .screen  (aspect-ratio W/H, contain)      the frame pane
//   #cursor  (blue dot, red while down)       the pointer dot
//   .log     (dark, monospace, per-lane ink)  the trace
//   .controls #play #scrub #tlabel            play / Slider / the ms readout
//   .lanes   (12 checkboxes, 4 off)           the lane ToggleGroup
//   .frames  (thumbnail strip, .on)           the strip
//   .detail  (<details> + <pre>)              the Collapsible
//   #packet  (<pre> of README.md)             the packet
//   #t=<ms>  deep link                        the `startAtMs` prop
//
// The lane colours, the four lanes hidden by default, the per-lane row text
// and the pointer-down tracking are copied from the donor's own script block
// (recording_store.py:500-560) line for line.
//
// Two deliberate differences, both forced by the move into the app:
//   * the donor read `frames[i].file` as a path RELATIVE to the folder it sat
//     in. A modal has no folder, so the host hands over `data:` URLs on the
//     same `{t, file}` shape (`RecordingBundle`, recordingClient.ts).
//   * the donor rebuilt its log imperatively, appending one `<div>` per row
//     as the clock passed it and re-rendering from scratch on a backwards
//     seek (`rebuild`/`render`, recording_store.py:519-565). Here the visible
//     rows are DERIVED from `t`, which is the same output with no
//     seek-direction branch to get wrong.
//
// This component fetches nothing and knows no core: it renders a bundle it is
// handed. That is what keeps "view last recording" a host decision rather
// than a second recording feature.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Pause, Play } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";
import { Slider } from "./slider";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import type { RecordingBundle } from "../recording/recordingClient";

/** Ported verbatim: recording_store.py:494 (the viewer's `colours` map). */
const LANE_INK: Record<string, string> = {
  input: "#7aa2ff",
  dom: "#9fd0ff",
  state: "#75d39b",
  store: "#c39bff",
  menu: "#f2b46b",
  console: "#f28b7d",
  mark: "#ff9ad5",
  network: "#f0c96f",
  workspace: "#60d4c2",
  action: "#8fb8ff",
  perf: "#ff9e64",
  ui: "#b7c6d9",
};

/**
 * Ported verbatim: recording_store.py:509 — `const hidden = new Set([...])`.
 * The four high-volume lanes start off: a two-second drag is hundreds of
 * `input`/`dom` rows and would bury the state changes that explain it.
 */
const HIDDEN_BY_DEFAULT = ["input", "dom", "store", "ui"] as const;

type Row = Record<string, unknown>;

/** Ported verbatim: recording_store.py:511-521 (`const text = (r) => …`). */
export function recordingRowText(row: Row): string {
  const lane = row.lane;
  const at = <T,>(key: string) => row[key] as T;
  if (lane === "input") {
    return (
      String(at<string>("name") ?? "") +
      (row.screen ? ` ${JSON.stringify(row.screen)}` : "") +
      (row.key ? ` ${String(row.key)}` : "") +
      (row.shape ? ` on ${String((row.shape as { type?: string }).type)}` : "") +
      (row.target ? ` @${String(row.target)}` : "")
    );
  }
  if (lane === "dom") {
    return (
      String(row.event ?? "") +
      (row.key ? ` ${String(row.key)}` : "") +
      (row.screen ? ` ${JSON.stringify(row.screen)}` : "") +
      ` on ${String(row.on ?? "")}`
    );
  }
  if (lane === "state") return `${String(row.from)} → ${String(row.to)}  (${String(row.trigger)})`;
  if (lane === "store") {
    return ((row.ops ?? []) as { op: string; type: string; delta?: object }[])
      .map((op) => `${op.op} ${op.type}${op.delta ? ` ${JSON.stringify(Object.keys(op.delta))}` : ""}`)
      .join(", ");
  }
  if (lane === "menu") return `open: ${((row.open ?? []) as string[]).join(", ") || "(none)"}`;
  if (lane === "mark") return `✎ ${String(row.text)}`;
  if (lane === "console") return `${String(row.level)}: ${((row.args ?? []) as unknown[]).join(" ")}`;
  if (typeof row.summary === "string") return row.summary;
  return JSON.stringify(row);
}

/** Ported: recording_store.py:531-533 — the pointer dot follows the last placed event. */
function pointerAt(rows: Row[], upTo: number): { x: number; y: number; down: boolean } | null {
  let down = false;
  let last: number[] | null = null;
  for (let index = 0; index < upTo; index += 1) {
    const row = rows[index];
    const name = String(row.name ?? row.event ?? "");
    if (/pointer_down|pointerdown/.test(name)) down = true;
    if (/pointer_up|pointerup|pointercancel|cancel/.test(name)) down = false;
    if ((row.lane === "input" || row.lane === "dom") && Array.isArray(row.screen)) last = row.screen as number[];
  }
  return last ? { x: Number(last[0]), y: Number(last[1]), down } : null;
}

export interface RecordingViewerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** What the host read back. `null` while loading, or when nothing was found. */
  bundle: RecordingBundle | null;
  loading?: boolean;
  error?: string | null;
  /** The donor's `#t=<ms>` deep link, as a prop. */
  startAtMs?: number;
  testIdPrefix?: string;
}

export function RecordingViewer({
  open,
  onOpenChange,
  bundle,
  loading = false,
  error = null,
  startAtMs = 0,
  testIdPrefix = "recording-viewer",
}: RecordingViewerProps) {
  const testId = (suffix: string) => `${testIdPrefix}-${suffix}`;

  const header = bundle?.header ?? {};
  const viewport = (header.viewport ?? {}) as { w?: number; h?: number };
  // Ported: recording_store.py:607-609 — the donor's own fallbacks.
  const frameWidth = Number(viewport.w) || 1440;
  const frameHeight = Number(viewport.h) || 960;
  const durationMs = Math.max(0, Math.round(Number(header.durationMs) || 0));
  const rows = useMemo(() => bundle?.rows ?? [], [bundle]);
  const frames = useMemo(() => bundle?.frames ?? [], [bundle]);
  const detailById = useMemo(
    () => new Map((bundle?.details ?? []).map((detail) => [detail.id, detail])),
    [bundle],
  );

  const [t, setT] = useState(startAtMs);
  const [playing, setPlaying] = useState(false);
  const [visibleLanes, setVisibleLanes] = useState<string[]>(() =>
    Object.keys(LANE_INK).filter((lane) => !HIDDEN_BY_DEFAULT.includes(lane as (typeof HIDDEN_BY_DEFAULT)[number])),
  );
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // A newly opened recording starts where the caller asked (the donor's
  // `#t=<ms>`), never where the previous one was left.
  useEffect(() => {
    if (open) {
      setT(Math.min(startAtMs, durationMs));
      setPlaying(false);
      setSelectedDetail(null);
    }
  }, [open, startAtMs, durationMs, bundle]);

  // Ported: recording_store.py:570-574 — real time, one rAF, stops at the end.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const startedAt = performance.now();
    const startT = t >= durationMs ? 0 : t;
    if (t >= durationMs) setT(0);
    const tick = (now: number) => {
      const next = Math.min(durationMs, startT + (now - startedAt));
      setT(next);
      if (next >= durationMs) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is the seed, not a dependency: re-reading it would restart the clock every frame.
  }, [playing, durationMs]);

  const shownCount = useMemo(() => {
    let count = 0;
    while (count < rows.length && Number(rows[count].t ?? 0) <= t) count += 1;
    return count;
  }, [rows, t]);

  const visible = useMemo(
    () =>
      rows
        .slice(0, shownCount)
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => visibleLanes.includes(String(row.lane))),
    [rows, shownCount, visibleLanes],
  );

  const frameIndex = useMemo(() => {
    let found = -1;
    for (let index = 0; index < frames.length; index += 1) if (frames[index].t <= t) found = index;
    return found;
  }, [frames, t]);

  const cursor = useMemo(() => pointerAt(rows, shownCount), [rows, shownCount]);

  // The donor pinned its log to the bottom on every render (py:566).
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [visible.length]);

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      setT(Math.max(0, Math.min(durationMs, next)));
    },
    [durationMs],
  );

  const meta = bundle
    ? // Ported: recording_store.py:610-613 (the donor's `.meta` line).
      `${(durationMs / 1000).toFixed(2)} s · ${rows.length} rows · ${frames.length} frames (${String(
        header.framesSource ?? "none",
      )}) · ${String(header.pathAtStart ?? "?")} → ${String(header.pathAtEnd ?? "?")}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testIdPrefix}
        className="flex max-h-[92vh] w-[min(80rem,calc(100vw-2rem))] max-w-none flex-col gap-3 overflow-hidden sm:max-w-none"
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2">
            <Film className="size-4" />
            {bundle ? `Recording ${String(header.startedAt ?? "")}` : "Recording"}
          </DialogTitle>
          <DialogDescription data-testid={testId("meta")} className="font-mono text-xs">
            {loading ? "Reading the recording…" : error ? error : meta}
          </DialogDescription>
        </DialogHeader>

        {bundle ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {/* WHY `shrink-0`: this scroller's children are flex items, and a
                flex item shrinks by default. The frame pane derives its
                height from its width (aspect ratio), so it does NOT shrink
                with its cell — the cell shrank and the pane painted straight
                over the scrubber and the lane pills. Caught by looking at
                reports/media/recording-2026-09-19/viewer-scrubbed.png. The
                parent already scrolls; nothing here should compress. */}
            <div className="grid min-h-0 shrink-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* .screen — recording_store.py:452-456 */}
              <div
                data-testid={testId("screen")}
                className="border-border bg-muted relative mx-auto overflow-hidden rounded-lg border"
                // WHY the width is computed instead of just `w-full` +
                // `aspect-ratio`: a 1440x900 frame in a ~1050px column is
                // 656px tall, which overflowed the grid row and PAINTED OVER
                // the scrubber, the lane pills and the detail pane — caught
                // by looking at reports/media/recording-2026-09-19/
                // viewer-scrubbed.png, not by any assertion. Capping the
                // HEIGHT instead would have been worse: `aspect-ratio` yields
                // to an explicit height, the box would stop matching the
                // frame, and the pointer dot (positioned as a percentage of
                // the frame's own coordinates) would land in the wrong place.
                // Deriving the width from a height budget keeps the ratio
                // exact under both constraints.
                style={{
                  aspectRatio: `${frameWidth}/${frameHeight}`,
                  width: `min(100%, calc(46vh * ${frameWidth} / ${frameHeight}))`,
                }}
              >
                {frameIndex >= 0 ? (
                  <img
                    data-testid={testId("frame")}
                    data-frame-index={frameIndex}
                    src={frames[frameIndex].file}
                    alt={`recorded frame at ${frames[frameIndex].t} ms`}
                    className="block size-full bg-white object-contain"
                  />
                ) : (
                  <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
                    no frame yet
                  </div>
                )}
                {cursor ? (
                  // WHY a percentage and not the donor's measured scale
                  // (py:534-538): the box is pinned to the frame's own aspect
                  // ratio, so `object-fit: contain` letterboxes by zero and
                  // the donor's `min(rect.w/FW, rect.h/FH)` is exactly
                  // `rect.w/FW`. Percentages are the same number with no
                  // measurement to go stale on a resize.
                  <span
                    data-testid={testId("cursor")}
                    data-down={cursor.down || undefined}
                    className={cn(
                      "pointer-events-none absolute -ml-[7px] -mt-[7px] size-3.5 rounded-full border-2 border-white",
                      cursor.down ? "bg-red-600 ring-[6px] ring-red-600/35" : "bg-blue-600 ring-[3px] ring-blue-600/40",
                    )}
                    style={{
                      left: `${(cursor.x / frameWidth) * 100}%`,
                      top: `${(cursor.y / frameHeight) * 100}%`,
                    }}
                  />
                ) : null}
              </div>

              {/* .log — recording_store.py:457-466 */}
              <div
                ref={logRef}
                data-testid={testId("log")}
                className="border-border max-h-[46vh] min-h-40 overflow-auto rounded-lg border bg-[#0f1216] px-2.5 py-2 font-mono text-[11.5px]/[1.55] text-[#cfd7e6]"
              >
                {visible.map(({ row, index }) => {
                  const detail = typeof row.detail === "string" ? row.detail : null;
                  const hasDetail = detail !== null && detailById.has(detail);
                  return (
                    <div
                      key={index}
                      data-testid={testId("row")}
                      data-lane={String(row.lane)}
                      data-detail={hasDetail ? detail : undefined}
                      role={hasDetail ? "button" : undefined}
                      tabIndex={hasDetail ? 0 : undefined}
                      title={hasDetail ? "Click for full detail" : undefined}
                      onClick={hasDetail ? () => setSelectedDetail(detail) : undefined}
                      onKeyDown={
                        hasDetail
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") setSelectedDetail(detail);
                            }
                          : undefined
                      }
                      className={cn(
                        "overflow-hidden text-ellipsis whitespace-nowrap",
                        hasDetail && "cursor-pointer hover:bg-white/10",
                      )}
                    >
                      <span className="inline-block w-[66px] text-[#7d8794]">
                        +{(Number(row.t ?? 0) / 1000).toFixed(2)}s
                      </span>
                      <span
                        className="inline-block w-[78px] font-bold"
                        style={{ color: LANE_INK[String(row.lane)] ?? "#fff" }}
                      >
                        {String(row.lane)}
                      </span>
                      {recordingRowText(row)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* .controls — recording_store.py:467-472. Two rows where the
                donor wrapped one: with twelve lane pills sharing a line, the
                scrubber collapses to its thumb, and the scrubber is the
                control the whole viewer is named after. */}
            <div className="flex shrink-0 items-center gap-2.5 font-mono text-xs">
              <Button
                size="sm"
                variant="outline"
                data-testid={testId("play")}
                onClick={() => setPlaying((was) => !was)}
              >
                {playing ? <Pause /> : <Play />}
                {playing ? "pause" : t >= durationMs && durationMs > 0 ? "replay" : "play"}
              </Button>
              <Slider
                data-testid={testId("scrub")}
                aria-label="Recording position"
                min={0}
                max={Math.max(durationMs, 1)}
                step={10}
                value={t}
                onValueChange={(value) => seek(Array.isArray(value) ? Number(value[0]) : Number(value))}
                // WHY the track is restyled from out here: stock `Slider`
                // paints it `bg-muted`, which measured all but invisible on
                // this dialog's dark surface — the capture showed a lone
                // white thumb floating between "play" and the clock. The
                // component exposes no track slot, so the host reaches it by
                // its `data-slot`, and `foreground/20` works in both themes
                // where a literal `white/20` would vanish in light mode.
                className="min-w-[200px] flex-1 [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-foreground/20"
              />
              <span data-testid={testId("clock")} className="min-w-20 text-right tabular-nums">
                {Math.round(t)} ms
              </span>
            </div>

            {/* .lanes — recording_store.py:469, the donor's twelve checkboxes. */}
            <ToggleGroup
              multiple
              size="sm"
              variant="outline"
              data-testid={testId("lanes")}
              value={visibleLanes}
              onValueChange={(value) => setVisibleLanes(value as string[])}
              className="shrink-0 flex-wrap"
            >
              {Object.keys(LANE_INK).map((lane) => (
                <ToggleGroupItem
                  key={lane}
                  value={lane}
                  data-testid={testId(`lane-${lane}`)}
                  // WHY an explicit off-state: stock Toggle's pressed look is
                  // `aria-pressed:bg-muted`, and on this surface `muted` and
                  // the dialog surface are within a few percent — the capture showed
                  // all twelve lanes looking identical when four were off.
                  // Which lanes are hidden is the viewer's most-used control.
                  className="font-mono text-[11px] aria-pressed:bg-foreground/15 aria-[pressed=false]:opacity-40"
                >
                  <span style={{ color: LANE_INK[lane] }}>{lane}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {/* .frames — recording_store.py:473 */}
            {frames.length ? (
              <div data-testid={testId("strip")} className="flex shrink-0 gap-1 overflow-x-auto pt-1">
                {frames.map((frame, index) => (
                  <img
                    key={`${frame.t}-${index}`}
                    src={frame.file}
                    alt={`frame at ${frame.t} ms`}
                    data-testid={testId(`thumb-${index}`)}
                    data-on={index === frameIndex || undefined}
                    title={`+${(frame.t / 1000).toFixed(2)} s`}
                    onClick={() => seek(frame.t)}
                    className={cn(
                      "h-[54px] cursor-pointer rounded border-2 border-transparent",
                      index === frameIndex && "border-blue-600",
                    )}
                  />
                ))}
              </div>
            ) : null}

            {/* .detail — recording_store.py:474 */}
            <Collapsible className="shrink-0" open={selectedDetail !== null} onOpenChange={(next) => !next && setSelectedDetail(null)}>
              <CollapsibleTrigger
                render={
                  <Button size="sm" variant="ghost" data-testid={testId("detail-toggle")}>
                    Selected event detail
                  </Button>
                }
              />
              <CollapsibleContent>
                <pre
                  data-testid={testId("detail")}
                  className="border-border bg-muted/40 mt-1 max-h-72 overflow-auto rounded-lg border p-2 font-mono text-xs whitespace-pre-wrap"
                >
                  {selectedDetail
                    ? JSON.stringify(detailById.get(selectedDetail), null, 2)
                    : "Click a highlighted timeline row to inspect its full detail."}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {/* #packet — recording_store.py:476 */}
            <pre
              data-testid={testId("packet")}
              className="border-border bg-muted/40 max-h-72 shrink-0 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap"
            >
              {bundle.packet}
            </pre>
          </div>
        ) : (
          <p data-testid={testId("empty")} className="text-muted-foreground py-8 text-center text-sm">
            {loading ? "Reading the recording…" : (error ?? "No recording has been saved yet.")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
