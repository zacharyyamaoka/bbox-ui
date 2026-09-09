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

const APPS = [
  { filter: "demo-reactflow", port: 5183, label: "React Flow demo" },
  { filter: "demo-tldraw", port: 5189, label: "tldraw demo" },
  { filter: "demo-compare", port: 5191, label: "compare harness" },
  { filter: "bbox-playground", port: 5193, label: "playground" },
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
  console.log("  playground  http://127.0.0.1:5193");
  console.log("  compare     http://127.0.0.1:5191");
  process.exit(0);
}

const args = ["--parallel"];
for (const app of missing) args.push("--filter", app.filter);
args.push("run", "dev");

console.log(`\n$ pnpm ${args.join(" ")}\n`);
const child = spawn("pnpm", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
