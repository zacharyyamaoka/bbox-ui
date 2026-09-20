// src/review/boardParam.test.ts — the pure half of `?board=`: which URLs are
// accepted, and when the app mounts without persistence.
import { describe, expect, it } from "vitest";

import { boardUrlFromSearch, bootOptionsFor } from "./boardParam";

const ORIGIN = "http://127.0.0.1:6101";

describe("boardUrlFromSearch", () => {
  it("returns null when there is no board param", () => {
    expect(boardUrlFromSearch("", ORIGIN)).toBeNull();
    expect(boardUrlFromSearch("?other=1", ORIGIN)).toBeNull();
  });

  it("accepts the literal same-origin path", () => {
    expect(boardUrlFromSearch("?board=/__review/board.tldr", ORIGIN)).toEqual({ ok: true, url: `${ORIGIN}/__review/board.tldr` });
  });

  it("accepts the %2F-encoded form, which URLSearchParams decodes", () => {
    expect(boardUrlFromSearch("?board=%2F__review%2Fboard.tldr", ORIGIN)).toEqual({ ok: true, url: `${ORIGIN}/__review/board.tldr` });
  });

  it("accepts a same-origin absolute URL", () => {
    expect(boardUrlFromSearch(`?board=${ORIGIN}/__review/board.tldr`, ORIGIN)).toEqual({ ok: true, url: `${ORIGIN}/__review/board.tldr` });
  });

  it.each([
    ["a cross-origin URL", "?board=https://evil.example/board.tldr"],
    ["a different port on the same host", "?board=http://127.0.0.1:6102/board.tldr"],
    ["a protocol-relative URL", "?board=//evil.example/x"],
    ["a backslash protocol-relative URL", "?board=/%5Cevil.example/x"],
    ["a javascript: URL", "?board=javascript:alert(1)"],
    ["a data: URL", "?board=data:application/json,%7B%7D"],
    ["a bare relative name", "?board=board.tldr"],
    ["an empty value", "?board="],
  ])("rejects %s with a human reason", (_label, search) => {
    const result = boardUrlFromSearch(search, ORIGIN);
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.reason.length).toBeGreaterThan(10);
  });
});

describe("bootOptionsFor", () => {
  it("mounts with persistenceKey null for a valid board", () => {
    expect(bootOptionsFor("?board=/__review/board.tldr", ORIGIN).persistenceKey).toBeNull();
  });

  it("mounts with persistenceKey null for an INVALID board too, so a typo cannot autosave over a real board", () => {
    const boot = bootOptionsFor("?board=https://evil.example/x", ORIGIN);
    expect(boot.persistenceKey).toBeNull();
    expect(boot.board?.ok).toBe(false);
  });

  it("leaves persistenceKey undefined (the app's own default) without a board param", () => {
    const boot = bootOptionsFor("?other=1", ORIGIN);
    expect(boot.persistenceKey).toBeUndefined();
    expect(boot.board).toBeNull();
  });
});
