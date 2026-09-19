// src/code.smoke.test.tsx — L1's acceptance: an ss-code shape renders the
// trunk's CodeEditor, a double-click enters editing on the SAME document,
// keystrokes write `props.code`, Escape leaves, and the 10px grab ring
// moves the shape while the editor's own face never does. Committed with
// the plan (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5, L1), off-limits to builders.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import type { TLShapeId } from "tldraw";

import { CODE_SHAPE_TYPE, CODE_TOOL_ID } from "./shapes/types";
import { canvasOf, centreOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

interface CodeShapeLike {
  id: TLShapeId;
  x: number;
  y: number;
  props: { code: string; language: string; origin: null | { uri: string } };
}

function place(code: string): TLShapeId {
  const id = app!.editor.createShapeId();
  app!.editor.createShape({ id, type: CODE_SHAPE_TYPE, x: 140, y: 120, props: { code, language: "python" } } as never);
  return id;
}

describe("L1 — code shape", () => {
  it("is a system-family tool and renders the trunk CodeEditor with the stored code", async () => {
    app = await mountApp();
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-system"]'), { what: "system face" });
    // The family popout lists Code (rows are the kit's DropdownMenuItems; find by role + text).
    const chevron = face.parentElement?.querySelector<HTMLElement>("[aria-haspopup]") ?? face;
    await userEvent.click(chevron);
    const row = await waitFor(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => /code/i.test(el.textContent ?? "")), { what: "a Code row in the system popout" });
    await userEvent.click(row);
    await waitFor(() => app!.editor.getCurrentToolId() === CODE_TOOL_ID, { what: "current tool is the code tool" });
    await userEvent.keyboard("{Escape}");

    const id = place("gain = clamp(x * k, 0, 1)");
    const editor = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="code-editor"]`), { what: "the CodeEditor face" });
    expect(editor.textContent).toContain("clamp");
  });

  it("double-click edits the same document; keystrokes write props.code per keystroke; Escape leaves editing", async () => {
    app = await mountApp();
    const id = place("x = 1");
    const face = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="code-editor"]`), { what: "the CodeEditor face" });
    await userEvent.dblClick(face);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "editing the code shape" });
    await userEvent.keyboard("{End}{Enter}y = 2");
    await waitFor(() => (app!.editor.getShape(id) as CodeShapeLike).props.code.includes("y = 2"), { what: "props.code updated from the keystrokes" });
    expect((app.editor.getShape(id) as CodeShapeLike).props.code).toBe("x = 1\ny = 2");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "editing ended" });
    // The value survived leaving (the value is never discarded — Ctrl+Z is the retract).
    expect((app.editor.getShape(id) as CodeShapeLike).props.code).toBe("x = 1\ny = 2");
  });

  it("the grab ring moves the shape; a press inside the editor face does not (the editor owns its pointer)", async () => {
    app = await mountApp();
    const id = place("a = 1\nb = 2\nc = 3");
    const shapeEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"]`), { what: "the shape element" });
    const face = shapeEl.querySelector<HTMLElement>('[data-slot="code-editor"]')!;
    const ring = shapeEl.querySelector<HTMLElement>('[data-slot="code-grab-ring"]')!;
    expect(ring, 'the host-owned grab ring carries data-slot="code-grab-ring"').not.toBeNull();

    const before = app.editor.getShape(id)!;
    const faceAt = centreOf(face);
    await userEvent.dragAndDrop(face, canvasOf(app.root), { targetPosition: { x: faceAt.x + 90, y: faceAt.y + 70 } });
    await new Promise((r) => setTimeout(r, 150));
    expect(app.editor.getShape(id)!.x).toBe(before.x);
    expect(app.editor.getShape(id)!.y).toBe(before.y);

    const ringRect = ring.getBoundingClientRect();
    await userEvent.dragAndDrop(ring, canvasOf(app.root), { sourcePosition: { x: 3, y: 3 }, targetPosition: { x: ringRect.left + 3 + 90, y: ringRect.top + 3 + 70 } });
    await waitFor(() => app!.editor.getShape(id)!.x > before.x + 40 && app!.editor.getShape(id)!.y > before.y + 30, { what: "the ring drag moved the shape" });
  });

  it("origin is reserved and null by default; a shape created with an origin keeps it verbatim", async () => {
    app = await mountApp();
    const plain = place("pass");
    expect((app.editor.getShape(plain) as CodeShapeLike).props.origin).toBeNull();
    const id = app.editor.createShapeId();
    app.editor.createShape({ id, type: CODE_SHAPE_TYPE, x: 0, y: 0, props: { code: "def run(): ...", origin: { uri: "stereo.py", anchor: "run", contentHash: "sha256:" + "a".repeat(64) } } } as never);
    expect((app.editor.getShape(id) as CodeShapeLike).props.origin?.uri).toBe("stereo.py");
  });
});
