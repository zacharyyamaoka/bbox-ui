# bbox-reactflow

The React Flow host: the same shell as the tldraw studio (`apps/systemsketch`),
over [simple-reactflow-whiteboard](https://github.com/zacharyyamaoka/simple-reactflow-whiteboard)
(MIT). It is the one host that can go on a public page, because tldraw needs a
licence key there. `src/` is a placeholder until L-RF-HOST fills it.

```bash
pnpm --filter bbox-reactflow dev
```

The dev server runs on port 4370. Tests use the studio's split: `unit` runs
`src/**/*.test.ts` in node, and `smoke` runs `src/**/*.smoke.test.tsx` in
headless Chromium.

## How the whiteboard is linked

| piece | value |
|---|---|
| source | `/home/bam/simple-reactflow-whiteboard`, branch `claude/open-as-library-2026-09-19` |
| pin | `12667720aa0db8213082eda4d6b41f8461c33e47`, recorded in `package.json` → `bboxUi.whiteboardPin` |
| worktree | `/home/bam/simple-reactflow-whiteboard-lib`, **detached** at the pin |
| link | `./simple-reactflow-whiteboard`, a committed symlink to that worktree |
| dependency | `"simple-reactflow-whiteboard": "file:./simple-reactflow-whiteboard"`, in `optionalDependencies` |

The design keeps four rules:

- **Its `main` is never merged into and it is never pushed** (decision D7).
  The worktree is detached because the branch is already checked out in the
  source repo, and git refuses to check one branch out twice.
- **`file:`, not `link:`.** The whiteboard's `dist/` treats React and
  `@xyflow/react` as external peers. A `link:` dependency would resolve them
  from the whiteboard's own `node_modules`, which means a second React and an
  "invalid hook call" error. `file:` installs a copy whose peers resolve from
  here instead.
- **The symlink, not an absolute `file:` path.** pnpm writes a `file:`
  directory into the lockfile relative to the lockfile. An absolute specifier
  would therefore produce a lockfile that is correct only at one checkout
  depth: `.claude/worktrees/<lane>` and the main checkout would disagree, and
  `--frozen-lockfile` fails with ENOENT at the other depth (measured). Going
  through the symlink records `file:apps/bbox-reactflow/simple-reactflow-whiteboard`,
  which is the same from every checkout.
- **Optional, so the docs deploy survives.** Cloudflare runs
  `pnpm install --frozen-lockfile` over the whole workspace on a machine that
  has no whiteboard worktree. A required `file:` dependency would fail that
  install, and with it every bbox-ui.com deploy. As an optional dependency it
  is skipped there. Locally, `src/whiteboardDependency.test.ts` turns that
  silent skip into a failing test.

To rebuild the whiteboard's `dist/` (its install runs `prepare`, which is
`build:lib`):

```bash
pnpm --dir /home/bam/simple-reactflow-whiteboard-lib install
```

Never run the whiteboard's plain `build` for this: it builds the demo app into
the same `dist/` and replaces the library.

pnpm installs a copy of `dist/`, not a link, so a rebuilt `dist/` reaches this
app only after a reinstall from the bbox-ui checkout root. Plain
`pnpm install`, and even `--force`, answer "Already up to date" and keep the
stale copy. Disabling optimistic repeat install is what refreshes it
(measured 2026-09-30):

```bash
pnpm install --frozen-lockfile --config.optimistic-repeat-install=false
```
