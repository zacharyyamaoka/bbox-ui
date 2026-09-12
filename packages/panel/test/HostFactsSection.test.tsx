import { act, create, type ReactTestRendererJSON } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { FieldValue } from "@bbox-ui/schema";
import { HOST_FIELDS } from "../src/hostFields";
import { HostFactsSection } from "../src/HostFactsSection";
import type { Subject } from "../src/fieldModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `react-test-renderer`, not jsdom — every element `HostFactsSection`
 * renders is a plain `<div>`/`<input>`/`<span>` (no portal, no floating-ui,
 * nothing that needs an actual `document`), the same reasoning
 * `glyph.fields.test.ts` gives for using this renderer over the component
 * it exercises.
 */
function renderSection(props: Partial<Parameters<typeof HostFactsSection>[0]> = {}): {
  json: ReactTestRendererJSON;
  onChange: ReturnType<typeof vi.fn>;
} {
  const onChange = vi.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <HostFactsSection
        renderLabel="tldraw"
        fields={HOST_FIELDS}
        subjects={props.subjects ?? [subject()]}
        editable={props.editable ?? true}
        writers={props.writers}
        onChange={props.onChange ?? onChange}
      />,
    );
  });
  const json = renderer.toJSON() as ReactTestRendererJSON;
  return { json, onChange };
}

function subject(overrides: Record<string, unknown> = {}): Subject {
  return { id: "s1", props: { x: 10, y: 20, rotation: 0, w: 18, h: 18, ...overrides } };
}

/** Depth-first search for every node carrying `data-slot === slot`. */
function findAll(node: ReactTestRendererJSON | string | null, slot: string): ReactTestRendererJSON[] {
  if (!node || typeof node === "string") return [];
  const hits = node.props?.["data-slot"] === slot ? [node] : [];
  const children = Array.isArray(node.children) ? node.children : [];
  return hits.concat(children.flatMap((child) => findAll(child, slot)));
}

describe("HostFactsSection", () => {
  it("renders one row per field — x, y, rotation, w, h", () => {
    const { json } = renderSection();
    const rows = findAll(json, "host-fact-row");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.props["data-field"])).toEqual(["x", "y", "rotation", "w", "h"]);
  });

  it("w and h render disabled — HOST_FIELDS.readOnly, editable stays true", () => {
    const { json } = renderSection({ editable: true });
    const rows = findAll(json, "host-fact-row");
    const byId = new Map(rows.map((r) => [r.props["data-field"], r]));
    expect(byId.get("w")!.props["data-disabled"]).toBe(true);
    expect(byId.get("h")!.props["data-disabled"]).toBe(true);
    expect(byId.get("x")!.props["data-disabled"]).toBe(false);
    expect(byId.get("rotation")!.props["data-disabled"]).toBe(false);
    // The disabled row's own control is a real disabled input, not merely
    // marked so on the wrapper.
    const wInput = findAll(byId.get("w")!, "host-fact-input")[0]!;
    expect(wInput.props.disabled).toBe(true);
  });

  it("editable=false disables every row, including x/y/rotation, and shows the note", () => {
    const { json } = renderSection({ editable: false });
    const rows = findAll(json, "host-fact-row");
    for (const row of rows) {
      expect(row.props["data-disabled"]).toBe(true);
      const input = findAll(row, "host-fact-input")[0]!;
      expect(input.props.disabled).toBe(true);
    }
    const note = findAll(json, "host-facts-no-handles");
    expect(note).toHaveLength(1);
    expect(note[0]!.children).toContain("No handles here — the DOM render has no canvas.");
  });

  it("editable=true shows no note", () => {
    const { json } = renderSection({ editable: true });
    expect(findAll(json, "host-facts-no-handles")).toHaveLength(0);
  });

  it("two subjects with different x read Mixed on x, but not on rotation where they agree", () => {
    const { json } = renderSection({
      subjects: [subject({ x: 10 }), subject({ x: 50 })],
    });
    const rows = findAll(json, "host-fact-row");
    const byId = new Map(rows.map((r) => [r.props["data-field"], r]));
    const xInput = findAll(byId.get("x")!, "host-fact-input")[0]!;
    const rotationInput = findAll(byId.get("rotation")!, "host-fact-input")[0]!;
    // NumberInput reads blank (value undefined) and shows the "Mixed"
    // placeholder when the row disagrees — never one subject's value
    // silently standing in for the selection, per fieldModel.ts's own rule.
    expect(xInput.props.value).toBe("");
    expect(xInput.props.placeholder).toBe("Mixed");
    expect(rotationInput.props.value).toBe("0");
    expect(rotationInput.props.placeholder).toBeUndefined();
  });

  it("the header names the render surface", () => {
    const { json } = renderSection({ subjects: [subject()] });
    const header = findAll(json, "host-facts-header")[0]!;
    expect(header.children).toContain("Renderer · ");
    expect(header.children).toContain("tldraw");
  });

  it("shows a field's writer as its own hint", () => {
    const { json } = renderSection({ writers: { x: "tldraw writes this when you drag" } });
    const rows = findAll(json, "host-fact-row");
    const xRow = rows.find((r) => r.props["data-field"] === "x")!;
    const writer = findAll(xRow, "host-fact-writer")[0]!;
    expect(writer.children).toContain("tldraw writes this when you drag");
  });

  it("onChange fires with the field id and a number when an editable row commits", () => {
    const onChange = vi.fn();
    const { json } = renderSection({ onChange });
    const rows = findAll(json, "host-fact-row");
    const xRow = rows.find((r) => r.props["data-field"] === "x")!;
    const input = findAll(xRow, "host-fact-input")[0]!;
    act(() => {
      input.props.onChange({ target: { value: "42" } });
    });
    expect(onChange).toHaveBeenCalledWith("x", 42);
    const [fieldId, value] = onChange.mock.calls[0] as [string, FieldValue];
    expect(fieldId).toBe("x");
    expect(typeof value).toBe("number");
  });

  it("a Mixed row's box never commits on a stray focus+blur — no typing can never land as 0", () => {
    // Reproduces the audit's CDP repro without a browser: two subjects
    // disagreeing on x, an untouched box, focus then blur with nothing
    // typed. The bug was `NumberInput`'s own onBlur reading the empty
    // Mixed box as "reset to the field default" and writing 0 to every
    // selected instance. `commitDefaultOnBlur={false}` (passed by this
    // row) is what stops it — asserted by exercising the actual onBlur,
    // not by asserting the handler is absent (it isn't; it just refuses
    // to commit).
    const onChange = vi.fn();
    const { json } = renderSection({
      subjects: [subject({ x: 10 }), subject({ x: 200 })],
      onChange,
    });
    const rows = findAll(json, "host-fact-row");
    const xInput = findAll(rows.find((r) => r.props["data-field"] === "x")!, "host-fact-input")[0]!;
    act(() => {
      xInput.props.onFocus?.();
    });
    act(() => {
      xInput.props.onBlur?.();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a single-selection host row reverts to the real value on blur, not the placeholder default", () => {
    // The sibling defect on the non-Mixed path: one subject at x=340,
    // clear the box, blur without typing a replacement. The bug committed
    // `field.defaultValue` (0, a placeholder for x/y/rotation, never a
    // real position) and would have jumped the instance to the origin.
    const onChange = vi.fn();
    const { json } = renderSection({ subjects: [subject({ x: 340 })], onChange });
    const rows = findAll(json, "host-fact-row");
    const xInput = findAll(rows.find((r) => r.props["data-field"] === "x")!, "host-fact-input")[0]!;
    act(() => {
      xInput.props.onFocus?.();
    });
    act(() => {
      xInput.props.onChange({ target: { value: "" } });
    });
    act(() => {
      xInput.props.onBlur?.();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typing in a Mixed row still commits — the fix removes only the auto-default-on-blur", () => {
    const onChange = vi.fn();
    const { json } = renderSection({
      subjects: [subject({ x: 10 }), subject({ x: 200 })],
      onChange,
    });
    const rows = findAll(json, "host-fact-row");
    const xInput = findAll(rows.find((r) => r.props["data-field"] === "x")!, "host-fact-input")[0]!;
    act(() => {
      xInput.props.onChange({ target: { value: "7" } });
    });
    expect(onChange).toHaveBeenCalledWith("x", 7);
  });

  it("every row carries a provenance dot — the same engine FigmaDense's Properties rows use", () => {
    const { json } = renderSection();
    expect(findAll(json, "field-provenance-dot")).toHaveLength(5);
  });

  it("w and h show their own hint even with no writer supplied — the fallback the row actually renders", () => {
    const { json } = renderSection(); // no `writers` prop at all
    const rows = findAll(json, "host-fact-row");
    const wWriter = findAll(rows.find((r) => r.props["data-field"] === "w")!, "host-fact-writer")[0]!;
    expect(wWriter.children).toContain("Derived from the component; read-only here.");
  });

  it("a read-only or non-editable row's label cannot scrub-write a value", () => {
    const { json } = renderSection({ editable: true });
    const rows = findAll(json, "host-fact-row");
    const wLabel = findAll(rows.find((r) => r.props["data-field"] === "w")!, "field-label")[0]!;
    const xLabel = findAll(rows.find((r) => r.props["data-field"] === "x")!, "field-label")[0]!;
    expect(wLabel.props.onPointerDown).toBeUndefined();
    expect(xLabel.props.onPointerDown).toBeDefined();
  });

  it("throws loudly if a host field is ever given a non-number kind", () => {
    const badField = {
      id: "lock",
      label: "Lock",
      kind: "toggle",
      defaultValue: false,
      host: true,
    } as unknown as Parameters<typeof HostFactsSection>[0]["fields"][number];
    expect(() => {
      act(() => {
        create(
          <HostFactsSection
            renderLabel="tldraw"
            fields={[badField]}
            subjects={[subject()]}
            editable
            onChange={vi.fn()}
          />,
        );
      });
    }).toThrow(/kind "toggle"/);
  });
});
