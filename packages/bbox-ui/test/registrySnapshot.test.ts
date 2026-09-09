import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The checked-in registry payloads (`public/r/*.json`) are how this library
 * is CONSUMED — `npx shadcn add <url>/r/<name>.json` copies their `content`
 * fields into the consumer's project. Each payload is a byte-for-byte
 * snapshot of the source files named in `registry.json`, taken by
 * `pnpm registry:build` (wired into `pnpm build`).
 *
 * WHY this test exists: round 3 changed `portLabelPlacement`'s public
 * signature and the snapshots kept shipping the pre-change adapters — code
 * that no longer typechecked against current core. A snapshot that can
 * drift silently will drift again, so staleness fails the suite: when this
 * test goes red, run `pnpm registry:build` and commit `public/r`.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

interface RegistryFileRef {
  path: string;
  type: string;
  target?: string;
}

interface RegistryItem {
  name: string;
  files: RegistryFileRef[];
}

const registry = JSON.parse(
  readFileSync(path.join(repoRoot, "registry.json"), "utf8"),
) as { items: RegistryItem[] };

describe("registry payloads (public/r) vs the sources they snapshot", () => {
  it("registry.json declares at least the known items", () => {
    const names = registry.items.map((item) => item.name);
    for (const required of [
      "bbox-layout",
      "port",
      "block",
      "block-node-reactflow",
      "block-shape-tldraw",
    ]) {
      expect(names).toContain(required);
    }
  });

  for (const item of registry.items) {
    it(`${item.name}: every payload file matches its source verbatim`, () => {
      const payloadPath = path.join(repoRoot, "public", "r", `${item.name}.json`);
      const payload = JSON.parse(readFileSync(payloadPath, "utf8")) as {
        files: Array<RegistryFileRef & { content?: string }>;
      };
      for (const fileRef of item.files) {
        const entry = payload.files.find((f) => f.path === fileRef.path);
        expect(
          entry,
          `${payloadPath} is missing an entry for ${fileRef.path} — run \`pnpm registry:build\``,
        ).toBeDefined();
        const source = readFileSync(path.join(repoRoot, fileRef.path), "utf8");
        expect(
          entry!.content === source,
          `${payloadPath} is stale for ${fileRef.path} — run \`pnpm registry:build\` and commit public/r`,
        ).toBe(true);
      }
    });
  }
});
