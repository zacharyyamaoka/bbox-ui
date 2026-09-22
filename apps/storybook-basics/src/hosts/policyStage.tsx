/**
 * src/hosts/policyStage.tsx — the shared stage every
 * `Hosts/DragPolicy/*` story stands on.
 *
 * Zach asked for exactly this shape (`PROJECT - Black Box UI.md:2512`):
 *
 *   "So in the story I imagine like a little table with the text, on the
 *    canvas, use a host reactflow/tldraw that syas like here is the
 *    expected interaction, and then I can basically like click it and move
 *    it my self to test."
 *
 * So: the table on the left, the live React Flow canvas on the right, and
 * the table's rows generated from `DRAG_DECLARATIONS` — the same data the
 * predicates read. A table typed by hand beside behaviour computed from
 * data is a table that drifts; this one cannot.
 *
 * WHY the roles are painted on the real declared elements rather than as a
 * measured overlay: the same reason `src/components/hitRegion.ts` gives —
 * a drawn rectangle that does not correspond to real hit-testing is
 * decoration. Here the wash is applied by `data-slot` selector to the
 * elements the walk actually resolves, so the paint and the policy share
 * one source of truth.
 *
 * tldraw is NOT on this stage. Phase 1 deliberately cut it (it needs a
 * ShapeUtil, a toolbar entry and frame interop), so every story here says
 * React Flow and the report records where tldraw would differ.
 */

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { HIT_REGION_FILL, HIT_REGION_LINE } from "../components/hitRegion";
import type { HostScene } from "./hostScene";
import { ReactFlowHost } from "./reactFlowHost";
import { DRAG_DECLARATIONS, POLICY_TABLE, type DragDeclaration, type GrabRole } from "../scene/interactions/dragPolicy";
import { OWNER_ATTR, resolveGrabAt } from "./grabChain";

/* ------------------------------------------------------------------ */
/* Role paint — three roles, three readings                            */
/* ------------------------------------------------------------------ */

/**
 * WHY three distinct colours and not a single hit wash: the whole point of
 * the policy is that "not grabbable" splits in two — an INERT surface lets
 * the press through to whatever is beneath, while an OWNS-POINTER surface
 * consumes it. Painting both grey would hide the distinction the report is
 * about.
 */
export const ROLE_PAINT: Record<GrabRole, { fill: string; line: string; label: string; blurb: string }> = {
  grab: {
    fill: HIT_REGION_FILL,
    line: HIT_REGION_LINE,
    label: "grab",
    blurb: "press and drag here moves the thing — from cold, no selection first",
  },
  inert: {
    fill: "color-mix(in srgb, currentColor 8%, transparent)",
    line: "color-mix(in srgb, currentColor 35%, transparent)",
    label: "inert",
    blurb: "press starts nothing here; it falls through to what is beneath",
  },
  "owns-pointer": {
    fill: "color-mix(in srgb, oklch(0.62 0.19 260) 18%, transparent)",
    line: "color-mix(in srgb, oklch(0.62 0.19 260) 70%, transparent)",
    label: "owns pointer",
    blurb: "the subtree consumes the press — caret, rail, cable. Host stays out",
  },
};

/** CSS that washes each declared part in its role's colour, by the very
 *  `data-slot` the resolver keys on. */
function rolePaintCss(declaration: DragDeclaration, scope: string): string {
  const rules: string[] = [];
  for (const [slot, role] of Object.entries(declaration.parts)) {
    const paint = ROLE_PAINT[role];
    rules.push(
      `${scope} [data-slot="${slot}"]{background-image:linear-gradient(${paint.fill},${paint.fill});outline:1px dashed ${paint.line};outline-offset:-1px;}`,
    );
  }
  const face = ROLE_PAINT[declaration.face];
  rules.push(`${scope}{box-shadow:inset 0 0 0 2px ${face.line};}`);
  return rules.join("\n");
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const cell: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid color-mix(in srgb, currentColor 15%, transparent)", verticalAlign: "top", fontSize: 11, lineHeight: 1.45 };
const head: CSSProperties = { ...cell, fontWeight: 600, whiteSpace: "nowrap" };

/** The per-part declaration, as a table. This is "here is the expected
 *  interaction" for one component. */
export function DeclarationTable({ declarationKey }: { declarationKey: string }) {
  const declaration = DRAG_DECLARATIONS[declarationKey];
  if (!declaration) return <p style={{ fontSize: 12 }}>No declaration for <code>{declarationKey}</code>.</p>;
  const rows = Object.entries(declaration.parts);
  return (
    <div data-testid="declaration-table">
      <h3 style={{ fontSize: 13, margin: "0 0 2px" }}>{declaration.component}</h3>
      <p style={{ fontSize: 11, margin: "0 0 8px", opacity: 0.75 }}>
        declares <code>{declarationKey}</code> · face is{" "}
        <strong data-testid="face-role">{ROLE_PAINT[declaration.face].label}</strong>
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr><th style={head}>part (<code>data-slot</code>)</th><th style={head}>role</th><th style={head}>what a press does</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, fontStyle: "italic" }}>the face (anything else)</td>
            <td style={{ ...cell, whiteSpace: "nowrap" }}><RoleChip role={declaration.face} /></td>
            <td style={cell}>{ROLE_PAINT[declaration.face].blurb}</td>
          </tr>
          {rows.map(([slot, role]) => (
            <tr key={slot} data-testid={`row-${slot}`}>
              <td style={cell}><code>{slot}</code></td>
              <td style={{ ...cell, whiteSpace: "nowrap" }}><RoleChip role={role} /></td>
              <td style={cell}>{ROLE_PAINT[role].blurb}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {declaration.editableParts && declaration.editableParts.length > 0 && (
        <p style={{ fontSize: 11, marginTop: 8, opacity: 0.8 }}>
          Editable once already active: {declaration.editableParts.map((p) => <code key={p} style={{ marginRight: 6 }}>{p}</code>)}
        </p>
      )}
    </div>
  );
}

export function RoleChip({ role }: { role: GrabRole }) {
  const paint = ROLE_PAINT[role];
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 10, background: paint.fill, outline: `1px solid ${paint.line}` }}>
      {paint.label}
    </span>
  );
}

/** The gesture table — identical for every component, because the state
 *  machine is the host's and does not vary per component. */
export function GestureTable() {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }} data-testid="gesture-table">
      <thead>
        <tr><th style={head}>gesture</th><th style={head}>on a grab part</th><th style={head}>on an inert part</th><th style={head}>on a pointer-owning part</th></tr>
      </thead>
      <tbody>
        {POLICY_TABLE.map((row) => (
          <tr key={row.gesture}>
            <td style={{ ...cell, fontWeight: 500 }}>{row.gesture}</td>
            <td style={cell}>{row.onGrab}</td>
            <td style={cell}>{row.onInert}</td>
            <td style={cell}>{row.onOwned}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* The live probe — what the browser says, under the pointer            */
/* ------------------------------------------------------------------ */

/**
 * Hover readout: the resolved role for whatever is under the pointer, read
 * through the REAL walk over REAL elements. Zach's "when the component is
 * merely being hovered over" column, made live rather than described.
 */
export function GrabProbe({ children }: { children: ReactNode }) {
  const [readout, setReadout] = useState<{ role: GrabRole | "—"; owner: string | null; via: string }>({ role: "—", owner: null, via: "—" });
  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const resolution = resolveGrabAt(event.target as Element, event.currentTarget as Element);
    setReadout({ role: resolution.role, owner: resolution.owner, via: resolution.via });
  }, []);
  return (
    <div onPointerMove={onPointerMove} style={{ display: "grid", gap: 6 }}>
      <div
        data-testid="grab-probe"
        data-role={readout.role}
        data-via={readout.via}
        style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", padding: "4px 8px", border: "1px solid color-mix(in srgb, currentColor 20%, transparent)", borderRadius: 4 }}
      >
        under pointer → <strong>{readout.role}</strong> · via <code>{readout.via}</code> · owner {readout.owner ?? "none"}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The stage                                                           */
/* ------------------------------------------------------------------ */

export interface PolicyStageProps {
  declarationKey: string;
  /** The scene rendered in the live host. */
  scene: HostScene;
  /** Which scene node ids carry this declaration (the wrapper applies the
   *  attribute; see "Owed wiring" — the components will emit it
   *  themselves once that lane clears). */
  declaredNodes: readonly string[];
  width?: number;
  height?: number;
  note?: ReactNode;
}

/**
 * The stage: table + live canvas, with the declaration attribute injected
 * onto the host's rendered nodes.
 *
 * WHY the attribute is injected here by a `useLayoutEffect`-free
 * post-render pass rather than passed as a prop: a concurrent lane owns
 * every file under `src/components/**` right now, so no component can be
 * edited to emit `data-drag-owner` yet. Injecting from the story keeps the
 * policy demonstrable today and the wiring a one-line follow-up per
 * component — recorded in the report's "Owed wiring" list. This scaffold
 * is meant to be DELETED when that lands, not kept.
 */
export function PolicyStage({ declarationKey, scene, declaredNodes, width = 560, height = 340, note }: PolicyStageProps) {
  const [live, setLive] = useState(scene);
  const css = useMemo(() => rolePaintCss(DRAG_DECLARATIONS[declarationKey] ?? { component: "", face: "inert", parts: {} }, `[${OWNER_ATTR}="${declarationKey}"]`), [declarationKey]);

  // Inject the declaration onto the host's node roots after each render.
  const attach = useCallback(
    (root: HTMLDivElement | null) => {
      if (!root) return;
      for (const id of declaredNodes) {
        root.querySelector(`[data-scene-node="${id}"]`)?.setAttribute(OWNER_ATTR, declarationKey);
      }
    },
    [declarationKey, declaredNodes],
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{css}</style>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <DeclarationTable declarationKey={declarationKey} />
          {note && <div style={{ fontSize: 11, lineHeight: 1.5, opacity: 0.85 }}>{note}</div>}
        </div>
        <GrabProbe>
          <div ref={attach} data-testid="policy-canvas">
            <ReactFlowHost scene={live} onSceneChange={setLive} width={width} height={height} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
          </div>
          <p style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>
            Grab it. Orange drags, blue is owned by the thing inside it, grey lets the press through.
          </p>
        </GrabProbe>
      </div>
      <details>
        <summary style={{ fontSize: 12, cursor: "pointer" }}>The gesture table — identical for every component (the state machine is the host's)</summary>
        <div style={{ marginTop: 8 }}><GestureTable /></div>
      </details>
    </div>
  );
}
