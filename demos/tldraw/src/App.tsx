import { Tldraw, createShapeId, type Editor, type TLShapePartial } from "tldraw";

import {
  BBoxBlockShapeUtil,
  setPortReceived,
  type BBoxBlockShape,
} from "@bbox-ui/adapter-tldraw";

const shapeUtils = [BBoxBlockShapeUtil];

const cameraId = createShapeId("camera");
const detectId = createShapeId("detect");
const trackId = createShapeId("track");
const clockId = createShapeId("clock");

const blocks: TLShapePartial<BBoxBlockShape>[] = [
  {
    id: cameraId,
    type: "bbox-block",
    x: 0,
    y: 40,
    props: {
      title: "Camera",
      blockType: "Source",
      description: "async computation",
      icon: "📷",
      ports: [
        {
          id: "frame",
          direction: "output",
          state: "wired",
          size: "md",
          label: "frame",
          textLayout: "left",
          side: "right",
          t: 0.72,
        },
      ],
    },
  },
  {
    id: detectId,
    type: "bbox-block",
    x: 560,
    y: 0,
    props: {
      title: "Detect",
      blockType: "dataflow",
      description: "blackbox modelling",
      icon: "🔍",
      tag: "Draft 1",
      ports: [
        {
          id: "image",
          direction: "input",
          state: "wired",
          size: "md",
          label: "image",
          textLayout: "right",
          side: "left",
          t: 0.35,
        },
        {
          id: "threshold",
          direction: "input",
          state: "default",
          size: "md",
          label: "threshold",
          textLayout: "right-offset",
          side: "left",
          t: 0.7,
        },
        {
          id: "boxes",
          direction: "output",
          state: "wired",
          size: "md",
          label: "boxes",
          textLayout: "left",
          side: "right",
          t: 0.62,
        },
      ],
    },
  },
  {
    id: trackId,
    type: "bbox-block",
    x: 1120,
    y: 40,
    props: {
      title: "Track",
      ports: [
        {
          id: "detections",
          // Persisted as wired; painted "received" at runtime below.
          direction: "input",
          state: "wired",
          size: "md",
          label: "detections",
          textLayout: "right",
          side: "left",
          t: 0.35,
        },
        {
          id: "config",
          direction: "input",
          state: "empty",
          size: "md",
          label: "config",
          textLayout: "right",
          side: "left",
          t: 0.7,
        },
        {
          id: "tracks",
          direction: "output",
          state: "empty",
          size: "md",
          label: "",
          textLayout: "left",
          side: "right",
          t: 0.5,
        },
      ],
    },
  },
  {
    id: clockId,
    type: "bbox-block",
    x: 560,
    y: 420,
    props: {
      title: "cm_clock",
      titleSize: "lg",
      blockType: "Clock",
      icon: "⏱",
      orientation: "vertical",
      ports: [
        {
          id: "tick",
          direction: "output",
          state: "empty",
          size: "md",
          label: "tick",
          textLayout: "left",
          side: "right",
          t: 0.5,
        },
      ],
    },
  },
];

function handleMount(editor: Editor) {
  (window as { editor?: Editor }).editor = editor;
  editor.createShapes(blocks);
  // Runtime-only: light one port up as "Data Recived" without ever writing
  // it into the document.
  setPortReceived(trackId, "detections", true);
  editor.zoomToFit({ immediate: true });
  editor.updateInstanceState({ isReadonly: false });
}

export function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
    </div>
  );
}
