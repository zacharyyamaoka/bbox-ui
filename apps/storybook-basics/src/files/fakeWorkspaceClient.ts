// src/files/fakeWorkspaceClient.ts — an in-memory `WorkspaceClient` for
// stories and tests. TEST SUPPORT committed with the acceptance by the
// planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md); off-limits to builders,
// because the FileNavigator acceptance story renders against it — a builder
// who could edit the fake could make the story pass without the navigator
// working.
//
// It answers with the host's SHAPES (the listing, the 409 conflict, create-
// only saves) so a story exercises the same branches the real host drives,
// but it is deliberately not the host: no locks, no atomic replace, no
// filesystem. The host's own behaviour is proved by
// scripts/tests/test_systemsketch_files.py against a real temp directory.
import {
  WorkspaceConflict,
  WorkspaceRequestError,
  type WorkspaceClient,
  type WorkspaceDirectoryCreated,
  type WorkspaceDocument,
  type WorkspaceDocumentKind,
  type WorkspaceDocumentSaved,
  type WorkspaceDocumentStat,
  type WorkspaceListing,
  type WorkspaceWriteInput,
} from "./workspaceClient";

export interface FakeFile {
  source: string;
  /** Seconds since the epoch, like the host's `st_mtime`. */
  mtime: number;
}

export interface FakeWorkspaceOptions {
  /** The fence root — "Home" in the navigator's Places. */
  root: string;
  /** The default workspace folder — "SystemSketch" in Places. */
  workspace: string;
  /** Absolute path → file. Parent folders are implied. */
  files?: Record<string, FakeFile>;
  /** Extra empty folders (absolute). */
  directories?: readonly string[];
}

export interface FakeWorkspaceClient extends WorkspaceClient {
  /** Every call, in order — `["list", dir]`, `["save", input]`, … */
  readonly calls: readonly (readonly unknown[])[];
  /** The current bytes at `path`, or undefined. */
  read(path: string): FakeFile | undefined;
  /** Simulate an external editor rewriting a file. */
  writeExternally(path: string, source: string): void;
}

function fakeDigest(source: string): string {
  // Stable, synchronous, collision-unlikely for fixtures: FNV-1a over UTF-16.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fake-${hash.toString(16)}-${source.length}`;
}

function kindOf(path: string): WorkspaceDocumentKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".systemsketch")) return "systemsketch";
  if (lower.endsWith(".tldr")) return "tldraw";
  return null;
}

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function titleOf(path: string): string {
  const name = baseName(path);
  const kind = kindOf(name);
  return kind === "systemsketch" ? name.slice(0, -".systemsketch".length) : kind === "tldraw" ? name.slice(0, -".tldr".length) : name;
}

export function createFakeWorkspaceClient(options: FakeWorkspaceOptions): FakeWorkspaceClient {
  const files = new Map<string, FakeFile>(Object.entries(options.files ?? {}));
  const directories = new Set<string>([options.root, options.workspace, ...(options.directories ?? [])]);
  const calls: unknown[][] = [];
  let clock = 1_789_790_000;

  const ensureParents = (path: string) => {
    let at = parentOf(path);
    while (at.length > options.root.length && at.startsWith(options.root)) {
      directories.add(at);
      at = parentOf(at);
    }
  };
  for (const path of files.keys()) ensureParents(path);
  for (const dir of options.directories ?? []) ensureParents(`${dir}/x`);

  const inside = (path: string) => path === options.root || path.startsWith(`${options.root}/`);
  const guard = (path: string) => {
    if (!inside(path)) throw new WorkspaceRequestError(`path must stay under an allowed root: ${options.root}`, 400);
  };
  const metadata = (path: string, file: FakeFile): WorkspaceDocumentSaved => ({
    path,
    title: titleOf(path),
    digest: fakeDigest(file.source),
    mtime: file.mtime,
    size: file.source.length,
  });

  const client: FakeWorkspaceClient = {
    get calls() {
      return calls;
    },
    read(path) {
      return files.get(path);
    },
    writeExternally(path, source) {
      clock += 5;
      files.set(path, { source, mtime: clock });
      ensureParents(path);
    },
    async list(dir): Promise<WorkspaceListing> {
      calls.push(["list", dir]);
      const at = dir ?? options.workspace;
      guard(at);
      const childDirs = [...directories].filter((candidate) => parentOf(candidate) === at && candidate !== at);
      const childFiles = [...files.entries()].filter(([path]) => parentOf(path) === at && kindOf(path) !== null);
      const byName = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: "base" });
      return {
        dir: at,
        exists: directories.has(at),
        parent: at === options.root ? null : parentOf(at),
        root: options.root,
        defaultDocument: `${options.workspace}/Untitled.tldr`,
        directories: childDirs
          .map((path) => ({ name: baseName(path), path }))
          .sort((left, right) => byName(left.name, right.name)),
        documents: childFiles
          .map(([path, file]) => ({
            name: baseName(path),
            title: titleOf(path),
            path,
            kind: kindOf(path)!,
            mtime: file.mtime,
            size: file.source.length,
          }))
          .sort((left, right) => byName(left.name, right.name)),
      };
    },
    async load(path): Promise<WorkspaceDocument> {
      calls.push(["load", path]);
      guard(path);
      const file = files.get(path);
      if (!file) return { path, source: null };
      return { ...metadata(path, file), source: file.source };
    },
    async stat(path): Promise<WorkspaceDocumentStat> {
      calls.push(["stat", path]);
      guard(path);
      const file = files.get(path);
      if (!file) return { path, mtime: null };
      const { digest, mtime, size } = metadata(path, file);
      return { path, digest, mtime, size };
    },
    async save(input: WorkspaceWriteInput): Promise<WorkspaceDocumentSaved> {
      calls.push(["save", input]);
      guard(input.path);
      const existing = files.get(input.path);
      if (!input.force) {
        if (existing && input.baseDigest === null) {
          throw new WorkspaceConflict(`${baseName(input.path)} already exists`, existing.mtime, fakeDigest(existing.source));
        }
        if (existing && input.baseDigest !== fakeDigest(existing.source)) {
          throw new WorkspaceConflict(`${baseName(input.path)} changed on disk since it was opened`, existing.mtime, fakeDigest(existing.source));
        }
        if (!existing && input.baseDigest !== null) {
          throw new WorkspaceConflict(`${baseName(input.path)} was removed from disk`, null, null);
        }
      }
      clock += 1;
      const file = { source: input.source, mtime: clock };
      files.set(input.path, file);
      ensureParents(input.path);
      return metadata(input.path, file);
    },
    async rename(input): Promise<WorkspaceDocumentSaved> {
      calls.push(["rename", input]);
      guard(input.path);
      guard(input.destination);
      const file = files.get(input.path);
      if (!file) throw new WorkspaceRequestError("the document no longer exists", 404);
      if (fakeDigest(file.source) !== input.baseDigest) {
        throw new WorkspaceConflict(`${baseName(input.path)} changed on disk since it was opened`, file.mtime, fakeDigest(file.source));
      }
      if (files.has(input.destination) && input.destination !== input.path) {
        const other = files.get(input.destination)!;
        throw new WorkspaceConflict(`${baseName(input.destination)} already exists`, other.mtime, fakeDigest(other.source));
      }
      files.delete(input.path);
      files.set(input.destination, file);
      return metadata(input.destination, file);
    },
    async trash(input): Promise<void> {
      calls.push(["trash", input]);
      guard(input.path);
      const file = files.get(input.path);
      if (!file) throw new WorkspaceRequestError("the document no longer exists", 404);
      if (fakeDigest(file.source) !== input.baseDigest) {
        throw new WorkspaceConflict(`${baseName(input.path)} changed on disk since it was opened`, file.mtime, fakeDigest(file.source));
      }
      files.delete(input.path);
    },
    async reveal(path): Promise<void> {
      calls.push(["reveal", path]);
      guard(path);
    },
    async createDirectory(parent, name): Promise<WorkspaceDirectoryCreated> {
      calls.push(["createDirectory", parent, name]);
      guard(parent);
      const trimmed = name.trim();
      if (!trimmed || trimmed.startsWith(".") || trimmed.includes("/")) {
        throw new WorkspaceRequestError("folder name must not be empty, start with . or contain a path separator", 409);
      }
      const path = `${parent}/${trimmed}`;
      if (directories.has(path)) throw new WorkspaceRequestError(`${trimmed} already exists`, 409);
      directories.add(path);
      return { name: trimmed, path };
    },
  };
  return client;
}

/** The fixture the navigator story and tests render: Zach's screenshot
 *  `Pasted image 20260919135724.png`, abridged — a `recordings` folder, a mix
 *  of `.tldr` and `.systemsketch` boards, under `/home/bam/SystemSketch`.
 *  These are NAMES only; nothing here touches the real folder. */
export function screenshotWorkspace(): FakeWorkspaceClient {
  const at = (name: string, mtime: number, source = '{"tldrawFileFormatVersion":1,"schema":{},"records":[]}') => [`/home/bam/SystemSketch/${name}`, { source, mtime }] as const;
  return createFakeWorkspaceClient({
    root: "/home/bam",
    workspace: "/home/bam/SystemSketch",
    directories: ["/home/bam/SystemSketch/recordings"],
    files: Object.fromEntries([
      // Seconds since the epoch, like the host's `st_mtime`: Sep 3, Sep 7,
      // Sep 8, Sep 18 and the morning of Sep 19, 2026 (UTC).
      at("02_literal_argument.tldr", 1_788_450_000),
      at("AI Workflow.systemsketch", 1_788_795_600),
      at("bbox-ui-anatomy-example.tldr", 1_788_882_000),
      at("bbox-ui-v3.systemsketch", 1_789_740_000),
      at("series_a_pose_pipeline_v7.systemsketch", 1_789_780_000),
    ]),
  });
}
