/**
 * Layout, ported line-for-line from docs/vocab_board.py (`_size`, `layout`,
 * `anchor`).
 *
 * WHY verbatim rather than "equivalent": all 705 specs in src/boards.json were
 * authored and hand-checked against THESE constants — node sizing from port
 * counts, per-column vertical centring, the extra padding a tunnelled frame
 * claims before placement. Re-deriving the geometry would silently re-break
 * boards that a human already signed off, so the numbers below are the Python's
 * numbers and the ordering below is the Python's ordering.
 *
 * Layout runs BEFORE React Flow: every node gets an absolute position and an
 * explicit width/height, and React Flow is handed a fully-placed graph.
 */
import type { Accent, Flow, Spec, SpecFrame, SpecNode, SpecWire, WireKind } from "./types";

// Palette — the report chrome's CSS variables, so board and page are one system.
export const BG = "#0e0f12";
export const PANEL = "#15171c";
export const PANEL2 = "#1b1e25";
export const LINE = "#282d38";
export const LINE2 = "#343b49";
export const FG = "#e6e8ee";
export const DIM = "#9aa3b2";
export const DIM2 = "#6b7383";
export const ACCENT = "#f0883e";
export const ACCENT2 = "#5aa9f8";
export const OK = "#3fb950";
export const WARN = "#e5534b";
export const AMBER = "#e8c06a";
export const PURPLE = "#bc8cff";

export const KIND: Record<WireKind, { c: string; w: number; dash: string | null }> = {
  data: { c: ACCENT2, w: 1.7, dash: null },
  exec: { c: "#f2f4f8", w: 2.6, dash: null },
  err: { c: WARN, w: 1.7, dash: "4 3" },
  item: { c: AMBER, w: 1.7, dash: null },
  geo: { c: OK, w: 2.2, dash: null },
  ctrl: { c: PURPLE, w: 1.7, dash: "5 3" },
  fb: { c: AMBER, w: 1.7, dash: "5 3" },
  dim: { c: DIM2, w: 1.4, dash: "3 3" },
};

/** Marker id suffix per kind — one arrowhead per colour, declared once a board. */
export const MARKER: Record<WireKind, string> = {
  data: "wA",
  exec: "wX",
  err: "wE",
  item: "wI",
  geo: "wG",
  ctrl: "wC",
  fb: "wF",
  dim: "wD",
};

export const ACC: Record<string, string> = {
  data: ACCENT2,
  exec: "#f2f4f8",
  err: WARN,
  item: AMBER,
  geo: OK,
  ctrl: PURPLE,
  dim: DIM2,
  "": DIM2,
};

export const accentOf = (a: Accent | undefined | null): string => ACC[a ?? ""] ?? DIM2;

export const PAD = 16; // outer margin
export const COL_GAP = 46; // horizontal gap between columns
export const ROW_GAP = 22; // vertical gap between rows in a column
export const ROW_GAP_TB = 54; // top-down patching needs room for inlet/outlet labels
export const TITLE_H = 21;
export const PORT_H = 15;

/** The Python's text metric. Used for node sizing AND the frame tag-fits test. */
export const textW = (text: string, fs = 10.5): number => text.length * fs * 0.605;

export interface PlacedNode extends SpecNode {
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface PlacedFrame extends SpecFrame {
  /** [x, y, w, h], or null when no member resolved. */
  box: [number, number, number, number] | null;
}

export interface Anchor {
  x: number;
  y: number;
  /** true when the wire meets this point from the left (the Python's third tuple slot). */
  left: boolean;
}

/** One endpoint, resolved to the React Flow node + handle that carries it. */
export interface Endpoint {
  /** React Flow node id — "n:<id>" for a node, "f:<id>" for a frame. */
  owner: string;
  /** React Flow handle id — "in:x", "out:x", "xin", "x:True", "lt:n", "rt:n". */
  handle: string;
  /** Anchor in BOARD coordinates. */
  abs: Anchor;
  /** Anchor relative to the owner's own box — what React Flow needs. */
  rel: { x: number; y: number };
}

export interface PlacedWire extends SpecWire {
  id: string;
  kind: WireKind;
  a1: Endpoint;
  b1: Endpoint;
}

/** A handle React Flow must know about: its exact offset inside its node. */
export interface HandleSpec {
  id: string;
  type: "source" | "target";
  /** Which wall — decides the attach point React Flow computes. */
  position: "left" | "right" | "top" | "bottom";
  x: number;
  y: number;
  /** A visible port mark, or null for an alias handle that only anchors a wire. */
  mark: "dot-in" | "dot-out" | "tri-in" | "tri-out" | "tab-in" | "tab-out" | "tunnel" | null;
  /** Stroke colour for the mark. */
  colour: string;
}

export interface Board {
  flow: Flow;
  W: number;
  H: number;
  nodes: PlacedNode[];
  frames: PlacedFrame[];
  wires: PlacedWire[];
  /** React Flow node id -> the handles that node must declare. */
  handles: Map<string, HandleSpec[]>;
  errors: string[];
  cap: string;
}

export const nodeRfId = (id: string) => `n:${id}`;
export const frameRfId = (id: string) => `f:${id}`;

/** The shapes draw_node returns on before it can draw a single port mark. */
const MARKLESS = new Set(["pill", "badge", "terminal", "note", "diamond"]);
export const drawsPortMarks = (n: SpecNode): boolean => !MARKLESS.has(n.shape ?? "box");

/**
 * Which React Flow node type paints this spec node. draw_node's own order:
 * pill / badge / terminal / note / diamond are decided by shape whatever the
 * flow is, and only what is left falls through to the top-down box.
 */
export function nodeTypeOf(n: SpecNode, flow: Flow): string {
  switch (n.shape) {
    case "pill":
      return "vpill";
    case "badge":
      return "vbadge";
    case "terminal":
      return "vterminal";
    case "note":
      return "vnote";
    case "diamond":
      return "vdiamond";
    default:
      if (flow === "tb") return "vtb";
      return n.shape === "round" ? "vround" : "vnode";
  }
}

/* ----------------------------------------------------------------- sizing */

function sizeOf(n: SpecNode, flow: Flow): [number, number] {
  const ins = n.in ?? [];
  const outs = n.out ?? [];
  const xout = n.xout ?? [];
  const shape = n.shape ?? "box";
  const title = n.t ?? "";
  const rows = Math.max(ins.length, outs.length + xout.length, 0);
  if (shape === "pill" || shape === "badge" || shape === "terminal" || shape === "note") {
    const w = Math.max(54, textW(title) + 26);
    const h = shape !== "note" ? 24 : 22;
    return [w, h];
  }
  if (flow === "tb") {
    const w = Math.max(
      78,
      textW(title, 11) + 28,
      Math.max(ins.length, outs.length, 1) * 34 + 14,
    );
    return [w, 30];
  }
  const lw = ins.length ? Math.max(...ins.map((p) => textW(p))) : 0;
  const rw = outs.concat(xout).length
    ? Math.max(...outs.concat(xout).map((p) => textW(p)))
    : 0;
  const w = Math.max(96, textW(title, 11) + 26, lw + rw + 40);
  let h = TITLE_H + Math.max(rows, 1) * PORT_H + 7;
  if (n.sub) h += 11;
  if (n.xin && ins.length === 0) h = Math.max(h, TITLE_H + PORT_H + 7);
  return [w, h];
}

/* ----------------------------------------------------------------- layout */

export function layout(spec: Spec): Board {
  const flow: Flow = spec.flow ?? "lr";
  const errors: string[] = [];
  const order = (spec.nodes ?? []).map((n) => n.id);
  const nodeById = new Map<string, PlacedNode>();
  for (const n of spec.nodes ?? []) {
    const [w, h] = sizeOf(n, flow);
    nodeById.set(n.id, {
      ...n,
      w,
      h,
      x: 0,
      y: 0,
      c: Math.trunc(Number(n.c ?? 0)),
      r: Math.trunc(Number(n.r ?? 0)),
    });
  }
  const frames: PlacedFrame[] = (spec.frames ?? []).map((f) => ({ ...f, box: null }));

  const cols = new Map<number, string[]>();
  for (const nid of order) {
    const n = nodeById.get(nid)!;
    const bucket = cols.get(n.c);
    if (bucket) bucket.push(nid);
    else cols.set(n.c, [nid]);
  }
  for (const list of cols.values()) {
    // Stable sort by row, so ties keep spec order — Python's list.sort is stable.
    list.sort((a, b) => nodeById.get(a)!.r - nodeById.get(b)!.r);
  }

  // Frame padding has to exist BEFORE placement or a wall clips its members.
  const fpad = new Map<string, number>();
  for (const f of frames) {
    // A LabVIEW-style wall draws its tunnel labels on the INSIDE of the wall, so
    // a framed node needs clearance or the label lands under it.
    const pad = f.ltun?.length || f.rtun?.length ? 38 : 22;
    for (const m of f.members ?? []) {
      fpad.set(m, Math.max(fpad.get(m) ?? 0, pad));
    }
  }

  const sortedCols = [...cols.keys()].sort((a, b) => a - b);
  const colx = new Map<number, [number, number]>();
  let x = PAD;
  for (const c of sortedCols) {
    const wmax = Math.max(
      ...cols.get(c)!.map((i) => nodeById.get(i)!.w + (fpad.get(i) ?? 0) * 2),
    );
    colx.set(c, [x, wmax]);
    x += wmax + COL_GAP;
  }
  const totalW = sortedCols.length ? x - COL_GAP + PAD : PAD * 2;

  const rowGap = flow === "tb" ? ROW_GAP_TB : ROW_GAP;
  const heights = new Map<number, number>();
  for (const c of sortedCols) {
    let y = PAD + 12;
    for (const nid of cols.get(c)!) {
      const n = nodeById.get(nid)!;
      y += fpad.get(nid) ?? 0;
      n.y = y;
      y += n.h + rowGap + (fpad.get(nid) ?? 0);
    }
    heights.set(c, y - rowGap);
  }
  const totalH = (heights.size ? Math.max(...heights.values()) : 120) + PAD;

  // Centre each column vertically so a 1-node column sits beside a 3-node one.
  for (const c of sortedCols) {
    const shift = (totalH - heights.get(c)!) / 2;
    for (const nid of cols.get(c)!) nodeById.get(nid)!.y += shift;
  }
  for (const c of sortedCols) {
    const [cx, cw] = colx.get(c)!;
    for (const nid of cols.get(c)!) {
      const n = nodeById.get(nid)!;
      n.x = cx + (cw - n.w) / 2;
    }
  }

  let tagBelow = false;
  for (const f of frames) {
    const ms = (f.members ?? []).map((m) => nodeById.get(m)).filter(Boolean) as PlacedNode[];
    if (!ms.length) {
      errors.push(`frame ${f.id} has no resolvable members`);
      f.box = null;
      continue;
    }
    const p = f.ltun?.length || f.rtun?.length ? 26 : 17;
    const x0 = Math.min(...ms.map((m) => m.x)) - p;
    const y0 = Math.min(...ms.map((m) => m.y)) - p - 13;
    const x1 = Math.max(...ms.map((m) => m.x + m.w)) + p;
    const y1 = Math.max(...ms.map((m) => m.y + m.h)) + p;
    f.box = [x0, y0, x1 - x0, y1 - y0];
    if (f.tag && textW(f.t ?? "", 10) + textW(f.tag, 9.2) + 26 > x1 - x0) tagBelow = true;
  }

  const W = totalW;
  const H = Math.max(totalH, 120) + (tagBelow ? 16 : 0);

  const board: Board = {
    flow,
    W,
    H,
    nodes: order.map((i) => nodeById.get(i)!),
    frames,
    wires: [],
    handles: new Map(),
    errors,
    cap: spec.cap ?? "",
  };

  /* --------------------------------------------------------------- anchors */

  // WHY the longest alternative comes first: a naive `(in|out|x|xin|lt|rt)`
  // matches "x" inside "xin", so `n.xin` silently parses as side "x" + port
  // "in" and every execution-input wire resolves to the node's RIGHT wall.
  // `xin` must be tried before `x`. layout.test.ts pins exactly this.
  const ENDPOINT = /^([A-Za-z0-9_-]+)\.(xin|in|out|x|lt|rt)\.?(.*)$/;

  function resolve(ref: string | undefined): Endpoint | null {
    const m = ENDPOINT.exec(ref ?? "");
    if (!m) {
      errors.push(`bad endpoint ${JSON.stringify(ref ?? null)}`);
      return null;
    }
    const nid = m[1];
    const side = m[2];
    const port = m[3] ?? "";

    if (side === "lt" || side === "rt") {
      const f = frames.find((q) => q.id === nid);
      if (!f || !f.box) {
        errors.push(`tunnel on unknown frame ${JSON.stringify(nid)}`);
        return null;
      }
      const [fx, fy, fw, fh] = f.box;
      const lst = (side === "lt" ? f.ltun : f.rtun) ?? [];
      const i = lst.indexOf(port) >= 0 ? lst.indexOf(port) : 0;
      const step = fh / (lst.length + 1);
      const ax = side === "lt" ? fx : fx + fw;
      const ay = fy + step * (i + 1);
      return {
        owner: frameRfId(nid),
        handle: `${side}:${port}`,
        abs: { x: ax, y: ay, left: side === "lt" },
        rel: { x: ax - fx, y: ay - fy },
      };
    }

    const n = nodeById.get(nid);
    if (!n) {
      errors.push(`wire to unknown node ${JSON.stringify(nid)}`);
      return null;
    }
    const mk = (ax: number, ay: number, left: boolean, handle: string): Endpoint => ({
      owner: nodeRfId(nid),
      handle,
      abs: { x: ax, y: ay, left },
      rel: { x: ax - n.x, y: ay - n.y },
    });

    if (flow === "tb") {
      const raw = side === "in" || side === "xin" ? n.in : n.out;
      const lst = raw && raw.length ? raw : [""];
      const i = lst.indexOf(port) >= 0 ? lst.indexOf(port) : 0;
      const step = n.w / (lst.length + 1);
      const top = side === "in" || side === "xin";
      return mk(n.x + step * (i + 1), n.y + (top ? 0 : n.h), top, `${side}:${port}`);
    }

    const shape = n.shape ?? "box";
    if (shape === "pill" || shape === "badge" || shape === "terminal" || shape === "note") {
      const left = side === "in" || side === "xin";
      return mk(
        n.x + (left ? 0 : n.w),
        n.y + n.h / 2,
        left,
        side === "xin" ? "xin" : `${side}:${port}`,
      );
    }

    const base = n.y + TITLE_H + (n.sub ? 11 : 0);
    if (side === "xin") return mk(n.x, base + PORT_H / 2, true, "xin");
    if (side === "x") {
      const lst = n.xout ?? [];
      const i = lst.indexOf(port) >= 0 ? lst.indexOf(port) : 0;
      const off = (n.out ?? []).length;
      return mk(n.x + n.w, base + PORT_H * (off + i) + PORT_H / 2, false, `x:${port}`);
    }
    const raw = side === "in" ? n.in : n.out;
    const lst = raw && raw.length ? raw : [""];
    const i = lst.indexOf(port) >= 0 ? lst.indexOf(port) : 0;
    const left = side === "in";
    return mk(
      n.x + (left ? 0 : n.w),
      base + PORT_H * i + PORT_H / 2,
      left,
      `${side}:${port}`,
    );
  }

  /* --------------------------------------------------------------- handles */

  const handles = board.handles;
  const seen = new Set<string>();
  const put = (owner: string, h: HandleSpec) => {
    const key = `${owner}|${h.type}|${h.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const list = handles.get(owner);
    if (list) list.push(h);
    else handles.set(owner, [h]);
  };

  // The visible ports first, so the mark lands on the real handle rather than a
  // decorative sibling — the handle IS the dot / triangle / tab / tunnel square.
  for (const n of board.nodes) {
    const owner = nodeRfId(n.id);
    const colour = accentOf(n.accent);
    // WHY this precedence and not the anchor rule's: draw_node returns on
    // pill/badge/terminal/note/diamond BEFORE it reaches the tb branch, so a
    // pill inside a top-down patch still draws as a pill with no inlet tabs —
    // while `anchor` puts the tb branch FIRST, so that same pill's wires still
    // meet its top and bottom edges. Marks follow the drawing, anchors follow
    // the anchoring; conflating them puts nubs on 56 Max/MSP pills.
    if (!drawsPortMarks(n)) continue;

    if (flow === "tb") {
      const ins = n.in ?? [];
      const outs = n.out ?? [];
      ins.forEach((p, i) => {
        const step = n.w / (ins.length + 1);
        put(owner, {
          id: `in:${p}`,
          type: "target",
          position: "top",
          x: step * (i + 1),
          y: 0,
          mark: "tab-in",
          colour,
        });
      });
      outs.forEach((p, i) => {
        const step = n.w / (outs.length + 1);
        put(owner, {
          id: `out:${p}`,
          type: "source",
          position: "bottom",
          x: step * (i + 1),
          y: n.h,
          mark: "tab-out",
          colour,
        });
      });
      continue;
    }

    const base = TITLE_H + (n.sub ? 11 : 0);
    if (n.xin) {
      put(owner, {
        id: "xin",
        type: "target",
        position: "left",
        x: 0,
        y: base + PORT_H / 2,
        mark: "tri-in",
        colour,
      });
    }
    (n.in ?? []).forEach((p, i) => {
      put(owner, {
        id: `in:${p}`,
        type: "target",
        position: "left",
        x: 0,
        y: base + PORT_H * i + PORT_H / 2,
        mark: "dot-in",
        colour,
      });
    });
    const outs = n.out ?? [];
    outs.forEach((p, i) => {
      put(owner, {
        id: `out:${p}`,
        type: "source",
        position: "right",
        x: n.w,
        y: base + PORT_H * i + PORT_H / 2,
        mark: "dot-out",
        colour,
      });
    });
    (n.xout ?? []).forEach((p, i) => {
      put(owner, {
        id: `x:${p}`,
        type: "source",
        position: "right",
        x: n.w,
        y: base + PORT_H * (outs.length + i) + PORT_H / 2,
        mark: "tri-out",
        colour,
      });
    });
  }

  for (const f of frames) {
    if (!f.box) continue;
    const owner = frameRfId(f.id);
    const [, , fw, fh] = f.box;
    for (const [side, lst] of [
      ["lt", f.ltun ?? []],
      ["rt", f.rtun ?? []],
    ] as const) {
      const step = fh / (lst.length + 1);
      lst.forEach((p, i) => {
        const hx = side === "lt" ? 0 : fw;
        const hy = step * (i + 1);
        // A tunnel is both ends of one hole in the wall: a wire runs into it
        // from one side and out of it on the other, so it is source AND target.
        put(owner, { id: `${side}:${p}`, type: "target", position: "left", x: hx, y: hy, mark: "tunnel", colour: AMBER });
        put(owner, { id: `${side}:${p}`, type: "source", position: "right", x: hx, y: hy, mark: null, colour: AMBER });
      });
    }
  }

  /* ----------------------------------------------------------------- wires */

  (spec.wires ?? []).forEach((w, i) => {
    const a1 = resolve(w.a);
    const b1 = resolve(w.b);
    if (!a1 || !b1) return;
    const kind: WireKind = (w.k && w.k in KIND ? w.k : "data") as WireKind;
    // An endpoint may be asked for in a direction its port was not declared in
    // (`out` used as a target happens 5 times in the corpus, `in` as a source
    // once). Declare the alias so React Flow can still find it; it sits at the
    // same point and draws nothing of its own.
    put(a1.owner, aliasFor(a1, "source"));
    put(b1.owner, aliasFor(b1, "target"));
    board.wires.push({ ...w, id: `w${i}`, kind, a1, b1 });
  });

  function aliasFor(e: Endpoint, type: "source" | "target"): HandleSpec {
    const position: HandleSpec["position"] =
      flow === "tb" ? (e.abs.left ? "top" : "bottom") : e.abs.left ? "left" : "right";
    return { id: e.handle, type, position, x: e.rel.x, y: e.rel.y, mark: null, colour: DIM2 };
  }

  return board;
}
