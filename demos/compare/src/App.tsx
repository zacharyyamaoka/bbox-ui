import { CompareView } from "@bbox-ui/compare-view";
import { SCENE } from "@bbox-ui/demo-scene";

/**
 * The standalone compare harness: the extracted CompareView over the ONE
 * fixed demo scene (demos/scene). This app is the regression net — the
 * headless driver (demos/drive-compare.mjs) holds its divergence at 0.00px —
 * so it deliberately stays pinned to SCENE while the playground feeds the
 * same view a scene derived from its live board.
 */
export function App() {
  return <CompareView scene={SCENE} useHashMode />;
}
