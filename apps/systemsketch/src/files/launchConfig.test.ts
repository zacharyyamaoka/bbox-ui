// src/files/launchConfig.test.ts — `boardLinkFor`, the paste-safe spelling of
// this app's `?board=` launch contract (ported from claude/board-url-2026-09-20
// `869eb22`'s boardParam.test.ts, minus that branch's second boot path).
//
// The claim worth pinning is not the string alone but that it is the SAME
// value as the two in-app renderings: `boardHref` / the trunk's `documentHref`
// build through `URLSearchParams.set`, which escapes every `/` to `%2F`. A
// human is handed the literal form; the app must read both back to one path,
// through the exact reader it boots with (`URLSearchParams.get(BOARD_PARAM)`,
// `persistenceKeyForSearch`).
import { describe, expect, it } from "vitest";

import { documentHref } from "@trunk/files/workspaceModel";

import { BOARD_PARAM, boardLinkFor, persistenceKeyForSearch } from "./launchConfig";

const ORIGIN = "http://127.0.0.1:4340";
const BOARD = "/home/bam/bbox-ui/apps/systemsketch/review/region-drawings-nesting.tldr";

/** What `browserDocumentLocation.initialBoard` does with `window.location.search`. */
const boardOf = (href: string) => new URL(href, ORIGIN).searchParams.get(BOARD_PARAM)?.trim() ?? null;

describe("boardLinkFor — the link a handoff pastes", () => {
  it("leaves the = and every / literal, so the link reads as a path", () => {
    const link = boardLinkFor(BOARD, ORIGIN);
    expect(link).toBe("http://127.0.0.1:4340/?board=/home/bam/bbox-ui/apps/systemsketch/review/region-drawings-nesting.tldr");
    expect(link).not.toContain("%2F");
    expect(link).not.toContain("%3D");
  });

  it("parses to the same path as the in-app %2F rendering — one value space, two spellings", () => {
    const inApp = documentHref(BOARD, `${ORIGIN}/`);
    expect(inApp).toContain("%2F");
    expect(boardOf(boardLinkFor(BOARD, ORIGIN))).toBe(BOARD);
    expect(boardOf(inApp)).toBe(BOARD);
  });

  it("boots the app file-backed, exactly as the in-app rendering does", () => {
    expect(persistenceKeyForSearch(new URL(boardLinkFor(BOARD, ORIGIN)).search)).toBeNull();
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(boardLinkFor(BOARD, `${ORIGIN}/`)).toBe(`${ORIGIN}/?board=${BOARD}`);
  });

  it("escapes only what would end, split or mis-decode the query, and still round-trips", () => {
    const awkward = "/home/bam/a#b/c&d/e+f/100%/board.tldr";
    const link = boardLinkFor(awkward, ORIGIN);
    expect(link).toBe(`${ORIGIN}/?board=/home/bam/a%23b/c%26d/e%2Bf/100%25/board.tldr`);
    expect(boardOf(link)).toBe(awkward);
  });
});
