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

  // UNRESOLVED, and deliberately visible: there is NO `assetUrls` prop below,
  // so tldraw serves its icons, fonts, translations and embed icons from
  // https://cdn.tldraw.com/5.3.2/ — 78 requests, measured with a Playwright
  // request listener against this app on :4340. The app needs the network on
  // first paint; the canvas, the dock and every bbox component do not.
  //
  // WHY it is not the self-hosted `getAssetUrlsByImport()` the plan asks for
  // (docs/SYSTEMSKETCH-REBUILD-PLAN.md §4 / the lane brief's STEP 4): that
  // helper only exists in `@tldraw/assets/imports.vite`, and
  // src/document/stockBoundary.test.ts:105 refuses ANY `@tldraw/*` import
  // except `@tldraw/tlschema` from every file under `src`. `tldraw` itself
  // re-exports no asset helper (checked: its package exports are `.` and
  // `./tldraw.css`), and moving the import outside `src` is outside this
  // lane's write set. The two rules as written cannot both hold.
  //
  // This lane took the reversible half: stock CDN assets, which cost only
  // offline use, rather than a source change that turns an acceptance gate
  // red. `@tldraw/assets` stays declared in package.json and excluded from
  // vite's prebundle so the fix is two lines once the dispatcher rules —
  // either whitelist `@tldraw/assets` in that regex beside `tlschema`, or
  // keep the CDN and delete the dependency. Recorded in README.md under
  // "Problems this lane cannot fix" so the decision is not silent.

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
