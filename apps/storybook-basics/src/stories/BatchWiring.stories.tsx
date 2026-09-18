/**
 * Blocks/Scene/Batch Wiring — wiring N ports in one gesture, inside the
 * DOM Canvas.
 *
 * THE FEATURE, from its donor (SystemSketch `batchWiring.ts`, read at
 * /home/bam/systemsketch/.claude/worktrees/vision-consolidated/src/blocks/
 * connections/batchWiring.ts — untracked there, see `scene/batchWire.ts`):
 * two commands over one mechanism, differing in exactly where a landing
 * click may land.
 *
 *   "Wire into…"    select the sources, invoke, click ONE dot anywhere a
 *                   source could legally reach — outside the selection too.
 *   "Wire together" select the group, invoke, click one of THEIR OWN dots
 *                   to elect it the hub; the rest wire into it.
 *
 * Zach remembers these as "wire to" and "wire within" (PROJECT - Black Box
 * UI.md:2748, hedged "I think two things"). Close: the code's own names are
 * the two above, and "within" also names a real second axis — selecting one
 * CONTAINER is the shorthand for wiring its members (`batchWireSources`).
 * Both are switchable below.
 *
 * WHY the controls sit on the canvas instead of in a toolbar: Zach's ask —
 * "We don't have a floating toolbar so you can just put like controls on
 * the canvas I think" (:2756). In the donor these same two commands live on
 * three surfaces at once (context menu, selection toolbar, command palette)
 * behind ONE availability read so they cannot drift; none of those surfaces
 * exists here, so the story's own markup is the surface.
 *
 * WHY event delegation rather than per-node handlers: `DomCanvas` takes no
 * selection or eligibility prop and this lane does not edit hosts. One
 * capture listener on a wrapper resolves the press through
 * `data-scene-node` / `data-block-id` / `data-port-id` — the repo's own
 * load-bearing DOM contract (`wireLayer.tsx:60-67` resolves every wire end
 * through the same two attributes), and the donor's own mechanism too
 * (`installConnections.ts`' capture listener on `.Port`, quoted in
 * SystemSketch `PortDot.tsx:2-6`). Nothing here reaches into a component.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import { hostPolarityOf, hostPortsOf, type HostScene } from "../hosts/hostScene";
import {
  applyBatchWire,
  batchWireSources,
  batchWireTargets,
  describeBatchWireOutcome,
  type BatchWireIntent,
  type PortRef,
} from "../scene/batchWire";
import { validateConnectionJudge } from "../scene/batchWireJudge";
import { portKey } from "../scene/scene";

/** The story's own rule vocabulary — PROHIBITIONS, the way the bench's
 *  checkboxes name them. `judgeWith` (below) inverts them into
 *  `ConnectionPolicy`'s PERMISSIONS at the one seam that needs to know
 *  both vocabularies exist. Replaces `batchWire.standIn.ts`'s own
 *  `StandInRules` (deleted; same shape, same defaults). */
export interface StandInRules {
  singleFeed?: boolean;
  acyclic?: boolean;
  sameScope?: boolean;
}

/** `validateConnectionJudge`, wearing the bench's own rule vocabulary —
 *  what used to be `standInJudge(scene, rules)`. This IS the "one line"
 *  `batchWire.ts`'s and `availability.ts`'s own comments promised, now
 *  real: the engine is `validateConnection`, not a second copy of its
 *  rules. Named `judgeWith` rather than `judgeFor` to avoid colliding with
 *  `applyBatchWire`'s own `judgeFor` option key below. */
function judgeWith(scene: HostScene, rules: StandInRules = {}): ReturnType<typeof validateConnectionJudge> {
  const { singleFeed = true, acyclic = true, sameScope = true } = rules;
  return validateConnectionJudge(scene, {
    portsOf: hostPortsOf(scene),
    directionOf: hostPolarityOf(scene),
    policy: { allowFanIn: !singleFeed, allowCycles: !acyclic, allowCrossScope: !sameScope },
  });
}

const meta = {
  title: "Blocks/Scene/Batch Wiring",
  tags: ["area:blocks", "lane:batch-wiring"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The fixture                                                         */
/* ------------------------------------------------------------------ */

/**
 * Built for this gesture rather than borrowed from `HOST_SCENE`: a batch
 * needs several same-shaped sources and a landing worth choosing, and it
 * needs the name-match tiebreak to be visible — `probe` carries a `logs`
 * output precisely so `sink/logs` resolves by NAME while its three other
 * outputs stay ambiguous.
 */
const FIXTURE: HostScene = {
  nodes: [
    { id: "cam", type: "block", position: { x: 16, y: 16 }, data: { name: "cam", view: "port", w: 108, h: 62, ports: { right: ["out"] } } },
    { id: "lidar", type: "block", position: { x: 16, y: 104 }, data: { name: "lidar", view: "port", w: 108, h: 62, ports: { right: ["out"] } } },
    { id: "imu", type: "block", position: { x: 16, y: 192 }, data: { name: "imu", view: "port", w: 108, h: 62, ports: { right: ["out"] } } },
    {
      id: "probe",
      type: "block",
      position: { x: 16, y: 280 },
      data: { name: "probe", view: "port", w: 108, h: 104, ports: { right: ["logs", "a", "b"] } },
    },
    {
      id: "fuse",
      type: "block",
      position: { x: 236, y: 92 },
      data: { name: "fuse", view: "port", w: 128, h: 130, ports: { left: ["in", "cfg", "logs"], right: ["out"] }, anchorStart: ["left"] },
    },
    { id: "gain", type: "value", position: { x: 424, y: 24 }, data: { name: "gain", value: "0.75", writers: ["set"], readers: ["val"] } },
    { id: "sink", type: "block", position: { x: 424, y: 168 }, data: { name: "sink", view: "port", w: 120, h: 104, ports: { left: ["in", "logs"] } } },
  ],
  edges: [],
};

/** Every node id, in scene order — the board, for `"into"`. */
const BOARD = FIXTURE.nodes.map((node) => node.id);

/* ------------------------------------------------------------------ */
/* The ineligible treatment                                            */
/* ------------------------------------------------------------------ */

/**
 * How an unavailable dot reads while a batch is armed.
 *
 * WHY this is a control and not a constant: Zach reviewed five live-CSS
 * treatments against the running donor on 2026-09-06 and picked "Dim"
 * (~18% opacity) with "Vanish" (0%) second at 84/100 — both the same
 * single-opacity mechanism, differing only in the tuned value. The donor
 * froze 18% with a do-not-retune comment (`block-canvas.css:1029-1037`).
 * This app's own `Port` already has a `dimmed` prop, and it paints 0.45
 * (`port.tsx:163`) — a materially lighter dim for a different purpose
 * (one hovered drag, not a whole board off the table). Rather than assert
 * one of the three is right for THIS kit, all three are switchable and the
 * donor's value is the default.
 */
const TREATMENTS = {
  "dim-18": { label: "Dim 18% — donor's frozen value", opacity: 0.18 },
  "dim-45": { label: "Dim 45% — this kit's Port `dimmed`", opacity: 0.45 },
  vanish: { label: "Vanish 0% — scored 84/100", opacity: 0 },
} as const;
type TreatmentKey = keyof typeof TREATMENTS;

const ROOT = "batch-wiring-bench";

/**
 * The armed paint, as one stylesheet.
 *
 * Attribute selectors over `data-block-id` / `data-port-id`, so the ring
 * and the dim ride the real rendered dots without any component knowing
 * this story exists. A port's dot and its label live in ONE
 * `[data-port-id]` wrapper here, which is why they dim together — the
 * donor needed two selectors and a shared hook for the same effect because
 * its dot and label render in separate loops with no common ancestor
 * (`block-canvas.css:1041-1047`).
 */
function armedCss(eligible: ReadonlySet<string>, treatment: TreatmentKey, selected: readonly string[]): string {
  const { opacity } = TREATMENTS[treatment];
  const rings = [...eligible]
    .map((key) => {
      const [nodeId, portId] = key.split("/");
      return `.${ROOT}[data-armed="true"] [data-block-id="${nodeId}"] [data-port-id="${portId}"]`;
    })
    .join(",\n");
  const selection = selected
    .map((id) => `.${ROOT} [data-scene-node="${id}"]`)
    .join(",\n");
  return `
/* Selected sources. Painted on the host's own node wrapper. */
${selection || ".__none"} {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
  border-radius: 10px;
}
/* Off the table: every dot the armed batch would NOT create a cable at. */
.${ROOT}[data-armed="true"] [data-port-id] {
  opacity: ${opacity};
  transition: opacity 120ms ease-in-out;
}
/* Available: the ring. Donor's Port_eligible halo (block-canvas.css:1011). */
${rings || ".__none"} {
  opacity: 1;
  box-shadow: 0 0 0 3px var(--background), 0 0 0 5px var(--primary), 0 0 0 9px color-mix(in srgb, var(--primary) 26%, transparent);
  border-radius: 999px;
}
`;
}

/* ------------------------------------------------------------------ */
/* Controls — plain markup, on the canvas                              */
/* ------------------------------------------------------------------ */

const BTN: React.CSSProperties = {
  font: "inherit",
  fontSize: 12,
  padding: "4px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  cursor: "pointer",
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(next: T): void;
  testId: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={`${testId}-${option.value}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          style={{
            ...BTN,
            borderColor: value === option.value ? "var(--primary)" : "var(--border)",
            background: value === option.value ? "color-mix(in srgb, var(--primary) 14%, var(--background))" : "var(--background)",
          }}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange(next: boolean): void; testId: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted-foreground)" }}>
      <input type="checkbox" data-testid={testId} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* The bench                                                           */
/* ------------------------------------------------------------------ */

function BatchWiringBench() {
  const [scene, setScene] = useState<HostScene>(FIXTURE);
  const [selected, setSelected] = useState<string[]>([]);
  const [intent, setIntent] = useState<BatchWireIntent>("into");
  const [armed, setArmed] = useState(false);
  const [treatment, setTreatment] = useState<TreatmentKey>("dim-18");
  const [rules, setRules] = useState<Required<StandInRules>>({ singleFeed: true, acyclic: true, sameScope: true });
  const [sentence, setSentence] = useState<string>("");
  const minted = useRef(0);

  const portsOf = useMemo(() => hostPortsOf(scene), [scene]);
  // The seam, now real: `judgeWith` (this file, above) wraps
  // `validateConnection` (`edgeValidation.ts`) behind this bench's own
  // rule vocabulary — `batchWire.standIn.ts` is deleted. Nothing else on
  // this page moved to make that land.
  const judge = useMemo(() => judgeWith(scene, rules), [scene, rules]);

  /** The selection read — a list, or one container standing for its members. */
  const sources = useMemo(() => batchWireSources(scene, selected), [scene, selected]);

  /** THE availability answer. Empty unless armed, so nothing paints at rest. */
  const eligible = useMemo(() => {
    if (!armed || !sources) return new Set<string>();
    return batchWireTargets({ sources: sources.sources, intent, candidateNodeIds: BOARD, portsOf, judge });
  }, [armed, sources, intent, portsOf, judge]);

  const arm = useCallback(() => {
    if (!sources) return;
    const targets = batchWireTargets({ sources: sources.sources, intent, candidateNodeIds: BOARD, portsOf, judge });
    // Donor `wireIntoState.ts:78-82` — an armed mode with no affordance is
    // a failure to report, not a mode to sit in.
    if (targets.size === 0) {
      setSentence("Nothing on this board can take a cable from that selection");
      return;
    }
    setSentence("");
    setArmed(true);
  }, [sources, intent, portsOf, judge]);

  /**
   * One capture listener for the whole gesture.
   *
   * Armed: a press on a ringing dot commits; a press anywhere else is a
   * decline, not an error — "the same answer clicking off any armed
   * affordance gives" (donor `wireIntoState.ts:143-145`).
   * At rest: a press on a node toggles it into the selection.
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const el = event.target as HTMLElement;
      const portEl = el.closest<HTMLElement>("[data-port-id]");
      const blockEl = el.closest<HTMLElement>("[data-block-id]");
      const nodeEl = el.closest<HTMLElement>("[data-scene-node]");

      if (armed) {
        const portId = portEl?.dataset.portId;
        const nodeId = blockEl?.dataset.blockId;
        if (!sources || !portId || !nodeId || !eligible.has(portKey(nodeId, portId))) {
          setArmed(false);
          return;
        }
        const target: PortRef = { nodeId, portId };
        const hub = scene.nodes.find((node) => node.id === nodeId);
        const { scene: next, outcome } = applyBatchWire(scene, {
          sources: sources.sources,
          target,
          portsOf,
          // Rebuilt per cable, so cable N sees cables 1..N-1 — the
          // single-feed rule is meaningless otherwise. See `SceneJudge`.
          judgeFor: (working) => judgeWith(working, rules),
          mintEdgeId: () => `batch-${(minted.current += 1)}`,
          // Only "together" CHOSE this end, so only it names a hub —
          // donor :456-462.
          ...(intent === "together" ? { hubLabel: hub?.data.name ?? nodeId } : {}),
        });
        setScene(next);
        setSentence(describeBatchWireOutcome(outcome));
        setArmed(false);
        return;
      }

      const nodeId = nodeEl?.dataset.sceneNode;
      if (!nodeId) {
        setSelected([]);
        return;
      }
      setSentence("");
      setSelected((previous) => (previous.includes(nodeId) ? previous.filter((id) => id !== nodeId) : [...previous, nodeId]));
    },
    [armed, eligible, sources, scene, portsOf, rules, intent],
  );

  // WHY Reset restores the RULE TOGGLES too, not just the scene: "Reset"
  // has to mean back-to-the-start or it means nothing. A sticky toggle
  // surviving it is also how a probe of this very bench fooled its author
  // into reading a correct refusal as a missing one — leaving `singleFeed`
  // off across a reset made a later batch wire two cables into one input,
  // which looked exactly like the incremental-judging bug that had just
  // been fixed. Bench state that outlives the bench's own reset button is a
  // trap for whoever measures next.
  const reset = useCallback(() => {
    setScene(FIXTURE);
    setSelected([]);
    setArmed(false);
    setSentence("");
    setIntent("into");
    setRules({ singleFeed: true, acyclic: true, sameScope: true });
    minted.current = 0;
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented
          label="intent"
          testId="intent"
          value={intent}
          options={[
            { value: "into", label: "Wire into…" },
            { value: "together", label: "Wire together" },
          ]}
          onChange={(next) => {
            setIntent(next);
            setArmed(false);
          }}
        />
        <button type="button" data-testid="arm" onClick={arm} disabled={!sources || armed} style={{ ...BTN, fontWeight: 600 }}>
          {armed ? "armed — click a dot" : "Arm"}
        </button>
        <button type="button" data-testid="reset" onClick={reset} style={BTN}>
          Reset
        </button>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented<TreatmentKey>
          label="ineligible"
          testId="treatment"
          value={treatment}
          options={(Object.keys(TREATMENTS) as TreatmentKey[]).map((key) => ({ value: key, label: TREATMENTS[key].label }))}
          onChange={setTreatment}
        />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>stand-in rules</span>
        <Check label="single feed" testId="rule-singleFeed" checked={rules.singleFeed} onChange={(next) => setRules((r) => ({ ...r, singleFeed: next }))} />
        <Check label="acyclic" testId="rule-acyclic" checked={rules.acyclic} onChange={(next) => setRules((r) => ({ ...r, acyclic: next }))} />
        <Check label="same scope" testId="rule-sameScope" checked={rules.sameScope} onChange={(next) => setRules((r) => ({ ...r, sameScope: next }))} />
      </div>

      {/* The read-out. Stands in for the donor's toast, which reports
        * through the same sentence (`batchWiringCommands.ts:29-34`) — and
        * a toast host is exactly the chrome this app does not have. */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontFamily: "monospace", fontSize: 11 }}>
        <span data-testid="readout-selection">
          selection: {selected.length === 0 ? "—" : selected.join(", ")}
          {sources ? ` (${sources.kind}: ${sources.sources.join(", ")})` : " (not armable)"}
        </span>
        <span data-testid="readout-available">available: {eligible.size}</span>
        <span data-testid="readout-wires">wires: {scene.edges.length}</span>
      </div>
      <div data-testid="readout-sentence" style={{ minHeight: 16, fontSize: 12, color: sentence ? "var(--foreground)" : "var(--muted-foreground)" }}>
        {sentence || "select two or more blocks, pick an intent, Arm, then click a ringing dot"}
      </div>

      <div
        className={ROOT}
        data-armed={armed || undefined}
        data-testid="bench"
        onPointerDownCapture={onPointerDown}
        style={{ cursor: armed ? "crosshair" : "default" }}
      >
        <style>{armedCss(eligible, treatment, selected)}</style>
        <DomCanvas scene={scene} onSceneChange={setScene} width={600} height={430} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/** Drive it: click blocks, Arm, click a ringing dot. */
export const Bench: Story = {
  render: () => <BatchWiringBench />,
};

/* ------------------------------------------------------------------ */
/* Measuring the paint                                                 */
/* ------------------------------------------------------------------ */

/**
 * Every rendered port dot, keyed the way the scene keys one.
 *
 * WHY measured and not inferred: a dot's availability is CSS, so the only
 * honest question is what the browser computed — `getComputedStyle`, never
 * "the element exists" or "the class is present".
 */
function portDots(bench: HTMLElement): { key: string; el: HTMLElement }[] {
  return [...bench.querySelectorAll<HTMLElement>("[data-block-id] [data-port-id]")].map((el) => ({
    key: `${el.closest<HTMLElement>("[data-block-id]")?.dataset.blockId}/${el.dataset.portId}`,
    el,
  }));
}

/** `portKey`s of every dot currently wearing the eligible ring. */
function ringingDots(bench: HTMLElement): string[] {
  return portDots(bench)
    .filter(({ el }) => getComputedStyle(el).boxShadow !== "none")
    .map(({ key }) => key)
    .sort();
}

/** Every dot the armed batch put off the table, by measured opacity. */
function dimmedDots(bench: HTMLElement): string[] {
  return portDots(bench)
    .filter(({ el }) => Number(getComputedStyle(el).opacity) < 1)
    .map(({ key }) => key)
    .sort();
}

/**
 * Assert the settled ring.
 *
 * WHY `waitFor` around a style read: the ineligible dim carries
 * `transition: opacity 120ms`, and `getComputedStyle` during a transition
 * returns the CURRENT animated value — so an assertion fired in the same
 * tick as the click reads opacity 1 on a dot that is on its way to 0.18.
 * That cost a debugging round here: the ring (box-shadow, untransitioned)
 * asserted green while the dim asserted empty, from one measurement.
 * Verified in a real Chromium via Playwright: settled values are 0.18 and
 * 1. Waiting for the settled paint is the claim actually worth making.
 */
async function expectRings(bench: HTMLElement, expected: readonly string[]): Promise<void> {
  await waitFor(() => expect(ringingDots(bench)).toEqual([...expected]));
}

/**
 * The mechanical proof of the "smart detection": given a selection and an
 * intent, EXACTLY these dots are offered and those are not — measured with
 * `getComputedStyle`, never inferred from an element existing.
 */
export const AvailabilityIsFiltered: Story = {
  render: () => <BatchWiringBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bench = canvas.getByTestId("bench");

    // At rest nothing is painted: no ring, no dim.
    await userEvent.click(canvas.getByTestId("reset"));
    await expectRings(bench, []);
    expect(dimmedDots(bench)).toEqual([]);

    for (const id of ["cam", "lidar", "imu"]) {
      const node = bench.querySelector<HTMLElement>(`[data-scene-node="${id}"]`);
      expect(node).not.toBeNull();
      await userEvent.click(node as HTMLElement);
    }
    expect(canvas.getByTestId("readout-selection").textContent).toContain("(list: cam, lidar, imu)");

    await userEvent.click(canvas.getByTestId("arm"));

    // "Wire into…": every sink in scope rings, and ONLY sinks. The three
    // selected sources' own outputs are dimmed, selected or not.
    await expectRings(bench, ["fuse/cfg", "fuse/in", "fuse/logs", "gain/set", "sink/in", "sink/logs"]);
    expect(canvas.getByTestId("readout-available").textContent).toBe("available: 6");
    await waitFor(() => {
      const dimmed = dimmedDots(bench);
      for (const dot of ["cam/out", "lidar/out", "imu/out", "gain/val", "probe/a", "fuse/out"]) {
        expect(dimmed).toContain(dot);
      }
    });
    // The dim is the donor's frozen 18%, measured on a real dot once settled.
    const offTheTable = bench.querySelector<HTMLElement>('[data-block-id="cam"] [data-port-id="out"]') as HTMLElement;
    await waitFor(() => expect(Number(getComputedStyle(offTheTable).opacity)).toBeCloseTo(0.18, 2));
    // Every ringing dot is at full strength — the two treatments never overlap.
    const ringing = ringingDots(bench);
    for (const { key, el } of portDots(bench)) {
      if (ringing.includes(key)) expect(Number(getComputedStyle(el).opacity)).toBe(1);
    }

    // Commit onto `fuse/in` and prove real wires appear. Single feed is on,
    // so the FIRST source takes `in` and the other two are refused — and the
    // sentence says so rather than going silent.
    await userEvent.click(bench.querySelector<HTMLElement>('[data-block-id="fuse"] [data-port-id="in"]') as HTMLElement);
    expect(canvas.getByTestId("readout-sentence").textContent).toBe("Wired 1 cable · skipped 2 input already fed");
    expect(canvas.getByTestId("readout-wires").textContent).toBe("wires: 1");
    // Disarmed by the commit: the whole paint is gone.
    await expectRings(bench, []);
    await waitFor(() => expect(dimmedDots(bench)).toEqual([]));
  },
};

/**
 * The one line separating the two commands: `"together"` narrows the
 * candidate hosts to the selection itself, so a legal landing OUTSIDE the
 * group stops being offered. Same selection, same rules, same judge — only
 * the intent differs.
 */
export const TogetherRingsOnlyItsOwnGroup: Story = {
  render: () => <BatchWiringBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bench = canvas.getByTestId("bench");
    await userEvent.click(canvas.getByTestId("reset"));

    for (const id of ["cam", "lidar", "fuse"]) {
      await userEvent.click(bench.querySelector<HTMLElement>(`[data-scene-node="${id}"]`) as HTMLElement);
    }

    // "into" offers the whole board — `sink/*` and `gain/set` included.
    //
    // `probe/logs` is in this list and it is the assertion catching ME: it
    // is an OUTPUT, and the first version of this expectation left it out
    // on the assumption that a batch only ever lands on inputs. It does
    // not. `fuse` is selected and carries a `logs` INPUT, so `fuse/logs` ↔
    // `probe/logs` is a legal opposite-polarity pair that resolves by name
    // — and the cable runs probe → fuse. Chasing that "wrong" ring is what
    // surfaced the backwards-edge bug now pinned by
    // `batchWire.test.ts`'s "writes the edge in the judge's DATAFLOW
    // order" case. Left recorded rather than quietly corrected.
    await userEvent.click(canvas.getByTestId("intent-into"));
    await userEvent.click(canvas.getByTestId("arm"));
    await expectRings(bench, ["fuse/cfg", "fuse/in", "fuse/logs", "gain/set", "probe/logs", "sink/in", "sink/logs"]);

    // "together" keeps only the group's OWN dots. `fuse` is selected, so its
    // sinks stay; `sink` and `gain` are not, so theirs go. That is the whole
    // difference between the two commands, measured.
    await userEvent.click(canvas.getByTestId("intent-together"));
    await userEvent.click(canvas.getByTestId("arm"));
    await expectRings(bench, ["fuse/cfg", "fuse/in", "fuse/logs"]);

    // Electing `fuse/cfg` the hub fans the rest of the group into it and
    // names it. Single feed caps `cfg` at one producer, so one lands.
    await userEvent.click(bench.querySelector<HTMLElement>('[data-block-id="fuse"] [data-port-id="cfg"]') as HTMLElement);
    expect(canvas.getByTestId("readout-sentence").textContent).toBe("Wired 1 cable into fuse · skipped 1 input already fed");
    expect(canvas.getByTestId("readout-wires").textContent).toBe("wires: 1");
  },
};

/**
 * The refusal that makes the whole feature safe: `probe` has three outputs,
 * all legal against any sink, so a landing it cannot resolve by NAME is
 * refused rather than guessed at.
 */
export const AmbiguityIsRefusedNotGuessed: Story = {
  render: () => <BatchWiringBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bench = canvas.getByTestId("bench");
    await userEvent.click(canvas.getByTestId("reset"));

    for (const id of ["probe", "cam"]) {
      await userEvent.click(bench.querySelector<HTMLElement>(`[data-scene-node="${id}"]`) as HTMLElement);
    }
    await userEvent.click(canvas.getByTestId("arm"));

    // `sink/logs` rings: `cam/out` is its single legal pair, and `probe`
    // resolves it BY NAME (`probe/logs`) rather than ambiguously.
    await expectRings(bench, ["fuse/cfg", "fuse/in", "fuse/logs", "gain/set", "sink/in", "sink/logs"]);
    await userEvent.click(bench.querySelector<HTMLElement>('[data-block-id="sink"] [data-port-id="logs"]') as HTMLElement);
    // probe/logs → sink/logs lands by name; cam/out is then refused, because
    // the name match already occupied that input.
    expect(canvas.getByTestId("readout-sentence").textContent).toBe("Wired 1 cable · skipped 1 input already fed");

    // Same shape with NO name to match on: `sink/in` has no counterpart
    // called `in` on `probe`, whose three outputs are all legal — so `probe`
    // is refused `ambiguous` while `cam` still wires.
    await userEvent.click(canvas.getByTestId("arm"));
    await userEvent.click(bench.querySelector<HTMLElement>('[data-block-id="sink"] [data-port-id="in"]') as HTMLElement);
    expect(canvas.getByTestId("readout-sentence").textContent).toBe("Wired 1 cable · skipped 1 no single obvious port");
    expect(canvas.getByTestId("readout-wires").textContent).toBe("wires: 2");
  },
};

/**
 * Arming is refused outright when the ring would be empty, and a press away
 * from every ringing dot is a decline rather than an error.
 */
export const EmptyRingRefusesToArm: Story = {
  render: () => <BatchWiringBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bench = canvas.getByTestId("bench");
    await userEvent.click(canvas.getByTestId("reset"));

    // Two outputs, "together": neither can take the other's cable.
    for (const id of ["cam", "lidar"]) {
      await userEvent.click(bench.querySelector<HTMLElement>(`[data-scene-node="${id}"]`) as HTMLElement);
    }
    await userEvent.click(canvas.getByTestId("intent-together"));
    await userEvent.click(canvas.getByTestId("arm"));
    expect(canvas.getByTestId("readout-sentence").textContent).toBe("Nothing on this board can take a cable from that selection");
    expect(bench.getAttribute("data-armed")).toBeNull();
    await expectRings(bench, []);

    // Switch to "into", arm for real, then decline by pressing empty canvas.
    await userEvent.click(canvas.getByTestId("intent-into"));
    await userEvent.click(canvas.getByTestId("arm"));
    expect(bench.getAttribute("data-armed")).toBe("true");
    await userEvent.click(canvas.getByTestId("bench"));
    expect(bench.getAttribute("data-armed")).toBeNull();
    expect(canvas.getByTestId("readout-wires").textContent).toBe("wires: 0");
  },
};

/**
 * Availability is a function of the RULES, not of the board alone: turning a
 * stand-in rule off changes which dots ring, live. This is what makes the
 * injected-judge seam visible — and what the real `validateConnection`
 * lane's rule registry will drive instead of this stand-in.
 */
export const RulesChangeAvailability: Story = {
  render: () => <BatchWiringBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bench = canvas.getByTestId("bench");
    await userEvent.click(canvas.getByTestId("reset"));

    for (const id of ["cam", "lidar"]) {
      await userEvent.click(bench.querySelector<HTMLElement>(`[data-scene-node="${id}"]`) as HTMLElement);
    }
    await userEvent.click(canvas.getByTestId("arm"));
    await expectRings(bench, ["fuse/cfg", "fuse/in", "fuse/logs", "gain/set", "sink/in", "sink/logs"]);

    // Wire one cable into `fuse/in`, then re-arm: single feed now removes
    // that dot from the ring — one fewer target, same selection.
    await userEvent.click(bench.querySelector<HTMLElement>('[data-block-id="fuse"] [data-port-id="in"]') as HTMLElement);
    await userEvent.click(canvas.getByTestId("arm"));
    await expectRings(bench, ["fuse/cfg", "fuse/logs", "gain/set", "sink/in", "sink/logs"]);

    // Turn single feed off and it comes back — same board, different rules,
    // no re-arm needed.
    await userEvent.click(canvas.getByTestId("rule-singleFeed"));
    await expectRings(bench, ["fuse/cfg", "fuse/in", "fuse/logs", "gain/set", "sink/in", "sink/logs"]);

    // No rule can ADD a source-polarity dot: polarity is not a rule, it is
    // the port's own identity, so `fuse/out` stays off the table regardless.
    await userEvent.click(canvas.getByTestId("rule-sameScope"));
    await userEvent.click(canvas.getByTestId("rule-acyclic"));
    await waitFor(() => expect(ringingDots(bench)).not.toContain("fuse/out"));
  },
};
