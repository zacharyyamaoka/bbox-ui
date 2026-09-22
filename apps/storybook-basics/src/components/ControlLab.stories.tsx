// src/components/ControlLab.stories.tsx — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/prototypes/menuLab/menuLabModel.ts:1-388` — every exported
//     function and type (`emptyLabState`, `labControl`, `labRecipe`,
//     `labValue`, `bindLabControl`, `labCandidates`, `labDangling`,
//     `labComposition`, `labRecipeSource`, `setLabControl`,
//     `moveLabControl`, `LabControlState`, `LabState`,
//     `LAB_LAYOUTS`/`LAB_TRIGGERS`/`LAB_STACK_PLACEMENTS`/`LAB_VALUE_STATES`),
//     ported near-verbatim, `ContextualControlKind` → this file's own
//     `DemoKind`, `ContextualControl(Recipe|Composition)` → the kit's
//     `BoundControl`/`ControlRecipe`/`ControlComposition`.
//
// The lever RENDERING (the table below, `LabControlRow`, the composed-strip
// panel, the dangling banner, the recipe-source `<pre>`) is NOT a port —
// `menuLabModel.ts` is "388 pure lines, zero engine imports" (task brief)
// and owns no UI at all; the donor's own lab UI lives in a Settings-embedded
// route this task does not carry over (MENU-KIT-DESIGN.md §3.4: "The
// standalone `?menu-lab` route and Settings embedding do not travel; the
// story is the single entry point"). Everything under "Lever board UI"
// below is ours, ad hoc, built to expose the ported model.
//
// WHAT CHANGED in the port, exhaustively:
//
//   1. `LAB_PRESETS`/`labPresetDrift` (donor :107-183, :207-242) do NOT
//      port. They exist to prove the donor's OWN shipped recipes
//      (`SHAPE_CONTEXTUAL_RECIPE`, etc.) haven't drifted from their lab
//      reproductions — a kit vocabulary has no such shipped recipes to
//      check against (design decision #4: "recipes are app data; stories
//      carry demo recipes"). `defaultLabState` below is an ordinary lever
//      preset, not a claim about product parity.
//   2. `LAB_KINDS` (donor :82-83, `Object.keys(CONTEXTUAL_CONTROL_REGISTRY)`)
//      becomes `Object.keys(demoDefinitions)` — the same idea, reading this
//      lane's own demo vocabulary (`ControlStrip.stories.tsx`, shared so
//      both files build against ONE registry) instead of the app-wide
//      module constant the donor's kind union no longer exists.
//   3. `bindLabControl`'s registry call is `demoRegistry.bindControl`
//      (`controlRegistry.ts`'s factory, this lane's `demoRegistry`) rather
//      than the donor's `bindContextualControl` free function — design
//      decision #1, "the registry becomes a factory."
//
// Everything else — the recipe-from-levers fold (`labRecipe`), the
// stack-chain walk in `labCandidates` (mirrors `stackModes` in
// `controlRegistry.ts`, kept independent here because the LAB additionally
// overrides `layout`/`trigger` per instance, which `stackModes` itself never
// does), the "a control whose stack has nothing to fold into just vanishes"
// dangling rule, `moveLabControl`'s "swap past the nearest INCLUDED
// neighbour" reorder — is unchanged behaviour.
"use client";

import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ControlStrip } from "./controlStrip";
import type {
  BoundControl,
  ControlComposition,
  ControlLayout,
  ControlRecipe,
  ControlTrigger,
} from "./controlRegistry";
import { demoDefinitions, demoGlyphs, demoRegistry, FONT_SIZE_PX, type DemoKind } from "./ControlStrip.stories";

/**
 * The contextual-menu lab: every composition lever, as data you can press.
 *
 * WHY this exists at all — Zach, 2026-09-06: "I'm tired of these contextual
 * menus being so buggy… show me how you can build and compose these
 * contextual menus in an incredibly modular way… make a generic contextual
 * menu with all the different configuration levers that I can just press
 * myself."
 *
 * PRIOR ART, and why the architecture already here is the right one rather
 * than something to reinvent:
 *
 * - **VS Code's `menus` contribution point.** A command is declared ONCE; a
 *   surface says which commands it wants via `group@order` and a `when`
 *   clause. Nothing about a command's label, icon, or keybinding is restated
 *   per menu. `demoDefinitions` is the command table, a `ControlRecipe` is
 *   the `menus` contribution, and `composeControls` is the resolver.
 * - **Blender's `layout.prop()`.** A panel is a nesting of rows and columns
 *   that BIND to properties; the widget for a property is chosen from the
 *   property's own type, never restated at the call site. That is exactly
 *   what the registry's `glyph` family and `layout` do here.
 * - **Tweakpane / leva / dat.GUI.** A control panel generated from a schema
 *   of levers. That is the shape of this lab itself.
 * - **Zach's own [[C - Semantic Type Registry]]**: "resolve semantics once,
 *   then project them many times," and "give plugins a constrained
 *   contribution point rather than an unbounded new visual language."
 *
 * So the lab is deliberately NOT a second menu implementation. It builds the
 * same `BoundControl` objects `ControlStrip.stories.tsx` builds and hands
 * them to the same `ControlStrip`/`ControlPanel` renderer. If a lever
 * composes here, it composes in the product — and if it is buggy here, the
 * product bug is reproducible without a canvas selection.
 */

// ---------------------------------------------------------------------------
// Ported model (menuLabModel.ts) — see this file's own header for the exact
// line ranges and the three changes.
// ---------------------------------------------------------------------------

type LabStackPlacement = "none" | "above" | "beside";
type LabValueState = "first" | "second" | "mixed";

const LAB_LAYOUTS: readonly ControlLayout[] = ["swatches", "row", "chips", "list", "library"];
const LAB_TRIGGERS: readonly ControlTrigger[] = ["value", "icon", "text", "toggle", "action"];
const LAB_STACK_PLACEMENTS: readonly LabStackPlacement[] = ["none", "above", "beside"];
const LAB_VALUE_STATES: readonly LabValueState[] = ["first", "second", "mixed"];

interface LabControlState {
  kind: DemoKind;
  included: boolean;
  layout: ControlLayout;
  trigger: ControlTrigger;
  /** Fold this control INTO the next included one instead of emitting it. */
  stack: LabStackPlacement;
  value: LabValueState;
  /** Draw the group hairline before this control. */
  breakBefore: boolean;
}

interface LabState {
  controls: readonly LabControlState[];
}

const LAB_KINDS = Object.keys(demoDefinitions) as DemoKind[];

function labControl(kind: DemoKind, overrides: Partial<LabControlState> = {}): LabControlState {
  const definition = demoDefinitions[kind];
  return {
    kind,
    included: false,
    layout: definition.layout,
    trigger: definition.trigger,
    stack: "none",
    value: "first",
    breakBefore: false,
    ...overrides,
  };
}

/** Every registered kind, in registry order, none of them included yet. */
function emptyLabState(): LabState {
  return { controls: LAB_KINDS.map((kind) => labControl(kind)) };
}

/** The recipe the current levers describe: group breaks become group ids. */
function labRecipe(state: LabState): ControlRecipe<DemoKind> {
  const groups: { id: string; items: DemoKind[] }[] = [];
  for (const control of state.controls) {
    if (!control.included || control.stack !== "none") continue;
    if (groups.length === 0 || control.breakBefore) {
      groups.push({ id: `group-${groups.length + 1}`, items: [] });
    }
    groups[groups.length - 1].items.push(control.kind);
  }
  return { id: "lab", groups };
}

function labValue(control: LabControlState): BoundControl<DemoKind>["value"] {
  if (control.value === "mixed") return { type: "mixed" };
  const options = demoDefinitions[control.kind].options;
  if (options.length === 0) return { type: "shared", value: "on" };
  const index = control.value === "second" ? Math.min(1, options.length - 1) : 0;
  return { type: "shared", value: options[index].value };
}

/**
 * Bind one lab control, carrying whatever is stacked onto it.
 *
 * The bound object is an ordinary `BoundControl` — the same type
 * `ControlStrip.stories.tsx` produces — so `ControlStrip` cannot tell a lab
 * composition from a product one, EXCEPT for `layout`/`trigger`: the lab
 * overrides both per instance so every lever actually does something, even
 * a layout/trigger the registered kind doesn't normally use. That is the
 * one place this lab reaches past what a real host binder ever would.
 */
function bindLabControl(
  control: LabControlState,
  onSelect: (kind: DemoKind, value: string | undefined) => void,
  mode?: { control: BoundControl<DemoKind>; placement: "above" | "beside" },
): BoundControl<DemoKind> {
  const bound = demoRegistry.bindControl(control.kind, {
    id: control.kind,
    value: labValue(control),
    onSelect: (value) => onSelect(control.kind, value),
    rungPxByValue: control.kind === "fontSize" ? FONT_SIZE_PX : undefined,
    ...(mode ? { modeControl: mode.control, modePlacement: mode.placement } : {}),
  });
  return { ...bound, layout: control.layout, trigger: control.trigger };
}

/**
 * Fold the lever list into the candidate controls, stacking each `above` /
 * `beside` control onto the next included one — the same chain
 * `BesideMode`/`FillPopover` in `ControlStrip.stories.tsx` build by hand,
 * here computed from the levers instead.
 */
function labCandidates(
  state: LabState,
  onSelect: (kind: DemoKind, value: string | undefined) => void,
): BoundControl<DemoKind>[] {
  const candidates: BoundControl<DemoKind>[] = [];
  let pending: { control: BoundControl<DemoKind>; placement: "above" | "beside" } | undefined;
  for (const control of state.controls) {
    if (!control.included) continue;
    if (control.stack !== "none") {
      pending = { control: bindLabControl(control, onSelect, pending), placement: control.stack };
      continue;
    }
    candidates.push(bindLabControl(control, onSelect, pending));
    pending = undefined;
  }
  return candidates;
}

/**
 * Controls whose `stack` lever has nothing below it to fold into.
 *
 * WHY this is surfaced rather than silently tolerated: stacking is defined
 * as "fold into the NEXT included control," so the last control in the list
 * has no host and simply disappears from the menu. Pressing a lever and
 * watching a control vanish with no explanation is exactly the kind of
 * quiet contextual-menu behaviour Zach is tired of (this file's own header
 * quote); the lab names it instead.
 */
function labDangling(state: LabState): DemoKind[] {
  const dangling: DemoKind[] = [];
  let pending: DemoKind[] = [];
  for (const control of state.controls) {
    if (!control.included) continue;
    if (control.stack !== "none") {
      pending.push(control.kind);
      continue;
    }
    pending = [];
  }
  dangling.push(...pending);
  return dangling;
}

function labComposition(
  state: LabState,
  onSelect: (kind: DemoKind, value: string | undefined) => void,
): ControlComposition<DemoKind> {
  return demoRegistry.composeControls(labRecipe(state), labCandidates(state, onSelect));
}

/** The recipe literal the current levers would be written as in source. */
function labRecipeSource(state: LabState): string {
  const recipe = labRecipe(state);
  const groups = recipe.groups
    .map(
      (group) =>
        `    { id: "${group.id}", items: [${group.items.map((item) => `"${item}"`).join(", ")}] },`,
    )
    .join("\n");
  return `const LAB_RECIPE: ControlRecipe<DemoKind> = {\n  id: "lab",\n  groups: [\n${groups}\n  ],\n};`;
}

function setLabControl(state: LabState, kind: DemoKind, patch: Partial<LabControlState>): LabState {
  return { controls: state.controls.map((control) => (control.kind === kind ? { ...control, ...patch } : control)) };
}

/**
 * Move a control past its nearest INCLUDED neighbour.
 *
 * WHY not a plain index swap: the lever list holds every registered kind,
 * most of them switched off, so a one-step swap usually trades places with
 * a hidden row and the composed menu does not move — the arrow silently
 * does nothing.
 */
function moveLabControl(state: LabState, kind: DemoKind, direction: -1 | 1): LabState {
  const controls = [...state.controls];
  const index = controls.findIndex((control) => control.kind === kind);
  if (index < 0) return state;
  let target = index + direction;
  while (target >= 0 && target < controls.length && !controls[target].included) {
    target += direction;
  }
  if (target < 0 || target >= controls.length) return state;
  [controls[index], controls[target]] = [controls[target], controls[index]];
  return { controls };
}

// ---------------------------------------------------------------------------
// Lever board UI — ours, ad hoc (see this file's own header). A starting
// preset so the strip isn't blank on load; `emptyLabState()` (above) is
// still what every lever's own OFF state resolves to.
// ---------------------------------------------------------------------------

function defaultLabState(): LabState {
  let state = emptyLabState();
  state = setLabControl(state, "fillMode", { included: true, stack: "above" });
  state = setLabControl(state, "fill", { included: true });
  state = setLabControl(state, "lineStyle", { included: true, breakBefore: true });
  state = setLabControl(state, "bold", { included: true });
  state = setLabControl(state, "align", { included: true });
  return state;
}

function LabControlRow({
  control,
  onPatch,
  onMove,
}: {
  control: LabControlState;
  onPatch: (patch: Partial<LabControlState>) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const selectClass = "rounded border border-input bg-transparent px-1 py-0.5 text-xs";
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-1.5">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            aria-label={`${control.kind} included`}
            checked={control.included}
            onChange={(event) => onPatch({ included: event.target.checked })}
          />
          <span className="font-mono text-xs">{control.kind}</span>
        </label>
      </td>
      <td className="p-1.5">
        <select
          aria-label={`${control.kind} layout`}
          className={selectClass}
          value={control.layout}
          onChange={(event) => onPatch({ layout: event.target.value as ControlLayout })}
        >
          {LAB_LAYOUTS.map((layout) => (
            <option key={layout} value={layout}>
              {layout}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1.5">
        <select
          aria-label={`${control.kind} trigger`}
          className={selectClass}
          value={control.trigger}
          onChange={(event) => onPatch({ trigger: event.target.value as ControlTrigger })}
        >
          {LAB_TRIGGERS.map((trigger) => (
            <option key={trigger} value={trigger}>
              {trigger}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1.5">
        <select
          aria-label={`${control.kind} stack`}
          className={selectClass}
          value={control.stack}
          onChange={(event) => onPatch({ stack: event.target.value as LabStackPlacement })}
        >
          {LAB_STACK_PLACEMENTS.map((stack) => (
            <option key={stack} value={stack}>
              {stack}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1.5">
        <select
          aria-label={`${control.kind} value`}
          className={selectClass}
          value={control.value}
          onChange={(event) => onPatch({ value: event.target.value as LabValueState })}
        >
          {LAB_VALUE_STATES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1.5">
        <input
          type="checkbox"
          aria-label={`${control.kind} break before`}
          title="Draw the group hairline before this control"
          checked={control.breakBefore}
          onChange={(event) => onPatch({ breakBefore: event.target.checked })}
        />
      </td>
      <td className="p-1.5">
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`Move ${control.kind} earlier`}
            className="rounded border border-input px-1.5 text-xs hover:bg-muted"
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${control.kind} later`}
            className="rounded border border-input px-1.5 text-xs hover:bg-muted"
            onClick={() => onMove(1)}
          >
            ↓
          </button>
        </div>
      </td>
    </tr>
  );
}

function ControlLabDemo() {
  const [state, setState] = useState<LabState>(defaultLabState);

  // Closes the loop the other way: clicking an option inside the REAL
  // rendered strip below moves the matching lever's own `value` state, so
  // the lab's levers and the strip's live behaviour never disagree about
  // what is selected — the donor's own point (this file's header) made
  // checkable rather than merely asserted.
  const onSelect = (kind: DemoKind, value: string | undefined) => {
    setState((previous) => {
      if (value === undefined) return setLabControl(previous, kind, { value: "mixed" });
      const options = demoDefinitions[kind].options;
      const index = options.findIndex((option) => option.value === value);
      const next: LabValueState = index <= 0 ? "first" : index === 1 ? "second" : "mixed";
      return setLabControl(previous, kind, { value: next });
    });
  };

  const composition = useMemo(() => labComposition(state, onSelect), [state]);
  const dangling = useMemo(() => labDangling(state), [state]);
  const recipeSource = useMemo(() => labRecipeSource(state), [state]);

  const patch = (kind: DemoKind, next: Partial<LabControlState>) =>
    setState((previous) => setLabControl(previous, kind, next));
  const move = (kind: DemoKind, direction: -1 | 1) =>
    setState((previous) => moveLabControl(previous, kind, direction));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-popover p-3 shadow-md">
        {composition.groups.length > 0 ? (
          <ControlStrip composition={composition} glyphs={demoGlyphs} aria-label="Lab composition" />
        ) : (
          <p className="text-muted-foreground text-sm">Nothing included yet — check a row below.</p>
        )}
      </div>

      {dangling.length > 0 ? (
        <p
          data-testid="lab-dangling-warning"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-2 text-xs"
        >
          Dangling: {dangling.join(", ")} — stacked with nothing included below it to fold into, so it
          disappears from the menu with no error. Give it a host (turn on the next kind, or set its own
          stack back to "none").
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs">
              <th className="p-1.5 font-medium">Kind</th>
              <th className="p-1.5 font-medium">Layout</th>
              <th className="p-1.5 font-medium">Trigger</th>
              <th className="p-1.5 font-medium">Stack</th>
              <th className="p-1.5 font-medium">Value</th>
              <th className="p-1.5 font-medium">Break</th>
              <th className="p-1.5 font-medium">Reorder</th>
            </tr>
          </thead>
          <tbody>
            {state.controls.map((control) => (
              <LabControlRow
                key={control.kind}
                control={control}
                onPatch={(next) => patch(control.kind, next)}
                onMove={(direction) => move(control.kind, direction)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <pre data-testid="lab-recipe-source" className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
        {recipeSource}
      </pre>
    </div>
  );
}

const meta = {
  title: "Components/Menus & Bars/ControlLab",
  tags: ["object:chrome"],
  component: ControlLabDemo,
} satisfies Meta<typeof ControlLabDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lab: Story = {
  render: () => <ControlLabDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The default preset drives the SAME `ControlStrip` the other stories
    // use — proving `labComposition` isn't a look-alike renderer.
    await expect(canvas.getByRole("button", { name: /^Fill,/ })).toBeInTheDocument();

    // Strip every included control down to just the stacked `fillMode`
    // lever — nothing left in the array can host it, reproducing
    // menuLabModel.ts's exact dangling case (:316-324): a control whose
    // `stack` lever has nothing below it to fold into just vanishes with no
    // error. (Excluding just `fill` is NOT enough to dangle `fillMode` —
    // `labDangling`/`labCandidates` both walk the WHOLE array looking for
    // the next included control regardless of adjacency, so `fillMode`
    // would simply re-attach to `lineStyle` instead.)
    await userEvent.click(canvas.getByRole("checkbox", { name: "fill included" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "lineStyle included" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "bold included" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "align included" }));

    await waitFor(() => expect(canvas.getByTestId("lab-dangling-warning")).toBeInTheDocument());
    await expect(canvas.getByTestId("lab-dangling-warning").textContent).toContain("fillMode");

    // Restore the full default composition — re-including `fill` first
    // gives `fillMode` somewhere to fold into again, clearing the warning
    // before any of the others come back.
    await userEvent.click(canvas.getByRole("checkbox", { name: "fill included" }));
    await waitFor(() => expect(canvas.queryByTestId("lab-dangling-warning")).toBeNull());
    await userEvent.click(canvas.getByRole("checkbox", { name: "lineStyle included" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "bold included" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "align included" }));

    // Reordering: move `bold` past its nearest included neighbour
    // (`lineStyle`) and confirm the recipe-literal readout actually
    // changes — `bold` leaves `lineStyle`'s group and joins `fill`'s.
    const before = canvas.getByTestId("lab-recipe-source").textContent ?? "";
    await userEvent.click(canvas.getByRole("button", { name: "Move bold earlier" }));
    await waitFor(() => expect(canvas.getByTestId("lab-recipe-source").textContent).not.toBe(before));
  },
};
