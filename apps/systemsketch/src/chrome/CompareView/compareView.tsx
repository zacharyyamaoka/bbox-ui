// src/chrome/CompareView/compareView.tsx — Compare, mounted.
//
// Ruling 10, Zach 2026-09-21: "we want to support the Compare view."
//
// The trunk already had every piece of this except the wiring: `CompareDialog`
// + `CompareReview` + `PropertyTable` + `CodeView` (the surface),
// `scene/sceneDiff.ts`'s `diffScene` (the engine), and `editor/sceneCompare.ts`
// (the bridge between them, written for this lane). The app imported NONE of
// it — zero references, measured 2026-09-21. This file is the only thing
// standing between "a tested module" and "a thing a person can open", which is
// the whole point of the lane.
//
// WHAT TWO STATES, and why these two: the baseline is the board as this window
// found it, replaceable at any time from the same menu. WHY not "the file on
// disk": the session autosaves (`src/files/session.tsx`, 600 ms after the last
// edit), so "since you last saved" is almost always "nothing" — it would be a
// Compare that is honest and useless. WHY not a `<name>.vN` sibling, which
// `@trunk/editor/compareSource.ts` already knows how to discover: that
// needs the local file host running AND a person who has hand-saved versions,
// so it cannot be the DEFAULT answer to "show me what changed" — it is the
// obvious next endpoint to add to the same rail, and is deliberately left for
// one (see this lane's report).
//
// WHY the two panes are `DomCanvas` and not a second tldraw: `compareDialog`'s
// own seam note gives the reason from the kit's side ("carrying BoardRender
// into this kit would put the engine inside the core"), and from the app's
// side there is a second: the baseline is a SCENE, not a store — a snapshot
// this window took, with no shapes behind it. A read-only DOM bench renders a
// scene directly and can never be mistaken for a board you may edit, which is
// what `ARCHITECTURE.md` means by "the compare panes never enable it — they
// are read-only by design".
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor } from "tldraw";

import type { MenuGroupSpec } from "@trunk/editor/chromeBar";
import { CompareDialog } from "@trunk/editor/compareDialog";
import type { CompareChange } from "@trunk/editor/compareModel";
import { compareScenes, compareTally } from "@trunk/editor/sceneCompare";
import { SceneDiffMarks, diffMarksForSide } from "@trunk/editor/sceneDiffMarks";
import { DomCanvas } from "@trunk/hosts/domCanvas";
import type { HostScene } from "@trunk/hosts/hostScene";
import type { ScenePortsOf } from "@trunk/scene/sceneDiff";

import { useHostPort } from "@trunk/shell/BboxShell";

import { sceneFromRecords, type DocumentScene } from "../../document/sceneFromStore";
import { documentSceneOf, usePortScene } from "../portScene";

/** Every test id this surface publishes hangs off this one prefix, which is
 *  the vocabulary `src/draft.smoke.test.tsx` was committed against before any
 *  of this existed (`ss-compare-dialog`, `-summary`, `-close`). */
export const COMPARE_TEST_ID_PREFIX = "ss-compare";

/**
 * `DocNodeData` keeps the port vocabulary in `data.ports`, so a port insertion
 * changes the node's own `data` too — see `sceneCompare.ts`'s `omitNodeFields`
 * doc for why that would otherwise report one fact twice, once readably and
 * once as a JSON blob. `portTypes` is deliberately NOT omitted: a port whose
 * declared type changed is a real modification of the block, and ruling 8 put
 * that type in the declaration precisely so it would be visible.
 */
const OMIT_NODE_FIELDS = ["ports"] as const;

/** The board's port vocabulary, read off the projection rather than guessed —
 *  the same `data.ports` `sceneFromStore.ts` fills from each block's rails. */
function portsOfScene(scene: DocumentScene): (nodeId: string) => readonly string[] | undefined {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return (nodeId) => {
    const ports = byId.get(nodeId)?.data.ports;
    if (!ports) return undefined;
    return Object.values(ports).flatMap((ids) => ids ?? []);
  };
}

/**
 * The box both panes draw inside, in BOARD coordinates.
 *
 * WHY one frame for both panes and not one each: the two panes are read
 * side by side, so a node that did not move must sit at the same place in
 * both. A per-pane frame would silently re-origin the `after` board the
 * moment a block was added above or left of everything else, and every
 * unchanged block would appear to have moved — a comparison that invents
 * differences is worse than one that misses them.
 *
 * WHY the origin shifts at all, rather than painting the board's raw
 * coordinates: a scene carries the positions a person dragged things to,
 * which on a real board are hundreds of pixels from (0, 0), and the panes
 * inside this dialog are a few hundred pixels wide. Unshifted, the first
 * thing a reviewer sees is empty canvas. This is a read-only presentation
 * transform on a read-only pane — it never reaches the document.
 */
interface CompareFrame {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

/** The gutter kept around the content on every side, in CSS pixels. Also the
 *  floor a pane is sized to when the board is empty. */
const PANE_MARGIN = 48;

function compareFrame(before: DocumentScene, after: DocumentScene): CompareFrame {
  const positions = [...before.nodes, ...after.nodes].filter((node) => node.parentId === undefined).map((node) => node.position);
  if (positions.length === 0) return { originX: 0, originY: 0, width: PANE_MARGIN * 2, height: PANE_MARGIN * 2 };
  const originX = Math.min(...positions.map((position) => position.x));
  const originY = Math.min(...positions.map((position) => position.y));
  const spanX = Math.max(...positions.map((position) => position.x)) - originX;
  const spanY = Math.max(...positions.map((position) => position.y)) - originY;
  // The span is between node ORIGINS — the scene carries no sizes (it "only
  // ever names ports; it never places them", and `sceneFromStore.ts` drops
  // geometry on purpose) — so the margin doubles as room for the widest node.
  return { originX, originY, width: spanX + PANE_MARGIN * 4, height: spanY + PANE_MARGIN * 4 };
}

/** The same scene, re-originned into the shared frame. Top-level nodes only:
 *  a member's `position` is relative to its parent, so shifting it too would
 *  move it twice. */
function framedScene(scene: DocumentScene, frame: CompareFrame): DocumentScene {
  return {
    ...scene,
    nodes: scene.nodes.map((node) =>
      node.parentId === undefined
        ? {
            ...node,
            position: {
              x: node.position.x - frame.originX + PANE_MARGIN,
              y: node.position.y - frame.originY + PANE_MARGIN,
            },
          }
        : node,
    ),
  };
}

/**
 * How far a pane will shrink a board to fit before it starts scrolling
 * instead.
 *
 * WHY there is a floor at all: fit-to-pane with no floor turns a wide board
 * into unreadable confetti — measured at a 1400px viewport, where the detail
 * rail's own 600px leaves each pane under 200px and an unclamped fit lands at
 * 0.41. Below this, scrolling a legible board beats seeing an illegible whole
 * one. At the window sizes this dialog is actually used at (the rail is
 * `max-w-[45%]`, so a 1920px window gives each pane ~500px) the fit never
 * reaches the floor and nothing scrolls.
 */
const MIN_PANE_SCALE = 0.6;

/** The pane's own box, live. Two numbers, so a re-measure that finds the same
 *  size re-renders nothing. */
function useBoxSize(ref: { current: HTMLElement | null }): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const box = element.getBoundingClientRect();
      setSize((previous) =>
        Math.abs(previous.width - box.width) < 0.5 && Math.abs(previous.height - box.height) < 0.5
          ? previous
          : { width: box.width, height: box.height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * One board pane.
 *
 * WHY the marks are a sibling layer and not a prop on the nodes: see
 * `@trunk/editor/sceneDiffMarks.tsx`'s header — a diff mark and a lint mark
 * must not share a channel, and a measured overlay cannot disagree with what
 * is on screen.
 */
function ComparePane({
  scene,
  frame,
  changes,
  side,
  selected,
}: {
  scene: DocumentScene;
  frame: CompareFrame;
  changes: readonly CompareChange[];
  side: "before" | "after";
  selected: CompareChange | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const marks = useMemo(() => diffMarksForSide(changes, side), [changes, side]);
  const anchor = selected ? (side === "before" ? selected.anchorBefore : selected.anchorAfter) : null;
  const framed = useMemo(() => framedScene(scene, frame), [scene, frame]);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const box = useBoxSize(paneRef);
  // Fit, never magnify. WHY the pane scales the board down instead of
  // scrolling it: the detail rail owns 600px of this dialog by its own
  // measured decision, so a pane is a few hundred pixels wide and a board
  // authored at real coordinates starts off-screen — the reviewer's first act
  // would be to hunt for the thing that changed. WHY it never scales UP: a
  // magnified two-block board would render a comparison at a size no board
  // ever has, and the panes are meant to be recognisable as the board.
  const fit = box.width > 0 ? Math.min(1, box.width / frame.width, box.height / frame.height) : 1;
  const scale = Math.max(MIN_PANE_SCALE, fit);
  // One identity that changes exactly when a box could have moved: the scene
  // (a node was added, removed, renamed or dragged) or the scale. A fresh
  // object per render would re-measure on every render instead.
  const layoutKey = useMemo(() => ({ scale, framed }), [scale, framed]);
  // The two data bags differ only in the fields the DOM host never reads
  // (`kind`, `declaration`, `portTypes`, …); `name`/`view`/`ports`/`code` —
  // everything `SceneNodeView` dispatches on — are the same shape in both.
  // Stated here once, at the one seam that crosses, rather than widening
  // `HostNodeData` to admit an app type it must not know about.
  const hostScene = framed as unknown as HostScene;
  return (
    <div
      ref={paneRef}
      data-testid={`${COMPARE_TEST_ID_PREFIX}-pane-${side}`}
      // `auto`, and the mark layer lives INSIDE the scrolled content (below),
      // so a pane narrow enough to need scrolling still draws its marks on the
      // right boxes. A layer positioned from the pane's VISIBLE box would slide
      // off its nodes the moment a reviewer scrolled.
      style={{ position: "relative", overflow: "auto", width: "100%", height: "100%" }}
    >
      <div
        ref={containerRef}
        style={{ position: "relative", width: frame.width * scale, height: frame.height * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: frame.width, height: frame.height }}>
          <DomCanvas scene={hostScene} width={frame.width} height={frame.height} />
        </div>
        {/* OUTSIDE the transform on purpose: the layer measures real screen
         *  rectangles, so drawing it inside a scaled box would scale those
         *  numbers a second time. Inside the CONTENT box, though, so it
         *  scrolls with what it marks. */}
        <SceneDiffMarks
          marks={marks}
          containerRef={containerRef}
          selectedId={anchor}
          layoutKey={layoutKey}
          testIdPrefix={`${COMPARE_TEST_ID_PREFIX}-mark-${side}`}
        />
      </div>
    </div>
  );
}

export interface CompareViewController {
  /** The burger's Compare group, for `buildAppMenu`'s `extra`. */
  readonly group: MenuGroupSpec;
  /** Mounted by the caller, beside the other chrome dialogs. */
  readonly dialog: ReactNode;
  /** How many changes stand between the baseline and the board right now —
   *  exposed so another surface (a draft bar, a status strip) can label its
   *  own Compare control from the same number the dialog shows. */
  readonly changeCount: number;
  /** Opens the dialog on the current baseline. */
  readonly open: () => void;
}

/**
 * The Compare view, as a hook, because every consumer of it is inside
 * `src/chrome/TitleBar/chromeBar.tsx` — the same reason `files/session.tsx`
 * states for being a hook rather than a context.
 */
export function useCompareView(editor: Editor): CompareViewController {
  const port = useHostPort();
  // Both sides of the comparison come from ONE derivation — the port's cached
  // scene (B-SHELL-P1) — so a baseline and the board it is compared with can
  // never differ only in how they were projected.
  const snapshot = useCallback(
    () => (port ? documentSceneOf(port) : sceneFromRecords(editor.store.allRecords())),
    [port, editor],
  );
  const [open, setOpen] = useState(false);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);

  // The baseline is captured ONCE, lazily, as this window found the board —
  // `useState`'s initialiser rather than an effect, so it is the board before
  // any render of this chrome could have changed it.
  const [baseline, setBaseline] = useState<{ scene: DocumentScene; label: string }>(() => ({
    scene: snapshot(),
    label: "When you opened this board",
  }));

  const current = usePortScene();

  const comparison = useMemo(() => {
    const portsOf: ScenePortsOf = { before: portsOfScene(baseline.scene), after: portsOfScene(current) };
    return compareScenes(baseline.scene, current, { portsOf, omitNodeFields: [...OMIT_NODE_FIELDS] });
  }, [baseline.scene, current]);

  const selected = comparison.changes.find((change) => change.id === selectedChangeId) ?? null;
  const frame = useMemo(() => compareFrame(baseline.scene, current), [baseline.scene, current]);

  const capture = useCallback(() => {
    setBaseline({
      scene: snapshot(),
      // A time, not "now": a baseline a person set at 14:03 and compares
      // against at 15:40 must say WHEN, or the pane heading is a lie by
      // omission about which board they are looking at.
      label: `Baseline set at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    });
    setSelectedChangeId(null);
  }, [snapshot]);

  const group = useMemo<MenuGroupSpec>(
    () => ({
      id: "compare",
      items: [
        {
          id: "compare-open",
          // The count is on the ROW, so the answer to "did anything change?"
          // does not cost a dialog. `compareTally` is the same arithmetic the
          // titlebar badges do, called once here.
          label: comparison.total > 0 ? `Compare ${comparison.total} changes…` : "Compare changes…",
          title: `${compareTally(comparison, "added")} added · ${compareTally(comparison, "removed")} removed · ${compareTally(comparison, "modified")} modified`,
          run: () => setOpen(true),
        },
        {
          id: "compare-set-baseline",
          label: "Set compare baseline to this board",
          run: capture,
        },
      ],
    }),
    [capture, comparison],
  );

  const dialog = (
    <CompareDialog
      open={open}
      onOpenChange={setOpen}
      comparison={comparison}
      // Two named endpoints, not a file history to page through — so the rail
      // says which two rather than offering a list of one.
      sourceNote={{ beforeLabel: baseline.label, afterLabel: "This board, now" }}
      problem={
        comparison.total === 0
          ? `Nothing has changed since the baseline (${baseline.label.toLowerCase()}). Edit the board, or set a new baseline from the menu.`
          : null
      }
      selectedChangeId={selectedChangeId}
      onSelectChange={setSelectedChangeId}
      // Overlay blends one pane over the other, which only means something
      // when the two share a camera. These are two independent DOM benches
      // with two independent origins, so the option is refused rather than
      // offered as a picture of nothing.
      canOverlay={false}
      testIdPrefix={COMPARE_TEST_ID_PREFIX}
      renderBefore={() => (
        <ComparePane scene={baseline.scene} frame={frame} changes={comparison.changes} side="before" selected={selected} />
      )}
      renderAfter={() => (
        <ComparePane scene={current} frame={frame} changes={comparison.changes} side="after" selected={selected} />
      )}
    />
  );

  return { group, dialog, changeCount: comparison.total, open: () => setOpen(true) };
}
