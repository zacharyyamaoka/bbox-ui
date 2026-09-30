// devFileHost.ts — the vite dev server's side of the local file host.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// every function THROWS until lane `dev-file-host` fills it in.
// `src/devFileHost.test.ts` is the acceptance and is off-limits to the builder.
//
// WHY the dev server owns this at all: the app reaches its file host SAME
// ORIGIN — the dock's Stable server proxies `/api/workspace/*` to this same
// script, run as a Stable process (`stable.processes` + `stable.proxy` in
// apps/systemsketch/stable-preview.json). Preview (`sps open --preview`), an
// agent's `sps dev` lane and a bare `pnpm --filter systemsketch dev` all run
// this Vite config, so without this plugin Open/Save would work in the dock
// and fail on :4340 — the two surfaces Zach actually uses, disagreeing. The
// plugin starts the SAME `scripts/systemsketch_files.py` on an ephemeral port
// and proxies the same paths to it.
//
// WHY it refuses to guess a files root under a test runner: a suite that
// spawned this with the default root would be writing into
// /home/bam/SystemSketch. `resolveDevFileHostRoots` returns null when
// `VITEST` is set and no explicit root is given, and the smoke suite starts
// its own temp-root host instead (src/testing/fileHost.globalSetup.ts).
import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
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

/** The archived SystemSketch's own lock directory (its `release_home / "locks"
 *  / "workspace"`) — the one Stable takes when it is there. */
const ARCHIVED_LOCK_ROOT = [".local", "share", "systemsketch", "runtime", "locks", "workspace"] as const;
/** This app's own state folder, used only when the archived one is absent. */
const NEXT_LOCK_ROOT = [".local", "state", "systemsketch-next", "locks", "workspace"] as const;

function isDirectory(candidate: string): boolean {
  return statSync(candidate, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * Where document locks live for `home`, with the SAME precedence
 * `default_lock_root` applies in `scripts/systemsketch_files.py`: the archived
 * app's directory when it exists, else this app's own state folder.
 *
 * WHY this probes the filesystem instead of naming one literal (judge finding
 * P1-2, 2026-09-19, reproduced): `vite dev` and the dock's Stable server are
 * two processes that save to the SAME `~/SystemSketch`, and `document_locks`
 * names its lock file under whatever root it is handed. This side used to hand
 * it `.local/state/systemsketch-next/…` unconditionally while Stable resolved
 * `.local/share/systemsketch/runtime/…` (which exists on this box) — two
 * roots, two lock files, no mutual exclusion. Both processes then read digest
 * D, both replaced, both verified, and the later save silently destroyed the
 * earlier one. The digest fence cannot catch that: each writer's own
 * read-then-replace looks perfectly consistent to itself. The plan's §7 item 3
 * already decided this ("share it when it exists, else the new app's own state
 * folder"); this is that decision, resolved the same way on both sides.
 *
 * The tempting alternative it rejects: agreeing on a fixed literal so neither
 * process has to stat the other's history. That is what was here before, and
 * it is only agreement with ITSELF — Stable's rule is the one that decides
 * which file gets flocked. `src/devFileHost.test.ts` pins this function to
 * Python's `default_lock_root` by running it, so the two cannot drift again.
 */
export function resolveSharedLockRoot(home: string, directoryExists: (candidate: string) => boolean = isDirectory): string {
  const archived = path.join(home, ...ARCHIVED_LOCK_ROOT);
  return directoryExists(archived) ? archived : path.join(home, ...NEXT_LOCK_ROOT);
}

/**
 * The roots for an environment, or `null` when this dev server must not start
 * a host at all.
 *
 *   - `SYSTEMSKETCH_FILES_ROOT` set → that root (and `SYSTEMSKETCH_LOCK_ROOT`,
 *     or `resolveSharedLockRoot(HOME)`);
 *   - otherwise, `VITEST` set → `null`;
 *   - otherwise → `{ filesRoot: HOME, lockRoot: the shared lock root }`, the
 *     same pair the dock's Stable server uses, so a board saved from `vite
 *     dev` and one saved from the dock are the same file, locked the same way.
 */
export function resolveDevFileHostRoots(
  environment: NodeJS.ProcessEnv,
  directoryExists: (candidate: string) => boolean = isDirectory,
): DevFileHostRoots | null {
  const home = environment.HOME ?? "";
  const sharedLockRoot = resolveSharedLockRoot(home, directoryExists);
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
      [SCRIPT_PATH, "serve", "--files-root", roots.filesRoot, "--lock-root", roots.lockRoot, "--host", "127.0.0.1", "--port", "0", "--recordings"],
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
/** The API prefixes this dev server forwards to the Python host, rather than
 *  letting Vite 404 them. Both are served by ONE child on ONE files root. */
const PROXIED_API_PREFIXES = ["/api/workspace", "/api/recordings"] as const;

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
        // WHY `/api/recordings` rides the SAME proxy and the same child:
        // `systemsketch_recordings.RecordingApi` writes its folders under the
        // very files root this host already serves, and its own POST fence
        // (`_refuse_state_change`) is an Origin check — so it has to answer on
        // the page's origin, which in dev is this vite server and nothing
        // else. A second proxy to a second child would be a second files root
        // to keep in agreement, which is the exact class of bug the round-1
        // judge found in the lock roots.
        if (!PROXIED_API_PREFIXES.some((prefix) => request.url?.startsWith(prefix))) {
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
  const refusal = crossOriginRefusal(request);
  if (refusal !== null) {
    response.statusCode = 403;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: refusal }));
    return;
  }

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
    if (value === undefined || !isForwardedRequestHeader(key)) continue;
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

/**
 * Why this request must not reach the file host, or `null` to forward it.
 *
 * WHY the proxy needs its own copy of the fence (judge finding P1-1, 2026-09-19):
 * the Python host refuses a cross-origin write, but it can only judge what it
 * is told, and this proxy forwards whatever arrives on :4340. Vite's dev server
 * answers requests from other origins, so without this check a page on any
 * other localhost port could reach the real `$HOME` file host THROUGH the dev
 * server — the same `text/plain` + `force: true` simple request that destroyed
 * a board, laundered through a same-machine hop. Checking here, and stripping
 * `Origin`/`Referer` below only after passing, is what lets the Python side
 * treat a proxied request as the same-process call it now is.
 *
 * A request with no `Origin` at all is not a browser page (`fetch` and the
 * smoke suite send none, and a browser always sends one on a non-GET), so it
 * is left alone.
 */
function crossOriginRefusal(request: IncomingMessage): string | null {
  const method = (request.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  const origin = headerValue(request, "origin");
  if (!origin) return null;
  const host = headerValue(request, "host");
  if (host && sameOrigin(origin, host)) return null;
  return `refused a cross-origin ${method} to the file host from ${origin}`;
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function sameOrigin(origin: string, host: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Which of the incoming request's headers travel to the file host.
 *
 * WHY each exclusion:
 *   - `host`: hop-by-hop; the upstream URL sets its own, and forwarding the
 *     dev server's would make the file host judge the wrong authority.
 *   - `transfer-encoding`/`content-length`: the body is re-read and handed on
 *     as a `Uint8Array`, so undici frames it itself. Forwarding the client's
 *     framing header makes undici throw and the proxy answer 503 — MEASURED,
 *     not assumed: `transfer-encoding: chunked` fails with "invalid
 *     transfer-encoding header" (which is what any client that streams its
 *     body without declaring a length sends), and a `content-length` that no
 *     longer matches fails with "Request body length does not match
 *     content-length header".
 *   - `connection`: hop-by-hop by definition.
 *   - `origin`/`referer`: stripped ONLY after `crossOriginRefusal` has already
 *     accepted this request as same-origin to the dev server. The host then
 *     sees a request with no Origin — which is exactly what it is by the time
 *     it leaves this process: a server-side call, not a page's.
 */
function isForwardedRequestHeader(name: string): boolean {
  return !["host", "connection", "content-length", "transfer-encoding", "origin", "referer"].includes(name.toLowerCase());
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
