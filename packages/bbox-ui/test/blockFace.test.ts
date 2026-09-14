import { describe, expect, it } from "vitest";
import { governedFieldIds } from "@bbox-ui/schema";
import {
  BlockFace,
  BlockPortRows,
  BlockPortWalls,
  resolveBlockFace,
  type BlockFaceData,
  type BlockFacePort,
} from "../src/blockFace";
import { BLOCK_PRESET_GOVERNS, BLOCK_PRESETS } from "../src/block.presets";
import { BLOCK_VIEWS } from "../src/block.view";

/**
 * `BlockFace`/`BlockPortRows`/`BlockPortWalls` use no hooks — calling each
 * directly, as a plain function, returns the exact element tree it would
 * render, with every real default already applied (T0's own
 * `port.fields.test.ts` pattern, reused throughout this package's tests).
 * Every `HEADER_RENDER`/`PORTS_RENDER`/`MEMBERS_RENDER`/`TYPE_RENDER` entry
 * is a plain function invoked SYNCHRONOUSLY inside `BlockFace`'s own body
 * (not a deferred React component), so calling `BlockFace` once actually
 * exercises that dispatch logic — the real risk surface a bare typecheck
 * cannot see.
 */
function blockFaceElement(props: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (BlockFace as any)(props);
}
function blockPortRowsElement(props: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (BlockPortRows as any)(props);
}
function blockPortWallsElement(props: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (BlockPortWalls as any)(props);
}

const DATA: BlockFaceData = { title: "Sort", typeLabel: "Sorter", description: "Splits the stream.", tag: "Draft" };

const PORTS: BlockFacePort[] = [
  { id: "in-1", direction: "input", name: "items", typeLabel: "list" },
  { id: "in-2", direction: "input", name: "bins" },
  { id: "out-1", direction: "output", name: "result", typeLabel: "list" },
];

describe("resolveBlockFace — the same cascade BLOCK_PRESETS describes", () => {
  it("view:'simple' with no overrides resolves to exactly the 'simple' preset's values", () => {
    const simple = BLOCK_PRESETS.find((p) => p.id === "simple")!;
    const resolved = resolveBlockFace({ view: "simple" });
    for (const id of BLOCK_PRESET_GOVERNS) {
      expect((resolved as unknown as Record<string, unknown>)[id]).toEqual(simple.values[id]);
    }
  });

  it("an explicit override reaches past the view preset, exactly the §1.4 worked example", () => {
    const resolved = resolveBlockFace({ view: "port", header: "centered" });
    expect(resolved.header).toBe("centered");
    // Everything else Port still governs, untouched by the one override.
    expect(resolved.ports).toBe("rows");
  });

  it("resolves every real view without throwing, and every governed field is defined", () => {
    for (const view of BLOCK_VIEWS) {
      const resolved = resolveBlockFace({ view });
      for (const id of governedFieldIds(BLOCK_PRESETS)) {
        expect((resolved as unknown as Record<string, unknown>)[id]).not.toBeUndefined();
      }
    }
  });
});

describe("BlockFace — renders every real view/ports/members combination without throwing", () => {
  it("a bare 'simple' face carries the resolved data-attributes and Simple's own default box", () => {
    const el = blockFaceElement({ view: "simple", data: DATA });
    expect(el.props["data-view"]).toBe("simple");
    expect(el.props["data-header"]).toBe("centered");
    expect(el.props["data-ports"]).toBe("anonymous");
    expect(el.props["data-members"]).toBe("hidden");
    expect(el.props.width).toBe(384);
    expect(el.props.height).toBe(258);
  });

  it("a bare 'port' face resolves the band header, rows ports, and its own box", () => {
    const el = blockFaceElement({ view: "port", data: { ...DATA, ports: PORTS } });
    expect(el.props["data-header"]).toBe("band");
    expect(el.props["data-ports"]).toBe("rows");
    expect(el.props.width).toBe(384);
    expect(el.props.height).toBe(346);
  });

  it("a bare 'expanded' face resolves the band header, walls ports, and shown members", () => {
    const el = blockFaceElement({
      view: "expanded",
      data: { ...DATA, ports: PORTS },
      membersContent: "a member",
    });
    expect(el.props["data-header"]).toBe("band");
    expect(el.props["data-ports"]).toBe("walls");
    expect(el.props["data-members"]).toBe("shown");
    expect(el.props.width).toBe(707);
    expect(el.props.height).toBe(452);
  });

  it("every view renders without a data icon/tag/description/ports present (the sparsest real input)", () => {
    for (const view of BLOCK_VIEWS) {
      expect(() => blockFaceElement({ view, data: { title: "Bare" } })).not.toThrow();
    }
  });

  it("the container's className carries the band override only for header:'band'", () => {
    const simple = blockFaceElement({ view: "simple", data: DATA });
    const port = blockFaceElement({ view: "port", data: DATA });
    expect(String(simple.props.className)).not.toContain("items-stretch");
    expect(String(port.props.className)).toContain("items-stretch");
  });
});

describe("BlockPortRows", () => {
  it("orders inputs before outputs and carries a data-port-id per port", () => {
    const el = blockPortRowsElement({ ports: PORTS });
    const rows = el.props.children as Array<{ props: { "data-port-id": string } }>;
    expect(rows.map((r) => r.props["data-port-id"])).toEqual(["in-1", "in-2", "out-1"]);
  });

  it("renders an empty list without throwing", () => {
    expect(() => blockPortRowsElement({ ports: [] })).not.toThrow();
  });
});

describe("BlockPortWalls", () => {
  it("spreads ports sharing a side evenly and carries a data-port-id per port", () => {
    const el = blockPortWallsElement({ ports: PORTS, width: 384, height: 346 });
    const wraps = el.props.children as Array<{ props: { "data-port-id": string } }>;
    expect(wraps.map((w) => w.props["data-port-id"])).toEqual(["in-1", "in-2", "out-1"]);
  });

  it("renders an empty list without throwing", () => {
    expect(() => blockPortWallsElement({ ports: [], width: 384, height: 346 })).not.toThrow();
  });
});
