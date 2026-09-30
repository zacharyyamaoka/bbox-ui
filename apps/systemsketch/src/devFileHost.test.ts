// src/devFileHost.test.ts — ACCEPTANCE for the dev server's file host.
// Committed by the planning lane of docs/CHROME-FILES-SETTINGS-PLAN.md before
// any builder; off-limits to lane `dev-file-host`.
//
// Node only. Every host started here serves a mkdtemp root and is stopped in a
// `finally`; the one case about the REAL home only computes paths.
//
// AMENDED 2026-09-19 by the judge-fix lane `host-and-locks`, after an
// independent Codex judge found dev and Stable taking DIFFERENT locks on the
// same board (finding P1-2). ONE existing expectation was corrected, in the
// same spirit as the two L4 cases the plan records replacing in place — and it
// is corrected UPWARDS, not weakened:
//
//   was  const SHARED_LOCKS = path.join(homedir(), ".local/state/systemsketch-next/locks/workspace");
//   now  asked of the Python that Stable actually calls (`default_lock_root`).
//
// The case is still named "with the lock folder the dock shares" and still
// asserts exactly that; the literal was simply not the folder the dock shares.
// Measured on this box: Stable resolves
// `~/.local/share/systemsketch/runtime/locks/workspace` (the archived app's
// own directory, which exists here), the literal above resolved the other one,
// and `document_locks` names a lock file under its root — so two roots are two
// lock files, and a dev save and a Stable save of one board excluded nothing.
// Everything else in this file is untouched; the rest is NEW CASES ONLY.
import { execFileSync, spawn } from "node:child_process";
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { devFileHostPlugin, resolveDevFileHostRoots, resolveSharedLockRoot, RootOverrideError, startFileHost, type RunningFileHost } from "../devFileHost";

const appDir = path.dirname(fileURLToPath(new URL("../vite.config.ts", import.meta.url)));
const scriptsDir = path.resolve(appDir, "../../scripts");

/**
 * What Stable's own process computes for `home` — read out of
 * `scripts/systemsketch_files.py` by running it, never restated as a literal
 * here. That makes Python the ORACLE for this file's lock-root expectations:
 * the TypeScript side cannot drift from the dock without this going red.
 */
function stableLockRoot(home: string): string {
  return execFileSync(
    "python3",
    [
      "-c",
      "import sys; sys.path.insert(0, sys.argv[1]); from pathlib import Path; from systemsketch_files import default_lock_root; print(default_lock_root(Path(sys.argv[2])))",
      scriptsDir,
      home,
    ],
    { encoding: "utf8" },
  ).trim();
}

const SHARED_LOCKS = stableLockRoot(homedir());

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

  // ADDED 2026-09-29 (Codex audit rounds 2-3), NEW CASES ONLY: Stable runs the
  // same host from its release snapshot and an `sps dev` lane runs this file
  // from its own worktree, so an override must mean ONE path everywhere: empty
  // is unset, relative is refused. Python's `roots_from_environment` (what
  // Stable runs) is the oracle, run here rather than restated.
  function stableRoots(environment: Record<string, string>): { filesRoot: string; lockRoot: string } | { refused: string } {
    try {
      const [filesRoot, lockRoot] = JSON.parse(
        execFileSync(
          "python3",
          [
            "-c",
            "import json, sys; sys.path.insert(0, sys.argv[1]); from pathlib import Path; from systemsketch_files import roots_from_environment; " +
              "print(json.dumps([str(p) for p in roots_from_environment(json.loads(sys.argv[2]), Path('/unused'), None, Path(sys.argv[3]))]))",
            scriptsDir,
            JSON.stringify(environment),
            homedir(),
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      ) as [string, string];
      return { filesRoot, lockRoot };
    } catch (cause) {
      const stderr = String((cause as { stderr?: unknown }).stderr ?? "");
      return { refused: stderr.trim().split("\n").pop() ?? "" };
    }
  }

  it("treats an empty lock root as unset — the shared folder, never the cwd — exactly as Stable does", () => {
    const environment = { HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "/tmp/elsewhere", SYSTEMSKETCH_LOCK_ROOT: "" };
    const roots = resolveDevFileHostRoots(environment as NodeJS.ProcessEnv);
    expect(roots).toEqual({ filesRoot: "/tmp/elsewhere", lockRoot: SHARED_LOCKS });
    expect(roots).toEqual(stableRoots(environment));
  });

  it("refuses a relative files or lock root, naming it — and so does Stable", () => {
    for (const [environment, named] of [
      [{ HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "boards" }, 'SYSTEMSKETCH_FILES_ROOT="boards"'],
      [{ HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "/tmp/elsewhere", SYSTEMSKETCH_LOCK_ROOT: "locks" }, 'SYSTEMSKETCH_LOCK_ROOT="locks"'],
    ] as const) {
      expect(() => resolveDevFileHostRoots(environment as NodeJS.ProcessEnv)).toThrow(RootOverrideError);
      expect(() => resolveDevFileHostRoots(environment as NodeJS.ProcessEnv)).toThrow(named);
      const stable = stableRoots(environment);
      expect("refused" in stable && stable.refused).toContain(named);
    }
  });

  it("refuses a relative lock root even when the files root is unset or empty (Codex round 4)", () => {
    const cases: Record<string, string>[] = [
      { HOME: homedir(), SYSTEMSKETCH_LOCK_ROOT: "./locks" },
      { HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "", SYSTEMSKETCH_LOCK_ROOT: "locks" },
    ];
    for (const environment of cases) {
      expect(() => resolveDevFileHostRoots(environment as NodeJS.ProcessEnv)).toThrow(RootOverrideError);
      const stable = stableRoots(environment);
      expect("refused" in stable && stable.refused).toContain("SYSTEMSKETCH_LOCK_ROOT=");
    }
  });

  it("passes an absolute override to the Python host UNCHANGED — no lexical `..`, no trimming (Codex round 4)", () => {
    const environment = { HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "/a/link/../boards/", SYSTEMSKETCH_LOCK_ROOT: "/a/link/../locks" };
    expect(resolveDevFileHostRoots(environment as NodeJS.ProcessEnv)).toEqual({ filesRoot: "/a/link/../boards/", lockRoot: "/a/link/../locks" });
  });

  it("keeps absolute overrides as they are — the host sees the same Path Stable builds", () => {
    // Round 4: this side hands the strings to the Python host unchanged (`--files-root`/`--lock-root`
    // → argparse `Path`); Stable builds `Path(value)` from its environment. Same input, same Path.
    const environment = { HOME: homedir(), SYSTEMSKETCH_FILES_ROOT: "/tmp/elsewhere/", SYSTEMSKETCH_LOCK_ROOT: "/tmp/locks" };
    const roots = resolveDevFileHostRoots(environment as NodeJS.ProcessEnv);
    expect(roots).toEqual({ filesRoot: "/tmp/elsewhere/", lockRoot: "/tmp/locks" });
    const asHostSeesThem = JSON.parse(
      execFileSync("python3", ["-c", "import json, sys; from pathlib import Path; print(json.dumps([str(Path(v)) for v in sys.argv[1:]]))", roots!.filesRoot, roots!.lockRoot], { encoding: "utf8" }),
    ) as [string, string];
    expect({ filesRoot: asHostSeesThem[0], lockRoot: asHostSeesThem[1] }).toEqual(stableRoots(environment));
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

// ---------------------------------------------------------------------------
// NEW CASES — judge-fix lane `host-and-locks`, 2026-09-19.
// Nothing above is weakened; these only add.
// ---------------------------------------------------------------------------

/** One request with EXACTLY these headers. `fetch` will not let a caller set
 *  `Origin`, and `Origin` is the whole point of the cases below. */
function rawRequest(
  origin: string,
  route: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    void import("node:http").then(({ request: httpRequest }) => {
      const url = new URL(route, origin);
      const sent = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: options.method ?? "GET", headers: options.headers ?? {} },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => (body += chunk));
          response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
        },
      );
      sent.on("error", reject);
      if (options.body !== undefined) sent.write(options.body);
      sent.end();
    }, reject);
  });
}

describe("resolveSharedLockRoot — dev and Stable must name the SAME lock folder", () => {
  // WHY this matters more than it reads (judge finding P1-2, reproduced):
  // `document_locks` opens one lock file per board UNDER ITS ROOT. Two roots
  // are two files, so a save from `vite dev` and a save from the dock both
  // took a lock, both read digest D, both replaced, both verified — and the
  // later one silently destroyed the earlier. The digest fence cannot see it:
  // each writer's read-then-replace looked consistent to itself.

  it("prefers the archived app's folder when it exists, exactly as Stable does", () => {
    const home = mkdtempSync(path.join(tmpdir(), "ss-home-shared-"));
    try {
      const archived = path.join(home, ".local/share/systemsketch/runtime/locks/workspace");
      mkdirSync(archived, { recursive: true });
      expect(resolveSharedLockRoot(home)).toBe(archived);
      expect(resolveSharedLockRoot(home)).toBe(stableLockRoot(home));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back to this app's own state folder when it does not, exactly as Stable does", () => {
    const home = mkdtempSync(path.join(tmpdir(), "ss-home-fresh-"));
    try {
      const fallback = path.join(home, ".local/state/systemsketch-next/locks/workspace");
      expect(resolveSharedLockRoot(home)).toBe(fallback);
      expect(resolveSharedLockRoot(home)).toBe(stableLockRoot(home));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("gives `vite dev` the very root the dock's Stable server takes for the real HOME", () => {
    const roots = resolveDevFileHostRoots({ HOME: homedir() } as NodeJS.ProcessEnv);
    expect(roots?.lockRoot).toBe(stableLockRoot(homedir()));
  });

  it("is what the spawned host is actually told to use", async () => {
    // A resolution nobody passes to the child is a resolution that locks
    // nothing: prove the value reaches `--lock-root` and the host writes there.
    const roots = tempRoots();
    host = await startFileHost(roots);
    const board = path.join(roots.filesRoot, "SystemSketch", "Locked.tldr");
    const saved = await fetch(`${host.url}/api/workspace/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: board, source: JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] }), baseDigest: null }),
    });
    expect(saved.status).toBe(200);
    expect(readdirSync(roots.lockRoot).filter((name) => name.endsWith(".lock"))).toHaveLength(1);
  });
});

describe("one resolver: an absolute root through a symlink and `..` means ONE folder on both channels (Codex round 4)", () => {
  /** The host exactly as Stable runs it: `--files-root <home> --files-root-from-env`, overrides in its environment. */
  function startStableHost(environment: Record<string, string>): Promise<{ url: string; stop: () => void }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "python3",
        [path.join(scriptsDir, "systemsketch_files.py"), "serve", "--files-root", environment.HOME, "--files-root-from-env", "--host", "127.0.0.1", "--port", "0"],
        { env: { ...process.env, ...environment }, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const line = stdout.split("\n").find((candidate) => candidate.startsWith("SYSTEMSKETCH_FILES_LISTENING"));
        if (line) resolve({ url: line.split(" ")[1].trim(), stop: () => child.kill("SIGTERM") });
      });
      child.on("exit", (code) => reject(new Error(`Stable-like host exited ${code}: ${stderr}`)));
    });
  }

  /** Every file named `name` under `root`, walked with lstat so no symlink is followed twice. */
  function find(root: string, test: (name: string) => boolean, found: string[] = []): string[] {
    for (const name of readdirSync(root)) {
      const full = path.join(root, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) find(full, test, found);
      else if (stat.isFile() && test(name)) found.push(full);
    }
    return found;
  }

  it("saves from Preview's host and Stable's host land in one board folder and lock in one lock folder", async () => {
    const base = realpathSync(mkdtempSync(path.join(tmpdir(), "ss-dotdot-")));
    mkdirSync(path.join(base, "real", "sub"), { recursive: true });
    symlinkSync(path.join(base, "real", "sub"), path.join(base, "link"));
    // Both spellings' folders exist, so neither channel can fail merely for a missing folder.
    for (const directory of ["real/boards/SystemSketch", "boards/SystemSketch", "home"]) mkdirSync(path.join(base, directory), { recursive: true });
    const environment = {
      HOME: path.join(base, "home"),
      SYSTEMSKETCH_FILES_ROOT: `${base}/link/../boards`,
      SYSTEMSKETCH_LOCK_ROOT: `${base}/link/../locks`,
    };
    const roots = resolveDevFileHostRoots(environment as NodeJS.ProcessEnv);
    expect(roots).not.toBeNull();
    const preview = await startFileHost(roots as { filesRoot: string; lockRoot: string });
    const stable = await startStableHost(environment);
    try {
      for (const [name, url] of [["Preview", preview.url], ["Stable", stable.url]] as const) {
        const health = (await (await fetch(`${url}/api/health`)).json()) as { filesRoot: string };
        const saved = await fetch(`${url}/api/workspace/file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `${health.filesRoot}/SystemSketch/${name}.tldr`,
            source: JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] }),
            baseDigest: null,
          }),
        });
        expect(saved.status, name).toBe(200);
      }
      const boardFolders = new Set(find(base, (name) => name.endsWith(".tldr")).map((file) => path.dirname(file)));
      const lockFolders = new Set(find(base, (name) => name.endsWith(".lock")).map((file) => path.dirname(file)));
      // the kernel's answer: link → real/sub, then `..` → real
      expect([...boardFolders]).toEqual([path.join(base, "real", "boards", "SystemSketch")]);
      expect([...lockFolders]).toEqual([path.join(base, "real", "locks")]);
    } finally {
      await preview.stop();
      stable.stop();
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("a relative root override stops the file host loudly (Codex round 3)", () => {
  it("answers every file request 503 naming the variable, and never spawns a host", async () => {
    const saved = { files: process.env.SYSTEMSKETCH_FILES_ROOT, locks: process.env.SYSTEMSKETCH_LOCK_ROOT };
    process.env.SYSTEMSKETCH_FILES_ROOT = "/tmp/relative-test-boards";
    process.env.SYSTEMSKETCH_LOCK_ROOT = "locks";
    const { createServer } = await import("vite");
    const server = await createServer({
      configFile: false,
      root: appDir,
      logLevel: "silent",
      server: { port: 0, strictPort: false, host: "127.0.0.1" },
      plugins: [devFileHostPlugin()],
    });
    try {
      await server.listen();
      const origin = (server.resolvedUrls?.local[0] ?? "").replace(/\/$/, "");
      for (const route of ["/api/workspace/list", "/api/recordings/last"]) {
        const answer = await fetch(`${origin}${route}`);
        expect(answer.status).toBe(503);
        expect(((await answer.json()) as { error: string }).error).toContain('SYSTEMSKETCH_LOCK_ROOT="locks" is relative');
      }
    } finally {
      await server.close();
      for (const [name, value] of [["SYSTEMSKETCH_FILES_ROOT", saved.files], ["SYSTEMSKETCH_LOCK_ROOT", saved.locks]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe("the plugin's proxy is not a hole in the file host's CSRF fence", () => {
  // WHY the proxy needs its own check (judge finding P1-1's blast radius):
  // vite's dev server answers cross-origin requests, and this proxy forwards
  // whatever reaches it. Without the check, any page on any other localhost
  // port could reach the file host THROUGH :4340 — the exact
  // `text/plain` + `force: true` simple request the Python side now refuses.

  async function withDevServer(run: (origin: string, roots: { filesRoot: string; lockRoot: string }) => Promise<void>) {
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
      await run(origin as string, roots);
    } finally {
      await server.close();
    }
  }

  const source = (marker: string) => JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [{ id: `shape:${marker}`, typeName: "shape", type: "ss-block" }] });

  it("saves a board for the app's own page and refuses the same write from another port", async () => {
    await withDevServer(async (origin, roots) => {
      const board = path.join(roots.filesRoot, "SystemSketch", "Proxied.tldr");
      const self = new URL(origin).host;

      // The app's own page: same-origin, JSON. This is the regression guard —
      // the fence must not cost `pnpm --filter systemsketch dev` its Save.
      const mine = await rawRequest(origin, "/api/workspace/file", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `http://${self}` },
        body: JSON.stringify({ path: board, source: source("mine"), baseDigest: null }),
      });
      expect(mine.status).toBe(200);
      expect(readFileSync(board, "utf8")).toContain("shape:mine");

      // A page on another localhost port, as a CORS simple request.
      const theirs = await rawRequest(origin, "/api/workspace/file", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: "http://localhost:31337" },
        body: JSON.stringify({ path: board, source: source("theirs"), baseDigest: null, force: true }),
      });
      expect(theirs.status).toBe(403);
      expect(readFileSync(board, "utf8")).toContain("shape:mine");

      // …and with JSON, which a preflight would have had to allow first.
      const alsoTheirs = await rawRequest(origin, "/api/workspace/file", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
        body: JSON.stringify({ path: board, source: source("theirs"), baseDigest: null, force: true }),
      });
      expect(alsoTheirs.status).toBe(403);
      expect(readFileSync(board, "utf8")).toContain("shape:mine");
    });
  });
});
