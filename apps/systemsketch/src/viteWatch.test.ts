// src/viteWatch.test.ts — a board file changing on disk must never reload
// the page.
//
// Zach, 2026-09-22: "the page keeps on reloading". A `?board=` window
// autosaves into its file; the seeded review boards live under this app's
// root, so Vite's watcher saw every save and answered with a full reload,
// which reopened the board, which saved it again. `vite.config.ts`'s
// `server.watch.ignored` is the fix; this measures it against Vite's REAL
// watcher (a dev server in middleware mode, no port), rather than
// re-implementing its glob matching and testing that instead.
//
// A control file beside the probes must be SEEN, so "no event" cannot pass
// because the watcher never started.
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = `watch-probe-${process.pid}-${Date.now()}`;

let server: ViteDevServer;
const seen = new Set<string>();

beforeAll(async () => {
  server = await createServer({
    configFile: path.join(APP_ROOT, "vite.config.ts"),
    root: APP_ROOT,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false },
  });
  for (const event of ["add", "change"] as const) server.watcher.on(event, (file: string) => seen.add(path.resolve(file)));
  // Ready = a file it must see IS seen. chokidar's own "ready" can fire
  // before this listener exists, and probes written before the watcher is
  // live would be missed for the wrong reason.
  const warmUp = path.join(APP_ROOT, `${TAG}.warmup.txt`);
  try {
    for (let attempt = 0; !seen.has(warmUp); attempt += 1) {
      if (attempt > 200) throw new Error("Vite's watcher never saw a plain file under the app root");
      writeFileSync(warmUp, String(attempt));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    rmSync(warmUp, { force: true });
  }
}, 30_000);

afterAll(async () => {
  await server?.close();
});

async function touched(files: string[]): Promise<Set<string>> {
  const control = path.join(APP_ROOT, `${TAG}.control.txt`);
  try {
    for (const file of [...files, control]) writeFileSync(file, "{}\n");
    const deadline = Date.now() + 10_000;
    while (!seen.has(control) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.has(control), "the control file must be seen, or this proves nothing about the watcher").toBe(true);
    // The probes were written BEFORE the control, so had they been watched
    // their events would already be in — plus a margin for good measure.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return new Set(files.filter((file) => seen.has(file)));
  } finally {
    for (const file of [...files, control]) rmSync(file, { force: true });
  }
}

describe("vite.config.ts server.watch.ignored", () => {
  it("a board saved anywhere under the app, or anything in review/, is invisible to Vite's watcher", async () => {
    const probes = [
      path.join(APP_ROOT, "review", `${TAG}.tldr`),
      path.join(APP_ROOT, "review", `${TAG}.recipe.json`),
      path.join(APP_ROOT, `${TAG}.tldr`),
      path.join(APP_ROOT, `${TAG}.bbox`),
      path.join(APP_ROOT, `${TAG}.systemsketch`),
      path.join(APP_ROOT, "src", `${TAG}.bbox`),
    ];
    expect([...(await touched(probes))]).toEqual([]);
  });

  // WHY a separate case: the app accepts a board suffix in any case
  // (`@trunk/files/workspaceModel`'s `documentSuffix` lower-cases the name
  // before comparing), so `Board.TLDR` opens, autosaves — and, if Vite's
  // ignore were case-sensitive, reloads the page on every save. A Codex
  // audit on 2026-09-22 caught exactly that with the first `**/*.tldr` globs.
  it("a board suffix in any case is invisible too — the app opens `.TLDR` as readily as `.tldr`", async () => {
    const probes = [
      path.join(APP_ROOT, `${TAG}.TLDR`),
      path.join(APP_ROOT, `${TAG}.BBOX`),
      path.join(APP_ROOT, `${TAG}.SYSTEMSKETCH`),
      path.join(APP_ROOT, "src", `${TAG}.Tldr`),
      path.join(APP_ROOT, "src", `${TAG}.Bbox`),
    ];
    expect([...(await touched(probes))]).toEqual([]);
  });

  it("source under src/review/ is still watched — the ignore is the app's review/ folder, not every folder named review", async () => {
    const source = path.join(APP_ROOT, "src", "review", `${TAG}.ts`);
    expect([...(await touched([source]))]).toEqual([source]);
  });
});
