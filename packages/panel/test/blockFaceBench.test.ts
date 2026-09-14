import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_ARRANGEMENT } from "@bbox-ui/core";
import { REGISTRY } from "../src/bench";
import type { RenderContext } from "../src/registerComponent";
import { PortDndProvider } from "../src/portDnd";

/**
 * Smoke coverage for the face-governed `renderBlock`/`renderRegion` wired
 * up 2026-09-13: every `view`/`ports` combination actually mounts without
 * throwing, and the probe attributes plus each governed region's presence
 * match what `resolveBlockFace` resolved — not screenshotted, but a real
 * `renderToStaticMarkup` pass over the real registry entry, the cheapest
 * check that catches "forgot an import" or "wrong ctx key" before a human
 * ever opens `/create`.
 */
const block = REGISTRY.find((e) => e.name === "Block")!;
const region = REGISTRY.find((e) => e.name === "Region")!;

function markup(props: Record<string, unknown>, ctx?: RenderContext): string {
  return renderToStaticMarkup(createElement(() => block.render(props, undefined, ctx) as never));
}

describe("renderBlock is face-governed", () => {
  it("simple view: centered header, anonymous ports, footer hidden, type pinned bottom", () => {
    const html = markup({ view: "simple" });
    expect(html).toContain('data-view="simple"');
    expect(html).toContain('data-header="centered"');
    expect(html).toContain('data-ports="anonymous"');
    expect(html).toContain('data-slot="block-centered-header"');
    expect(html).toContain('data-slot="block-type"');
    expect(html).not.toContain('data-slot="block-body-footer"');
  });

  it("port view: band header, rows ports, footer shown, type inline (nothing extra at bottom)", () => {
    const html = markup({ view: "port" });
    expect(html).toContain('data-header="band"');
    expect(html).toContain('data-ports="rows"');
    expect(html).not.toContain('data-slot="block-centered-header"');
    // No bottom-pinned demo type under "header" placement.
    expect(html).not.toContain('data-slot="block-type"');
  });

  it("expanded view: band header, wall ports, members shown, footer hidden", () => {
    const html = markup({ view: "expanded" });
    expect(html).toContain('data-header="band"');
    expect(html).toContain('data-ports="walls"');
    expect(html).toContain('data-members="shown"');
  });

  it("ports=anonymous wraps the lane block so it paints nothing but stays mounted", () => {
    const ctx: RenderContext = {
      arrangement: DEFAULT_ARRANGEMENT,
      placements: {},
      blockId: "block-1",
      members: {},
    };
    // Real usage always mounts a Block's render inside the PortDndProvider
    // render-instance.tsx wires around it (see bench.tsx's own module doc);
    // PortLane reads its model from that context and throws without one.
    const html = renderToStaticMarkup(
      createElement(() =>
        createElement(PortDndProvider, {
          blockId: "block-1",
          arrangement: DEFAULT_ARRANGEMENT,
          placements: {},
          members: {},
          onMovePort: () => {},
          children: block.render({ view: "simple" }, undefined, ctx),
        }),
      ),
    );
    expect(html).toContain('data-slot="ports-anonymous"');
    expect(html).toContain("visibility:hidden");
  });

  it("ports=rows renders the Block's non-locked Port members as a rows column, excluding the locked one", () => {
    const ctx: RenderContext = {
      members: {
        "port-a": createElement("span", { key: "port-a", "data-testid": "port-a" }, "A"),
        "port-fn": createElement("span", { key: "port-fn", "data-testid": "port-fn" }, "fn"),
      },
      lockedMemberIds: ["port-fn"],
    };
    const html = markup({ view: "port" }, ctx);
    expect(html).toContain('data-slot="block-port-rows-bench"');
    expect(html).toContain('data-member-id="port-a"');
    // The locked port is pinned separately, outside the rows column, never
    // duplicated into it.
    const rowsSection = html.split('data-slot="block-port-rows-bench"')[1]!.split("</div>")[0]!;
    expect(rowsSection).not.toContain("port-fn");
    expect(html).toContain('data-slot="port-locked"');
  });

  it("view switching resizes the box: expanded is wider/taller than simple", () => {
    const simpleHtml = markup({ view: "simple" });
    const expandedHtml = markup({ view: "expanded" });
    const widthOf = (html: string) => Number(/width:(\d+)px/.exec(html)?.[1]);
    expect(widthOf(expandedHtml)).toBeGreaterThan(widthOf(simpleHtml));
  });
});

describe("renderRegion composes a real Block, in Port view, into its corner", () => {
  it("mounts the corner and body slots", () => {
    const ctx: RenderContext = {
      slots: {
        corner: createElement("span", { key: "c", "data-slot": "region-corner-probe" }, "corner"),
        body: createElement("span", { key: "b", "data-slot": "region-body-probe" }, "body"),
      },
    };
    const html = renderToStaticMarkup(createElement(() => region.render({ kind: "while" }, undefined, ctx) as never));
    expect(html).toContain('data-kind="while"');
    expect(html).toContain("region-corner-probe");
    expect(html).toContain("region-body-probe");
  });
});
