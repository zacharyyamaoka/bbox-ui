/**
 * src/editor/compareSource.ts — where the "before" side of a comparison
 * comes from: the `<stem>.vN.<ext>` sibling convention.
 *
 * Ported from /home/bam/systemsketch/src/compare/compareSource.ts:1-111,
 * with the one structural change this repo's core rule requires (CLAUDE.md,
 * "The core imports no canvas engine"): the donor's module-level
 * `import type { Editor, TLStoreSnapshot } from 'tldraw'` (:25) and its
 * `inspectWorkspaceDocumentSource` import (:27) do not travel, and neither
 * does `loadEntrySnapshot` (:98-111), which exists only to hand a tldraw
 * store snapshot back. Reading a path is an injected `ReadSource` function
 * instead of the donor's hardcoded `fetch('/api/workspace/file?path=…')`
 * (:51-60) — a host owns its transport, and the probe algebra below is the
 * only part of that file that is actually about comparing.
 *
 * What survives verbatim is the part that is a DECISION rather than
 * plumbing, and the donor's own framing of it is kept in the comments
 * below:
 *
 * - **The `after` side is real and live** — it is the board the dialog
 *   opened over. Nothing is fetched for it and nothing is faked, which is
 *   why `currentVersion` takes no reader and can never fail.
 * - **The `before` side is a real file**, read through whatever reader the
 *   host already uses for the File menu, so a board that opens here opens
 *   in the app.
 * - **The LIST of prior versions is the stub.** With no version store to
 *   ask, this probes for `<stem>.v1`, `<stem>.v2` … beside the open board
 *   and offers the ones that exist. When a real history lands, only
 *   `discoverHistory` changes; `compareReview.tsx` above it already speaks
 *   in entries and does not care where they came from.
 */
import { DEFAULT_NEW_DOCUMENT_SUFFIX, DOCUMENT_SUFFIXES } from "../files/workspaceModel"
import type { HistoryRecord } from "./historyList"

/** One endpoint a comparison can be pointed at. */
export interface CompareVersion {
  /** Stable id for selection. */
  readonly id: string
  /** What the entry is called in the rail. */
  readonly label: string
  /** A one-line description of what that version was — the donor shows the filename. */
  readonly note: string
  /** Absolute path, or null for the live board. */
  readonly path: string | null
  /** Whether this entry is the live editor rather than a file. */
  readonly isCurrent: boolean
}

/** Reads one path, or resolves null when it does not exist / will not load. */
export type ReadSource = (path: string) => Promise<string | null>

/** How many `.vN` siblings to probe for before giving up. Donor :43. */
export const HISTORY_PROBE_DEPTH = 6

/**
 * Every extension a board can carry. Donor :46 hardcoded two; this builds the
 * alternation from `DOCUMENT_SUFFIXES` so the version-probe cannot fall behind
 * the file type. It already nearly did: when `.bbox` landed (Zach, 2026-09-21)
 * a hardcoded pair would have left `pipeline.bbox` unmatched, and the fallback
 * below would then have probed `pipeline.bbox.v1.systemsketch` — a path that
 * can never exist, so Compare would have reported "no prior versions" for
 * every new board and been believed.
 */
const BOARD_EXTENSION = new RegExp(`^(.*)(${DOCUMENT_SUFFIXES.map((suffix) => suffix.replace(".", "\\.")).join("|")})$`)

/**
 * Split a board path into the stem a `.vN` sibling hangs off, and its
 * extension. Donor :45-49: an unrecognised path keeps its whole self as the
 * stem and is assumed to carry the type this build writes, so a probe still
 * produces a well-formed candidate rather than throwing. (The donor's
 * assumption was `.systemsketch` because that was ITS own type; the constant
 * moved, the rule did not.)
 */
export function stemOf(path: string): { stem: string; extension: string } {
  const match = path.match(BOARD_EXTENSION)
  if (!match) return { stem: path, extension: DEFAULT_NEW_DOCUMENT_SUFFIX }
  return { stem: match[1], extension: match[2] }
}

/** The filename a path ends in, for the rail's note line. Donor :81, :90. */
export function fileNameOf(path: string): string {
  return path.split("/").pop() ?? path
}

/**
 * The candidate sibling paths, in probe order — the pure half of
 * `discoverHistory`, split out so the convention can be tested without a
 * reader at all.
 *
 * WHY: this IS the `<name>.v1.<ext>` convention. It is the only
 * thing standing in for a version store, so it is worth pinning on its own
 * rather than only through whatever a fake reader happened to answer.
 */
export function versionCandidates(
  currentPath: string | null,
  depth: number = HISTORY_PROBE_DEPTH,
): readonly { readonly id: string; readonly label: string; readonly path: string }[] {
  if (!currentPath) return []
  const { stem, extension } = stemOf(currentPath)
  const candidates: { id: string; label: string; path: string }[] = []
  for (let version = 1; version <= depth; version += 1) {
    candidates.push({ id: `v${version}`, label: `Version ${version}`, path: `${stem}.v${version}${extension}` })
  }
  return candidates
}

/** The live board's own entry. Donor :87-93. */
export function currentVersion(currentPath: string | null): CompareVersion {
  return {
    id: "current",
    label: "Current version",
    note: currentPath ? fileNameOf(currentPath) : "unsaved board",
    path: currentPath,
    isCurrent: true,
  }
}

/**
 * Find the prior versions that exist beside the open board.
 *
 * Donor :62-95, including its WHY verbatim: absence is a finding, not an
 * error — a board with no `.vN` siblings gets a history of one entry,
 * itself, and the panel says there is nothing to compare against rather
 * than inventing a second endpoint.
 *
 * The probe stays ORDERED and sequential (donor :75, `no-await-in-loop` on
 * purpose, at most six): the entries come back in version order, and a
 * `Promise.all` that resolved them out of order would have to re-sort by
 * parsing the ids back out of the paths it just built.
 */
export async function discoverHistory(
  currentPath: string | null,
  readSource: ReadSource,
  depth: number = HISTORY_PROBE_DEPTH,
): Promise<CompareVersion[]> {
  const entries: CompareVersion[] = []
  for (const candidate of versionCandidates(currentPath, depth)) {
    // eslint-disable-next-line no-await-in-loop -- ordered probe, at most six
    const source = await readSource(candidate.path)
    if (!source) continue
    entries.push({
      id: candidate.id,
      label: candidate.label,
      note: fileNameOf(candidate.path),
      path: candidate.path,
      isCurrent: false,
    })
  }
  entries.push(currentVersion(currentPath))
  return entries
}

/**
 * The amber notice the dialog shows when the probe found nothing — the
 * screenshot's own sentence, and the only place the convention is spelled
 * out to a human.
 *
 * Returns null when there IS something to compare against, so a host can
 * pass the result straight through to `problem`.
 */
export function historyProblem(versions: readonly CompareVersion[]): string | null {
  const priors = versions.filter((version) => !version.isCurrent)
  if (priors.length > 0) return null
  return `No prior versions found beside this board. Save a \`<name>.v1${DEFAULT_NEW_DOCUMENT_SUFFIX}\` next to it to compare against.`
}

/**
 * Turn the discovered versions into the rail's rows.
 *
 * WHY `author: null`, always, and why that is stated rather than simply
 * omitted: SystemSketch has no identity layer — a `.systemsketch` file
 * records who saved it nowhere — so the rail's footer says so out loud
 * ("Titles are measured by diffing the files; SystemSketch records no
 * author"). A future host with real identity fills this in; guessing one
 * from the filesystem's owner would be inventing a fact the file does not
 * carry.
 *
 * WHY the live board is `isCurrent` and nothing else can be: the current
 * board is always the `after` endpoint — a status, not a choice — so
 * `compareReview.tsx` disables that row rather than letting it be picked
 * as `before`. Two selectable endpoints would let a reviewer compare two
 * saved files while the pane headed "Current version" showed neither.
 *
 * @param titleOf  How a version is titled once its diff has been measured
 *                 — "3 changes", say. Omitted → the version's own label.
 */
export function versionRecords(
  versions: readonly CompareVersion[],
  options: {
    readonly timestampOf?: (version: CompareVersion) => number | null
    readonly titleOf?: (version: CompareVersion) => string
  } = {},
): HistoryRecord[] {
  return versions.map((version) => ({
    id: version.id,
    title: options.titleOf?.(version) ?? version.label,
    description: version.note,
    timestamp: options.timestampOf?.(version) ?? null,
    author: null,
    badge: version.isCurrent ? "•" : version.id,
    tone: version.isCurrent ? "current" : "none",
    isCurrent: version.isCurrent,
  }))
}
