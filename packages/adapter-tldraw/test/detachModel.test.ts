import { describe, expect, it } from "vitest";

import type { BBoxPortShapeProps } from "../src/port-shape-util";
import type { BBoxBlockShapeProps } from "../src/block-shape-util";
import {
  BBOX_UI_META_KEY,
  DETACH_FORMAT_VERSION,
  detachMeta,
  isDetachedAnchor,
  readDetachedBlock,
  readDetachedPort,
  readDetachedRecord,
  readRebuildableRecord,
  toJsonSafe,
} from "../src/detach/detachModel";

const portProps: BBoxPortShapeProps = {
  w: 25,
  h: 25,
  state: "wired",
  size: "md",
  label: "image",
  textLayout: "right",
};

const blockProps: BBoxBlockShapeProps = {
  w: 384,
  h: 258,
  title: "Detect",
  titleSize: "xl",
  blockType: "dataflow",
  description: "blackbox modelling",
  icon: "🔍",
  tag: "Draft 1",
  orientation: "horizontal",
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
  ],
};

describe("detach records", () => {
  it("round-trips a port record through meta", () => {
    const meta = detachMeta({
      kind: "port",
      version: DETACH_FORMAT_VERSION,
      props: portProps,
    });
    const record = readDetachedPort(meta);
    expect(record).not.toBeNull();
    expect(record!.props).toEqual(portProps);
  });

  it("round-trips a block record through meta, ports included", () => {
    const meta = detachMeta({
      kind: "block",
      version: DETACH_FORMAT_VERSION,
      props: blockProps,
    });
    const record = readDetachedBlock(meta);
    expect(record).not.toBeNull();
    expect(record!.props).toEqual(blockProps);
  });

  it("claims exactly one key in the meta bag", () => {
    const meta = detachMeta({
      kind: "port",
      version: DETACH_FORMAT_VERSION,
      props: portProps,
    });
    expect(Object.keys(meta)).toEqual([BBOX_UI_META_KEY]);
  });

  it("declines a record from a newer format version rather than guessing", () => {
    const meta = detachMeta({
      kind: "port",
      version: DETACH_FORMAT_VERSION + 1,
      props: portProps,
    });
    expect(readDetachedRecord(meta)).toBeNull();
    expect(readRebuildableRecord(meta)).toBeNull();
  });

  it("still reads an older version", () => {
    const meta = {
      [BBOX_UI_META_KEY]: { kind: "port", version: 0, props: portProps },
    };
    expect(readDetachedPort(meta)).not.toBeNull();
  });

  it("ignores meta it does not own", () => {
    expect(readDetachedRecord({ someoneElse: { kind: "port" } })).toBeNull();
    expect(readDetachedRecord(undefined)).toBeNull();
    expect(readDetachedRecord("nope")).toBeNull();
  });

  it("marks and recognises anchors, which are not rebuildable by themselves", () => {
    const meta = detachMeta({ kind: "block-card", version: DETACH_FORMAT_VERSION });
    expect(isDetachedAnchor(meta)).toBe(true);
    expect(readRebuildableRecord(meta)).toBeNull();
  });

  it("toJsonSafe drops present-but-undefined keys meta would reject", () => {
    expect(
      toJsonSafe({ a: 1, b: undefined, c: { d: undefined, e: "x" }, f: [1, undefined] }),
    ).toEqual({ a: 1, c: { e: "x" }, f: [1, null] });
  });
});
