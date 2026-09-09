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
 * package exists for, and duplicating this panel between the two host
 * demos keeps each demo app independent, the same reason the two adapter
 * packages never import each other.
 */
const PRIMITIVES = ["int", "float", "str", "bool"];

const TYPES = [
  { label: "Pose", kind: "known" },
  { label: "int", kind: "primitive" },
  { label: "float", kind: "primitive" },
  { label: "str", kind: "primitive" },
];
const VALUES = [{ label: "None" }, { label: "0.0" }, { label: "default_pose()" }];
const KIND_LABELS = { known: "board type", primitive: "primitive" };

/**
 * `CodeField` driven several ways: a single port row, a multi-line port
 * lane (with folding), the RENDERED ⟷ SOURCE toggle over a Type-style
 * attribute body, and a real Pose "board type" field a foreign row can
 * jump to — the same `signature` grammar throughout, proving the one
 * component covers a port row, a lane, and an attribute tree without a
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

  // Pose is a real, separately-editable field — not a static string — so a
  // foreign row inside `attrs`'s "origin: Pose" expansion has somewhere
  // real to jump to and open source at THAT field's own line, matching the
  // donor's rule: a foreign row's click opens the OWNER's source, never
  // this field's own document at an unrelated line.
  const [poseSource, setPoseSource] = useState("x: float = 0.0\ny: float = 0.0\ntheta: float = 0.0");
  const [poseMode, setPoseMode] = useState<"rendered" | "source">("rendered");
  const [poseCursorAt, setPoseCursorAt] = useState<number | undefined>(undefined);

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

  function resolveReference(name: string): CodeFieldReference | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (PRIMITIVES.includes(trimmed)) return { kind: "primitive" };
    if (trimmed === "Pose") {
      return {
        kind: "known",
        owner: "Pose",
        onJump: () => setJumpedTo(trimmed),
        expandLines: () => signatureGrammar().lines!(poseSource),
      };
    }
    return { kind: "unknown" };
  }

  const attrGrammar = useMemo(
    () => signatureGrammar({ types: TYPES, values: VALUES, kindLabels: KIND_LABELS, resolveReference }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poseSource],
  );
  const poseGrammar = useMemo(
    () => signatureGrammar({ types: TYPES, values: VALUES, kindLabels: KIND_LABELS }),
    [],
  );

  return (
    <div className="bbox-code-field-demo" data-testid="code-field-demo">
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
          onOpenSource={(line, column, owner) => {
            // A foreign row (came from Pose's own expandLines()) opens
            // Pose's OWN source at that line — never this field's source
            // at `line`'s (unrelated) index into `attrs`.
            if (owner === "Pose") {
              setPoseCursorAt(lineStartOffset(poseSource, line) + column);
              setPoseMode("source");
              return;
            }
            setCursorAt(lineStartOffset(attrs, line) + column);
            setMode("source");
          }}
        />
        {jumpedTo ? <p data-testid="code-field-jumped-to">jumped to: {jumpedTo}</p> : null}
      </section>
      <section>
        <h2>Pose (referenced board type)</h2>
        <CodeFieldModeToggle mode={poseMode} onModeChange={setPoseMode} />
        <CodeField
          value={poseSource}
          onWrite={setPoseSource}
          grammar={poseGrammar}
          mode={poseMode}
          multiline
          autoFocus={poseMode === "source"}
          cursorAt={poseCursorAt}
          testId="code-field-pose"
        />
      </section>
    </div>
  );
}
