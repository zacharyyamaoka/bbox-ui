// src/chrome/FocusLens/focusLens.tsx — the HOST half of the propagation focus
// lens (parity item P-025, "focus DIMS, isolate HIDES").
//
// Neither half of this feature was built here: `@trunk/scene/focus` is the pure
// traversal (`focusSnapshot`/`focusStepLimits`, ported from the archive's
// `propagationGraph.ts`/`propagationFocus.ts`) and `@trunk/editor/focusControls`
// is the floating control (ported from `PropagationFocusControls.tsx`). Both
// were imported by this app ZERO times before this file. What was missing is
// exactly the list `@trunk/editor/README.md` says a host owes the lens: the
// seed, the live state, the paint, and somewhere to put the control.
//
// Four things this file owns, and nothing else:
//   1. THE SEED — one selected shape that the derived scene knows as a node or
//      an edge. The archive's `propagationSeedFromSelection`, restated over
//      `sceneFromStore.ts`'s projection instead of over tldraw bindings.
//   2. THE STATE — seed, the two step counts, and which lens is running.
//   3. THE PAINT — one generated CSS rule for DIM; tldraw's own
//      `getShapeVisibility` seam for ISOLATE (see `./focusVisibility.ts`).
//   4. THE PLACEMENT — see the WHY below; it is NOT where the archive put it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useEditor, useValue, type TLShapeId } from "tldraw";

import { FocusControls } from "@trunk/editor/focusControls";
import { focusSnapshot, focusStepLimits, type FocusDirection } from "@trunk/scene/focus";

import { useDocumentScene } from "../../document/sceneFromStore";
import { clearFocusHiddenShapeIds, setFocusHiddenShapeIds } from "./focusVisibility";
import "./focusLens.css";

export type FocusLensMode = "dim" | "hide";

interface FocusLensState {
  seedId: string | null;
  upstreamSteps: number;
  downstreamSteps: number;
  mode: FocusLensMode;
}

const IDLE: FocusLensState = { seedId: null, upstreamSteps: 1, downstreamSteps: 1, mode: "dim" };

/**
 * Every shape host that must stay bright for ONE focused scene object.
 *
 * WHY the descendants and the ancestors come too, when the traversal named
 * neither: a CSS filter applies to a whole subtree, so a dimmed block would
 * drag its own port dots down with it however brightly they were named — and an
 * included port sitting inside a dimmed block would still read as dim, because
 * its ancestor's filter is applied over it. The traversal answers a question
 * about the GRAPH ("which nodes and edges are within N steps"); which DOM hosts
 * that implies is this file's question, and it has a different answer.
 */
function hostIdsFor(
  editor: ReturnType<typeof useEditor>,
  includedIds: Iterable<string>,
): Set<string> {
  const hosts = new Set<string>();
  for (const id of includedIds) {
    const shapeId = id as TLShapeId;
    if (!editor.getShape(shapeId)) continue;
    for (const descendant of editor.getShapeAndDescendantIds([shapeId])) hosts.add(String(descendant));
    for (const ancestor of editor.getShapeAncestors(shapeId)) hosts.add(String(ancestor.id));
  }
  return hosts;
}

/** A CSS attribute-selector literal for a shape id. Ids are minted by tldraw
 *  (`shape:` + a nanoid) so this can only ever be a no-op, but a board that
 *  arrives from a file is not something to take on trust. */
function cssIdLiteral(id: string): string {
  return `"${id.replace(/["\\]/g, "\\$&")}"`;
}

export function FocusLens() {
  const editor = useEditor();
  const scene = useDocumentScene(editor);
  const [state, setState] = useState<FocusLensState>(IDLE);

  const selectedIds = useValue(
    "ss focus lens selection",
    () => editor.getSelectedShapeIds().map(String),
    [editor],
  );

  /** One selected thing the SCENE knows about. Two selected shapes have no
   *  single seed, and a shape the projection dropped (a half-bound wire) has
   *  no place in the traversal. */
  const seedCandidate = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const id = selectedIds[0];
    const known = scene.nodes.some((node) => node.id === id) || scene.edges.some((edge) => edge.id === id);
    return known ? id : null;
  }, [selectedIds, scene]);

  // A seed whose shape has been deleted takes the lens down with it, rather
  // than leaving the board dimmed around something that is not there.
  useEffect(() => {
    if (!state.seedId) return;
    const alive = scene.nodes.some((node) => node.id === state.seedId) || scene.edges.some((edge) => edge.id === state.seedId);
    if (!alive) setState(IDLE);
  }, [scene, state.seedId]);

  const limits = useMemo(
    () => (state.seedId ? focusStepLimits(scene, state.seedId, state.upstreamSteps) : { upstream: 0, downstream: 0 }),
    [scene, state.seedId, state.upstreamSteps],
  );

  const snapshot = useMemo(
    () => focusSnapshot(scene, state.seedId, state.upstreamSteps, state.downstreamSteps),
    [scene, state.seedId, state.upstreamSteps, state.downstreamSteps],
  );

  const active = snapshot.seedId !== null;

  const hostIds = useMemo(
    () => (active ? hostIdsFor(editor, [...snapshot.includedNodeIds, ...snapshot.includedEdgeIds]) : new Set<string>()),
    [editor, active, snapshot],
  );

  /* ------------------------------------------------------- DIM: the paint */

  useLayoutEffect(() => {
    const container = editor.getContainer();
    if (active && state.mode === "dim") container.setAttribute("data-ss-focus", "dim");
    else container.removeAttribute("data-ss-focus");
    return () => container.removeAttribute("data-ss-focus");
  }, [editor, active, state.mode]);

  /* ---------------------------------------------------- ISOLATE: the hide */

  useEffect(() => {
    if (!active || state.mode !== "hide") {
      clearFocusHiddenShapeIds();
      return;
    }
    const hidden = new Set<string>();
    for (const id of editor.getCurrentPageShapeIds()) {
      if (!hostIds.has(String(id))) hidden.add(String(id));
    }
    setFocusHiddenShapeIds(hidden);
  }, [editor, active, state.mode, hostIds]);

  // The lens is chrome, not document state: whatever it was doing, leaving
  // takes it with it. Without this an unmount mid-isolate would leave every
  // other shape on the board hidden with no control left to clear it.
  useEffect(() => clearFocusHiddenShapeIds, []);

  /* ------------------------------------------------------------- controls */

  const start = useCallback(() => {
    if (!seedCandidate) return;
    setState((current) => ({ ...current, seedId: seedCandidate, upstreamSteps: 1, downstreamSteps: 1 }));
  }, [seedCandidate]);

  const changeSteps = useCallback((direction: FocusDirection, value: number) => {
    setState((current) =>
      direction === "upstream" ? { ...current, upstreamSteps: value } : { ...current, downstreamSteps: value },
    );
  }, []);

  const clear = useCallback(() => setState(IDLE), []);
  const changeMode = useCallback((mode: FocusLensMode) => setState((current) => ({ ...current, mode })), []);

  if (!active && !seedCandidate) return null;

  const included = [...hostIds]
    .map((id) => `.tl-container[data-ss-focus="dim"] .tl-shape[data-shape-id=${cssIdLiteral(id)}]`)
    .join(",");

  return (
    <div
      className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2"
      data-testid="ss-focus-lens"
    >
      {/* WHY a generated stylesheet rather than marking each host: see
          ./focusLens.css. One rule, no MutationObserver, and a shape that
          tldraw re-mounts while panning is already covered. */}
      {active && state.mode === "dim" && included ? (
        <style data-testid="ss-focus-lens-style">{`${included}{filter:none;transition:filter 120ms ease-out}`}</style>
      ) : null}
      <FocusControls
        hasSeed={seedCandidate !== null}
        active={active}
        limits={limits}
        upstreamSteps={snapshot.upstreamSteps}
        downstreamSteps={snapshot.downstreamSteps}
        mode={state.mode}
        onModeChange={changeMode}
        onStart={start}
        onStepsChange={changeSteps}
        onClear={clear}
      />
    </div>
  );
}
