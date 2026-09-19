// src/devFileHost.test.ts — ACCEPTANCE for the dev server's file host.
// Committed by the planning lane of docs/CHROME-FILES-SETTINGS-PLAN.md before
// any builder; off-limits to lane `dev-file-host`.
//
// Node only. Every host started here serves a mkdtemp root and is stopped in a
// `finally`; the one case about the REAL home only computes paths.
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { devFileHostPlugin, resolveDevFileHostRoots, startFileHost, type RunningFileHost } from "../devFileHost";

const appDir = path.dirname(fileURLToPath(new URL("../vite.config.ts", import.meta.url)));
const SHARED_LOCKS = path.join(homedir(), ".local/state/systemsketch-next/locks/workspace");

let host: RunningFileHost | null = null;
let temporary: string | null = null;

afterEach(async () => {
  await host?.stop();
  host = null;
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  temporary = null;
});

function tempRoots() {
  temporary = mkdtempSync(path.join(tmpdir(), "ss-dev-host-"));
  const filesRoot = path.join(temporary, "home");
  mkdirSync(path.join(filesRoot, "SystemSketch"), { recursive: true });
  return { filesRoot, lockRoot: path.join(temporary, "locks") };
}

describe("resolveDevFileHostRoots", () => {
  it("serves the real home for a developer, with the lock folder the dock shares", () => {
    expect(resolveDevFileHostRoots({ HOME: homedir() } as NodeJS.ProcessEnv)).toEqual({ filesRoot: homedir(), lockRoot: SHARED_LOCKS });
  });

  it("refuses to guess a root under a test runner", () => {
    expect(resolveDevFileHostRoots({ HOME: homedir(), VITEST: "true" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("honours an explicit root, test runner or not", () => {
    expect(resolveDevFileHostRoots({ HOME: homedir(), VITEST: "true", SYSTEMSKETCH_FILES_ROOT: "/tmp/elsewhere" } as NodeJS.ProcessEnv)).toEqual({
      filesRoot: "/tmp/elsewhere",
      lockRoot: SHARED_LOCKS,
    });
    expect(
      resolveDevFileHostRoots({ HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "/tmp/elsewhere", SYSTEMSKETCH_LOCK_ROOT: "/tmp/locks" } as NodeJS.ProcessEnv),
    ).toEqual({ filesRoot: "/tmp/elsewhere", lockRoot: "/tmp/locks" });
  });
});

describe("startFileHost", () => {
  it("runs the real Python host on an ephemeral loopback port and stops it by PID", async () => {
    const roots = tempRoots();
    host = await startFileHost(roots);
    expect(host.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const health = (await (await fetch(`${host.url}/api/health`)).json()) as { product: string; filesRoot: string };
    expect(health.product).toBe("systemsketch-files");
    expect(health.filesRoot).toBe(roots.filesRoot);

    const board = path.join(roots.filesRoot, "SystemSketch", "Dev.tldr");
    const source = JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] });
    const saved = await fetch(`${host.url}/api/workspace/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: board, source, baseDigest: null }),
    });
    expect(saved.status).toBe(200);
    expect(readFileSync(board, "utf8")).toContain("tldrawFileFormatVersion");

    const { pid } = host;
    await host.stop();
    host = null;
    expect(() => process.kill(pid, 0)).toThrow();
  });
});

describe("the plugin", () => {
  it("proxies /api/workspace/* from a real vite dev server to its own host", async () => {
    const roots = tempRoots();
    const { createServer } = await import("vite");
    const server = await createServer({
      configFile: false,
      root: appDir,
      logLevel: "silent",
      server: { port: 0, strictPort: false, host: "127.0.0.1" },
      plugins: [devFileHostPlugin(roots)],
    });
    try {
      await server.listen();
      const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
      expect(origin).toBeTruthy();
      const listing = (await (await fetch(`${origin}/api/workspace/list`)).json()) as { root: string; dir: string };
      expect(listing.root).toBe(roots.filesRoot);
      expect(listing.dir).toBe(path.join(roots.filesRoot, "SystemSketch"));
    } finally {
      await server.close();
    }
  });

  it("is mounted by the app's own vite config", () => {
    const config = readFileSync(path.join(appDir, "vite.config.ts"), "utf8");
    expect(config).toMatch(/devFileHostPlugin\(/);
    expect(config).toMatch(/from "\.\/devFileHost"/);
  });
});
