"use client";

// src/components/codeCellFace.tsx — the two faces ONE code cell wears.
// Props in, DOM out: a `BlockPort` (./blockPort.tsx) around a `Block`
// (./block.tsx), whose body is a `CodeEditor` (./codeEditor.tsx) when the
// cell is opaque and whose members are the collapsed blocks when it is
// expanded. No scene import, no state of its own, no measurement — the host
// decides which face is showing and hands this component the pieces.
//
// WHY one component with a `view` toggle rather than two components, and
// why OPAQUE is the resting face (Zach, Proposal 5): "when you collapse one
// of these regions it can look like this honest port view first." The two
// faces are the same node — the same id, the same promoted ports on the
// same walls, the same header — so the toggle must not be able to produce a
// different block. Two components could; one component with a branch in its
// body cannot, because everything outside the branch is written once.
// Opaque is the default a collapse lands on: the text is what the user
// asked to see, and the blocks are still there underneath (see
// `scene/codeCell.ts`'s header) waiting for the toggle or for an expand.
//
// WHY the origin spec arrives already resolved: see ./originBadge.tsx's own
// note on `layering.test.ts`'s import wall. The four states are computed in
// `scene/codeOrigin.ts` and travel here as data.

import type { ReactNode } from "react";
import { python } from "@codemirror/lang-python";

import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { BlockPort, type BlockEdgeSpec } from "./blockPort";
import { CodeEditor } from "./codeEditor";
import { OriginBadge, type OriginBadgeSpec } from "./originBadge";
import type { BlockSide } from "./port.layout";

/** Opaque = the text face; expanded = the blocks underneath it. */
export type CodeCellFaceView = "opaque" | "expanded";

/** The state and the row it paints, travelling together so a caller cannot
 *  produce a half-bound badge. Absent = paint no badge at all. */
export interface CodeCellFaceOrigin {
  state: string;
  spec: OriginBadgeSpec;
}

/** What this face reads off a cell's payload — structurally a
 *  `scene/codeCell.ts` `CodeCellPayload`, minus the `origin` binding it has
 *  no use for (that arrives resolved, as `origin` above). */
export interface CodeCellFaceCell {
  language: string;
  source: string;
}

export interface CodeCellFaceProps {
  /** The node id, stamped as `data-block-id` by `BlockPort` — what a wire
   *  layer resolves an endpoint against. */
  id: string;
  name: ReactNode;
  cell: CodeCellFaceCell;
  origin?: CodeCellFaceOrigin;
  view: CodeCellFaceView;
  /** The collapsed blocks, rendered only by the expanded face. */
  members?: BlockMember[];
  /** `BlockPort`'s own `edges` — the cell's promoted ports, host-placed. */
  ports?: Partial<Record<BlockSide, BlockEdgeSpec>>;
  width?: number;
  onSourceWrite?(next: string): void;
}

export function CodeCellFace({ id, name, cell, origin, view, members, ports, width, onSourceWrite }: CodeCellFaceProps) {
  const opaque = view === "opaque";
  return (
    <div data-slot="code-cell-face" data-view={view} data-cell-id={id}>
      <BlockPort id={id} view={opaque ? "port" : "expanded"} edges={ports ?? {}}>
        <Block
          header={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span data-slot="code-cell-name">{name}</span>
              {origin ? <OriginBadge state={origin.state} spec={origin.spec} size="sm" /> : null}
            </span>
          }
          width={width}
          body={
            opaque ? (
              <CodeEditor
                value={cell.source}
                multiline
                lineNumbers
                // WHY `wrap` and not the field's default `clip`: a cell's
                // text is the whole point of the opaque face, and a face is
                // as wide as the board gave it. Clipping would hide
                // authored characters behind a horizontal scroll the reader
                // has no reason to suspect is there — the one thing a
                // rendering of stored text may not do.
                overflow="wrap"
                // The language is a LANGUAGE fact (codeCell.ts's own note),
                // so it is read off the payload rather than passed beside
                // it; anything this kit has no parser for renders as plain
                // text instead of guessing at one.
                language={cell.language === "python" ? python() : undefined}
                onWrite={onSourceWrite ?? (() => {})}
              />
            ) : undefined
          }
          members={opaque ? undefined : members}
          membersLayout="stack"
        />
      </BlockPort>
    </div>
  );
}
