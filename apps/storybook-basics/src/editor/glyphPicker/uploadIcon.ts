/**
 * src/editor/glyphPicker/uploadIcon.ts — the trunk-lineage copy of
 * packages/glyph-picker/src/uploadIcon.ts (see glyphPicker.tsx's header for why
 * two copies exist). Identical but for its import paths
 *
 * The Upload tab's pipeline: turn whatever a person hands the picker (a
 * file input, a drop, a paste, or a pasted URL) into a small, self-
 * contained image `content` string a Glyph can carry.
 *
 * Ported BY VALUE from SystemSketch's `iconPicker/uploadIcon.ts`. The
 * downscale math, the SVG-passthrough rule, and the size caps are
 * unchanged; `createIconAsset(editor, prepared)` — the one tldraw touch in
 * the donor file — is replaced by `encodeUploadedIcon`, which needs no
 * host engine at all: docs/GLYPH-PLAN.md's D3 is uploads as a `content`
 * data URL, no tldraw asset record, so there is nothing here for a host to
 * register — the encoded string IS the stored value.
 */

/** The longest edge a raster icon is allowed to keep. SVGs pass through unscaled. */
export const ICON_MAX_EDGE_PX = 256;

// WHY a size cap on SVGs when rasters are already bounded by ICON_MAX_EDGE_PX:
// an SVG passes through byte-for-byte (see prepareIconImage below), so there
// is no downscale step to shrink a pathological file the way there is for a
// raster. Without a ceiling here, a multi-megabyte vector (embedded raster
// data, thousands of paths) sails past every other guard and would sit
// inline in a Glyph's `content` string forever.
export const ICON_MAX_SVG_BYTES = 1024 * 1024;

export interface PreparedIconImage {
  file: File;
  /** The stored (post-downscale) size — an SVG's is its own declared size. */
  width: number;
  height: number;
  /** The source raster's size before downscaling; equal to `width`/`height` for an SVG. */
  originalWidth: number;
  originalHeight: number;
  originalBytes: number;
  storedBytes: number;
  kind: "svg" | "png";
}

/**
 * The downscale math on its own, with no `createImageBitmap`/canvas
 * dependency — jsdom (and plain Node) has neither, so this is the seam a
 * vitest exercises directly rather than skipping the ratio math entirely.
 */
export function scaledIconDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, ICON_MAX_EDGE_PX / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Shared with the preview meta line and this module's own error messages,
 * so a size only ever gets formatted one way.
 */
export function formatIconBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.max(0, Math.round(bytes))} B`;
}

/**
 * `FileReader.readAsText`, not `Blob.prototype.text()`/`arrayBuffer()`:
 * jsdom's `Blob`/`File` polyfill (the environment `GlyphPicker.test.tsx`
 * runs under) implements neither of those newer convenience methods, but
 * does implement `FileReader` — a real browser supports every one of
 * these equally, so this costs nothing there and is what actually runs
 * under this repo's test environment.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("could not read the file"));
    reader.readAsText(file);
  });
}

function isSvg(file: File): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

/** An SVG's own `width`/`height` (or `viewBox`), when it declares one; else a 1:1 guess. */
function svgDimensions(source: string): { width: number; height: number } {
  const width = Number(/width="([\d.]+)"/.exec(source)?.[1]);
  const height = Number(/height="([\d.]+)"/.exec(source)?.[1]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  const viewBox = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(source);
  if (viewBox) {
    const vbWidth = Number(viewBox[1]);
    const vbHeight = Number(viewBox[2]);
    if (vbWidth > 0 && vbHeight > 0) return { width: vbWidth, height: vbHeight };
  }
  return { width: ICON_MAX_EDGE_PX, height: ICON_MAX_EDGE_PX };
}

/**
 * SVG passes through untouched — it is already vector and already small.
 * Any raster is decoded, downscaled so its longest edge is at most
 * `ICON_MAX_EDGE_PX`, and re-encoded to PNG so a picked JPEG/WEBP/HEIC all
 * land on the one format a Glyph's `<img>` has to trust.
 */
export async function prepareIconImage(file: File): Promise<PreparedIconImage> {
  const originalBytes = file.size;
  if (isSvg(file)) {
    if (originalBytes > ICON_MAX_SVG_BYTES) {
      // WHY exact KB here and not formatIconBytes' MB rounding: MB at one
      // decimal collapses anything from ~1,000 KB to ~1,098 KB down to
      // "1.0 MB" — a 1,075 KB file reads back as "this SVG is 1.0 MB — the
      // largest an icon can be is 1.0 MB", which looks like the check is
      // broken. KB is fine-grained enough that the file's size and the
      // limit are never printed the same when they differ.
      const fileKb = Math.round(originalBytes / 1024).toLocaleString();
      const limitKb = Math.round(ICON_MAX_SVG_BYTES / 1024).toLocaleString();
      throw new Error(`this SVG is ${fileKb} KB; the limit is ${limitKb} KB`);
    }
    const text = await readFileAsText(file);
    const { width, height } = svgDimensions(text);
    return {
      file,
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      originalBytes,
      storedBytes: originalBytes,
      kind: "svg",
    };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = scaledIconDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("could not get a 2d canvas context to downscale the image");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("canvas.toBlob produced no image"));
      }, "image/png");
    });
    const scaledFile = new File([blob], renamedToPng(file.name), { type: "image/png" });
    return {
      file: scaledFile,
      width,
      height,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      originalBytes,
      storedBytes: blob.size,
      kind: "png",
    };
  } finally {
    bitmap.close();
  }
}

function renamedToPng(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "icon"}.png`;
}

/**
 * `PreparedIconImage.file` → a `data:` URL, the exact string a Glyph's
 * `content` prop stores for an upload (docs/GLYPH-PLAN.md's grammar: a
 * bare `data:`/`http(s):` URL decodes to `{kind:"image"}`, no prefix
 * needed). `FileReader.readAsDataURL` reads the file's own declared MIME
 * type, so an SVG comes back `data:image/svg+xml;base64,...` and a
 * downscaled raster `data:image/png;base64,...` — the same call handles
 * both `PreparedIconImage.kind`s.
 *
 * WHY this replaces the donor's `createIconAsset(editor, prepared)`: that
 * function registered a tldraw asset record and returned its id; D3 in the
 * plan is uploads staying inline, self-contained strings — no store, no
 * asset id, so there is nothing to register and nothing async beyond the
 * read itself.
 */
export function encodeUploadedIcon(prepared: PreparedIconImage): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("could not read the prepared image"));
    reader.readAsDataURL(prepared.file);
  });
}

export class IconFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IconFetchError";
    this.status = status;
  }
}

/**
 * Fetches a pasted/typed image URL directly from the browser.
 *
 * WHY not proxied through a host server, unlike the donor (SystemSketch's
 * own Python host, `POST /api/icon/fetch`): this package ships with no
 * backend of its own — off-the-shelf first means not building one just for
 * this. The tradeoff this accepts: a cross-origin image with no
 * CORS-friendly headers taints the canvas `prepareIconImage`'s raster path
 * draws it into (rasters only — an SVG never touches canvas), so a URL
 * paste against such a host fails at the downscale step rather than at the
 * fetch. Every same-origin or CORS-permissive image (the common case for a
 * direct image link) works exactly as pasting the file itself would.
 */
export async function fetchIconFromUrl(url: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new IconFetchError(cause instanceof Error ? cause.message : String(cause), 0);
  }
  if (!response.ok) {
    throw new IconFetchError(`request failed (${response.status})`, response.status);
  }
  const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
  const bytes = await response.arrayBuffer();
  const name = nameFromUrl(url, contentType);
  return new File([bytes], name, { type: contentType });
}

function nameFromUrl(url: string, contentType: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to a synthesized name
  }
  const extension = contentType === "image/svg+xml" ? "svg" : contentType.split("/")[1] || "png";
  return `icon.${extension}`;
}
