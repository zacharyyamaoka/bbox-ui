// src/shell/hostContract.ts — the HostPort contract, as a runnable suite.
//
// WHY this is a PURE function first and vitest sugar second: A0.1 of
// docs/WORK-ORDER-HOST-LESS-SHELL.md requires proving the suite goes RED
// against deliberately broken hosts — "a contract that cannot fail is not a
// contract". A failing `describe` cannot be nested inside a passing test, so
// the primitive has to be a VALUE ("these checks failed"), not a test run.
// The same consequence the order asks for falls out for free: the identical
// function runs in the Node `unit` project and in the browser `storybook`
// project, because it imports neither vitest nor a DOM.
//
// Every check below is written so that a host which merely TYPE-CHECKS still
// fails it. Presence is never the assertion; behaviour is.

import type { BlockScene } from "../scene/scene";
import {
  HOST_CAPABILITIES,
  SHELL_AFFORDANCES,
  affordancesFor,
  type HostCapability,
  type HostPort,
  type ShellAffordance,
} from "./hostPort";

export interface ContractCheck {
  /** Capability group from the work order's §4.3 table. */
  group: string;
  name: string;
  ok: boolean;
  /** Why it failed. Empty when it passed. */
  detail: string;
  /** True when the host does not declare the capability this check needs. */
  skipped?: boolean;
}

export interface ContractResult {
  checks: ContractCheck[];
  /** Gated checks this host never ran, because it declares no such capability. */
  skipped: ContractCheck[];
  violations: ContractCheck[];
  /** One line per violation — what gets pasted into a report. */
  report: string;
}

/** A fresh host per check, so one check's writes cannot leak into the next. */
export type MakeHost = () => HostPort;

/* ------------------------------------------------------------------ */

function nodeIdsOf(scene: BlockScene): string[] {
  return scene.nodes.map((n) => n.id);
}

function positionOf(scene: BlockScene, id: string): { x: number; y: number } | null {
  const node = scene.nodes.find((n) => n.id === id);
  return node ? { x: node.position.x, y: node.position.y } : null;
}

/** Captures what the shell can observe, for before/after comparison. */
function snapshot(port: HostPort): string {
  return JSON.stringify({
    nodes: port.scene().nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, data: n.data })),
    edges: port.scene().edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  });
}

/**
 * Runs the whole contract against a host factory. Never throws: a check that
 * blows up is reported as a violation with the thrown message, because a host
 * that crashes has failed the contract just as surely as one that lies.
 */
export async function runHostContract(makeHost: MakeHost): Promise<ContractResult> {
  const checks: ContractCheck[] = [];

  const check = async (group: string, name: string, needs: HostCapability | null, body: (port: HostPort) => void | Promise<void>) => {
    let port: HostPort;
    try {
      port = makeHost();
    } catch (error) {
      checks.push({ group, name, ok: false, detail: `makeHost() threw: ${String(error)}` });
      return;
    }
    if (needs && !port.capabilities.has(needs)) {
      checks.push({ group, name, ok: true, detail: "", skipped: true });
      return;
    }
    try {
      await body(port);
      checks.push({ group, name, ok: true, detail: "" });
    } catch (error) {
      checks.push({ group, name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  // `asserts condition` so a guard like `assert(box !== null, …)` narrows what
  // follows it. The explicit annotation is required: TS only honours an
  // assertion signature on a `const` that is declared with one. Without it the
  // trunk's `tsc` reports 14 "possibly null" errors here — the branch tip was
  // already red on them; vitest strips types, so its green never saw them.
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  /**
   * ONE shared precondition, so a check that indexes `ids[0]`/`ids[1]` can
   * never degrade into a vacuous pass on an under-populated board.
   *
   * WHY it is hoisted instead of repeated: an independent audit ran the real
   * suite against a legitimately-emptied host and found four checks passing
   * with nothing to be wrong about, plus three failures whose message said
   * "node vanished" when no node had ever existed. Both are the same bug —
   * a precondition each check was reinventing, or forgetting.
   */
  const idsAtLeast = (port: HostPort, n: number): string[] => {
    const ids = nodeIdsOf(port.scene());
    if (ids.length < n) {
      throw new Error(
        `this check needs a host whose scene starts with at least ${n} node(s); it has ${ids.length}. ` +
          `Seed the board in makeHost() — see HOST-PORT.md, "One precondition the suite has".`,
      );
    }
    return ids;
  };

  /* ---------------- lifecycle ---------------- */

  await check("lifecycle", "capabilities is a set of known values", null, (port) => {
    assert(typeof port.capabilities?.has === "function", "capabilities is not a Set");
    for (const declared of port.capabilities) {
      assert(HOST_CAPABILITIES.includes(declared), `unknown capability ${String(declared)}`);
    }
  });

  await check("lifecycle", "subscribe returns a working unsubscribe", null, (port) => {
    let calls = 0;
    const off = port.subscribe(() => {
      calls += 1;
    });
    assert(typeof off === "function", "subscribe did not return a function");
    const [id] = idsAtLeast(port, 1);
    port.select([id]);
    assert(calls > 0, "a change did not notify the subscriber");
    const afterFirst = calls;
    off();
    port.select([]);
    assert(calls === afterFirst, `unsubscribe did not stop notifications (${calls} > ${afterFirst})`);
  });

  /* ---------------- the stability rule ----------------
   * The shell reads through useSyncExternalStore. A getter that allocates a
   * fresh value per call makes React throw "The result of getSnapshot should
   * be cached to avoid an infinite loop" and spins the app — so this is a
   * contract clause, not a performance note. See HOST-PORT.md, constraint 7. */

  await check("lifecycle", "every getter is referentially stable between notifications", null, (port) => {
    const getters: [string, () => unknown][] = [
      ["scene", () => port.scene()],
      ["selection", () => port.selection()],
      ["viewport", () => port.viewport()],
      ["tools", () => port.tools()],
      ["history", () => port.history()],
      ["interaction", () => port.interaction()],
      ["documentName", () => port.documentName()],
    ];
    for (const [name, get] of getters) {
      const a = get();
      const b = get();
      assert(Object.is(a, b), `${name}() returned a fresh value with no change between calls — useSyncExternalStore would loop`);
    }
  });

  await check("lifecycle", "a change invalidates the getter it affects", null, (port) => {
    const before = port.selection();
    const [id] = idsAtLeast(port, 1);
    port.select([id]);
    assert(!Object.is(before, port.selection()), "selection() returned the same reference across a real selection change");
  });

  /* ---------------- scene ---------------- */

  await check("scene", "the scene is DERIVED — a command is visible in the next read", null, (port) => {
    const [id] = idsAtLeast(port, 1);
    const before = positionOf(port.scene(), id);
    assert(before !== null, "node vanished from the scene");
    port.nodes({ kind: "update", patches: [{ id, position: { x: before.x + 137, y: before.y + 41 } }] });
    const after = positionOf(port.scene(), id);
    assert(after !== null, "node vanished after an update");
    assert(
      after.x === before.x + 137 && after.y === before.y + 41,
      `scene() did not reflect the write: expected (${before.x + 137}, ${before.y + 41}), read (${after.x}, ${after.y}) — a stored scene, not a derived one`,
    );
  });

  /**
   * F1 from the audit, and the most serious thing it found: every other scene
   * check compares a DELTA (one more node, one fewer), so a host that leaks a
   * constant phantom record — React Flow's invisible `anchor`, a tldraw
   * bookmark helper — passed all 28 checks. `fakeHost.ts` even carried a
   * comment claiming its own helper record made this checkable. It did not.
   *
   * Deleting every id the scene reports must leave the scene EMPTY. A leaked
   * record survives that and is the only thing left, which is exactly the
   * shape of the bug. Uses nothing but port verbs, so it is as true of a
   * tldraw adapter as of this fake.
   */
  await check("scene", "no record survives deleting every node the scene reports", null, (port) => {
    const ids = idsAtLeast(port, 1);
    port.nodes({ kind: "delete", ids });
    const left = port.scene().nodes;
    assert(
      left.length === 0,
      `after deleting all ${ids.length} reported node(s), scene() still returns ${left.length} ` +
        `(${left.map((n) => `${n.id}:${n.type ?? "?"}`).join(", ")}) — a derived scene is leaking a record ` +
        `the shell can see but cannot address`,
    );
    assert(port.scene().edges.length === 0, "edges survived the deletion of both their endpoints");
  });

  /**
   * The leak check above catches a phantom the shell cannot address. This one
   * catches a phantom it CAN name but not act on — the same bug wearing the
   * other face, and the reason one check was not enough: an audit's leaked
   * record was still deletable by id, so deleting everything emptied the board
   * and the leak went by.
   *
   * Every node the shell is shown must be a node the user can act on. A helper
   * record never is — React Flow spells that `selectable: false`.
   */
  await check("scene", "every node the scene reports can actually be selected", null, (port) => {
    for (const id of idsAtLeast(port, 1)) {
      port.select([id]);
      const got = port.selection().ids;
      assert(
        got.length === 1 && got[0] === id,
        `scene() reports node ${id}, but select([${id}]) read back [${got.join(", ")}] — ` +
          `the shell is being shown a record it cannot act on`,
      );
    }
  });

  await check("scene", "scene nodes carry a position and data", null, (port) => {
    for (const node of port.scene().nodes) {
      assert(typeof node.id === "string" && node.id.length > 0, "node without an id");
      assert(node.position && typeof node.position.x === "number", `node ${node.id} has no numeric position`);
      assert(node.data !== undefined, `node ${node.id} has no data ({} is the honest empty)`);
    }
  });

  /* ---------------- selection ---------------- */

  await check("selection", "select() is readable back", null, (port) => {
    const ids = idsAtLeast(port, 1);
    port.select([ids[0]]);
    assert(port.selection().ids.length === 1 && port.selection().ids[0] === ids[0], "selection did not round-trip");
    port.select([]);
    assert(port.selection().ids.length === 0, "clearing the selection did not take");
  });

  await check("selection", "an empty selection has null bounds", null, (port) => {
    port.select([]);
    assert(port.selection().screenBounds === null, "empty selection reported a bounding box");
  });

  await check("selection", "a non-empty selection has a finite, non-negative box", null, (port) => {
    port.select([idsAtLeast(port, 1)[0]]);
    const box = port.selection().screenBounds;
    assert(box !== null, "a selected node reported no bounds");
    for (const key of ["x", "y", "w", "h"] as const) {
      assert(Number.isFinite(box[key]), `screenBounds.${key} is not finite`);
    }
    assert(box.w >= 0 && box.h >= 0, "screenBounds has negative size");
  });

  /* ---------------- camera ---------------- */

  await check("camera", "zoomTo is readable back from viewport()", null, (port) => {
    port.view({ kind: "zoomTo", zoom: 2 });
    assert(port.viewport().zoom === 2, `zoomTo(2) left zoom at ${port.viewport().zoom}`);
  });

  await check("camera", "fit does not throw and leaves a finite viewport", null, (port) => {
    port.view({ kind: "fit" });
    port.view({ kind: "fit", ids: [idsAtLeast(port, 1)[0]] });
    const vp = port.viewport();
    assert(Number.isFinite(vp.zoom) && vp.zoom > 0, `fit left zoom at ${vp.zoom}`);
    for (const key of ["x", "y", "w", "h"] as const) {
      assert(Number.isFinite(vp.screenBounds[key]), `viewport.screenBounds.${key} is not finite`);
    }
  });

  /* ---------------- interaction ---------------- */

  await check("interaction", "interaction() answers one of the four phases", null, (port) => {
    const phases = ["idle", "moving", "resizing", "selecting"];
    assert(phases.includes(port.interaction()), `interaction() returned ${String(port.interaction())}`);
  });

  /* ---------------- tools ---------------- */

  await check("tools", "the catalogue is non-empty and active names one of its ids", "tools", (port) => {
    const { catalogue, active } = port.tools();
    assert(catalogue.length > 0, "a host declaring `tools` has an empty catalogue");
    assert(
      catalogue.some((tool) => tool.id === active),
      `active tool ${active} is not in the catalogue [${catalogue.map((t) => t.id).join(", ")}]`,
    );
    for (const tool of catalogue) {
      assert(typeof tool.label === "string" && tool.label.length > 0, `tool ${tool.id} has no label`);
    }
  });

  await check("tools", "setTool is readable back, including a variant id", "tools", (port) => {
    const { catalogue } = port.tools();
    for (const tool of catalogue) {
      port.setTool(tool.id);
      assert(port.tools().active === tool.id, `setTool(${tool.id}) left active at ${port.tools().active}`);
    }
  });

  /* ---------------- nodes ---------------- */

  await check("nodes", "delete removes exactly the named nodes", null, (port) => {
    const before = idsAtLeast(port, 2);
    port.nodes({ kind: "delete", ids: [before[0]] });
    const after = nodeIdsOf(port.scene());
    assert(!after.includes(before[0]), "delete left the node in the scene");
    assert(after.length === before.length - 1, `delete removed ${before.length - after.length} nodes, expected 1`);
  });

  await check("nodes", "update merges data rather than replacing it", null, (port) => {
    const [id] = idsAtLeast(port, 1);
    port.nodes({ kind: "update", patches: [{ id, data: { contractProbe: 7 } }] });
    const node = port.scene().nodes.find((n) => n.id === id);
    assert(node !== undefined, `node ${id} is gone after a data-only update`);
    assert((node.data as Record<string, unknown>).contractProbe === 7, "data write did not land");
  });

  await check("nodes", "duplicate adds a node with a new id", "duplicate", (port) => {
    const before = idsAtLeast(port, 1);
    port.nodes({ kind: "duplicate", ids: [before[0]] });
    const after = nodeIdsOf(port.scene());
    assert(after.length === before.length + 1, `duplicate produced ${after.length - before.length} nodes, expected 1`);
    const fresh = after.filter((id) => !before.includes(id));
    assert(fresh.length === 1, `duplicate did not mint exactly one new id (${fresh.length})`);
  });

  /* ---------------- history ---------------- */

  await check("history", "undo RESTORES the previous state, not just the flag", "history", (port) => {
    const [id] = idsAtLeast(port, 1);
    const before = snapshot(port);
    port.transact("move", () => port.nodes({ kind: "update", patches: [{ id, position: { x: 999, y: 888 } }] }));
    assert(snapshot(port) !== before, "the transact did not change anything, so undo cannot be tested");
    assert(port.history().canUndo, "canUndo is false after a change");
    port.undo();
    assert(
      snapshot(port) === before,
      "undo() did not restore the previous scene — a history flag that moves without the state is not undo",
    );
  });

  await check("history", "redo re-applies what undo took away", "history", (port) => {
    const [id] = idsAtLeast(port, 1);
    port.transact("move", () => port.nodes({ kind: "update", patches: [{ id, position: { x: 999, y: 888 } }] }));
    const afterChange = snapshot(port);
    port.undo();
    assert(port.history().canRedo, "canRedo is false after an undo");
    port.redo();
    assert(snapshot(port) === afterChange, "redo() did not re-apply the undone change");
  });

  await check("history", "one transact is ONE undo step", "history", (port) => {
    const ids = idsAtLeast(port, 2);
    const before = snapshot(port);
    port.transact("two writes, one gesture", () => {
      port.nodes({ kind: "update", patches: [{ id: ids[0], position: { x: 10, y: 10 } }] });
      port.nodes({ kind: "update", patches: [{ id: ids[1], position: { x: 20, y: 20 } }] });
    });
    port.undo();
    assert(snapshot(port) === before, "one transact took more than one undo to reverse");
  });

  /**
   * Rewritten after an audit found the first version's second disjunct dead:
   * it compared a snapshot captured AFTER the write it was testing for, so
   * the two branches could never disagree. The crisp statement is the one
   * `chrome/variantSwitch.tsx:152` actually needs — switching a design
   * variant must not become something the user can undo.
   */
  await check("history", "an undoable:false write does not become an undo step", "history", (port) => {
    const [id] = idsAtLeast(port, 1);
    assert(!port.history().canUndo, "a host reports undoable history before anything happened");
    const before = snapshot(port);
    port.transact("variant switch", () => port.nodes({ kind: "update", patches: [{ id, data: { variant: "b" } }] }), { undoable: false });
    assert(snapshot(port) !== before, "the undoable:false write changed nothing, so there is nothing to test");
    assert(
      !port.history().canUndo,
      "an undoable:false write made canUndo true — switching a design variant must not be undoable",
    );
  });

  await check("history", "canUndo is false on a fresh host", "history", (port) => {
    assert(!port.history().canUndo, "a host reports undoable history before anything happened");
  });

  /* ---------------- document ---------------- */

  await check("document", "the document name round-trips", null, (port) => {
    port.setDocumentName("contract probe");
    assert(port.documentName() === "contract probe", `documentName() read back ${port.documentName()}`);
  });

  await check("document", "serialize then load restores the scene", "documentIo", async (port) => {
    const before = snapshot(port);
    const text = await port.serialize();
    assert(typeof text === "string" && text.length > 0, "serialize() produced no text");
    port.nodes({ kind: "delete", ids: nodeIdsOf(port.scene()) });
    assert(snapshot(port) !== before, "clearing the board changed nothing, so load cannot be tested");
    const result = port.load(text);
    assert(result.ok, `load() refused its own serialize(): ${result.ok ? "" : result.reason}`);
    assert(snapshot(port) === before, "load() did not restore what serialize() captured");
  });

  await check("document", "load refuses junk with a reason instead of throwing", "documentIo", (port) => {
    const result = port.load("this is not a board");
    assert(!result.ok, "load() accepted junk");
    assert(!result.ok && typeof result.reason === "string" && result.reason.length > 0, "a refusal carried no reason");
  });

  await check("document", "load resets history — the board before is not undoable back", "documentIo", async (port) => {
    const text = await port.serialize();
    port.nodes({ kind: "delete", ids: nodeIdsOf(port.scene()) });
    port.load(text);
    assert(!port.history().canUndo, "after load() the previous board is still one undo away (fileActions.ts:185 clears history)");
  });

  /* ---------------- affordances ----------------
   * A0.1's "a host lacking a capability does not get the affordance", made
   * assertable in P0 where the shell has no windows yet (I3). */

  await check("affordances", "a declared capability turns its affordances on", null, (port) => {
    const shown = affordancesFor(port);
    for (const [affordance, needed] of Object.entries(SHELL_AFFORDANCES) as [ShellAffordance, HostCapability][]) {
      if (port.capabilities.has(needed)) {
        assert(shown.has(affordance), `${affordance} is hidden although the host declares ${needed}`);
      }
    }
  });

  await check("affordances", "an UNDECLARED capability hides every affordance that needs it", null, (port) => {
    const shown = affordancesFor(port);
    for (const [affordance, needed] of Object.entries(SHELL_AFFORDANCES) as [ShellAffordance, HostCapability][]) {
      if (!port.capabilities.has(needed)) {
        assert(!shown.has(affordance), `${affordance} is shown although the host does NOT declare ${needed}`);
      }
    }
  });

  const violations = checks.filter((c) => !c.ok);
  const skipped = checks.filter((c) => c.skipped);
  // WHY the skip count is in the report line: a sparsely-capable host passes
  // by not running the gated checks at all, and "0 violations" reads the same
  // either way. An audit measured a host with no declared capabilities
  // skipping 11 of 28 while reporting clean. Saying so is the honest fix;
  // failing a host for declaring less than it could is not.
  return {
    checks,
    skipped,
    violations,
    report:
      violations.map((v) => `  ✗ [${v.group}] ${v.name}\n      ${v.detail}`).join("\n") +
      (skipped.length > 0 ? `\n  (${skipped.length} of ${checks.length} checks skipped: capability not declared)` : ""),
  };
}

export interface TestHooks {
  describe: (name: string, fn: () => void) => void;
  it: (name: string, fn: () => void) => void;
  expect: (actual: unknown) => { toBe(expected: unknown): void };
}

/**
 * Vitest sugar: one `it()` per check, grouped by capability group, so a
 * failure names the group and the rule rather than "contract failed".
 *
 * It takes an already-run `ContractResult` rather than the host factory,
 * because `runHostContract` is async and vitest registers `describe` bodies
 * SYNCHRONOUSLY — awaiting inside one silently registers nothing. The caller
 * does `const result = await runHostContract(makeHost)` at the top level of
 * the test file (both projects support top-level await) and passes it in.
 * The hooks are parameters rather than imports so this file stays free of
 * vitest and runs identically in the node project and the browser one.
 */
export function describeHostContract(
  result: ContractResult,
  hooks: TestHooks,
): void {
  const groups = new Map<string, ContractCheck[]>();
  for (const c of result.checks) {
    const list = groups.get(c.group) ?? [];
    list.push(c);
    groups.set(c.group, list);
  }
  for (const [group, list] of groups) {
    hooks.describe(group, () => {
      for (const c of list) {
        hooks.it(c.skipped ? `${c.name} (skipped — capability not declared)` : c.name, () => {
          hooks.expect(c.ok ? "" : c.detail).toBe("");
        });
      }
    });
  }
}
