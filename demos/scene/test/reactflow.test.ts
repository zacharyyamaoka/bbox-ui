import { describe, expect, it } from "vitest";

import { sceneToReactFlowNodes } from "../src/reactflow";
import { sceneFromEditor, type SceneSource } from "../src/fromEditor";
import { SCENE, type Scene } from "../src/scene";

const port = {
  id: "image",
  direction: "input",
  state: "wired",
  size: "md",
  label: "image",
  textLayout: "right",
  side: "left",
  t: 0.35,
} as const;

const sizedScene: Scene = {
  blocks: [
    {
      id: "resized",
      x: 100,
      y: 60,
      w: 524,
      h: 358,
      title: "Detect",
      ports: [port],
    },
  ],
  edges: [],
};

describe("sceneToReactFlowNodes — the explicit-size contract", () => {
  it("emits explicit CSS size on the node when the scene carries w/h", () => {
    const [node] = sceneToReactFlowNodes(sizedScene);
    // React Flow's node width/height fields are where it STORES what it
    // measured — size is CONTROLLED through CSS, so the converter must emit
    // style, and mirror w/h into data for the Block fill + port anchors.
    expect(node.style).toEqual({ width: 524, height: 358 });
    expect(node.data).toMatchObject({ w: 524, h: 358 });
  });

  it("omits the size entirely when the scene carries none — hug contents", () => {
    for (const node of sceneToReactFlowNodes(SCENE)) {
      expect(node.style).toBeUndefined();
      expect(node.data).not.toHaveProperty("w");
      expect(node.data).not.toHaveProperty("h");
    }
  });

  it("never emits a half-specified size", () => {
    const halfScene: Scene = {
      blocks: [{ ...sizedScene.blocks[0], h: undefined }],
      edges: [],
    };
    const [node] = sceneToReactFlowNodes(halfScene);
    expect(node.style).toBeUndefined();
    expect(node.data).not.toHaveProperty("w");
  });

  it("round-trips a resized block from a live board into the node's CSS size", () => {
    // The defect this file guards: a block resized on the tldraw board
    // (props.w/h ≠ default) reached the React Flow pane at the default size,
    // so compare mode reported a real Δsize.
    const editor: SceneSource = {
      getCurrentPageShapes: () => [
        {
          id: "shape:blk1",
          type: "bbox-block",
          x: 120,
          y: 80,
          props: {
            w: 524,
            h: 358,
            title: "Detect",
            titleSize: "xl",
            blockType: "",
            description: "",
            icon: "",
            tag: "",
            orientation: "horizontal",
            ports: [port],
          },
        },
      ],
    };
    const { scene } = sceneFromEditor(editor);
    const [node] = sceneToReactFlowNodes(scene);
    expect(node.style).toEqual({ width: 524, height: 358 });
    expect(node.data).toMatchObject({ w: 524, h: 358 });
  });
});
