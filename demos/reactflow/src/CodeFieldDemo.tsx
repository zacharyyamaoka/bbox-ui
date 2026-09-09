import { useMemo, useState } from "react";

import {
  CodeField,
  CodeFieldModeToggle,
  lineStartOffset,
  signatureGrammar,
  type CodeFieldReference,
} from "@bbox-ui/core";

/**
 * A tiny static "board" so `resolveReference` has something real to resolve
 * against — stands in for the live board scan a host (SystemSketch's own
 * Type attribute body, say) would run. Demo-only; this file is deliberately
 * NOT part of `demos/scene` (the compare harness's shared content) — the
 * field's own demo has nothing to do with the Block/Port comparison that
 * package exists for, and duplicating this ~80-line panel between the two
 * host demos keeps each demo app independent, the same reason the two
 * adapter packages never import each other.
 */
const KNOWN_TYPES: Record<string, string> = {
  Pose: "x: float = 0.0\ny: float = 0.0\ntheta: float = 0.0",
};
const PRIMITIVES = ["int", "float", "str", "bool"];

function resolveReference(name: string, onJump: (name: string) => void): CodeFieldReference | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (PRIMITIVES.includes(trimmed)) return { kind: "primitive" };
  const fields = KNOWN_TYPES[trimmed];
  if (fields) {
    return {
      kind: "known",
      onJump: () => onJump(trimmed),
      expandLines: () => signatureGrammar().lines!(fields),
    };
  }
  return { kind: "unknown" };
}

const TYPES = [
  { label: "Pose", kind: "known" },
  { label: "int", kind: "primitive" },
  { label: "float", kind: "primitive" },
  { label: "str", kind: "primitive" },
];
const VALUES = [{ label: "None" }, { label: "0.0" }, { label: "default_pose()" }];
const KIND_LABELS = { known: "board type", primitive: "primitive" };

/**
 * `CodeField` driven three ways: a single port row, a multi-line port lane
 * (with folding), and the RENDERED ⟷ SOURCE toggle over a Type-style
 * attribute body — the same `signature` grammar in all three, proving the
 * one component covers a port row, a lane, and an attribute tree without a
 * fork.
 */
export function CodeFieldDemo() {
  const [portRow, setPortRow] = useState("pose: Pose = None");
  const [lane, setLane] = useState(
    "pose: Pose = None\nwindow: int = 5\ntemperature sensor readings",
  );
  const [attrs, setAttrs] = useState("origin: Pose\nsamples: int = 10\nlabel: str = \"cam\"");
  const [mode, setMode] = useState<"rendered" | "source">("rendered");
  const [cursorAt, setCursorAt] = useState<number | undefined>(undefined);
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);

  const rowGrammar = useMemo(
    () => signatureGrammar({ types: TYPES, values: VALUES, kindLabels: KIND_LABELS }),
    [],
  );
  const laneGrammar = useMemo(
    () =>
      signatureGrammar({
        types: TYPES,
        values: VALUES,
        kindLabels: KIND_LABELS,
        foldInactiveLinesAfter: 22,
      }),
    [],
  );
  const attrGrammar = useMemo(
    () =>
      signatureGrammar({
        types: TYPES,
        values: VALUES,
        kindLabels: KIND_LABELS,
        resolveReference: (name) => resolveReference(name, setJumpedTo),
      }),
    [],
  );

  return (
    <div className="bbox-code-field-demo" data-tooltip-host data-testid="code-field-demo">
      <section>
        <h2>Port row</h2>
        <CodeField value={portRow} onWrite={setPortRow} grammar={rowGrammar} testId="code-field-row" />
      </section>
      <section>
        <h2>Port lane</h2>
        <CodeField
          value={lane}
          onWrite={setLane}
          grammar={laneGrammar}
          multiline
          lineHeightPx={20}
          testId="code-field-lane"
        />
      </section>
      <section>
        <h2>Attribute body — Rendered ⟷ Source</h2>
        <CodeFieldModeToggle mode={mode} onModeChange={setMode} />
        <CodeField
          value={attrs}
          onWrite={setAttrs}
          grammar={attrGrammar}
          mode={mode}
          multiline
          autoFocus={mode === "source"}
          cursorAt={cursorAt}
          testId="code-field-attrs"
          onOpenSource={(line, column) => {
            setCursorAt(lineStartOffset(attrs, line) + column);
            setMode("source");
          }}
        />
        {jumpedTo ? <p data-testid="code-field-jumped-to">jumped to: {jumpedTo}</p> : null}
      </section>
    </div>
  );
}
