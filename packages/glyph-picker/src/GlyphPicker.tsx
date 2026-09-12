import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Popover } from "@base-ui/react/popover";
import { Glyph, type GlyphSize } from "@bbox-ui/core";
import { decodeGlyphContent, encodeGlyphContent, sameGlyphContent, type GlyphContent } from "@bbox-ui/glyph-content";

import { applySkinTone, EMOJI_FONT_FAMILY, EMOJI_SKIN_TONES, loadEmojiLibrary, peekEmojiLibrary, type EmojiEntry, type EmojiLibrary } from "./emojiLibrary";
import { LucideNodeSvg, loadLucideLibrary, peekLucideLibrary, type LucideLibrary, type LucideLibraryEntry } from "./lucideLibrary";
import { LucideGlyphResolver } from "./resolveLucideName";
import {
  IconFetchError,
  encodeUploadedIcon,
  fetchIconFromUrl,
  formatIconBytes,
  prepareIconImage,
  type PreparedIconImage,
} from "./uploadIcon";
import { useWindowedGrid } from "./useWindowedGrid";
import "./glyph-picker.css";

/**
 * packages/glyph-picker/src/GlyphPicker.tsx — real implementation
 * (docs/GLYPH-PLAN.md phase 3). SystemSketch's `BlockIconPicker.tsx`
 * ported BY VALUE: same tabs, same filter/shuffle/skin-tone/windowed-grid
 * behaviour, same Recent lists, same paste/drop/file/URL upload entry
 * points. What changed is exactly the plan's stock-part table:
 *
 *  - Radix `Popover` → Base UI `Popover` (this repo has no Radix at all).
 *  - `useContainerIfExists()` → the frozen `portalContainer` prop.
 *  - `useMaybeEditor()` + `createIconAsset` (a tldraw asset record) →
 *    `encodeUploadedIcon` (a `data:` URL written straight into `content`,
 *    plan D3 — no asset store, no editor, no host at all).
 *
 * `GlyphPickerProps` — value/onChange/size/padding/sizePreset/open/
 * onOpenChange/portalContainer/disabled/children/className — is unchanged
 * from the frozen file; nothing here renames or adds to it.
 */
export interface GlyphPickerProps {
  /** The encoded content — `@bbox-ui/glyph-content`'s grammar. Same value
   *  `Glyph.content` reads. */
  value: string;
  onChange(next: string): void;
  /** How the trigger glyph paints — mirrors `GlyphProps`' own size cascade
   *  (`sizePreset` the preset layer, `size` the override, in px). */
  size?: number;
  padding?: number;
  sizePreset?: GlyphSize;
  /** Controlled open state. Omit both to let the picker manage its own
   *  (uncontrolled) open flag — a canvas host that wants to close the
   *  picker on, say, a tool change passes both instead. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
  /** Where the popover mounts — tldraw's own container element, so the
   *  picker paints above the canvas rather than under it. `undefined`
   *  mounts in the ambient DOM position (the DOM render, Storybook). */
  portalContainer?: HTMLElement | null;
  disabled?: boolean;
  /** A custom trigger. Omitting it renders the default trigger: a `Glyph`
   *  painted with `value` at the given size/padding/sizePreset. */
  children?: ReactNode;
  className?: string;
}

/**
 * Uncontrolled-with-controlled-escape-hatch, the same shape every other
 * open/close surface in this repo's donor libraries uses (Base UI's own
 * components, Radix before it). `open !== undefined` is the controlled
 * check — not truthiness — so a host that controls the picker and is
 * currently holding it closed (`open={false}`) is still "controlled",
 * never silently demoted to the internal flag.
 */
function useOpenState(
  open: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (next: boolean) => void] {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return [resolvedOpen, setOpen];
}

type PickerTab = "emoji" | "icons" | "upload";

/**
 * Staged Upload-tab state: nothing yet, a prepared image waiting on Save,
 * or an error. `error` carries `prepared`/`previewUrl` when the failure
 * came from `saveUpload` (the file was already staged) so Back can return
 * to that preview instead of losing the pick; it's absent when the
 * failure came from `stageFile`/`stageUrl` (nothing staged yet to go
 * back to). Ported from the donor's `UploadStage`.
 */
type UploadStage =
  | { kind: "empty" }
  | { kind: "preview"; prepared: PreparedIconImage; previewUrl: string }
  | { kind: "saving"; prepared: PreparedIconImage; previewUrl: string }
  | { kind: "error"; message: string; prepared?: PreparedIconImage; previewUrl?: string };

const RECENT_KEY = "bboxUi.glyphPicker.recentLucide";
// WHY a sibling key rather than mixing kinds into `RECENT_KEY`: Lucide's
// recent list is a list of kebab names, looked up through `lucideLib.byKebab`;
// keeping emoji `slug`s in their own key means neither tab's lookup has to
// guess what kind of id a given string is.
const RECENT_EMOJI_KEY = "bboxUi.glyphPicker.recentEmoji";
const SKIN_TONE_KEY = "bboxUi.glyphPicker.skinTone";
const RECENT_LIMIT = 12;
/** Notion's promise, spelled out in the filter's own placeholder area. */
const URL_PATTERN = /^https?:\/\/\S+$/;

function readRecents(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(key: string, names: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(names));
  } catch {
    // private browsing / storage disabled — recents just don't persist
  }
}

function readSkinTone(): number {
  try {
    const stored = Number(localStorage.getItem(SKIN_TONE_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < EMOJI_SKIN_TONES.length ? stored : 0;
  } catch {
    return 0;
  }
}

function writeSkinTone(tone: number): void {
  try {
    localStorage.setItem(SKIN_TONE_KEY, String(tone));
  } catch {
    // ditto
  }
}

const TONE_HANDS: readonly string[] = EMOJI_SKIN_TONES.map((modifier) => `✋${modifier}`);

/** True for anything a person can type text into — an `<input>`/`<textarea>` or a contenteditable. */
function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

function randomEntry<T>(list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

function describeUpload(prepared: PreparedIconImage): string {
  if (prepared.kind === "svg") {
    return `SVG kept as vector · ${formatIconBytes(prepared.originalBytes)}`;
  }
  return (
    `${prepared.originalWidth}×${prepared.originalHeight} ${formatIconBytes(prepared.originalBytes)} → `
    + `${prepared.width}×${prepared.height} PNG ${formatIconBytes(prepared.storedBytes)}, stored inline`
  );
}

export function GlyphPicker({
  value,
  onChange,
  size,
  padding,
  sizePreset,
  open,
  onOpenChange,
  portalContainer,
  disabled,
  children,
  className,
}: GlyphPickerProps) {
  const [isOpen, setOpen] = useOpenState(open, onOpenChange);
  const decoded = useMemo(() => decodeGlyphContent(value), [value]);

  const [tab, setTab] = useState<PickerTab>("icons");
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState(() => readSkinTone());
  const [toneOpen, setToneOpen] = useState(false);
  const [recent, setRecent] = useState(() => readRecents(RECENT_KEY));
  const [recentEmoji, setRecentEmoji] = useState(() => readRecents(RECENT_EMOJI_KEY));
  const [upload, setUpload] = useState<UploadStage>({ kind: "empty" });
  const [urlValue, setUrlValue] = useState("");
  const [lucideLib, setLucideLib] = useState<LucideLibrary | null>(() => peekLucideLibrary());
  const [emojiLib, setEmojiLib] = useState<EmojiLibrary | null>(() => peekEmojiLibrary());
  const searchRef = useRef<HTMLInputElement | null>(null);

  // WHY gated on `open`: Root/Trigger stay mounted for the picker's whole
  // life (Base UI only unmounts the Popup), so an unconditional load here
  // would fetch the ~1,800-icon chunk the moment a Glyph mounts, not the
  // moment its picker is actually opened.
  useEffect(() => {
    if (!isOpen || (lucideLib && emojiLib)) return;
    let cancelled = false;
    void Promise.all([loadLucideLibrary(), loadEmojiLibrary()]).then(([lucide, emoji]) => {
      if (cancelled) return;
      setLucideLib(lucide);
      setEmojiLib(emoji);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, lucideLib, emojiLib]);

  // Reset transient UI (never the staged upload — Cancel/Back own that)
  // each time the panel opens, so a stale filter or tab doesn't survive a
  // reopen. Recent lists are re-read from storage here too, not just
  // seeded once via `useState`'s initializer — see the donor's own WHY: an
  // uncontrolled picker that stays mounted across opens only ever sees ITS
  // OWN prior writes to `recent` state otherwise, not a sibling instance's.
  useEffect(() => {
    if (!isOpen) return;
    setTab("icons");
    setQuery("");
    setToneOpen(false);
    setUpload({ kind: "empty" });
    setUrlValue("");
    setRecent(readRecents(RECENT_KEY));
    setRecentEmoji(readRecents(RECENT_EMOJI_KEY));
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (upload.kind === "preview" || upload.kind === "saving" || (upload.kind === "error" && upload.previewUrl)) {
      const url = upload.previewUrl;
      if (url) return () => URL.revokeObjectURL(url);
    }
  }, [upload]);

  const filteredIcons = useMemo<LucideLibraryEntry[]>(() => (lucideLib ? lucideLib.search(query) : []), [lucideLib, query]);
  const filteredEmoji = useMemo<EmojiEntry[]>(() => (emojiLib ? emojiLib.search(query) : []), [emojiLib, query]);
  const recentIcons = useMemo<LucideLibraryEntry[]>(() => {
    if (!lucideLib || query.trim() !== "") return [];
    return recent.map((kebab) => lucideLib.byKebab.get(kebab)).filter((entry): entry is LucideLibraryEntry => Boolean(entry));
  }, [lucideLib, recent, query]);
  const recentEmojiEntries = useMemo<EmojiEntry[]>(() => {
    if (!emojiLib || query.trim() !== "") return [];
    return recentEmoji.map((slug) => emojiLib.bySlug.get(slug)).filter((entry): entry is EmojiEntry => Boolean(entry));
  }, [emojiLib, recentEmoji, query]);

  const choose = (content: GlyphContent, options: { keepOpen?: boolean; emojiSlug?: string } = {}) => {
    if (content.kind === "lucide") {
      const next = [content.name, ...recent.filter((name) => name !== content.name)].slice(0, RECENT_LIMIT);
      setRecent(next);
      writeRecents(RECENT_KEY, next);
    }
    if (content.kind === "emoji" && options.emojiSlug) {
      const slug = options.emojiSlug;
      const next = [slug, ...recentEmoji.filter((entry) => entry !== slug)].slice(0, RECENT_LIMIT);
      setRecentEmoji(next);
      writeRecents(RECENT_EMOJI_KEY, next);
    }
    // `sameGlyphContent` per its own doc comment: skip an `onChange` that
    // would not actually change anything (re-picking the icon already
    // selected shouldn't fire a host update, even though it still counts
    // as "picked" for Recent above and still closes the panel below).
    if (!sameGlyphContent(decoded, content)) onChange(encodeGlyphContent(content));
    if (!options.keepOpen) setOpen(false);
  };

  const stageFile = async (file: File) => {
    try {
      const prepared = await prepareIconImage(file);
      setUpload({ kind: "preview", prepared, previewUrl: URL.createObjectURL(prepared.file) });
      setTab("upload");
    } catch (cause) {
      setUpload({ kind: "error", message: cause instanceof Error ? cause.message : String(cause) });
      setTab("upload");
    }
  };

  const stageUrl = async (url: string) => {
    try {
      const file = await fetchIconFromUrl(url);
      await stageFile(file);
    } catch (cause) {
      const message = cause instanceof IconFetchError ? cause.message : cause instanceof Error ? cause.message : String(cause);
      setUpload({ kind: "error", message });
      setTab("upload");
    }
  };

  const saveUpload = async () => {
    if ((upload.kind !== "preview" && upload.kind !== "error") || !upload.prepared || !upload.previewUrl) return;
    const { prepared, previewUrl } = upload;
    setUpload({ kind: "saving", prepared, previewUrl });
    try {
      const dataUrl = await encodeUploadedIcon(prepared);
      choose({ kind: "image", src: dataUrl });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setUpload({ kind: "error", message: `couldn't encode this icon — ${message}`, prepared, previewUrl });
    }
  };

  // WHY a capture-phase listener on the document: a host canvas (tldraw,
  // React Flow) may register its own paste-to-canvas handler in the bubble
  // phase, so a capture listener here runs first for any paste targeting
  // an element, and `stopImmediatePropagation` keeps the host from ever
  // seeing it. Without this a paste meant for the picker could also drop a
  // second image onto the canvas behind it.
  useEffect(() => {
    if (!isOpen) return;
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const image = items.find((item) => item.type.startsWith("image/"));
      if (image) {
        const file = image.getAsFile();
        if (file) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void stageFile(file);
        }
        return;
      }
      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text || !URL_PATTERN.test(text)) return;
      // Only intercept a pasted URL on the Upload tab, or when nothing
      // else on the page is a typing target — a URL pasted into the
      // Icons/Emoji filter mid-search must fill that field, not hijack the
      // paste into Upload.
      if (tab !== "upload" && isTypingTarget(document.activeElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void stageUrl(text);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab]);

  // Base UI closes on Escape only when focus sits inside the popup —
  // reliably true here because the filter input autofocuses on open, but
  // this is the same explicit safety net this repo's own inspector
  // popover wrapper needed once measured focus didn't land where expected.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen]);

  const defaultTrigger = (
    <LucideGlyphResolver>
      <Glyph content={value} size={size} padding={padding} sizePreset={sizePreset} />
    </LucideGlyphResolver>
  );

  return (
    <Popover.Root open={isOpen} onOpenChange={(next) => setOpen(next)}>
      <Popover.Trigger
        data-slot="glyph-picker-trigger"
        data-empty={value === "" ? "true" : undefined}
        disabled={disabled}
        className={["GlyphPicker-trigger", className].filter(Boolean).join(" ")}
      >
        {children ?? defaultTrigger}
      </Popover.Trigger>
      <Popover.Portal container={portalContainer ?? undefined}>
        <Popover.Positioner className="GlyphPicker-positioner" side="bottom" align="start" sideOffset={6} collisionPadding={12}>
          <Popover.Popup
            className="GlyphPicker-panel"
            data-slot="glyph-picker-panel"
            role="dialog"
            aria-label="Glyph picker"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.target === searchRef.current) {
                event.preventDefault();
                const first = tab === "icons" ? filteredIcons[0] : tab === "emoji" ? filteredEmoji[0] : null;
                if (first) {
                  if (tab === "icons") choose({ kind: "lucide", name: (first as LucideLibraryEntry).kebab });
                  else choose({ kind: "emoji", char: applySkinTone(first as EmojiEntry, tone) }, { emojiSlug: (first as EmojiEntry).slug });
                }
              }
            }}
          >
            <div className="GlyphPicker-head">
              {(["emoji", "icons", "upload"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className="GlyphPicker-tab"
                  role="tab"
                  aria-selected={tab === candidate}
                  data-testid={`glyph-picker-tab-${candidate}`}
                  onClick={() => {
                    setTab(candidate);
                    setQuery("");
                    setToneOpen(false);
                  }}
                >
                  {candidate === "emoji" ? "Emoji" : candidate === "icons" ? "Icons" : "Upload"}
                </button>
              ))}
              <button type="button" className="GlyphPicker-remove" data-testid="glyph-picker-remove" onClick={() => choose({ kind: "none" })}>
                Remove
              </button>
            </div>

            {tab === "upload" ? (
              <UploadPanel
                stage={upload}
                urlValue={urlValue}
                onUrlValueChange={setUrlValue}
                onPickFile={(file) => void stageFile(file)}
                onPickUrl={(url) => void stageUrl(url)}
                onBack={() => setUpload({ kind: "empty" })}
                onCancel={() => setOpen(false)}
                onSave={() => void saveUpload()}
              />
            ) : (
              <>
                <div className="GlyphPicker-filter">
                  <label className="GlyphPicker-search">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      ref={searchRef}
                      type="text"
                      placeholder="Filter…"
                      autoComplete="off"
                      spellCheck={false}
                      value={query}
                      data-testid="glyph-picker-filter"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                    />
                    {query ? (
                      <button
                        type="button"
                        className="GlyphPicker-clear"
                        title="Clear"
                        onClick={() => {
                          setQuery("");
                          searchRef.current?.focus();
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" opacity=".5" fill="currentColor" />
                          <path d="m9 9 6 6m0-6-6 6" stroke="var(--bbox-panel-surface, #ffffff)" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    ) : null}
                  </label>
                  <button
                    type="button"
                    className="GlyphPicker-btn"
                    title={(tab === "icons" ? lucideLib : emojiLib) ? "Random" : "Loading…"}
                    disabled={!(tab === "icons" ? lucideLib : emojiLib)}
                    data-testid="glyph-picker-shuffle"
                    onClick={() => {
                      if (tab === "icons") {
                        const entry = randomEntry(filteredIcons);
                        if (entry) choose({ kind: "lucide", name: entry.kebab }, { keepOpen: true });
                      } else {
                        const entry = randomEntry(filteredEmoji);
                        if (entry) choose({ kind: "emoji", char: applySkinTone(entry, tone) }, { keepOpen: true, emojiSlug: entry.slug });
                      }
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m18 14 4 4-4 4" />
                      <path d="m18 2 4 4-4 4" />
                      <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
                      <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
                      <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
                    </svg>
                  </button>
                  {tab === "emoji" ? (
                    <span className="GlyphPicker-toneWrap">
                      <button
                        type="button"
                        className="GlyphPicker-btn"
                        title="Skin tone"
                        aria-haspopup="true"
                        data-testid="glyph-picker-tone"
                        onClick={() => setToneOpen((current) => !current)}
                      >
                        {TONE_HANDS[tone]}
                      </button>
                      {toneOpen ? (
                        <div className="GlyphPicker-tonePop" role="menu">
                          {TONE_HANDS.map((hand, index) => (
                            <button
                              key={hand}
                              type="button"
                              aria-pressed={tone === index}
                              onClick={() => {
                                setTone(index);
                                writeSkinTone(index);
                                setToneOpen(false);
                              }}
                            >
                              {hand}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </span>
                  ) : null}
                </div>

                <div className="GlyphPicker-body">
                  {!lucideLib || !emojiLib ? (
                    <div className="GlyphPicker-empty">Loading…</div>
                  ) : tab === "icons" ? (
                    <IconsGrid
                      entries={filteredIcons}
                      recent={recentIcons}
                      query={query}
                      decoded={decoded}
                      onChoose={(kebab) => choose({ kind: "lucide", name: kebab })}
                    />
                  ) : (
                    <EmojiGrid
                      entries={filteredEmoji}
                      recent={recentEmojiEntries}
                      groups={emojiLib.groups}
                      query={query}
                      tone={tone}
                      decoded={decoded}
                      onChoose={(char, slug) => choose({ kind: "emoji", char }, { emojiSlug: slug })}
                    />
                  )}
                </div>

                <div className="GlyphPicker-foot">
                  <span>
                    {tab === "icons"
                      ? lucideLib
                        ? `Lucide ${lucideLib.version} · ${lucideLib.entries.length} icons · ${filteredIcons.length} shown`
                        : ""
                      : emojiLib
                        ? `${emojiLib.entries.length} emoji · ${filteredEmoji.length} shown`
                        : ""}
                  </span>
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function WindowedGrid<T>({ items, renderItem }: { items: readonly T[]; renderItem(item: T): ReactNode }) {
  const { gridRef, start, end, topPad, bottomPad } = useWindowedGrid(items.length);
  const visible = items.slice(start, end);
  return (
    <div className="GlyphPicker-grid" ref={gridRef}>
      {topPad > 0 ? <div aria-hidden="true" style={{ gridColumn: "1 / -1", height: topPad }} /> : null}
      {visible.map((item) => renderItem(item))}
      {bottomPad > 0 ? <div aria-hidden="true" style={{ gridColumn: "1 / -1", height: bottomPad }} /> : null}
    </div>
  );
}

function IconsGrid({
  entries,
  recent,
  query,
  decoded,
  onChoose,
}: {
  entries: readonly LucideLibraryEntry[];
  recent: readonly LucideLibraryEntry[];
  query: string;
  decoded: GlyphContent;
  onChoose(kebab: string): void;
}) {
  if (entries.length === 0) {
    return (
      <div className="GlyphPicker-empty">
        No icons match "{query}".
        <br />
        Try the Emoji tab, or Upload your own.
      </div>
    );
  }
  return (
    <>
      {recent.length > 0 ? (
        <>
          <div className="GlyphPicker-section">Recent</div>
          <div className="GlyphPicker-grid">
            {recent.map((entry) => (
              <IconCell key={`recent:${entry.kebab}`} entry={entry} selected={decoded.kind === "lucide" && decoded.name === entry.kebab} onChoose={onChoose} />
            ))}
          </div>
        </>
      ) : null}
      <div className="GlyphPicker-section">{query ? `Icons · ${entries.length}` : "Icons"}</div>
      <WindowedGrid
        items={entries}
        renderItem={(entry) => (
          <IconCell key={entry.kebab} entry={entry} selected={decoded.kind === "lucide" && decoded.name === entry.kebab} onChoose={onChoose} />
        )}
      />
    </>
  );
}

function IconCell({ entry, selected, onChoose }: { entry: LucideLibraryEntry; selected: boolean; onChoose(kebab: string): void }) {
  const title = entry.tags.length ? `${entry.kebab} · ${entry.tags.slice(0, 4).join(", ")}` : entry.kebab;
  return (
    <button
      type="button"
      className="GlyphPicker-cell"
      aria-selected={selected}
      title={title}
      data-testid={`glyph-picker-cell-lucide-${entry.kebab}`}
      onClick={() => onChoose(entry.kebab)}
    >
      <LucideNodeSvg node={entry.node} size={20} />
    </button>
  );
}

function EmojiGrid({
  entries,
  recent,
  groups,
  query,
  tone,
  decoded,
  onChoose,
}: {
  entries: readonly EmojiEntry[];
  recent: readonly EmojiEntry[];
  groups: readonly string[];
  query: string;
  tone: number;
  decoded: GlyphContent;
  onChoose(char: string, slug: string): void;
}) {
  if (entries.length === 0) {
    return <div className="GlyphPicker-empty">No emoji match "{query}".</div>;
  }
  const cell = (entry: EmojiEntry, keyPrefix = "") => {
    const char = applySkinTone(entry, tone);
    const title = entry.keywords.length ? `${entry.name} · ${entry.keywords.join(", ")}` : entry.name;
    return (
      <button
        key={`${keyPrefix}${entry.slug}`}
        type="button"
        className="GlyphPicker-cell GlyphPicker-cell--emoji"
        aria-selected={decoded.kind === "emoji" && decoded.char === char}
        title={title}
        data-testid={`glyph-picker-cell-emoji-${entry.slug}`}
        onClick={() => onChoose(char, entry.slug)}
        style={{ fontFamily: EMOJI_FONT_FAMILY }}
      >
        {char}
      </button>
    );
  };
  const recentSection =
    recent.length > 0 ? (
      <>
        <div className="GlyphPicker-section">Recent</div>
        <div className="GlyphPicker-grid">{recent.map((entry) => cell(entry, "recent:"))}</div>
      </>
    ) : null;
  if (query.trim()) {
    return (
      <>
        <div className="GlyphPicker-section">Emoji · {entries.length}</div>
        <WindowedGrid items={entries} renderItem={(entry) => cell(entry)} />
      </>
    );
  }
  return (
    <>
      {recentSection}
      {groups.map((group) => {
        const items = entries.filter((entry) => entry.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <div className="GlyphPicker-section">{group}</div>
            <WindowedGrid items={items} renderItem={(entry) => cell(entry)} />
          </div>
        );
      })}
    </>
  );
}

function UploadPanel({
  stage,
  urlValue,
  onUrlValueChange,
  onPickFile,
  onPickUrl,
  onBack,
  onCancel,
  onSave,
}: {
  stage: UploadStage;
  urlValue: string;
  onUrlValueChange(next: string): void;
  onPickFile(file: File): void;
  onPickUrl(url: string): void;
  onBack(): void;
  onCancel(): void;
  onSave(): void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // A failed save (`error` with `prepared`/`previewUrl` still attached)
  // renders through this same preview branch rather than falling to the
  // picker screen below: the file is still staged, so Back should return
  // to it, not discard the pick and make the person start over. Only
  // `saving` disables Back — a save that hasn't failed or finished yet is
  // the one moment there's nothing safe to go back to.
  if (stage.kind === "preview" || stage.kind === "saving" || (stage.kind === "error" && stage.prepared)) {
    const previewUrl = stage.previewUrl ?? "";
    return (
      <div className="GlyphPicker-upload">
        <div className="GlyphPicker-preview">
          <div className="GlyphPicker-previewLabel">Preview</div>
          <div className="GlyphPicker-previewChip">
            <img src={previewUrl} alt="" />
            <span>Glyph</span>
          </div>
          {stage.kind === "error" ? (
            <div className="GlyphPicker-uploadError">{stage.message}</div>
          ) : (
            <div className="GlyphPicker-previewMeta">{describeUpload(stage.prepared)}</div>
          )}
        </div>
        <div className="GlyphPicker-actions">
          <button type="button" onClick={onBack} disabled={stage.kind === "saving"}>
            Back
          </button>
          <button type="button" className="GlyphPicker-save" onClick={onSave} disabled={stage.kind === "saving"}>
            {stage.kind === "saving" ? "Saving…" : stage.kind === "error" ? "Retry" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="GlyphPicker-upload">
      <button
        type="button"
        className={`GlyphPicker-uploadButton${dragOver ? " is-drop" : ""}`}
        data-testid="glyph-picker-upload-button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event: DragEvent<HTMLButtonElement>) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event: DragEvent<HTMLButtonElement>) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          if (file) onPickFile(file);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        Upload an image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.svg"
        hidden
        data-testid="glyph-picker-file-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) onPickFile(file);
          event.target.value = "";
        }}
      />
      <form
        className="GlyphPicker-uploadUrl"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (urlValue.trim()) onPickUrl(urlValue.trim());
        }}
      >
        <input
          type="url"
          placeholder="Or paste an image URL"
          value={urlValue}
          data-testid="glyph-picker-url-input"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onUrlValueChange(event.target.value)}
        />
        <button type="submit" data-testid="glyph-picker-url-fetch" disabled={!urlValue.trim()}>
          Fetch
        </button>
      </form>
      <div className="GlyphPicker-uploadHint">or Ctrl+V to paste an image or link</div>
      {stage.kind === "error" ? <div className="GlyphPicker-uploadError">{stage.message}</div> : null}
      <div className="GlyphPicker-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="GlyphPicker-save" disabled>
          Save
        </button>
      </div>
    </div>
  );
}
