// src/testing/fileHost.globalSetup.ts — one REAL file host per smoke run,
// over a TEMP root. Part of the committed acceptance harness
// (docs/CHROME-FILES-SETTINGS-PLAN.md); off-limits to builders.
//
// Runs in node before the smoke project's browser starts (vitest.config.ts
// `globalSetup`). It starts `scripts/systemsketch_files.py serve` exactly as
// the vite dev plugin does, except:
//   - `--files-root` is a fresh `mkdtemp` directory, never the real home —
//     and this file REFUSES to start if the resolved root is, or is inside,
//     the real `~/SystemSketch` (the archive's rule: "Never point a test at
//     Zach's real board — the app autosaves into it");
//   - `--lock-root` is inside that temp directory too;
//   - `--desktop record:<temp>/desktop.jsonl`, so Move to Trash and Show in
//     Files are logged, never performed on this machine;
//   - `--cors-loopback`, because the test page is Vitest's own origin and the
//     host is on an ephemeral port — the one cross-origin deployment there is.
//
// If the host cannot start (e.g. before lane `file-host` lands, when the
// module is a stub), this does NOT throw — every other smoke test must keep
// running. It provides `fileHost.url = ""` and the host's stderr as
// `fileHost.error`, and each file test fails loudly on that.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

export interface FileHostContext {
  /** `http://127.0.0.1:<port>`, or `""` when the host did not start. */
  url: string;
  /** The temp directory served as the files root ("Home" in the navigator). */
  filesRoot: string;
  /** `<filesRoot>/SystemSketch` — the default workspace folder. */
  workspace: string;
  /** Why the host did not start; `""` when it did. */
  error: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    fileHost: FileHostContext;
  }
}

const SCRIPT = fileURLToPath(new URL("../../../../scripts/systemsketch_files.py", import.meta.url));
const BANNER = "SYSTEMSKETCH_FILES_LISTENING";
const START_TIMEOUT_MS = 15_000;

function assertNotTheRealWorkspace(root: string) {
  const real = path.join(homedir(), "SystemSketch");
  const resolved = realpathSync(root);
  if (resolved === real || resolved.startsWith(real + path.sep) || real.startsWith(resolved + path.sep)) {
    throw new Error(`refusing to serve ${resolved}: it is, contains, or sits inside the real ${real}`);
  }
}

export default async function setup(project: TestProject) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "systemsketch-files-")));
  const filesRoot = path.join(base, "home");
  const workspace = path.join(filesRoot, "SystemSketch");
  mkdirSync(workspace, { recursive: true });
  assertNotTheRealWorkspace(filesRoot);

  let child: ChildProcess | null = null;
  let stderr = "";
  const url = await new Promise<string>((resolve) => {
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      stderr += `\n(no ${BANNER} line within ${START_TIMEOUT_MS}ms)`;
      finish("");
    }, START_TIMEOUT_MS);
    try {
      child = spawn(
        "python3",
        [
          SCRIPT,
          "serve",
          "--files-root", filesRoot,
          "--lock-root", path.join(base, "locks"),
          "--host", "127.0.0.1",
          "--port", "0",
          "--cors-loopback",
          "--desktop", `record:${path.join(base, "desktop.jsonl")}`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (cause) {
      stderr = String(cause);
      finish("");
      return;
    }
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((candidate) => candidate.startsWith(BANNER));
      if (line) finish(line.slice(BANNER.length).trim());
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      stderr += `\n(file host exited with code ${code})`;
      finish("");
    });
    child.on("error", (cause) => {
      stderr += `\n${String(cause)}`;
      finish("");
    });
  });

  project.provide("fileHost", { url, filesRoot, workspace, error: url ? "" : stderr.trim() || "the file host did not start" });

  return async () => {
    const running = child as ChildProcess | null;
    if (running && running.exitCode === null) {
      running.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const hard = setTimeout(() => {
          running.kill("SIGKILL");
          resolve();
        }, 5_000);
        running.once("exit", () => {
          clearTimeout(hard);
          resolve();
        });
      });
    }
    rmSync(base, { recursive: true, force: true });
  };
}
