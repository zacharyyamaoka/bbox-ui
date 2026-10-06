// src/chrome/portScene.ts — the HostPort's CACHED scene, for the host-side
// readers the shell mounts (`problems.ts`, `FocusLens/focusLens.tsx`,
// `CompareView/compareView.tsx`).
//
// WHY these read the port and not `editor.store`: the old reader
// (`useDocumentScene`, document/sceneFromStore.ts) derived over
// `editor.store.allRecords()`, so every camera move, pointer move and click
// rebuilt the whole scene and re-ran every analysis over it
// (completeness-critic #18; lanes.json B-SHELL-P1 extra 5). The tldraw port's
// `scene()` (`./tldrawHostPort.ts`) changes only when a shape or a binding
// does — `tldrawHostPort.smoke.test.tsx` "SHELL-P1/residual-scene" pins it.
//
// WHY its own module and not an export of `./tldrawHostPort.ts`: `problems.ts`
// is loaded by the node `unit` project (`backend/backend.test.ts`), which
// imports no component and no tldraw; the adapter imports both.
import { useHostValue } from "@trunk/shell/BboxShell";
import type { HostPort } from "@trunk/shell/hostPort";

import type { DocumentScene } from "../document/sceneFromStore";

const EMPTY_SCENE: DocumentScene = { nodes: [], edges: [] };

/** The port's scene, typed as the projection it is. `HostPort.scene()` is the
 *  trunk's generic `BlockScene`; on the tldraw host it is always the document
 *  projection (`sceneFromRecords`), so a host-side reader may name its data. */
export function documentSceneOf(port: HostPort): DocumentScene {
  return port.scene() as DocumentScene;
}

/** Re-renders only when the scene's REFERENCE changes — a camera or selection
 *  notification re-reads the same cached object and React bails out. */
export function usePortScene(): DocumentScene {
  return useHostValue(documentSceneOf, EMPTY_SCENE);
}
