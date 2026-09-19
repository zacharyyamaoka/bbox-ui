// src/App.tsx — SystemSketch, mounted.
//
// The whole thesis of the rebuild in one file: SystemSketch IS bbox-ui + stock
// tldraw. Every capability this app adds enters through a prop tldraw
// documents — `shapeUtils`, `bindingUtils`, `tools`, `components`, `overrides`,
// `onMount` — and this file composes them. It defines no shape, no gesture and
// no geometry of its own; src/document/stockBoundary.test.ts asserts exactly
// that, from day 0, because the archive's own boundary test
// (/home/bam/systemsketch/tests/test_stock_boundary.py) is what kept the
// original honest for a year.
import { useCallback } from "react";
import { Tldraw, type Editor, type TLComponents, type TLUiOverrides } from "tldraw";

import "tldraw/tldraw.css";
import "./app.css";

import { SystemSketchDock } from "./chrome/dock";
import { Overlay } from "./chrome/overlay";
import { BINDING_UTILS, KITS, SHAPE_UTILS, TOOLS, withToolUi } from "./shapes/registry";

export interface AppProps {
  /** `undefined` → the app's own board. `null` → no persistence at all, which
   *  is what a test mounts with (src/testing/harness.tsx): a suite must never
   *  inherit a previous run's board, and must never write one. */
  persistenceKey?: string | null;
  /** Fires once from `onMount`, AFTER every kit has installed. */
  onEditorReady?(editor: Editor): void;
}

const DEFAULT_PERSISTENCE_KEY = "systemsketch";

const COMPONENTS: TLComponents = {
  // The trunk's own dock replaces tldraw's toolbar in the slot tldraw provides
  // for it — the same seam the archive used. One system-family icon, not two.
  Toolbar: SystemSketchDock,
  InFrontOfTheCanvas: Overlay,
};

// Keyboard shortcuts for our tools. A dock row whose id has no `tools[id]`
// entry is a silent no-op; see the `toolUi` contract in ./shapes/registry.
const OVERRIDES: TLUiOverrides = {
  tools: withToolUi,
};

export function App({ persistenceKey, onEditorReady }: AppProps) {
  const handleMount = useCallback(
    (editor: Editor) => {
      const stops = KITS.flatMap((kit) => (kit.install ? [kit.install(editor)] : []));
      onEditorReady?.(editor);
      return () => {
        for (const stop of stops) stop();
      };
    },
    [onEditorReady],
  );

  const key = persistenceKey === undefined ? DEFAULT_PERSISTENCE_KEY : persistenceKey;

  return (
    <main data-testid="systemsketch-app" style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        shapeUtils={SHAPE_UTILS}
        bindingUtils={BINDING_UTILS}
        tools={TOOLS}
        components={COMPONENTS}
        overrides={OVERRIDES}
        onMount={handleMount}
        persistenceKey={key ?? undefined}
        colorScheme="system"
      />
    </main>
  );
}
