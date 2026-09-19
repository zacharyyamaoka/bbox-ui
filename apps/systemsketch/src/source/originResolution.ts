// src/source/originResolution.ts — the HOST half of the origin binding:
// following the pointer. `@trunk/scene/codeOrigin.ts` only JUDGES ("a HOST
// resolves `origin.uri` against the board's directory and hashes the span;
// this file only judges") — this is that host, for `apps/systemsketch`.
//
// One rule decides everything below: WITHOUT A BACKEND A BOUND CELL CANNOT
// BE VERIFIED, and pretending it is synced is the one lie this design
// forbids. So every path that cannot produce evidence answers with the
// absence of evidence — `undefined`, or `fileFound: false` — which
// `codeOriginState` reads as `orphaned`. Nothing here ever invents a
// `spanHash`.
//
// No React below the hook at the bottom, no tldraw, no DOM: the resolution
// is a function of (origin, backend, a lookup) and is unit-tested as one
// (./originResolution.test.ts).
import { useEffect, useState } from "react";

import type { CodeOrigin, CodeOriginResolution } from "@trunk/scene/codeOrigin";
import type { DefinitionsView } from "@trunk/scene/definitionsToScene";
import { PYBLOCKS_BACKEND_KIND, type SourceBackendRef } from "@trunk/editor/sourceActions";

import { useSourceBackend, type AppSourceBackend } from "./backendSwitch";

/**
 * How a host reaches a file's definitions view. `path` is the resolved
 * filesystem path (`sourcePathFor` below), NOT the board-relative `uri`.
 * `null` means "no such file" — a refusal, never a throw.
 *
 * WHY this is a parameter rather than a call on `PyblocksClient`: the
 * `--view-kind definitions` route is lane `scv:scv-definitions-partition`'s,
 * in the pyblocks repo, and it is not on this branch —
 * `@trunk/backend/pyblocksClient.ts` publishes `health`, `scene` and
 * `events` and nothing else. Naming the seam as a function type lets this
 * file be complete and tested today and lets the day that route lands be a
 * one-line wiring change in ./backendSwitch.tsx, with no edit here.
 */
export type DefinitionsLookup = (path: string) => Promise<DefinitionsView | null>;

export interface OriginResolutionContext {
  /** Only `kind` is read — the contract `sourceActions.ts` states. */
  backend: SourceBackendRef | null | undefined;
  /** The directory the board document lives in. `origin.uri` is POSIX and
   *  relative to it (`codeOrigin.ts`'s own rule). Default `"."`. */
  boardDir?: string;
  definitionsFor?: DefinitionsLookup;
}

/** The answer nothing could be learned from: no file, no anchor, no hash.
 *  `codeOriginState` reads it as `orphaned`. */
const NOTHING_FOUND: CodeOriginResolution = Object.freeze({ fileFound: false, anchorFound: false });

/**
 * `sha256:<lower-hex64>` over the UTF-8 bytes of `text`.
 *
 * WHY `crypto.subtle` and not a hand-rolled hash or a dependency: it is in
 * every browser this app runs in and in node ≥ 18, so the unit test and the
 * running app hash with the same implementation. WHY lower-case hex and no
 * normalisation of `text`: `codeOriginState` compares the two strings
 * EXACTLY ("a differently-spelled hash is a different producer, which is
 * news"), and the span the definitions view reports is emitted with "no
 * strip, no newline canonicalisation" — so the hasher consumes the identical
 * slice or the comparison is meaningless.
 */
export async function sha256Of(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

/**
 * `origin.uri` resolved against the board's directory, or `null` when the
 * uri is not one this design allows.
 *
 * WHY a refusal rather than a best effort: `codeOrigin.ts` states the shape
 * of a legal uri — "Never `file://`, never absolute, never `..`-escaping" —
 * and pyblocks' own viewer backend refuses the same shapes from the other
 * side (`viewer_backend.py:273-300`). A host that quietly resolved
 * `../secrets.py` would be the one end of the pair that does not refuse, and
 * the tempting alternative (clamp it to the board directory and read
 * whatever lands) turns a malformed binding into a silently different file.
 * Pure string work — `node:path` is not available in the browser and the
 * rule is POSIX by definition.
 */
export function sourcePathFor(boardDir: string, uri: string): string | null {
  if (uri === "" || uri.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(uri)) return null;
  const parts: string[] = [];
  for (const segment of uri.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // An interior `..` that stays inside is fine (`src/../stereo.py`); one
      // that would pop above the board's directory is the escape the rule
      // forbids, and it is refused at the moment it would pop, not after.
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  if (parts.length === 0) return null;
  return `${boardDir.replace(/\/+$/, "")}/${parts.join("/")}`;
}

/**
 * Follow the pointer, right now.
 *
 * Returns `undefined` when there was nothing to follow it WITH — no backend,
 * or a backend with no definitions route wired. That is not the same as
 * "followed it and found nothing" (`NOTHING_FOUND`), even though
 * `codeOriginState` renders both as `orphaned`: the caller uses the
 * difference to tell "unverifiable" from "checked and missing" in a log, and
 * collapsing them here would throw that away for no gain.
 */
export async function resolveCodeOrigin(
  // Only the two fields that decide WHERE to look. `contentHash` is
  // deliberately not read here: comparing it is `codeOriginState`'s job, and
  // a resolver that knew the expected answer is a resolver that could be
  // tempted to agree with it.
  origin: Pick<CodeOrigin, "uri" | "anchor">,
  context: OriginResolutionContext,
): Promise<CodeOriginResolution | undefined> {
  // THE ONE GATE, same string `sourceActions.ts` gates its menu rows on.
  if (context.backend?.kind !== PYBLOCKS_BACKEND_KIND) return undefined;
  const lookup = context.definitionsFor;
  if (!lookup) return undefined;

  const path = sourcePathFor(context.boardDir ?? ".", origin.uri);
  if (path === null) return NOTHING_FOUND;

  let view: DefinitionsView | null;
  try {
    view = await lookup(path);
  } catch {
    // A backend that is down is a FACT about the resolution, not an
    // exception for a React render to catch. Orphaned is the honest reading
    // of "I could not check".
    return NOTHING_FOUND;
  }
  if (!view) return NOTHING_FOUND;

  const definition = view.definitions.find((one) => one.anchor === origin.anchor);
  if (!definition) return { fileFound: true, anchorFound: false };

  return { fileFound: true, anchorFound: true, spanHash: await sha256Of(definition.text) };
}

/** `pending` until the host has an answer; `settled` once it does — and a
 *  settled `undefined` is a real answer ("nothing could verify this"), not a
 *  missing one. */
export type OriginResolutionStatus =
  | { status: "pending" }
  | { status: "settled"; resolution: CodeOriginResolution | undefined };

const SETTLED_NOTHING: OriginResolutionStatus = Object.freeze({ status: "settled", resolution: undefined });

/**
 * The badge's data source, for one shape.
 *
 * WHY a status and not just `CodeOriginResolution | undefined`, which is
 * what the lane brief sketched: the brief also says "while a bound cell's
 * resolution is still pending render no badge" AND "with no backend return
 * undefined, which `codeOriginState` reads as orphaned". Those two are the
 * same value under the brief's own spelling, so one of them has to be wrong
 * on screen — either a bound cell with no backend shows nothing (hiding the
 * most important state there is), or an in-flight lookup flashes a red
 * Orphaned badge for one frame and then corrects itself. The status makes
 * them different facts, and the shape face branches on `status`, never on
 * `resolution === undefined`.
 */
export function useCodeOriginResolution(origin: CodeOrigin | null): OriginResolutionStatus {
  const backend: AppSourceBackend = useSourceBackend();
  const [status, setStatus] = useState<OriginResolutionStatus>(() => (origin === null ? SETTLED_NOTHING : { status: "pending" }));

  // The fields the resolution actually depends on, as scalars: `origin` is a
  // fresh object on every tldraw record update, so depending on it directly
  // would re-run this effect on every unrelated prop write.
  const uri = origin?.uri ?? null;
  const anchor = origin?.anchor ?? null;
  const kind = backend.kind;
  const lookup = backend.definitionsFor;
  const boardDir = backend.boardDir;

  useEffect(() => {
    if (uri === null || anchor === null) {
      setStatus(SETTLED_NOTHING);
      return;
    }
    // No backend: the answer is known WITHOUT going anywhere, so it settles
    // synchronously rather than flashing "pending" first.
    if (kind !== PYBLOCKS_BACKEND_KIND || !lookup) {
      setStatus(SETTLED_NOTHING);
      return;
    }
    let alive = true;
    setStatus({ status: "pending" });
    void resolveCodeOrigin({ uri, anchor }, { backend: { kind }, definitionsFor: lookup, boardDir }).then((resolution) => {
      if (alive) setStatus({ status: "settled", resolution });
    });
    return () => {
      alive = false;
    };
    // `contentHash` is deliberately NOT a dependency: the resolution reports
    // what the FILE says, and the comparison against the stored hash is
    // `codeOriginState`'s job at render time. Re-reading the file because
    // the board's copy of the hash changed would be re-asking a question
    // whose answer cannot have moved.
  }, [uri, anchor, kind, lookup, boardDir]);

  return status;
}
