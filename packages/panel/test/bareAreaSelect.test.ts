import { describe, expect, it } from "vitest";
import { nextSelectionForRootPress, priorSelectionForRootPress } from "../src/bareAreaSelect";

describe("priorSelectionForRootPress", () => {
  it("drops every id the host engine does not recognize as a root", () => {
    expect(priorSelectionForRootPress(["member-1", "block-8"], (id) => id === "block-8")).toEqual(["block-8"]);
  });

  it("keeps a genuine multi-root selection intact", () => {
    const isKnownRoot = (id: string) => id === "block-1" || id === "block-2";
    expect(priorSelectionForRootPress(["block-1", "block-2"], isKnownRoot)).toEqual(["block-1", "block-2"]);
  });

  it("returns an empty selection when nothing survives the filter", () => {
    expect(priorSelectionForRootPress(["member-1", "member-2"], () => false)).toEqual([]);
  });
});

describe("nextSelectionForRootPress — verify-round-4 F1 (tldraw)", () => {
  it("a plain press on the root replaces a stale member selection with the root alone", () => {
    // Two members shift-selected (no shape of their own); the host engine
    // may still think a stale root is selected — irrelevant here, since a
    // non-additive press always replaces outright.
    const next = nextSelectionForRootPress({
      rootId: "block-8",
      additive: false,
      selectedIds: ["textbox-1", "textbox-2"],
      isKnownRoot: (id) => id === "block-8",
    });
    expect(next).toEqual(["block-8"]);
  });

  it("a plain press on an already-selected root is a no-op replace, not a toggle-off", () => {
    const next = nextSelectionForRootPress({
      rootId: "block-8",
      additive: false,
      selectedIds: ["block-8"],
      isKnownRoot: (id) => id === "block-8",
    });
    expect(next).toEqual(["block-8"]);
  });

  it("an additive press adds the root to any OTHER root the engine still recognizes", () => {
    const next = nextSelectionForRootPress({
      rootId: "block-2",
      additive: true,
      selectedIds: ["block-1"],
      isKnownRoot: (id) => id === "block-1" || id === "block-2",
    });
    expect(next).toEqual(["block-1", "block-2"]);
  });

  it("an additive press drops a leftover member of a DIFFERENT root along the way", () => {
    const next = nextSelectionForRootPress({
      rootId: "block-2",
      additive: true,
      selectedIds: ["block-1", "textbox-of-block-1"],
      isKnownRoot: (id) => id === "block-1" || id === "block-2",
    });
    expect(next).toEqual(["block-1", "block-2"]);
  });

  it("an additive press on the already-selected root toggles it off", () => {
    const next = nextSelectionForRootPress({
      rootId: "block-8",
      additive: true,
      selectedIds: ["block-1", "block-8"],
      isKnownRoot: (id) => id === "block-1" || id === "block-8",
    });
    expect(next).toEqual(["block-1"]);
  });
});
