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
import type { Plugin } from "vite";

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
  void environment;
  throw new Error("resolveDevFileHostRoots: not implemented (lane dev-file-host)");
}

/** Spawn `scripts/systemsketch_files.py serve …` on port 0 and resolve once
 *  it prints its listening banner (reject after ~15s or on early exit). */
export function startFileHost(roots: DevFileHostRoots & { python?: string }): Promise<RunningFileHost> {
  void roots;
  throw new Error("startFileHost: not implemented (lane dev-file-host)");
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
  void roots;
  throw new Error("devFileHostPlugin: not implemented (lane dev-file-host)");
}
