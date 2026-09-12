// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { NumberInput } from "../src/NumberInput";

/**
 * The component's wiring, rendered. Round 5 showed the reducer tests could
 * not fail on what the component passes: a blur that carried no value left
 * the suite green while the box went blank over a stored 3. This drives the
 * real element through React, with a parent that stores commits the way the
 * page does.
 */
// The page hands the box the RESOLVED value: a single subject with nothing
// stored resolves to the default, and only a Mixed selection resolves to
// undefined. The host models that, or it tests a page that does not exist.
function Host({ initial, mixed, min, max, step }: { initial: number | undefined; mixed?: boolean; min?: number; max?: number; step?: number }) {
  const [stored, setStored] = useState<number | undefined>(initial);
  const resolved = stored !== undefined ? stored : mixed ? undefined : 0;
  return (
    <>
      <NumberInput
        data-slot="box"
        value={resolved}
        defaultValue={0}
        min={min}
        max={max}
        step={step}
        onCommit={setStored}
        onClear={() => setStored(undefined)}
      />
      <output data-slot="stored">{stored === undefined ? "unset" : String(stored)}</output>
    </>
  );
}

function drive(initial: number | undefined, range: { min?: number; max?: number; step?: number; mixed?: boolean } = {}) {
  const ui = render(<Host initial={initial} {...range} />);
  const box = ui.container.querySelector('[data-slot="box"]') as HTMLInputElement;
  const stored = () => (ui.container.querySelector('[data-slot="stored"]') as HTMLOutputElement).textContent;
  return { box, stored, ui };
}

describe("NumberInput, rendered", () => {
  it("a Mixed box that committed while typing, was erased and left, reads the stored value (kills 'blur carries no value')", () => {
    const { box, stored } = drive(undefined, { min: 0, max: 24, step: 1, mixed: true });
    act(() => { fireEvent.focus(box); });
    act(() => { fireEvent.change(box, { target: { value: "3" } }); });
    expect(stored()).toBe("3");
    act(() => { fireEvent.change(box, { target: { value: "" } }); });
    act(() => { fireEvent.blur(box); });
    expect(stored()).toBe("3");
    expect(box.value).toBe("3");
  });

  it("erasing a box over a resolved default and leaving shows the default, not blank (round 5)", () => {
    const { box, stored } = drive(0, { min: 0, max: 24, step: 1 });
    act(() => { fireEvent.focus(box); });
    act(() => { fireEvent.change(box, { target: { value: "" } }); });
    act(() => { fireEvent.blur(box); });
    expect(stored()).toBe("unset");
    expect(box.value).toBe("0");
  });

  it("a field with no declared step steps by 1 in the attribute AND in the commit", () => {
    const { box, stored } = drive(0, { min: 0, max: 24 });
    expect(box.step).toBe("1");
    act(() => { fireEvent.focus(box); });
    act(() => { fireEvent.change(box, { target: { value: "12.5" } }); });
    expect(stored()).toBe("13");
  });

  it("the padding bug itself: the initial 0 can be deleted and 50 lands as the clamped 24, never 050", () => {
    const { box, stored } = drive(0, { min: 0, max: 24, step: 1 });
    act(() => { fireEvent.focus(box); });
    act(() => { fireEvent.change(box, { target: { value: "" } }); });
    expect(box.value).toBe("");
    act(() => { fireEvent.change(box, { target: { value: "50" } }); });
    expect(box.value).toBe("50");
    expect(stored()).toBe("24");
    act(() => { fireEvent.blur(box); });
    expect(box.value).toBe("24");
  });

  it("a Tab through a Mixed box writes nothing", () => {
    const { box, stored } = drive(undefined, { mixed: true });
    act(() => { fireEvent.focus(box); });
    act(() => { fireEvent.blur(box); });
    expect(stored()).toBe("unset");
    expect(box.value).toBe("");
  });
});
