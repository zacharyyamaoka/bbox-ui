// src/files.smoke.test.tsx — real files: the File menu against the REAL file
// host (a temp root, src/testing/fileHost.globalSetup.ts), in both navigation
// modes. ACCEPTANCE committed by the planning lane of
// docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
// `app-wiring`.
//
// Zach, 2026-09-19: "we need to be able to save real files to the system so I
// can start working on this: Please copy over the code from system sketch for
// the file navigator here … (in settings you can have a toggle wether for file
// navigation to use native or our app one)". So every case here moves real
// bytes: through the Python host into a mkdtemp folder (app mode), or through a
// stubbed File System Access handle (native mode — the OS dialog cannot be
// driven headless, so `window.showOpenFilePicker`/`showSaveFilePicker` are
// replaced for the test and restored after).
//
// Nothing here can reach /home/bam/SystemSketch: the host's files root is the
// temp folder (the global setup refuses anything else), and the window's
// address bar is a `memoryDocumentLocation` — a navigation is RECORDED, never
// performed, so the old app's :4321 is never loaded either.
import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";

import { LEGACY_SYSTEMSKETCH_URL } from "./chrome/legacyApp";
import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation, setFileHostBaseUrl, type MemoryDocumentLocation } from "./files/launchConfig";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { closeMenus, openBurger, openSubmenu, rowsOf, runFileCommand } from "./testing/menus";

const host = inject("fileHost");

const RECENTS_KEY = "systemsketch.recentDocuments.v1";
const CLAIMS_KEY = "systemsketch.untitledClaims.v1";
const SETTINGS_KEY = "systemsketch.settings.v1";

let app: MountedApp | null = null;
let restoreStubs: (() => void)[] = [];

beforeEach(() => {
  expect(host.error, `the temp-root file host must be running for these tests:\n${host.error}`).toBe("");
  setFileHostBaseUrl(host.url);
  for (const key of [RECENTS_KEY, CLAIMS_KEY, SETTINGS_KEY]) window.localStorage.removeItem(key);
});

afterEach(() => {
  app?.unmount();
  app = null;
  for (const restore of restoreStubs.splice(0)) restore();
  for (const key of [RECENTS_KEY, CLAIMS_KEY, SETTINGS_KEY]) window.localStorage.removeItem(key);
  resetLaunchConfig();
});

/* ------------------------------------------------------------ helpers */

async function eventually<T>(probe: () => Promise<T | null | undefined | false>, what: string, timeout = 10_000): Promise<T> {
  const started = performance.now();
  let last: unknown = null;
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (cause) {
      last = cause;
    }
    if (performance.now() - started > timeout) throw new Error(`timed out after ${timeout}ms — ${what}${last ? `: ${String(last)}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function hostCall<T>(method: "GET" | "POST", route: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(host.url + route, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

interface HostDocument {
  path: string;
  source: string | null;
  digest?: string;
}

const hostLoad = async (path: string) => (await hostCall<HostDocument>("GET", `/api/workspace/file?path=${encodeURIComponent(path)}`)).body;
const hostList = async (dir: string) =>
  (await hostCall<{ documents: { name: string; path: string }[] }>("GET", `/api/workspace/list?dir=${encodeURIComponent(dir)}`)).body;
async function hostWrite(path: string, source: string, options: { force?: boolean } = {}) {
  const result = await hostCall<{ digest: string; error?: string }>("POST", "/api/workspace/file", { path, source, baseDigest: null, force: options.force === true });
  expect(result.status, result.body.error).toBe(200);
  return result.body;
}

function placeBlock(editor: Editor, name: string, x = 240, y = 240): TLShapeId {
  const id = createShapeId();
  editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports: { left: [{ id: "in", name: "in", type: "" }], right: [], top: [], bottom: [] } } } as never);
  return id;
}

function blockNamesIn(source: string | null | undefined): string[] {
  if (!source) return [];
  const parsed = JSON.parse(source) as { records: { typeName: string; type?: string; props?: { name?: string } }[] };
  return parsed.records.filter((record) => record.typeName === "shape" && record.type === BLOCK_SHAPE_TYPE).map((record) => record.props?.name ?? "");
}

function blockNamed(editor: Editor, name: string): TLShapeId | null {
  const shape = editor.getCurrentPageShapes().find((candidate) => candidate.type === BLOCK_SHAPE_TYPE && (candidate.props as { name?: string }).name === name);
  return shape ? shape.id : null;
}

/** Mount on `board` (or a scratch board), with a recording address bar. */
async function mountOn(board: string | null): Promise<{ app: MountedApp; location: MemoryDocumentLocation }> {
  const location = memoryDocumentLocation({ initialBoard: board });
  setDocumentLocation(location);
  app = await mountApp();
  return { app, location };
}

async function remount(board: string | null) {
  app?.unmount();
  app = null;
  return mountOn(board);
}

/** A board this app can read, holding one block per name — made by the app's own serializer. */
async function boardWith(names: string[]): Promise<string> {
  const { app: scratch } = await remount(null);
  names.forEach((name, index) => placeBlock(scratch.editor, name, 200 + index * 260, 200));
  const { serializeBoard } = await import("./chrome/fileActions");
  const source = await serializeBoard(scratch.editor);
  scratch.unmount();
  app = null;
  return source;
}

const titleOf = (mounted: MountedApp) => mounted.root.querySelector<HTMLElement>('[data-testid="ss-chrome-title"]');
const statusToneOf = (mounted: MountedApp) => titleOf(mounted)?.querySelector('[data-slot="chrome-bar-status-dot"]')?.getAttribute("data-tone") ?? null;
const navigatorDialog = (mode: "open" | "saveAs") => document.querySelector<HTMLElement>(`[data-testid="ss-file-navigator"][data-mode="${mode}"]`);
const rowFor = (path: string) => document.querySelector<HTMLElement>(`[data-testid="ss-file-navigator-row"][data-path="${CSS.escape(path)}"]`);

/* ------------------------------------------------------------ app mode */

describe("app file navigation (the default) — real .tldr files through the local file host", () => {
  it("Save As… from a scratch board writes a real .tldr, and the board survives open → edit → save → reopen", async () => {
    const path = `${host.workspace}/roundtrip.tldr`;
    const first = await mountOn(null);
    placeBlock(first.app.editor, "rt-1");

    await runFileCommand(first.app, "Save As…");
    const dialog = await waitFor(() => navigatorDialog("saveAs"), { what: "the app navigator in Save As mode" });
    const name = dialog.querySelector<HTMLInputElement>('[data-testid="ss-file-navigator-name"]')!;
    await userEvent.clear(name);
    await userEvent.type(name, "roundtrip");
    await userEvent.click(dialog.querySelector<HTMLElement>('[data-testid="ss-file-navigator-confirm"]')!);

    const onDisk = await eventually(async () => {
      const doc = await hostLoad(path);
      return doc.source ? doc : null;
    }, "roundtrip.tldr written into the temp workspace");
    expect(blockNamesIn(onDisk.source)).toEqual(["rt-1"]);
    // From a scratch board the window moves onto the file (a recorded
    // `assign`, or `replaceBoard` — either names the board); the reopen below
    // is what proves the file IS the board.
    await waitFor(() => first.location.board === path, { what: "this window now names the saved board" });

    // Reopen from disk, edit, save with Ctrl+S.
    const second = await remount(path);
    const id = await waitFor(() => blockNamed(second.app.editor, "rt-1"), { what: "the saved block, loaded from disk" });
    await waitFor(() => titleOf(second.app)?.textContent?.includes("roundtrip"), { what: "the title reads the file's name" });
    second.app.editor.updateShape({ id, type: BLOCK_SHAPE_TYPE, props: { name: "rt-2" } } as never);
    second.app.editor.focus();
    await userEvent.keyboard("{Control>}s{/Control}");
    await eventually(async () => blockNamesIn((await hostLoad(path)).source).includes("rt-2"), "the edit reached disk");

    const third = await remount(path);
    await waitFor(() => blockNamed(third.app.editor, "rt-2"), { what: "the edit survives a reopen" });
    expect(blockNamed(third.app.editor, "rt-1")).toBeNull();
  });

  it("a board rewritten on disk by someone else is never clobbered — the save is refused and the title says so", async () => {
    const path = `${host.workspace}/contested.tldr`;
    const source = await boardWith(["seed"]);
    await hostWrite(path, source);

    const { app: mounted } = await mountOn(path);
    const id = await waitFor(() => blockNamed(mounted.editor, "seed"), { what: "the contested board loaded" });

    // Someone else (the archived app, an editor) replaces the file.
    const theirs = source.replace('"name": "seed"', '"name": "theirs"').replace('"name":"seed"', '"name":"theirs"');
    expect(theirs).not.toBe(source);
    await hostWrite(path, theirs, { force: true });

    mounted.editor.updateShape({ id, type: BLOCK_SHAPE_TYPE, props: { name: "mine" } } as never);
    mounted.editor.focus();
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => statusToneOf(mounted) === "error", { what: "the title's status reads as a conflict", timeout: 10_000 });
    await sleep(2_000);
    const onDisk = await hostLoad(path);
    expect(blockNamesIn(onDisk.source)).toEqual(["theirs"]);
  });

  it("a .tldr this app cannot read (another app's shapes) opens as an error and is never written", async () => {
    const path = `${host.workspace}/foreign.tldr`;
    const parsed = JSON.parse(await boardWith([])) as { records: { id: string; typeName: string }[] };
    const page = parsed.records.find((record) => record.typeName === "page")!;
    parsed.records.push({
      id: "shape:legacy",
      typeName: "shape",
      // The archived app's block type — a shape this app's schema does not know.
      type: "block",
      x: 0, y: 0, rotation: 0, index: "a1", parentId: page.id, isLocked: false, opacity: 1, props: {}, meta: {},
    } as never);
    const written = await hostWrite(path, JSON.stringify(parsed));

    const { app: mounted } = await mountOn(path);
    await waitFor(() => statusToneOf(mounted) === "error", { what: "an unreadable board reads as an error", timeout: 10_000 });
    placeBlock(mounted.editor, "should-not-save");
    mounted.editor.focus();
    await userEvent.keyboard("{Control>}s{/Control}");
    await sleep(2_500);
    const stat = (await hostCall<{ digest: string }>("GET", `/api/workspace/stat?path=${encodeURIComponent(path)}`)).body;
    expect(stat.digest).toBe(written.digest);
  });

  it("Open… lists the workspace; a .tldr row opens that board, a .systemsketch row hands off to the archived app", async () => {
    const tldr = `${host.workspace}/pick-me.tldr`;
    const legacy = `${host.workspace}/legacy-board.systemsketch`;
    const source = await boardWith(["picked"]);
    await hostWrite(tldr, source);
    await hostWrite(legacy, JSON.stringify({ systemSketch: { formatVersion: 2 }, ...JSON.parse(source) }));

    const first = await mountOn(null);
    await runFileCommand(first.app, "Open…");
    await waitFor(() => navigatorDialog("open"), { what: "the app navigator in Open mode" });
    await userEvent.dblClick(await waitFor(() => rowFor(tldr), { what: "the pick-me.tldr row" }));
    await waitFor(() => first.location.board === tldr, { what: "the window now names pick-me.tldr" });
    const reopened = await remount(first.location.board);
    await waitFor(() => blockNamed(reopened.app.editor, "picked"), { what: "the picked board's block" });

    const second = await remount(null);
    await runFileCommand(second.app, "Open…");
    await waitFor(() => navigatorDialog("open"), { what: "the navigator again" });
    await userEvent.dblClick(await waitFor(() => rowFor(legacy), { what: "the .systemsketch row" }));
    const handoff = await waitFor(() => second.location.assigned.at(-1), { what: "a hand-off navigation" });
    const url = new URL(handoff, window.location.href);
    expect(url.origin).toBe(new URL(LEGACY_SYSTEMSKETCH_URL).origin);
    expect(url.searchParams.get("board")).toBe(legacy);
  });

  it("New reserves the next Untitled .tldr in the workspace folder, and the file appears once the board has content", async () => {
    const first = await mountOn(null);
    await runFileCommand(first.app, "New");
    const untitled = await waitFor(() => first.location.board, { what: "a board path for the new document" });
    expect(untitled).toMatch(new RegExp(`^${host.workspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/Untitled( \\d+)?\\.tldr$`));

    const second = await remount(untitled);
    await waitFor(() => /Untitled/.test(titleOf(second.app)?.textContent ?? ""), { what: "the title reads Untitled…" });
    placeBlock(second.app.editor, "fresh");
    second.app.editor.focus();
    await userEvent.keyboard("{Control>}s{/Control}");
    await eventually(async () => blockNamesIn((await hostLoad(untitled)).source).includes("fresh"), "the new board written to disk");
  });

  it("New window opens a second window on a new Untitled board and leaves this one alone", async () => {
    const first = await mountOn(null);
    await runFileCommand(first.app, "New window");
    const opened = await waitFor(() => (first.location.windows[0]?.url ? first.location.windows[0] : null), { what: "a second window pointed at a board" });
    const board = new URL(opened.url!, window.location.href).searchParams.get("board");
    expect(board).toMatch(/\/Untitled( \d+)?\.tldr$/);
    expect(board!.startsWith(`${host.workspace}/`)).toBe(true);
    expect(first.location.assigned).toEqual([]);
    expect(first.location.board).toBeNull();
  });

  it("Open recent lists this app's recent boards newest first (full path on hover) and opens the one picked; empty reads No recent files", async () => {
    const empty = await mountOn(null);
    let file = await openSubmenu(await openBurger(empty.app), "File");
    let recent = await openSubmenu(file, "Open recent");
    expect(rowsOf(recent).map((row) => row.label)).toEqual(["No recent files"]);
    expect(rowsOf(recent)[0].element.getAttribute("aria-disabled")).toBe("true");
    await closeMenus();

    const older = `${host.workspace}/older.tldr`;
    const newer = `${host.workspace}/newer.tldr`;
    const source = await boardWith(["r"]);
    await hostWrite(older, source);
    await hostWrite(newer, source);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify([newer, older]));

    const second = await remount(null);
    file = await openSubmenu(await openBurger(second.app), "File");
    recent = await openSubmenu(file, "Open recent");
    const rows = rowsOf(recent);
    expect(rows.map((row) => row.label)).toEqual(["newer", "older"]);
    expect(rows.map((row) => row.element.getAttribute("title"))).toEqual([newer, older]);
    await userEvent.click(rows[1].element);
    await waitFor(() => second.location.board === older, { what: "the window now names older.tldr" });
  });

  it("renaming the title renames the file on disk — and the field sits exactly where the title was, with no hint under it", async () => {
    const path = `${host.workspace}/rename-me.tldr`;
    await hostWrite(path, await boardWith(["n"]));
    const { app: mounted, location } = await mountOn(path);
    const title = await waitFor(() => (titleOf(mounted)?.textContent?.includes("rename-me") ? titleOf(mounted) : null), { what: "the file's title" });
    const bar = mounted.root.querySelector<HTMLElement>('[data-testid="ss-chrome"]')!;
    const titleRect = title.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();

    await userEvent.dblClick(title);
    const input = await waitFor(() => mounted.root.querySelector<HTMLInputElement>('[data-slot="inline-rename-input"]'), { what: "the rename field" });
    const inputRect = input.getBoundingClientRect();
    for (const key of ["left", "top", "width", "height"] as const) {
      expect(Math.abs(inputRect[key] - titleRect[key]), `field ${key}`).toBeLessThanOrEqual(1);
    }
    const barNow = bar.getBoundingClientRect();
    for (const key of ["left", "top", "width", "height"] as const) {
      expect(Math.abs(barNow[key] - barRect[key]), `bar ${key}`).toBeLessThanOrEqual(1);
    }
    expect(document.body.textContent ?? "").not.toMatch(/Press Enter|Escape to cancel/);

    await userEvent.clear(input);
    await userEvent.type(input, "renamed{Enter}");
    const renamed = `${host.workspace}/renamed.tldr`;
    await eventually(async () => {
      const names = (await hostList(host.workspace)).documents.map((entry) => entry.path);
      return names.includes(renamed) && !names.includes(path);
    }, "rename-me.tldr renamed to renamed.tldr on disk");
    await waitFor(() => location.board === renamed, { what: "the window follows the rename" });
    await waitFor(() => titleOf(mounted)?.textContent?.includes("renamed"), { what: "the title follows the rename" });
  });

  it("Copy Absolute Path copies the open board's path", async () => {
    const path = `${host.workspace}/copy-me.tldr`;
    await hostWrite(path, await boardWith(["c"]));
    const copied: string[] = [];
    const clipboard = navigator.clipboard;
    const original = clipboard.writeText.bind(clipboard);
    clipboard.writeText = async (text: string) => {
      copied.push(text);
    };
    restoreStubs.push(() => {
      clipboard.writeText = original;
    });
    const { app: mounted } = await mountOn(path);
    await waitFor(() => titleOf(mounted)?.textContent?.includes("copy-me"), { what: "the board loaded" });
    await runFileCommand(mounted, "Copy Absolute Path");
    await waitFor(() => copied.includes(path), { what: "the path on the clipboard" });
  });
});

/* ------------------------------------------------------------ native mode */

interface FakeHandle {
  name: string;
  content: string;
  lastModified: number;
  getFile(): Promise<{ name: string; lastModified: number; text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(): Promise<"granted">;
  requestPermission(): Promise<"granted">;
}

function fakeHandle(name: string, content = ""): FakeHandle {
  const handle: FakeHandle = {
    name,
    content,
    lastModified: Date.now(),
    async getFile() {
      return { name: handle.name, lastModified: handle.lastModified, text: async () => handle.content };
    },
    async createWritable() {
      let buffer = "";
      return {
        async write(data: string) {
          buffer += data;
        },
        async close() {
          handle.content = buffer;
          handle.lastModified = Date.now();
        },
      };
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
  };
  return handle;
}

function stubWindow(name: "showOpenFilePicker" | "showSaveFilePicker", value: unknown) {
  const target = window as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(target, name);
  const previous = target[name];
  target[name] = value;
  restoreStubs.push(() => {
    if (had) target[name] = previous;
    else delete target[name];
  });
}

describe("native file navigation — the browser's File System Access pickers, no server", () => {
  beforeEach(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fileNavigation: "native", settingsPresentation: "dialog" }));
  });

  it("the File menu offers only what a picker can honour", async () => {
    const { app: mounted } = await mountOn(null);
    const file = await openSubmenu(await openBurger(mounted), "File");
    expect(rowsOf(file).map((row) => row.label)).toEqual(["New", "New window", "Open…", "Save", "Save As…"]);
    await closeMenus();
  });

  it("Save As… calls showSaveFilePicker for a .tldr and writes the board through the handle — no navigator, no host", async () => {
    const saved = fakeHandle("native-board.tldr");
    const calls: { suggestedName?: string; types?: { accept: Record<string, readonly string[]> }[] }[] = [];
    stubWindow("showSaveFilePicker", async (options: (typeof calls)[number]) => {
      calls.push(options);
      return saved;
    });
    const { app: mounted } = await mountOn(null);
    placeBlock(mounted.editor, "native-1");
    await runFileCommand(mounted, "Save As…");
    await waitFor(() => blockNamesIn(saved.content || null).includes("native-1"), { what: "the board written through the handle" });
    expect(calls).toHaveLength(1);
    expect(calls[0].suggestedName).toMatch(/\.tldr$/);
    expect(Object.values(calls[0].types?.[0]?.accept ?? {}).flat()).toContain(".tldr");
    expect(navigatorDialog("saveAs")).toBeNull();
    await waitFor(() => titleOf(mounted)?.textContent?.includes("native-board"), { what: "the title reads the picked file's name" });
  });

  it("Open… calls showOpenFilePicker and loads the picked board; Save writes back through the same handle and refuses a file changed underneath it", async () => {
    const picked = fakeHandle("native-picked.tldr", await boardWith(["native-picked"]));
    let opens = 0;
    stubWindow("showOpenFilePicker", async () => {
      opens += 1;
      return [picked];
    });
    const { app: mounted } = await mountOn(null);
    await runFileCommand(mounted, "Open…");
    const id = await waitFor(() => blockNamed(mounted.editor, "native-picked"), { what: "the picked board in the editor" });
    expect(opens).toBe(1);
    expect(navigatorDialog("open")).toBeNull();

    mounted.editor.updateShape({ id, type: BLOCK_SHAPE_TYPE, props: { name: "native-edited" } } as never);
    mounted.editor.focus();
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => blockNamesIn(picked.content).includes("native-edited"), { what: "Save wrote back through the handle" });

    // Another program rewrites the file; the next save must not clobber it.
    picked.content = picked.content.replace(/native-edited/g, "external");
    picked.lastModified = Date.now() + 5_000;
    const again = blockNamed(mounted.editor, "native-edited")!;
    mounted.editor.updateShape({ id: again, type: BLOCK_SHAPE_TYPE, props: { name: "clobber" } } as never);
    mounted.editor.focus();
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => statusToneOf(mounted) === "error", { what: "the conflict surfaced", timeout: 10_000 });
    await sleep(1_000);
    expect(blockNamesIn(picked.content)).toEqual(["external"]);
  });
});
