import { describe, expect, it, vi } from "vitest";

import { FieldGesture } from "../src/fieldGesture";

describe("FieldGesture — live mode (CodeField's only write policy)", () => {
  it("writes on every change and commits once on end", () => {
    const write = vi.fn();
    const begin = vi.fn();
    const end = vi.fn();
    const gesture = new FieldGesture({ write, begin, end }, "live");

    gesture.change("a");
    gesture.change("ab");
    expect(write).toHaveBeenNthCalledWith(1, "a");
    expect(write).toHaveBeenNthCalledWith(2, "ab");
    expect(begin).toHaveBeenCalledTimes(1); // lazy — only the first real change opens the step

    gesture.commit();
    expect(end).toHaveBeenCalledWith("ab", "");
  });

  it("focus is idempotent — re-entering keeps the original pre-edit value", () => {
    const gesture = new FieldGesture({ write: vi.fn() });
    gesture.focus("start");
    gesture.change("start-edited");
    gesture.focus("ignored second focus");
    expect(gesture.startValue).toBe("start");
    expect(gesture.value).toBe("start-edited");
  });

  it("a no-op change (same value) never opens an undo step or writes", () => {
    const write = vi.fn();
    const begin = vi.fn();
    const gesture = new FieldGesture({ write, begin });
    gesture.focus("same");
    gesture.change("same");
    expect(write).not.toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
  });

  it("commit is idempotent — calling it twice only ends the gesture once", () => {
    const end = vi.fn();
    const gesture = new FieldGesture({ write: vi.fn(), end });
    gesture.change("x");
    gesture.commit();
    gesture.commit();
    expect(end).toHaveBeenCalledTimes(1);
    expect(gesture.isEditing).toBe(false);
  });

  it("commit with nothing typed still fires `end` once entered", () => {
    const end = vi.fn();
    const gesture = new FieldGesture({ write: vi.fn(), end });
    gesture.focus("value");
    gesture.commit();
    expect(end).toHaveBeenCalledWith("value", "value");
  });
});

describe("FieldGesture — exit mode", () => {
  it("buffers every change and writes exactly once, at commit", () => {
    const write = vi.fn();
    const gesture = new FieldGesture({ write }, "exit");
    gesture.change("a");
    gesture.change("ab");
    gesture.change("abc");
    expect(write).not.toHaveBeenCalled();
    gesture.commit();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("abc");
  });

  it("never writes if the value never actually changed", () => {
    const write = vi.fn();
    const gesture = new FieldGesture({ write }, "exit");
    gesture.focus("same");
    gesture.change("same");
    gesture.commit();
    expect(write).not.toHaveBeenCalled();
  });

  it("unmount (an explicit commit with no further input) is still a real end boundary", () => {
    const write = vi.fn();
    const end = vi.fn();
    const gesture = new FieldGesture({ write, end }, "exit");
    gesture.focus("start");
    gesture.change("edited");
    // Simulates the unmount cleanup effect calling commit() with no blur ever firing.
    gesture.commit();
    expect(write).toHaveBeenCalledWith("edited");
    expect(end).toHaveBeenCalledWith("edited", "start");
  });
});
