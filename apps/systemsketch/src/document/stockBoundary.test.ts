// src/document/stockBoundary.test.ts — "tldraw stays stock", asserted from
// day 0 (docs/SYSTEMSKETCH-REBUILD-PLAN.md §2). The archive's
// /home/bam/systemsketch/tests/test_stock_boundary.py did this in Python by
// reading src/App.tsx; this is the same idea in the app's own test runner.
// Committed with the plan, off-limits to builders.
//
// Three walls:
//   1. the pin — tldraw is "5.3.2" exactly, in this app and in the trunk;
//   2. the seams — every capability enters <Tldraw> through the props it
//      documents (shapeUtils / bindingUtils / tools / components /
//      overrides / onMount), and the app never reaches past the public
//      `tldraw` entry point;
//   3. the vocabulary — the registry publishes exactly the shape/binding
//      types docs/SYSTEMSKETCH-REBUILD-PLAN.md §3 names, and the engine-free
//      trunk kits stay engine-free (the trunk's own engineFree.test.ts is
//      the primary guard; this re-checks from the consumer's side so a
//      consumer cannot be green while its supplier is red).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(SRC, "..");
const TRUNK = join(APP_DIR, "..", "storybook-basics", "src");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?:^|\n)\s*\/\/.*(?=\n|$)/g, "");
}

function sourceFilesUnder(dir: string, skip: (name: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const full = join(at, name);
      if (statSync(full).isDirectory()) {
        if (name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || skip(name)) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

describe("stock boundary — the pin", () => {
  it("apps/systemsketch pins tldraw to exactly 5.3.2, no range", () => {
    const pkg = JSON.parse(read(join(APP_DIR, "package.json"))) as { name: string; dependencies?: Record<string, string> };
    expect(pkg.name).toBe("systemsketch");
    expect(pkg.dependencies?.tldraw).toBe("5.3.2");
  });

  it("the trunk it imports pins the same tldraw (two React trees, one engine)", () => {
    const trunkPkg = JSON.parse(read(join(APP_DIR, "..", "storybook-basics", "package.json"))) as { dependencies?: Record<string, string> };
    expect(trunkPkg.dependencies?.tldraw).toBe("5.3.2");
  });
});

describe("stock boundary — the seams in App.tsx", () => {
  const app = () => withoutComments(read(join(SRC, "App.tsx")));

  it("mounts stock <Tldraw> with the documented seams and nothing bolted beside the engine", () => {
    const source = app();
    expect(source).toContain("<Tldraw");
    for (const seam of ["shapeUtils={SHAPE_UTILS}", "bindingUtils={BINDING_UTILS}", "tools={TOOLS}", "components={COMPONENTS}", "overrides={OVERRIDES}", "onMount={"]) {
      expect(source, seam).toContain(seam);
    }
    // Persistence is tldraw's own; a test can switch it off (harness contract).
    expect(source).toMatch(/persistenceKey=\{/);
    // The registry is the ONE place shape/binding/tool lists come from.
    expect(source).toMatch(/from ["']\.\/shapes\/registry["']/);
    // Nothing here reimplements what tldraw already owns.
    for (const forbidden of ["setPointerCapture", "class .* extends ShapeUtil", "requestAnimationFrame", "zIndex"]) {
      expect(source, `App.tsx must not contain ${forbidden}`).not.toMatch(new RegExp(forbidden));
    }
  });

  it("the toolbar is the trunk's ToolDock through components.Toolbar — one system family slot", () => {
    const source = app();
    expect(source).toMatch(/Toolbar:\s*\w+/);
    const dock = withoutComments(read(join(SRC, "chrome", "Toolbar", "dock.tsx")));
    expect(dock).toMatch(/from ["']@trunk\/editor\/toolDock["']/);
    expect(dock).toContain('id: "system"');
    // Exactly one system-family declaration: the archive's second "bbox"
    // family is what Zach asked to remove (Pasted image 20260918201649.png).
    expect(dock.match(/id: "system"/g)).toHaveLength(1);
    expect(dock).not.toMatch(/id: "bbox"/);
  });

  it("only the app and the trunk's hosts/detach import an engine; every other kit stays engine-free", () => {
    const enginePattern = /from\s+["'](?:tldraw|@tldraw\/[^"']+|@xyflow\/[^"']+)["']/g;
    // The app never imports @xyflow — "never the other engine" (CLAUDE.md).
    const appOffenders: string[] = [];
    for (const file of sourceFilesUnder(SRC)) {
      const matches = withoutComments(read(file)).match(enginePattern) ?? [];
      for (const m of matches) if (/@xyflow/.test(m)) appOffenders.push(`${relative(SRC, file)}: ${m}`);
      // The app reaches tldraw only through its public entry: "tldraw" or "@tldraw/tlschema" (type augmentation).
      for (const m of matches) if (/@tldraw\/(?!tlschema)/.test(m)) appOffenders.push(`${relative(SRC, file)}: ${m}`);
    }
    expect(appOffenders).toEqual([]);

    const trunkOffenders: string[] = [];
    // WHY "layout" is gone from this list: the kit refactor (c6f481b) applied the
    // placement rule "does it render?" and layout/fitToContent.ts, being pure, moved
    // into scene/ — so the directory no longer exists and the existsSync below was
    // asserting the shape of a tree that had been superseded. The walled set is
    // unchanged in substance: fitToContent is still scanned, now under scene/.
    // hosts/ and skin/ stay OUT deliberately — hosts adapt an engine by definition,
    // and skin is presentation applied on top.
    // presets/ left the trunk on 2026-09-22 — each preset now lives with its component
    for (const dir of ["components", "scene", "editor"]) {
      expect(existsSync(join(TRUNK, dir)), `trunk ${dir}`).toBe(true);
      for (const file of sourceFilesUnder(join(TRUNK, dir), (name) => /\.test\.tsx?$/.test(name))) {
        const matches = withoutComments(read(file)).match(enginePattern);
        if (matches) trunkOffenders.push(`${relative(TRUNK, file)}: ${matches.join(",")}`);
      }
    }
    expect(trunkOffenders).toEqual([]);
  });

  it("the app imports the trunk ONLY through the @trunk alias — never a relative path into storybook-basics", () => {
    const offenders: string[] = [];
    for (const file of sourceFilesUnder(SRC)) {
      const source = withoutComments(read(file));
      if (/from\s+["'][^"']*storybook-basics[^"']*["']/.test(source)) offenders.push(relative(SRC, file));
    }
    expect(offenders).toEqual([]);
    const vite = read(join(APP_DIR, "vite.config.ts"));
    expect(vite).toMatch(/@trunk/);
    expect(vite).toMatch(/storybook-basics\/src/);
    const tsconfig = read(join(APP_DIR, "tsconfig.json"));
    expect(tsconfig).toMatch(/"@trunk\/\*"/);
    expect(vite).toMatch(/4340/);
    expect(vite).toMatch(/strictPort/);
  });
});

describe("stock boundary — the vocabulary", () => {
  it("shapes/types.ts spells every persisted type exactly as the plan's document-model contract", async () => {
    const types = (await import("../shapes/types")) as Record<string, unknown>;
    expect(types.BLOCK_SHAPE_TYPE).toBe("ss-block");
    expect(types.CODE_SHAPE_TYPE).toBe("ss-code");
    expect(types.PORT_SHAPE_TYPE).toBe("ss-port");
    expect(types.WIRE_SHAPE_TYPE).toBe("ss-wire");
    expect(types.REGION_SHAPE_TYPE).toBe("ss-region");
    expect(types.WIRE_BINDING_TYPE).toBe("ss-wire-binding");
    expect(types.NODE_SHAPE_TYPES).toEqual(["ss-block", "ss-code", "ss-port", "ss-region"]);
    expect(types.FLOATING_PORT_ID).toBe("port");
  });

  it("every kind directory exists with an index.ts exporting its kit (placeholders count — a missing directory is a broken registry)", () => {
    for (const kind of ["block", "code", "port", "wire", "region"]) {
      const index = join(SRC, "shapes", kind, "index.ts");
      expect(existsSync(index), index).toBe(true);
      expect(read(index)).toMatch(new RegExp(`export const ${kind}Kit`));
    }
    const registry = withoutComments(read(join(SRC, "shapes", "registry.ts")));
    for (const kind of ["blockKit", "codeKit", "portKit", "wireKit", "regionKit"]) expect(registry).toContain(kind);
    for (const exported of ["SHAPE_UTILS", "BINDING_UTILS", "TOOLS", "SYSTEM_FAMILY_ITEMS", "withToolUi"]) expect(registry).toContain(exported);
  });
});
