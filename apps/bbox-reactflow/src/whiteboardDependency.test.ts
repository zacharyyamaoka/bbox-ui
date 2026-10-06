// src/whiteboardDependency.test.ts — the one guard B-DEPS owes the React Flow
// host: the canvas library is the PINNED build, installed so it shares this
// app's React. See README.md for how the link is made.
//
// WHY a test and not trust in `pnpm install`: the dependency is an
// OPTIONAL `file:` dependency (so Cloudflare's `pnpm install --frozen-lockfile`
// on a machine without the whiteboard worktree still passes), and pnpm skips
// a missing optional dependency without an error. This file turns that silent
// skip into a red `pnpm -r test`.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRequire = createRequire(path.join(APP_DIR, "package.json"));
const manifest = JSON.parse(readFileSync(path.join(APP_DIR, "package.json"), "utf8")) as {
  bboxUi: { whiteboardPin: { commit: string; worktree: string } };
};
const PIN = manifest.bboxUi.whiteboardPin;

describe("simple-reactflow-whiteboard, the pinned open-as-library build", () => {
  it("is installed and resolves by package name to its built dist/", () => {
    const entry = appRequire.resolve("simple-reactflow-whiteboard");
    expect(entry.split(path.sep).join("/")).toMatch(/\/dist\/index\.js$/);
  });

  it("the linked worktree is checked out at the pinned commit", () => {
    // `./simple-reactflow-whiteboard` is the symlink the `file:` specifier
    // names; it must point at the worktree the manifest records.
    expect(realpathSync(path.join(APP_DIR, "simple-reactflow-whiteboard"))).toBe(realpathSync(PIN.worktree));
    const head = execFileSync("git", ["-C", PIN.worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(head).toBe(PIN.commit);
  });

  it("shares ONE react, react-dom and @xyflow/react with this app and the trunk", () => {
    // WHY: its dist/ externalises these as peers (vite.lib.config.ts) because
    // bbox-ui already hit "invalid hook call" from a duplicate React once. A
    // `link:` dependency would resolve them from the whiteboard's OWN
    // node_modules and bring that back; `file:` installs a copy whose peers
    // resolve from here. Two @xyflow/react copies would also split the
    // ReactFlowProvider context between the host and the trunk's node views.
    const whiteboardRequire = createRequire(appRequire.resolve("simple-reactflow-whiteboard"));
    const trunkRequire = createRequire(path.resolve(APP_DIR, "../storybook-basics/src/hosts/index.ts"));
    for (const dep of ["react", "react-dom", "@xyflow/react"]) {
      const fromApp = realpathSync(appRequire.resolve(dep));
      expect(realpathSync(whiteboardRequire.resolve(dep)), `${dep} from the whiteboard`).toBe(fromApp);
      expect(realpathSync(trunkRequire.resolve(dep)), `${dep} from the trunk`).toBe(fromApp);
    }
  });
});
