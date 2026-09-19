# pyblocks → SystemSketch contract fixtures

Frozen 2026-09-18 by the planning lane (`docs/PYBLOCKS-BACKEND-PLAN.md`).
Both repos test against these bytes; neither builder edits them.

| File | Side | What it is |
|---|---|---|
| `linear_chain.blockview.json` | input | Hand-authored BlockView v1: `run(raw)` → `decode()` → `scale(frame, 2.0)` → return. Two blocks carry authored positions, two do not. |
| `linear_chain.scene.json` | output | The exact `PyblocksSceneDocument` pyblocks must emit for it. |
| `region_for_if.blockview.json` | input | The P1 lane's frozen specimen `expanded.blockview.json` (pyblocks `b3c0e12`, `docs/viewer-spike/specimen/`), URIs made portable (`workspace:sort_frame.py`). 11 blocks, 19 edges, `for ⊃ if` nesting, `__inner` twin ports, one `state` edge, two `control` edges. |
| `region_for_if.scene.json` | output | Its exact projection: 11 nodes, 17 wires, 2 control edges kept aside. |
| `events_edit_session.json` | shared | `before`/`after` `HostScene` pair, the exact `SceneEvent[]` the trunk must derive (in order), and the class pyblocks must assign per event type. |
| `test_systemsketch_scene_acceptance.py` | pyblocks | Acceptance for `pyblocks/systemsketch_scene.py`, the `to-systemsketch` CLI verb and the two routes. Run from the pyblocks lane worktree — the docstring has the command. |

The TypeScript acceptance lives beside the skeletons it tests:
`apps/storybook-basics/src/scene/pyblocksScene.test.ts` and
`apps/storybook-basics/src/scene/sceneEvents.test.ts`
(`pnpm exec vitest --project=unit run src/scene/pyblocksScene.test.ts src/scene/sceneEvents.test.ts`).
