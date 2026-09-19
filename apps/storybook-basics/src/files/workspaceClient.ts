// src/files/workspaceClient.ts — the local file host's protocol, as a client.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md).
// The wire types and the four error classes below are PORTED VERBATIM now
// (they are the contract); `createHttpWorkspaceClient` THROWS until lane
// `files-kit` fills it in. `workspaceClient.test.ts` is the acceptance and is
// off-limits to the builder.
//
// Donor, read on disk: `/home/bam/systemsketch/src/workspace/
// workspaceClient.ts:1-389` (types :1-58, errors :60-113, request plumbing
// :115-180, routes :182-389). What does NOT travel: `traceWorkspace` and every
// `emitRecorderDiagnostic` call (the archive's recorder lane does not exist
// here), `flushWorkspaceDocument` (the pagehide keepalive write — this app
// guards unsaved edits with `beforeunload` instead; see the plan), and the
// `/api/settings/file-access` pair (the "allow opening files anywhere" switch
// is not ported — the host fences to its files root).
//
// WHY a client OBJECT with an injectable `fetch` and `baseUrl`, where the
// donor had free functions over the global `fetch` and same-origin paths:
// the new app reaches the host same-origin in production (the dock's Stable
// server mounts the routes) but cross-origin in its smoke tests (a temp-root
// host on an ephemeral port), and a test must never need a global stub to aim
// a request. Every path and body shape is still the donor's, byte for byte.

/** Which on-disk encoding a listed document uses. The Python host derives it from the suffix. */
export type WorkspaceDocumentKind = "systemsketch" | "tldraw";

export interface WorkspaceDocumentEntry {
  name: string;
  title: string;
  path: string;
  kind: WorkspaceDocumentKind;
  mtime: number;
  size: number;
}

export interface WorkspaceListing {
  dir: string;
  exists: boolean;
  parent: string | null;
  root: string;
  /** The document a clean launch opens: an existing `Untitled`, else a new one. */
  defaultDocument: string;
  directories: { name: string; path: string }[];
  documents: WorkspaceDocumentEntry[];
}

export interface WorkspaceDocument {
  path: string;
  /** `null` = no file at that path yet (the host answers 200, not 404). */
  source: string | null;
  title?: string;
  digest?: string;
  mtime?: number;
  size?: number;
}

export interface WorkspaceDocumentStat {
  path: string;
  mtime: number | null;
  size?: number;
  digest?: string;
}

export interface WorkspaceDocumentSaved {
  path: string;
  title: string;
  digest: string;
  mtime: number;
  size: number;
}

export interface WorkspaceDirectoryCreated {
  name: string;
  path: string;
}

export class WorkspaceConflict extends Error {
  readonly diskMtime: number | null;
  readonly diskDigest: string | null;

  constructor(message: string, diskMtime: number | null, diskDigest: string | null) {
    super(message);
    this.name = "WorkspaceConflict";
    this.diskMtime = diskMtime;
    this.diskDigest = diskDigest;
  }
}

export interface WorkspaceRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class WorkspaceRequestTimeout extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`The local SystemSketch controller did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`);
    this.name = "WorkspaceRequestTimeout";
    this.timeoutMs = timeoutMs;
  }
}

export class WorkspaceRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkspaceRequestError";
    this.status = status;
  }
}

export class WorkspaceTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceTransportError";
  }
}

/** Only transport failures and explicitly transient HTTP responses should retry. */
export function isRetryableWorkspaceFailure(cause: unknown): boolean {
  if (cause instanceof WorkspaceRequestTimeout || cause instanceof WorkspaceTransportError) return true;
  return cause instanceof WorkspaceRequestError && (cause.status === 408 || cause.status === 429 || cause.status >= 500);
}

export interface WorkspaceWriteInput {
  path: string;
  source: string;
  /** `null` = create-only (Save As / New): the host refuses if the file exists. */
  baseDigest: string | null;
  /** Explicit "Replace" after a conflict — the only way past the fence. */
  force?: boolean;
}

/**
 * The host's eight operations. Every method rejects with `WorkspaceConflict`
 * on a 409 `{conflict: true}` answer, `WorkspaceRequestError` on any other
 * non-OK answer or `{error}` body, `WorkspaceRequestTimeout` when its budget
 * lapses, `WorkspaceTransportError` when `fetch` itself throws a TypeError,
 * and passes a caller's `AbortSignal` abort through as-is (donor
 * `requestPayload`, :144-180).
 */
export interface WorkspaceClient {
  /** GET `/api/workspace/list[?dir=]` — no `dir` → the host's default workspace folder. */
  list(dir?: string, options?: WorkspaceRequestOptions): Promise<WorkspaceListing>;
  /** GET `/api/workspace/file?path=` */
  load(path: string, options?: WorkspaceRequestOptions): Promise<WorkspaceDocument>;
  /** GET `/api/workspace/stat?path=` */
  stat(path: string, options?: WorkspaceRequestOptions): Promise<WorkspaceDocumentStat>;
  /** POST `/api/workspace/file` with `{path, source, baseDigest, force}` (force always sent, `false` by default). */
  save(input: WorkspaceWriteInput, options?: WorkspaceRequestOptions): Promise<WorkspaceDocumentSaved>;
  /** POST `/api/workspace/rename` with `{path, destination, baseDigest}`. */
  rename(input: { path: string; destination: string; baseDigest: string }, options?: WorkspaceRequestOptions): Promise<WorkspaceDocumentSaved>;
  /** POST `/api/workspace/trash` with `{path, baseDigest}`. */
  trash(input: { path: string; baseDigest: string }, options?: WorkspaceRequestOptions): Promise<void>;
  /** POST `/api/workspace/reveal` with `{path}`. */
  reveal(path: string, options?: WorkspaceRequestOptions): Promise<void>;
  /** POST `/api/workspace/directory` with `{parent, name}`. */
  createDirectory(parent: string, name: string, options?: WorkspaceRequestOptions): Promise<WorkspaceDirectoryCreated>;
}

export interface HttpWorkspaceClientOptions {
  /** Prepended to every `/api/workspace/*` path. `""` (default) = same origin. */
  baseUrl?: string;
  /** Defaults to the global `fetch`, looked up at CALL time (so a test that
   *  stubs the global after construction is still honoured). */
  fetch?: typeof fetch;
}

/** The donor's per-operation budgets (workspaceClient.ts:115-117), verbatim. */
export const WORKSPACE_METADATA_TIMEOUT_MS = 10_000;
export const WORKSPACE_READ_TIMEOUT_MS = 30_000;
export const WORKSPACE_WRITE_TIMEOUT_MS = 45_000;

export function createHttpWorkspaceClient(options: HttpWorkspaceClientOptions = {}): WorkspaceClient {
  void options;
  throw new Error("createHttpWorkspaceClient: not implemented (lane files-kit)");
}
