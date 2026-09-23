/** The board spec, verbatim from docs/vocab_board.py's docstring. */

export type Flow = "lr" | "tb";

export type Shape =
  | "box"
  | "pill"
  | "round"
  | "diamond"
  | "badge"
  | "terminal"
  | "note";

export type Accent = "data" | "exec" | "err" | "item" | "geo" | "ctrl" | "dim";

export type FrameStyle = "wall" | "paired" | "subsystem" | "dashed" | "plain";

export type WireKind =
  | "data"
  | "exec"
  | "err"
  | "item"
  | "geo"
  | "ctrl"
  | "fb"
  | "dim";

export interface SpecNode {
  id: string;
  t: string;
  sub?: string;
  c: number;
  r: number;
  shape?: Shape;
  in?: string[];
  out?: string[];
  /** has an EXECUTION input pin (white triangle) */
  xin?: boolean;
  /** execution OUTPUT pins, drawn BELOW the data outs */
  xout?: string[];
  accent?: Accent;
  tag?: string;
  /** tb only: draw inlet/outlet labels (default false) */
  plabels?: boolean;
}

export interface SpecFrame {
  id: string;
  t?: string;
  style?: FrameStyle;
  /** node ids inside it — the box is COMPUTED from them */
  members: string[];
  /** tunnels on the LEFT wall (LabVIEW). names. */
  ltun?: string[];
  /** tunnels on the RIGHT wall */
  rtun?: string[];
  tag?: string;
}

export interface SpecWire {
  a: string;
  b: string;
  k?: WireKind;
  /** short label on the wire */
  t?: string;
  dash?: boolean;
}

export interface Spec {
  flow?: Flow;
  nodes: SpecNode[];
  frames?: SpecFrame[];
  wires?: SpecWire[];
  /** caption, rendered by the REPORT, not by us */
  cap?: string;
}

export interface BoardEntry {
  id: string;
  spec: Spec;
  scenario?: string;
  bucket?: string;
  members?: unknown;
}
