import "@xyflow/react/dist/style.css";
import "./theme.css";
import "./board.css";
import "./app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BOARDS, BOARD_BY_ID } from "./boards";
import { layout } from "./layout";

/* ------------------------------------------------------------- capture API */

/**
 * What docs/capture_vocab_boards.mjs drives. The report inlines the markup
 * __BOARD_HTML__ returns, so it has to be self-contained: every marker, every
 * transform and every colour must live inside the viewport or inside
 * dist/board.css, and nothing may need JavaScript to be correct.
 */
function readyBoardId(): string | undefined {
  return document.body.dataset.boardReady;
}

function viewportOf(id: string | undefined): Element | null {
  if (id) {
    const scoped = document.querySelector(`[data-board-id="${CSS.escape(id)}"] .react-flow__viewport`);
    if (scoped) return scoped;
  }
  return document.querySelector(".react-flow__viewport");
}

declare global {
  interface Window {
    __BOARD_HTML__: () => string;
    __BOARD_SIZE__: () => { width: number; height: number };
    __BOARD_IDS__: () => string[];
    __BOARD_ERRORS__: (id?: string) => string[];
    /** The analytic model, so a test can check what React Flow DREW against
     *  what layout.ts computed rather than trusting one of them. */
    __BOARD_MODEL__: (id?: string) => unknown;
  }
}

window.__BOARD_HTML__ = () => viewportOf(readyBoardId())?.outerHTML ?? "";

window.__BOARD_SIZE__ = () => {
  const id = readyBoardId() ?? new URLSearchParams(window.location.search).get("board") ?? "";
  const entry = BOARD_BY_ID.get(id);
  if (!entry) return { width: 0, height: 0 };
  const b = layout(entry.spec);
  return { width: b.W, height: b.H };
};

window.__BOARD_IDS__ = () => BOARDS.map((b) => b.id);

window.__BOARD_ERRORS__ = (id) => {
  if (id) {
    const e = BOARD_BY_ID.get(id);
    return e ? layout(e.spec).errors : [`no board with id ${id}`];
  }
  const all: string[] = [];
  for (const b of BOARDS) for (const e of layout(b.spec).errors) all.push(`${b.id}: ${e}`);
  return all;
};

window.__BOARD_MODEL__ = (id) => {
  const key = id ?? readyBoardId() ?? new URLSearchParams(window.location.search).get("board") ?? "";
  const entry = BOARD_BY_ID.get(key);
  if (!entry) return null;
  const b = layout(entry.spec);
  return {
    flow: b.flow,
    W: b.W,
    H: b.H,
    errors: b.errors,
    nodes: b.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, accent: n.accent ?? "", shape: n.shape ?? "box" })),
    frames: b.frames.map((f) => ({ id: f.id, style: f.style ?? "plain", box: f.box, ltun: f.ltun ?? [], rtun: f.rtun ?? [] })),
    wires: b.wires.map((w) => ({
      id: w.id,
      kind: w.kind,
      a: { owner: w.a1.owner, handle: w.a1.handle, x: w.a1.abs.x, y: w.a1.abs.y },
      b: { owner: w.b1.owner, handle: w.b1.handle, x: w.b1.abs.x, y: w.b1.abs.y },
    })),
  };
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
