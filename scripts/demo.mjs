#!/usr/bin/env node
/**
 * Start only the dev servers that are not already running.
 *
 * WHY: this is wired to a fence in a handoff and to the dock launcher, so
 * assume it WILL be run twice. Every app pins `--strictPort`, so a plain
 * `pnpm --parallel … run dev` over all four exits 1 the moment one of them is
 * already serving — which is exactly what a second press does. Attaching to
 * what is up and starting only the gap makes re-running a no-op instead of an
 * error, without dropping `--strictPort` (a drifting port silently breaks the
 * compare harness's calibration and every journey's hard-coded URL).
 */
import { spawn } from "node:child_process";

// WHY: a worktree lane cannot share the main checkout's ports — Zach usually
// has main's demos up on 5183/5189, and "attach to what is up" would then hand
// him the wrong build. `BBOX_PORT_OFFSET=100 node scripts/demo.mjs` shifts
// every app by the same amount (5283/5289/…) so a lane's fence is still one
// idempotent line. Each app keeps `--strictPort`; the override only changes
// which port it is strict about.
const OFFSET = Number(process.env.BBOX_PORT_OFFSET ?? 0) || 0;
const APPS = [
  { filter: "demo-reactflow", port: 5183 + OFFSET, label: "React Flow demo" },
  { filter: "demo-tldraw", port: 5189 + OFFSET, label: "tldraw demo" },
  { filter: "demo-compare", port: 5191 + OFFSET, label: "compare harness" },
  { filter: "bbox-playground", port: 5193 + OFFSET, label: "playground" },
];

async function serving(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return true;
  } catch {
    return false;
  }
}

const states = await Promise.all(
  APPS.map(async (app) => ({ ...app, up: await serving(app.port) })),
);

for (const app of states) {
  console.log(
    `  ${app.up ? "already up" : "starting  "}  :${app.port}  ${app.label}`,
  );
}

const missing = states.filter((app) => !app.up);
if (missing.length === 0) {
  console.log("\nAll four already serving — nothing to do.");
  for (const app of states) console.log(`  ${app.label.padEnd(15)} http://127.0.0.1:${app.port}`);
  process.exit(0);
}

// Without an offset every app's own `dev` script pins its port; with one, each
// app is started through `vite` directly on its shifted port. Both keep
// `--strictPort`.
const children = OFFSET === 0
  ? [spawn("pnpm", ["--parallel", ...missing.flatMap((app) => ["--filter", app.filter]), "run", "dev"], { stdio: "inherit" })]
  : missing.map((app) =>
      spawn("pnpm", ["--filter", app.filter, "exec", "vite", "--port", String(app.port), "--strictPort"], { stdio: "inherit" }),
    );
console.log(`\n$ ${children.length} dev server${children.length === 1 ? "" : "s"} starting${OFFSET ? ` (port offset ${OFFSET})` : ""}\n`);
let exited = 0;
for (const child of children) {
  child.on("exit", (code) => {
    if (code) process.exit(code);
    exited += 1;
    if (exited === children.length) process.exit(0);
  });
}
