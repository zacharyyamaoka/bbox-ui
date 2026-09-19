# Acceptance for the pyblocks lane `scv-definitions-partition`

The planner cannot write to `/home/bam/pyblocks`, so the acceptance test for
the definitions partition lives HERE and the dispatcher copies it into the
pyblocks lane worktree before dispatch, byte for byte:

| this file | lands at (inside the pyblocks lane worktree) |
|---|---|
| `test_definition_graph.py` | `tests/test_definition_graph.py` |
| `stereo_fixture.py` | `tests/fixtures/definition_graph/stereo.py` |
| `stereo_definitions.expected.json` | `tests/fixtures/definition_graph/stereo_definitions.expected.json` |

The builder may not edit any of the three. `stereo_definitions.expected.json`
is also read by bbox-ui's `apps/storybook-basics/src/scene/definitionsToScene.test.ts`
— one literal, two repos: that is the cross-repo contract test.

`stereo_fixture.py` sha256 = `0492198bb2aedef2b939d54fba455f62da62a4bfe65acf2710b630537e405a0f`
(the same value pyblocks' own `analyze --view module` reports as `source.sha256`
for this text — verified 2026-09-18 by running the CLI read-only).
