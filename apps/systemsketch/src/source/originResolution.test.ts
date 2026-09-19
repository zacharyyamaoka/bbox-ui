// src/source/originResolution.test.ts — lane scv:scv-origin-on-app-shape's
// OWN acceptance, written and committed BEFORE a line of the implementation
// existed (the brief carried no committed tests; this file and
// ./codeCellActions.test.ts and ./source.smoke.test.tsx are the bar). It may
// not be weakened afterwards.
//
// Two halves:
//   1. the schema — `ss-code`'s `origin` prop validates null, validates a
//      populated origin, and REFUSES an extra key inside it. The exact-keys
//      discipline is `@trunk/scene/codeOrigin.ts`'s (`isCodeOrigin`), and
//      this asserts the tldraw validator agrees with it, because the
//      validator is what actually guards a saved board.
//   2. the host glue — what `resolveCodeOrigin` answers, per row of
//      `codeOriginState`'s table, driven through the real judge so the two
//      cannot drift.
import { describe, expect, it } from "vitest";

import { codeOriginState, type CodeOrigin } from "@trunk/scene/codeOrigin";
import type { DefinitionsView, SourceDefinition } from "@trunk/scene/definitionsToScene";

import { CodeShapeUtil } from "../shapes/code/CodeShapeUtil";
import { resolveCodeOrigin, sha256Of, sourcePathFor } from "./originResolution";

const HASH_OF_RUN = "sha256:" + "a".repeat(64);

function origin(over: Partial<CodeOrigin> = {}): CodeOrigin {
  return { uri: "stereo.py", anchor: "Pipeline.run", contentHash: HASH_OF_RUN, ...over };
}

/** The one field of a `SourceDefinition` this lane reads (`text`) plus the
 *  key it matches on (`anchor`); the rest is filled to satisfy the type. */
function definition(anchor: string, text: string): SourceDefinition {
  return {
    anchor,
    name: anchor,
    kind: "function",
    parent: "<module>",
    ordinal: 0,
    span: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 0, columnEncoding: "utf8-bytes" },
    signature: `def ${anchor}()`,
    parameters: [],
    outputs: [],
    contentHash: "sha256:" + "0".repeat(64),
    text,
  };
}

function view(definitions: SourceDefinition[]): DefinitionsView {
  return {
    schemaVersion: 1,
    kind: "definitions",
    source: { name: "stereo.py", lineCount: 2, sha256: "0".repeat(64) },
    definitions,
    references: [],
    diagnostics: [],
  };
}

const PYBLOCKS = { kind: "pyblocks" } as const;

describe("ss-code's origin prop — the schema the saved board is guarded by", () => {
  const validator = CodeShapeUtil.props.origin;

  it("getDefaultProps().origin is null and validates", () => {
    const util = new CodeShapeUtil({} as never);
    expect(util.getDefaultProps().origin).toBeNull();
    expect(validator.validate(null)).toBeNull();
  });

  it("a populated origin validates and round-trips verbatim", () => {
    const value = origin();
    expect(validator.validate(value)).toEqual(value);
  });

  it("an extra key INSIDE origin is rejected", () => {
    expect(() => validator.validate({ ...origin(), extra: "no" })).toThrow();
  });

  it("a missing key inside origin is rejected", () => {
    expect(() => validator.validate({ uri: "a.py", anchor: "f" })).toThrow();
  });

  it("no migration is needed: origin shipped in version 0, so the sequence is empty", () => {
    // The lane brief allowed ONE `AddOrigin` migration "only if a version
    // without `origin` already shipped". It did not — the app's first
    // `ss-code` schema (L1) already carried the prop — so the honest answer
    // is no migration at all. Asserted rather than asserted-in-prose: a
    // future hand that adds a sequence entry has to come back here and say
    // why.
    expect(CodeShapeUtil.migrations.sequence).toEqual([]);
  });
});

describe("sha256Of — the hash spelling both ends compare exactly", () => {
  it("renders sha256:<lower-hex64>", async () => {
    const hash = await sha256Of("def run(self):\n    return 1\n");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is stable and content-sensitive", async () => {
    expect(await sha256Of("a")).toBe(await sha256Of("a"));
    expect(await sha256Of("a")).not.toBe(await sha256Of("b"));
  });

  it("agrees with node's own SHA-256 over UTF-8 bytes — an INDEPENDENT oracle, not a frozen constant", async () => {
    // WHY node:crypto and not a hex literal pasted in here: the claim is
    // "this is SHA-256 of the UTF-8 bytes", and a literal only proves this
    // function still does whatever it did the day the literal was copied.
    // `createHash` is a different implementation (OpenSSL) reached through a
    // different API than `crypto.subtle`, so agreement is evidence.
    // Non-ASCII on purpose: "é" is TWO bytes in UTF-8 and ONE UTF-16 code
    // unit, so a hasher that fed code units would disagree here and nowhere
    // in ASCII.
    const { createHash } = await import("node:crypto");
    for (const text of ["", "def run(self):\n    return 1\n", "é café — \u{1f9e9}"]) {
      expect(await sha256Of(text)).toBe("sha256:" + createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });
});

describe("sourcePathFor — a board-relative uri, resolved against the board's directory", () => {
  it("joins a plain relative path", () => {
    expect(sourcePathFor("/work/boards", "stereo.py")).toBe("/work/boards/stereo.py");
    expect(sourcePathFor("/work/boards/", "src/stereo.py")).toBe("/work/boards/src/stereo.py");
  });

  it("refuses an absolute uri, a file:// uri and one that escapes the board's directory", () => {
    expect(sourcePathFor("/work/boards", "/etc/passwd")).toBeNull();
    expect(sourcePathFor("/work/boards", "file:///etc/passwd")).toBeNull();
    expect(sourcePathFor("/work/boards", "../secrets.py")).toBeNull();
    expect(sourcePathFor("/work/boards", "src/../../secrets.py")).toBeNull();
    expect(sourcePathFor("/work/boards", "")).toBeNull();
  });

  it("normalises . and an interior .. that stays inside", () => {
    expect(sourcePathFor("/work/boards", "./stereo.py")).toBe("/work/boards/stereo.py");
    expect(sourcePathFor("/work/boards", "src/../stereo.py")).toBe("/work/boards/stereo.py");
  });
});

describe("resolveCodeOrigin — one row per state of codeOriginState's table", () => {
  it("NO BACKEND → undefined, which the judge reads as orphaned", async () => {
    expect(await resolveCodeOrigin(origin(), { backend: null })).toBeUndefined();
    expect(await resolveCodeOrigin(origin(), { backend: { kind: "none" } })).toBeUndefined();
    expect(codeOriginState(origin(), undefined)).toBe("orphaned");
  });

  it("a pyblocks backend with no definitions route wired → undefined (orphaned), never a guess", async () => {
    expect(await resolveCodeOrigin(origin(), { backend: PYBLOCKS })).toBeUndefined();
  });

  it("file not found → fileFound false → orphaned", async () => {
    const resolution = await resolveCodeOrigin(origin(), { backend: PYBLOCKS, definitionsFor: async () => null });
    expect(resolution).toEqual({ fileFound: false, anchorFound: false });
    expect(codeOriginState(origin(), resolution)).toBe("orphaned");
  });

  it("anchor not in the view → anchorFound false → orphaned", async () => {
    const resolution = await resolveCodeOrigin(origin(), {
      backend: PYBLOCKS,
      definitionsFor: async () => view([definition("Pipeline.__init__", "def __init__(self): ...")]),
    });
    expect(resolution).toEqual({ fileFound: true, anchorFound: false });
    expect(codeOriginState(origin(), resolution)).toBe("orphaned");
  });

  it("anchor found and the span hashes to contentHash → synced", async () => {
    const text = "def run(self):\n    return 1\n";
    const hash = await sha256Of(text);
    const resolution = await resolveCodeOrigin(origin({ contentHash: hash }), {
      backend: PYBLOCKS,
      definitionsFor: async () => view([definition("Pipeline.run", text)]),
    });
    expect(resolution).toEqual({ fileFound: true, anchorFound: true, spanHash: hash });
    expect(codeOriginState(origin({ contentHash: hash }), resolution)).toBe("synced");
  });

  it("anchor found but the span moved under it → drifted", async () => {
    const resolution = await resolveCodeOrigin(origin(), {
      backend: PYBLOCKS,
      definitionsFor: async () => view([definition("Pipeline.run", "def run(self):\n    return 2\n")]),
    });
    expect(resolution?.anchorFound).toBe(true);
    expect(codeOriginState(origin(), resolution)).toBe("drifted");
  });

  it("the uri is resolved against the board's directory before it is asked for", async () => {
    const asked: string[] = [];
    await resolveCodeOrigin(origin(), {
      backend: PYBLOCKS,
      boardDir: "/work/boards",
      definitionsFor: async (path) => {
        asked.push(path);
        return null;
      },
    });
    expect(asked).toEqual(["/work/boards/stereo.py"]);
  });

  it("a uri that escapes the board's directory is REFUSED, not asked for", async () => {
    const asked: string[] = [];
    const resolution = await resolveCodeOrigin(origin({ uri: "../secrets.py" }), {
      backend: PYBLOCKS,
      boardDir: "/work/boards",
      definitionsFor: async (path) => {
        asked.push(path);
        return null;
      },
    });
    expect(asked).toEqual([]);
    expect(resolution).toEqual({ fileFound: false, anchorFound: false });
  });

  it("a lookup that throws resolves to orphaned rather than taking the caller down", async () => {
    const resolution = await resolveCodeOrigin(origin(), {
      backend: PYBLOCKS,
      definitionsFor: async () => {
        throw new Error("backend is down");
      },
    });
    expect(resolution).toEqual({ fileFound: false, anchorFound: false });
    expect(codeOriginState(origin(), resolution)).toBe("orphaned");
  });
});
