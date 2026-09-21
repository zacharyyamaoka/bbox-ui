// src/document/boardText.test.ts — the pure half of board Find and Replace:
// which strings one shape offers, and which of them may be written back.
//
// The walk itself (`boardTextSources`) and the write-back need a live
// `Editor`, so they are acceptance-tested against the real app in
// `src/boardFind.smoke.test.tsx`. This file holds the part that is pure, and
// it holds it in node, in milliseconds.
import { describe, expect, it } from "vitest";

import { boardTextFieldsOf, RICH_TEXT_BLOCKER } from "./boardText";

describe("what one shape offers Find", () => {
  it("reads a block's name, and offers it for replacement", () => {
    expect(boardTextFieldsOf({ type: "ss-block", props: { name: "Pose estimator" } })).toEqual([
      { field: "Block name", prop: "name", text: "Pose estimator" },
    ]);
  });

  it("reads a port's WHOLE declaration line, not its parsed name half", () => {
    // `sceneFromStore.ts`: the line is carried whole "so a write-back cannot
    // re-space it". Find has to search the same string Replace will write.
    expect(boardTextFieldsOf({ type: "ss-port", props: { declaration: "frame : Image" } })).toEqual([
      { field: "Port", prop: "declaration", text: "frame : Image" },
    ]);
  });

  it("reads a code cell's source and a region's name", () => {
    expect(boardTextFieldsOf({ type: "ss-code", props: { code: "x = 1" } })[0]).toMatchObject({
      prop: "code",
      text: "x = 1",
    });
    expect(boardTextFieldsOf({ type: "ss-region", props: { name: "retry loop" } })[0]).toMatchObject({
      prop: "name",
      text: "retry loop",
    });
  });

  it("reads a STOCK frame's name and offers it too — it is a plain string prop", () => {
    expect(boardTextFieldsOf({ type: "frame", props: { name: "Perception" } })).toEqual([
      { field: "Frame name", prop: "name", text: "Perception" },
    ]);
  });

  it("offers a stock rich-text shape read-only rather than omitting it", () => {
    // The trunk module's own header declines to port tldraw's ProseMirror
    // rewrite. Dropping the shape from the RESULTS would be a different, worse
    // answer: the user would be told the word is not on the board.
    const fields = boardTextFieldsOf({ type: "text", props: {} }, "sensor fusion");
    expect(fields).toEqual([
      { field: "Text", prop: "", text: "sensor fusion", replaceBlocker: RICH_TEXT_BLOCKER },
    ]);
  });

  it("offers nothing for a shape with no text at all", () => {
    expect(boardTextFieldsOf({ type: "ss-block", props: { name: "" } })).toEqual([]);
    expect(boardTextFieldsOf({ type: "geo", props: {} })).toEqual([]);
    expect(boardTextFieldsOf({ type: "ss-wire", props: {} })).toEqual([]);
  });
});
