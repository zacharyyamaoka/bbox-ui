// devFileHost.ts — the vite dev server's side of the local file host.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// every function THROWS until lane `dev-file-host` fills it in.
// `src/devFileHost.test.ts` is the acceptance and is off-limits to the builder.
//
// WHY the dev server owns this at all: the app reaches its file host SAME
// ORIGIN — the dock's Stable server mounts `/api/workspace/*` next to the
// build it serves (scripts/launch_systemsketch.py). `pnpm --filter
// systemsketch dev` has no such server, so without this plugin Open/Save
// would work in the dock and fail on :4340 — the two surfaces Zach actually
// uses, disagreeing. The plugin starts the SAME `scripts/systemsketch_files.py`
// on an ephemeral port and proxies the same paths to it.
//
// WHY it refuses to guess a files root under a test runner: a suite that
// spawned this with the default root would be writing into
// /home/bam/SystemSketch. `resolveDevFileHostRoots` returns null when
// `VITEST` is set and no explicit root is given, and the smoke suite starts
// its own temp-root host instead (src/testing/fileHost.globalSetup.ts).
import { spawn, type ChildProcess } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// The same script the dock's Stable server and the smoke suite's
// `fileHost.globalSetup.ts` both start — see that file for the pattern this
// mirrors (temp-root banner detection, PID teardown).
const SCRIPT_PATH = fileURLToPath(new URL("../../scripts/systemsketch_files.py", import.meta.url));
const LISTENING_BANNER = "SYSTEMSKETCH_FILES_LISTENING";
const START_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;

export interface DevFileHostRoots {
  /** Served as the workspace fence — the navigator's "Home". */
  filesRoot: string;
  /** Where `document_locks` puts its lock files. */
  lockRoot: string;
}

export interface RunningFileHost {
  /** `http://127.0.0.1:<port>` */
  url: string;
  pid: number;
  /** SIGTERM, then resolve once the process is gone. */
  stop(): Promise<void>;
}

/**
 * The roots for an environment, or `null` when this dev server must not start
 * a host at all.
 *
 *   - `SYSTEMSKETCH_FILES_ROOT` set → that root (and `SYSTEMSKETCH_LOCK_ROOT`,
 *     or `<HOME>/.local/state/systemsketch-next/locks/workspace`);
 *   - otherwise, `VITEST` set → `null`;
 *   - otherwise → `{ filesRoot: HOME, lockRoot: the shared lock root }`, the
 *     same pair the dock's Stable server uses, so a board saved from `vite
 *     dev` and one saved from the dock are the same file, locked the same way.
 */
export function resolveDevFileHostRoots(environment: NodeJS.ProcessEnv): DevFileHostRoots | null {
  const home = environment.HOME ?? "";
  // WHY this exact path and not `default_lock_root`'s legacy check: the dock
  // and this dev host are two independent processes that must agree on a lock
  // directory WITHOUT one of them probing the filesystem for the other's
  // history. Python's `default_lock_root` still runs (inside
  // scripts/systemsketch_files.py) for the dock and for a host started here
  // with no `--lock-root` override; this literal is only the value this TS
  // side computes when nothing more specific is given.
  const sharedLockRoot = path.join(home, ".local", "state", "systemsketch-next", "locks", "workspace");
  if (environment.SYSTEMSKETCH_FILES_ROOT) {
    return {
      filesRoot: environment.SYSTEMSKETCH_FILES_ROOT,
      lockRoot: environment.SYSTEMSKETCH_LOCK_ROOT ?? sharedLockRoot,
    };
  }
  // WHY: a suite that spawned this with the default root would be writing
  // into the real ~/SystemSketch — see the module WHY above.
  if (environment.VITEST) return null;
  return { filesRoot: home, lockRoot: sharedLockRoot };
}

/** Spawn `scripts/systemsketch_files.py serve …` on port 0 and resolve once
 *  it prints its listening banner (reject after ~15s or on early exit). */
export function startFileHost(roots: DevFileHostRoots & { python?: string }): Promise<RunningFileHost> {
  const python = roots.python ?? "python3";
  return new Promise<RunningFileHost>((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };

    const child: ChildProcess = spawn(
      python,
      [SCRIPT_PATH, "serve", "--files-root", roots.filesRoot, "--lock-root", roots.lockRoot, "--host", "127.0.0.1", "--port", "0"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const timer = setTimeout(() => {
      settle(() => {
        child.kill("SIGKILL");
        reject(new Error(`${SCRIPT_PATH}: no ${LISTENING_BANNER} line within ${START_TIMEOUT_MS}ms\n${stderr}`));
      });
    }, START_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((candidate) => candidate.startsWith(LISTENING_BANNER));
      if (!line) return;
      const url = line.slice(LISTENING_BANNER.length).trim();
      const pid = child.pid;
      settle(() => {
        if (pid === undefined) {
          reject(new Error(`${SCRIPT_PATH}: printed its banner with no pid`));
          return;
        }
        resolve({ url, pid, stop: () => stopChild(child) });
      });
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      settle(() => reject(new Error(`${SCRIPT_PATH}: exited with code ${code} before it started listening\n${stderr}`)));
    });
    child.on("error", (cause) => {
      settle(() => reject(cause));
    });
  });
}

/** SIGTERM, then SIGKILL after `STOP_TIMEOUT_MS`; resolves once the process
 *  is confirmed gone either way. */
function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const hardKill = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(hardKill);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

/**
 * The plugin `vite.config.ts` mounts. `apply: "serve"`; on `configureServer`
 * it resolves its roots (doing NOTHING when that is `null`), starts the host
 * lazily, proxies every `/api/workspace/*` request to it (method, headers,
 * body and status carried through), and stops the child when the server
 * closes. A request that arrives while the host is down answers 503 with a
 * JSON `{error}` naming the log — never a hang.
 */
export function devFileHostPlugin(roots?: DevFileHostRoots): Plugin {
  return {
    name: "systemsketch:dev-file-host",
    apply: "serve",
    configureServer(server) {
      const resolved = roots ?? resolveDevFileHostRoots(process.env);
      // WHY doing nothing rather than registering a no-op middleware: under
      // a test runner with no explicit root (`resolveDevFileHostRoots`
      // returned null), this dev server must never guess a files root — see
      // the module WHY. `/api/workspace/*` simply falls through to Vite's
      // own 404 in that case, exactly as if this plugin were absent.
      if (!resolved) return;

      // WHY lazy: most `vite dev` sessions never touch Open/Save in a given
      // run, and starting a subprocess only on the first real request keeps
      // `pnpm dev` startup unaffected by this plugin existing.
      let hostPromise: Promise<RunningFileHost> | null = null;
      const ensureHost = () => {
        if (!hostPromise) {
          hostPromise = startFileHost(resolved).catch((cause: unknown) => {
            hostPromise = null; // let the next request retry a fresh spawn
            throw cause;
          });
        }
        return hostPromise;
      };

      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api/workspace")) {
          next();
          return;
        }
        void proxyToFileHost(request, response, ensureHost);
      });

      server.httpServer?.once("close", () => {
        void hostPromise?.then((host) => host.stop());
      });
    },
  };
}

/** Buffer the incoming request, forward it to the running host, and mirror
 *  its status/headers/body back — or answer 503 with `{error}` naming what
 *  the host's own log said, rather than ever hanging the request. */
async function proxyToFileHost(request: IncomingMessage, response: ServerResponse, ensureHost: () => Promise<RunningFileHost>): Promise<void> {
  let host: RunningFileHost;
  try {
    host = await ensureHost();
  } catch (cause) {
    respondHostDown(response, cause);
    return;
  }

  const method = request.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || key.toLowerCase() === "host" || key.toLowerCase() === "connection") continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  // WHY `Uint8Array.from` instead of passing the Buffer straight through:
  // undici's fetch typings accept a `BufferSource`, but the DOM lib's
  // `BodyInit` overload resolution rejects a bare `Buffer` — this is the
  // same bytes, typed as the interface fetch actually declares.
  const body = method === "GET" || method === "HEAD" ? undefined : Uint8Array.from(await readRequestBody(request));

  let upstream: Response;
  try {
    upstream = await fetch(new URL(request.url ?? "/", host.url), { method, headers, body });
  } catch (cause) {
    respondHostDown(response, cause);
    return;
  }

  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    // Node re-encodes the body below; a stale length/encoding header from
    // the upstream response would disagree with what actually goes out.
    if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length" || key.toLowerCase() === "transfer-encoding") return;
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

function respondHostDown(response: ServerResponse, cause: unknown): void {
  response.statusCode = 503;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) }));
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
