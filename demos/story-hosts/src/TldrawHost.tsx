import "tldraw/tldraw.css";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  Tldraw,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";
import { resizeBox } from "tldraw";

/**
 * T0 SPIKE. Real tldraw shape props are persisted document state (they go
 * through the `T.*` validators below), so they cannot carry a live ReactNode
 * — a `.tldr` file that tried to serialize a story's rendered JSX would be
 * nonsense on reload. Content instead rides a plain React Context: the
 * shape's `component()` is a normal function component in the SAME React
 * tree tldraw mounts (not a second root), so `useContext` reaches straight
 * through to whatever <TldrawHost> is currently wrapping. Only the box the
 * story lives in (w/h) is real, persistable shape state.
 */
const StoryContentContext = createContext<ReactNode>(null);

interface StoryHostShapeProps {
  w: number;
  h: number;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "story-host": StoryHostShapeProps;
  }
}

type StoryHostShape = TLBaseShape<"story-host", StoryHostShapeProps>;

const STORY_HOST_W = 360;
const STORY_HOST_H = 200;

class StoryHostShapeUtil extends ShapeUtil<StoryHostShape> {
  static override type = "story-host" as const;

  static override props = {
    w: T.number,
    h: T.number,
  };

  override getDefaultProps(): StoryHostShape["props"] {
    return { w: STORY_HOST_W, h: STORY_HOST_H };
  }

  override getGeometry(shape: StoryHostShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize(shape: StoryHostShape, info: TLResizeInfo<StoryHostShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: StoryHostShape) {
    // The whole point of the spike: this is a REAL tldraw shape's component
    // method, reading REAL shape props, rendering a REAL Storybook story
    // (via context) inside HTMLContainer — not a mock of any of the three.
    const content = useContext(StoryContentContext);
    return (
      <HTMLContainer
        data-slot="story-host"
        style={{
          width: shape.props.w,
          height: shape.props.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--color-border, #999)",
          borderRadius: 8,
          background: "var(--color-panel, white)",
          pointerEvents: "all",
        }}
      >
        {content}
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: StoryHostShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

const SHAPE_UTILS = [StoryHostShapeUtil];

/**
 * The tldraw host — mounts a real <Tldraw> canvas with ONE custom
 * ShapeUtil whose component() renders the story inside HTMLContainer.
 * Copies the mounting shape of demos/tldraw/src/App.tsx (onMount creates
 * shapes once, StrictMode-safe by checking for existing shapes first).
 */
export function TldrawHost({ children }: { children: ReactNode }) {
  const editorRef = useRef<Editor | null>(null);

  function handleMount(editor: Editor) {
    editorRef.current = editor;
    if (editor.getCurrentPageShapeIds().size === 0) {
      editor.createShape<StoryHostShape>({
        type: "story-host",
        x: 40,
        y: 40,
        props: { w: STORY_HOST_W, h: STORY_HOST_H },
      });
    }
    editor.zoomToFit({ immediate: true });
    editor.updateInstanceState({ isReadonly: false });
  }

  // Re-fit whenever the host is freshly mounted (host switch remounts the
  // whole subtree via the decorator's `key`, so this only needs to run once
  // per mount — no dependency on `children` itself).
  useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  const shapeUtils = useMemo(() => SHAPE_UTILS, []);

  return (
    <StoryContentContext.Provider value={children}>
      <div data-host="tldraw" style={{ position: "relative", width: "100%", height: 420 }}>
        <Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
      </div>
    </StoryContentContext.Provider>
  );
}
