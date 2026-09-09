import { useState } from "react";

import { HTMLContainer, Rectangle2d, ShapeUtil, T, type TLBaseShape } from "tldraw";

import { CodeField, signatureGrammar } from "@bbox-ui/core";

/**
 * A real tldraw custom shape with a `CodeField` inside — not the floating
 * `CodeFieldDemo` panel (a DOM sibling of `<Tldraw>`, which never exercised
 * tldraw's own pointer/wheel/keydown handling at all). Demo-only, so it
 * stays local rather than joining `@bbox-ui/adapter-tldraw`: it exists to
 * prove finding 6's in-host claims, not as a shipped primitive.
 */
export interface CodeFieldHostShapeProps {
  w: number;
  h: number;
  value: string;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "code-field-host": CodeFieldHostShapeProps;
  }
}

export type CodeFieldHostShape = TLBaseShape<"code-field-host", CodeFieldHostShapeProps>;

const TYPES = [
  { label: "Pose", kind: "known" },
  { label: "int", kind: "primitive" },
];

export class CodeFieldHostShapeUtil extends ShapeUtil<CodeFieldHostShape> {
  static override type = "code-field-host" as const;

  static override props = {
    w: T.number,
    h: T.number,
    value: T.string,
  };

  override getDefaultProps(): CodeFieldHostShape["props"] {
    return { w: 240, h: 64, value: "t: P" };
  }

  override getGeometry(shape: CodeFieldHostShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: CodeFieldHostShape) {
    const [value, setValue] = useState(shape.props.value);
    const grammar = signatureGrammar({ types: TYPES });
    return (
      <HTMLContainer style={{ pointerEvents: "all", padding: 8, overflow: "visible" }}>
        <div
          style={{
            fontSize: 10,
            marginBottom: 4,
            color: "var(--color-muted-foreground, #888)",
          }}
        >
          CodeField in a tldraw shape
        </div>
        <CodeField value={value} onWrite={setValue} grammar={grammar} testId="code-field-in-tldraw-shape" />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: CodeFieldHostShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
