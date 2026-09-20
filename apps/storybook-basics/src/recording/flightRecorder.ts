// src/recording/flightRecorder.ts — PORTED VERBATIM from the archive:
// /home/bam/systemsketch/src/recorder/flightRecorder.ts:1-897 (read on disk
// 2026-09-19, 896 lines). Zach, 2026-09-19: "Please copy the source code of
// the recording exactly.. as there is alot going on there with the screen
// shots, with the auto copy paste of the context, etc. etc."
//
// Exactly two edits, and no others:
//   * `./recorderEvents` -> `./recordingDiagnostics` (the module's name here);
//   * this header.
// Its own donor test suite came with it unchanged, as an independent oracle:
// recording/flightRecorder.test.ts (donor src/recorder/flightRecorder.test.ts).
//
// WHY this file sits in `recording/` and not `components/`: it is the ONE
// module of the feature that legitimately imports a canvas engine — it reads
// tldraw through `editor.on('event')`, `store.listen`, `getPath()` and
// `menus.getOpenMenus()`. `src/engineFree.test.ts` walls components/, scene/,
// editor/, presets/ and layout/ off from every engine; `recording/` is
// deliberately outside that wall, and `recordingPurity.test.ts` holds the
// INNER wall — the state machine next door imports neither tldraw, nor React,
// nor the DOM, and reaches this class only through `RecordingEffects`.
import {
  reverseRecordsDiff,
  type Editor,
  type HistoryEntry,
  type RecordsDiff,
  type TLEventInfo,
  type TLRecord,
  type TLStoreSnapshot,
} from 'tldraw'
import {
  subscribeRecorderDiagnostics,
  type RecorderDiagnosticEvent,
} from './recordingDiagnostics'

/**
 * The in-page half of the flight recorder.
 *
 * It listens to tldraw through its public seams only — `editor.on('event')`,
 * `store.listen`, `getPath()`, `menus.getOpenMenus()` — and to the window for
 * the keys and clicks tldraw never sees (a menu or a text field swallows the
 * key-down before the editor's document handler runs). Everything lands as
 * compact row per fact on ONE clock, `performance.now()` since the recorder
 * started. Large causal evidence lives in separately collected detail records
 * and complete store diffs, linked by ID from the compact row. Nothing here
 * writes to disk or talks to the host; see `recorderStore`.
 *
 * Measured in the spike that preceded this module: 2.1 ms of listener time
 * over an 8.4 s Block interaction (0.03 %). The product now starts it only for
 * an explicit take; the retrospective collection path remains available.
 */

export type RecorderLane =
  | 'input'
  | 'state'
  | 'menu'
  | 'store'
  | 'console'
  | 'dom'
  | 'mark'
  | 'network'
  | 'action'
  | 'workspace'
  | 'perf'
  | 'ui'
export type RecorderMode = 'last' | 'take'

export interface RecorderRow {
  /** Milliseconds since the recorder started (rebased to the window on save). */
  t: number
  lane: RecorderLane
  [key: string]: unknown
}

export interface RecorderDetail {
  id: string
  t: number
  lane: RecorderLane
  kind: string
  data: Record<string, unknown>
}

/** Full immutable records for replay; the timeline carries only their summary. */
export interface RecorderStoreDiff {
  id: string
  t: number
  source: string
  changes: RecordsDiff<TLRecord>
}

export interface RecorderHeader {
  mode: RecorderMode
  startedAt: string
  endedAt: string
  startedAtWall: number
  endedAtWall: number
  durationMs: number
  windowMs: number
  note: string
  url: string
  userAgent: string
  devicePixelRatio: number
  viewport: { w: number; h: number }
  screenBounds: unknown
  camera: unknown
  pageId: string
  shapeCount: number
  pathAtStart: string
  pathAtEnd: string
  selectedAtStart: string[]
  selectedAtEnd: string[]
  recorderUptimeMs: number
  recorderCostMs: number
  rowsDropped: number
  windowId: string
  environment: {
    locale: string
    languages: readonly string[]
    timeZone: string
    platform: string
    hardwareConcurrency: number | null
    colorScheme: string
    theme: string
    interfaceScale: string
    visibilityState: string
  }
  performance: {
    longTasks: number
    maxLongTaskMs: number
    rafStalls: number
    maxRafGapMs: number
  }
}

export interface RecordingPayload {
  header: RecorderHeader
  rows: RecorderRow[]
  details: RecorderDetail[]
  storeDiffs: RecorderStoreDiff[]
  startSnapshot: TLStoreSnapshot
  endSnapshot: TLStoreSnapshot
}

export interface FlightRecorderOptions {
  windowMs?: number
  /** Injected clocks so the window logic can be unit-tested. */
  now?: () => number
  wallNow?: () => number
  /** A DOM to listen on for the `dom` lane; omit to skip that lane. */
  domTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
}

export const DEFAULT_WINDOW_MS = 30_000
export const MIN_WINDOW_MS = 5_000
export const MAX_WINDOW_MS = 120_000
export const WINDOW_CHOICES_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const
type ConsoleLevel = (typeof CONSOLE_LEVELS)[number]

export function clampWindowMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WINDOW_MS
  return Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, Math.round(value)))
}

/** Drop everything older than `cutoff` from the front of a time-ordered list. */
export function trimBefore<T extends { t: number }>(items: T[], cutoff: number): number {
  let dropped = 0
  while (items.length && items[0].t < cutoff) {
    items.shift()
    dropped += 1
  }
  return dropped
}

interface StoreOp {
  op: 'add' | 'update' | 'remove'
  id: string
  type: string
  delta?: Record<string, unknown>
}

/** A readable summary of a store diff: what changed, by record and by key. */
export function summariseDiff(changes: RecordsDiff<TLRecord>): StoreOp[] {
  const ops: StoreOp[] = []
  for (const record of Object.values(changes.added)) {
    ops.push({ op: 'add', id: record.id, type: recordType(record) })
  }
  for (const record of Object.values(changes.removed)) {
    ops.push({ op: 'remove', id: record.id, type: recordType(record) })
  }
  for (const [before, after] of Object.values(changes.updated)) {
    if (after.typeName === 'pointer') continue // 60 Hz duplicate of the input lane
    const delta: Record<string, unknown> = {}
    let changed = 0
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      const next = JSON.stringify(after[key])
      if (next === JSON.stringify(before[key])) continue
      changed += 1
      delta[key as string] = next.length <= 160 ? after[key] : `<${next.length} chars>`
    }
    if (changed === 0) continue
    ops.push({ op: 'update', id: after.id, type: recordType(after), delta })
  }
  return ops
}

function recordType(record: TLRecord): string {
  return 'type' in record && typeof record.type === 'string' ? record.type : record.typeName
}

/**
 * Walk a store snapshot BACK through a list of diffs, newest first, to the
 * state at the window's tail. This is what makes a retroactive save replayable:
 * `startSnapshot` + the store lane reproduces every instant in the window.
 */
export function rewindSnapshot(end: TLStoreSnapshot, diffs: RecordsDiff<TLRecord>[]): TLStoreSnapshot {
  const store: Record<string, TLRecord> = { ...(end.store as Record<string, TLRecord>) }
  for (let index = diffs.length - 1; index >= 0; index -= 1) {
    const reversed = reverseRecordsDiff(diffs[index]) as RecordsDiff<TLRecord>
    for (const id of Object.keys(reversed.removed)) delete store[id]
    for (const [id, record] of Object.entries(reversed.added)) store[id] = record
    for (const [id, [, after]] of Object.entries(reversed.updated)) store[id] = after
  }
  return { ...end, store: store as TLStoreSnapshot['store'] }
}

function compactEvent(editor: Editor, info: TLEventInfo): Record<string, unknown> {
  const out: Record<string, unknown> = { name: info.name, type: info.type }
  if ('point' in info && info.point) out.screen = [Math.round(info.point.x), Math.round(info.point.y)]
  if (info.name.startsWith('pointer')) {
    const page = editor.inputs.currentPagePoint
    out.page = [Math.round(page.x), Math.round(page.y)]
  }
  if ('target' in info && info.target) out.target = info.target
  if ('shape' in info && info.shape) out.shape = { id: info.shape.id, type: info.shape.type }
  if ('handle' in info && info.handle) out.handle = typeof info.handle === 'string' ? info.handle : info.handle.id
  if ('button' in info && typeof info.button === 'number') out.button = info.button
  if ('key' in info && info.key) out.key = info.key
  if ('code' in info && info.code) out.code = info.code
  const flags = info as unknown as Record<string, unknown>
  const mods = (['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const).filter((key) => flags[key] === true)
  if (mods.length) out.mods = mods
  if ('isPen' in info && info.isPen) out.pen = true
  return out
}

/** Which UI element a DOM event landed on, in the terms a person would use. */
export function describeDomTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target?.constructor?.name ?? 'window')
  const labelled = target.closest('[aria-label],[data-testid],button,[role="menuitem"],input,textarea,[contenteditable="true"]') ?? target
  const tag = labelled.tagName.toLowerCase()
  const label = labelled.getAttribute('aria-label') ?? labelled.getAttribute('data-testid') ?? labelled.getAttribute('title')
  const role = labelled.getAttribute('role')
  const text = tag === 'button' || role === 'menuitem' ? (labelled.textContent ?? '').trim().slice(0, 32) : ''
  const name = label ?? text
  return name ? `${tag}${role ? `[${role}]` : ''} “${name}”` : `${tag}${role ? `[${role}]` : ''}`
}

function elementDetail(element: Element): Record<string, unknown> {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const tag = element.tagName.toLowerCase()
  const role = element.getAttribute('role') ?? undefined
  const label = element.getAttribute('aria-label')
    ?? element.getAttribute('data-testid')
    ?? element.getAttribute('title')
    ?? ((tag === 'button' || role === 'menuitem') ? (element.textContent ?? '').trim().slice(0, 80) : '')
    ?? undefined
  const resourceUrl = element.getAttribute('src') ?? element.getAttribute('href')
  return {
    target: describeDomTarget(element),
    tag,
    role,
    label: label || undefined,
    testId: element.getAttribute('data-testid') ?? undefined,
    action: element.getAttribute('data-action') ?? undefined,
    resource: resourceUrl ? safeUrl(resourceUrl) : undefined,
    rect: {
      x: +rect.x.toFixed(1),
      y: +rect.y.toFixed(1),
      w: +rect.width.toFixed(1),
      h: +rect.height.toFixed(1),
    },
    style: {
      position: style.position,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      display: style.display,
      opacity: style.opacity,
    },
  }
}

function uiHitDetail(event: MouseEvent | PointerEvent): Record<string, unknown> {
  const point = { x: Math.round(event.clientX), y: Math.round(event.clientY) }
  const stack = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(event.clientX, event.clientY).slice(0, 8).map(elementDetail)
    : []
  return {
    event: event.type,
    point,
    target: event.target instanceof Element ? elementDetail(event.target) : describeDomTarget(event.target),
    activeElement: document.activeElement instanceof Element ? elementDetail(document.activeElement) : null,
    hitStack: stack,
  }
}

function errorDetail(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause instanceof Error
        ? { name: value.cause.name, message: value.cause.message, stack: value.cause.stack }
        : value.cause === undefined ? undefined : stringifyArgument(value.cause, 4_000),
    }
  }
  return { value: stringifyArgument(value, 8_000) }
}

function safeWindowId(): string {
  if (typeof window === 'undefined') return 'server'
  const key = 'systemsketch.recorder.window-id.v1'
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const next = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `window-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(key, next)
    return next
  } catch {
    return `window-${Date.now().toString(36)}`
  }
}

function safeUrl(value: RequestInfo | URL): string {
  try {
    const raw = typeof value === 'string' || value instanceof URL ? String(value) : value.url
    const url = new URL(raw, location.href)
    const names = [...url.searchParams.keys()]
    return `${url.origin === location.origin ? '' : url.origin}${url.pathname}${names.length ? `?${names.map((name) => `${encodeURIComponent(name)}=<redacted>`).join('&')}` : ''}`
  } catch {
    return '<unparseable URL>'
  }
}

function bodyBytes(body: BodyInit | null | undefined): number | null {
  if (typeof body === 'string') return new TextEncoder().encode(body).length
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString()).length
  if (body instanceof Blob) return body.size
  if (body instanceof ArrayBuffer) return body.byteLength
  if (ArrayBuffer.isView(body)) return body.byteLength
  return null
}

export class FlightRecorder {
  readonly windowMs: number
  private readonly editor: Editor
  private readonly now: () => number
  private readonly wallNow: () => number
  private readonly domTarget: FlightRecorderOptions['domTarget']
  private rows: RecorderRow[] = []
  private details: RecorderDetail[] = []
  private diffs: RecorderStoreDiff[] = []
  private sequence = 0
  private t0 = 0
  private wall0 = 0
  private costMs = 0
  private dropped = 0
  private lastPath = ''
  private lastMenus = ''
  private take: { t: number; wall: number; snapshot: TLStoreSnapshot; path: string; selected: string[] } | null = null
  private disposers: (() => void)[] = []
  private originalConsole: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {}
  private originalFetch: typeof window.fetch | null = null
  private longTasks = 0
  private maxLongTaskMs = 0
  private rafStalls = 0
  private maxRafGapMs = 0
  running = false

  constructor(editor: Editor, options: FlightRecorderOptions = {}) {
    this.editor = editor
    this.windowMs = clampWindowMs(options.windowMs ?? DEFAULT_WINDOW_MS)
    this.now = options.now ?? (() => performance.now())
    this.wallNow = options.wallNow ?? (() => Date.now())
    this.domTarget = options.domTarget === undefined ? (typeof window === 'undefined' ? null : window) : options.domTarget
  }

  /** Milliseconds since start; the recorder's clock. */
  elapsed(): number {
    return this.now() - this.t0
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.t0 = this.now()
    this.wall0 = this.wallNow()
    this.rows = []
    this.details = []
    this.diffs = []
    this.sequence = 0
    this.costMs = 0
    this.dropped = 0
    this.longTasks = 0
    this.maxLongTaskMs = 0
    this.rafStalls = 0
    this.maxRafGapMs = 0
    this.lastPath = this.editor.getPath()
    this.lastMenus = this.editor.menus.getOpenMenus().join(',')

    const onEvent = this.timed((info: TLEventInfo) => {
      if (info.name === 'tick') return
      this.push('input', compactEvent(this.editor, info))
      this.checkDerived(info.name)
    })
    this.editor.on('event', onEvent)
    this.disposers.push(() => this.editor.off('event', onEvent))

    const onCrash = ({ error }: { error: unknown }) => {
      this.pushDetailed(
        'console',
        'editor-crash',
        { level: 'error', args: [`editor crash: ${error instanceof Error ? error.message : String(error)}`] },
        errorDetail(error),
      )
    }
    this.editor.on('crash', onCrash)
    this.disposers.push(() => this.editor.off('crash', onCrash))

    this.disposers.push(
      this.editor.store.listen(
        this.timed((entry: HistoryEntry<TLRecord>) => {
          const ops = summariseDiff(entry.changes)
          if (ops.length) {
            const id = this.nextId('store')
            const t = this.push('store', { source: entry.source, ops, detail: id })
            this.diffs.push({ id, t, source: String(entry.source), changes: entry.changes })
          }
          this.checkDerived('store')
        }),
        { scope: 'all', source: 'all' },
      ),
    )

    for (const level of CONSOLE_LEVELS) {
      const original = console[level] as (...args: unknown[]) => void
      this.originalConsole[level] = original
      console[level] = (...args: unknown[]) => {
        try {
          this.pushDetailed(
            'console',
            'console',
            { level, args: args.slice(0, 8).map((argument) => stringifyArgument(argument)) },
            {
              level,
              arguments: args.slice(0, 16).map((argument) => (
                argument instanceof Error ? errorDetail(argument) : stringifyArgument(argument, 8_000)
              )),
            },
          )
        } catch {
          // Recording a console line must never break the console.
        }
        original.apply(console, args)
      }
    }
    this.disposers.push(() => {
      for (const level of CONSOLE_LEVELS) {
        const original = this.originalConsole[level]
        if (original) console[level] = original as typeof console.log
      }
    })

    if (this.domTarget) {
      const dom = this.domTarget
      const onError = (event: Event) => {
        if (event instanceof ErrorEvent) {
          const detail = {
            ...errorDetail(event.error ?? event.message),
            source: event.filename,
            line: event.lineno,
            column: event.colno,
          }
          this.pushDetailed('console', 'uncaught-error', {
            level: 'error', args: [event.message], uncaught: true,
          }, detail)
          return
        }
        if ('reason' in event) {
          const reason = (event as PromiseRejectionEvent).reason
          this.pushDetailed('console', 'unhandled-rejection', {
            level: 'error', args: [stringifyArgument(reason)], uncaught: true,
          }, errorDetail(reason))
          return
        }
        const resource = event.target instanceof Element ? elementDetail(event.target) : { target: describeDomTarget(event.target) }
        this.pushDetailed('network', 'resource-error', {
          name: 'resource-error', summary: `resource failed on ${describeDomTarget(event.target)}`, level: 'error',
        }, resource)
      }
      const onKey = this.timed((event: Event) => {
        const key = event as KeyboardEvent
        const sensitive = event.target instanceof HTMLInputElement && event.target.type === 'password'
        this.push('dom', {
          event: event.type,
          key: sensitive && key.key.length === 1 ? '<redacted>' : key.key,
          code: key.code,
          on: describeDomTarget(event.target),
          mods: (['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const).filter((name) => key[name]),
        })
      })
      const onPointer = this.timed((event: Event) => {
        const pointer = event as PointerEvent
        const compact = {
          event: event.type,
          button: pointer.button,
          buttons: pointer.buttons,
          pointerType: pointer.pointerType,
          screen: [Math.round(pointer.clientX), Math.round(pointer.clientY)],
          on: describeDomTarget(event.target),
        }
        if (event.type === 'pointerdown' || event.type === 'click') {
          this.pushDetailed('dom', 'ui-hit', compact, uiHitDetail(pointer))
        } else {
          this.push('dom', compact)
        }
      })
      const onFocus = this.timed((event: Event) => {
        this.pushDetailed('ui', 'focus', {
          name: event.type,
          summary: `${event.type} ${describeDomTarget(event.target)}`,
        }, {
          event: event.type,
          target: event.target instanceof Element ? elementDetail(event.target) : describeDomTarget(event.target),
          relatedTarget: event instanceof FocusEvent && event.relatedTarget instanceof Element
            ? elementDetail(event.relatedTarget)
            : null,
        })
      })
      const onText = this.timed((event: Event) => {
        const input = event as InputEvent
        this.push('ui', {
          name: event.type,
          summary: `${event.type} on ${describeDomTarget(event.target)}`,
          inputType: input.inputType || undefined,
          dataLength: typeof input.data === 'string' ? input.data.length : 0,
          composing: input.isComposing,
          on: describeDomTarget(event.target),
        })
      })
      const onWheel = this.timed((event: Event) => {
        const wheel = event as WheelEvent
        this.push('ui', {
          name: 'wheel', summary: `wheel on ${describeDomTarget(event.target)}`,
          delta: [Math.round(wheel.deltaX), Math.round(wheel.deltaY), Math.round(wheel.deltaZ)],
          mode: wheel.deltaMode,
          on: describeDomTarget(event.target),
        })
      })
      const onResize = this.timed(() => {
        this.push('ui', {
          name: 'resize', summary: `viewport ${innerWidth}×${innerHeight}`,
          viewport: { w: innerWidth, h: innerHeight },
          visualViewport: window.visualViewport ? {
            w: +window.visualViewport.width.toFixed(1),
            h: +window.visualViewport.height.toFixed(1),
            scale: window.visualViewport.scale,
            x: window.visualViewport.offsetLeft,
            y: window.visualViewport.offsetTop,
          } : null,
        })
      })
      const onVisibility = this.timed(() => {
        this.push('ui', { name: 'visibility', summary: `document ${document.visibilityState}`, state: document.visibilityState })
      })
      dom.addEventListener('error', onError)
      dom.addEventListener('unhandledrejection', onError)
      dom.addEventListener('keydown', onKey, true)
      dom.addEventListener('keyup', onKey, true)
      dom.addEventListener('pointerdown', onPointer, true)
      dom.addEventListener('pointerup', onPointer, true)
      dom.addEventListener('pointercancel', onPointer, true)
      dom.addEventListener('click', onPointer, true)
      dom.addEventListener('focusin', onFocus, true)
      dom.addEventListener('focusout', onFocus, true)
      dom.addEventListener('beforeinput', onText, true)
      dom.addEventListener('input', onText, true)
      dom.addEventListener('compositionstart', onText, true)
      dom.addEventListener('compositionend', onText, true)
      dom.addEventListener('wheel', onWheel, true)
      dom.addEventListener('resize', onResize)
      document.addEventListener('visibilitychange', onVisibility)
      this.disposers.push(() => {
        dom.removeEventListener('error', onError)
        dom.removeEventListener('unhandledrejection', onError)
        dom.removeEventListener('keydown', onKey, true)
        dom.removeEventListener('keyup', onKey, true)
        dom.removeEventListener('pointerdown', onPointer, true)
        dom.removeEventListener('pointerup', onPointer, true)
        dom.removeEventListener('pointercancel', onPointer, true)
        dom.removeEventListener('click', onPointer, true)
        dom.removeEventListener('focusin', onFocus, true)
        dom.removeEventListener('focusout', onFocus, true)
        dom.removeEventListener('beforeinput', onText, true)
        dom.removeEventListener('input', onText, true)
        dom.removeEventListener('compositionstart', onText, true)
        dom.removeEventListener('compositionend', onText, true)
        dom.removeEventListener('wheel', onWheel, true)
        dom.removeEventListener('resize', onResize)
        document.removeEventListener('visibilitychange', onVisibility)
      })

      this.installFetchRecorder()
      this.installPerformanceRecorder()
    }

    this.disposers.push(subscribeRecorderDiagnostics((event) => this.recordDiagnostic(event)))
  }

  private installFetchRecorder(): void {
    if (typeof window === 'undefined' || this.originalFetch) return
    const original = window.fetch.bind(window)
    this.originalFetch = window.fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = this.now()
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const url = safeUrl(input)
      const requestBytes = bodyBytes(init?.body)
      try {
        const response = await original(input, init)
        const durationMs = +(this.now() - started).toFixed(1)
        const compact = {
          name: 'fetch',
          summary: `${method} ${url} → ${response.status} in ${durationMs} ms`,
          method,
          url,
          status: response.status,
          ok: response.ok,
          durationMs,
          level: response.ok ? 'info' : 'error',
        }
        this.pushDetailed('network', 'fetch', compact, {
          ...compact,
          requestBytes,
          responseBytes: Number(response.headers.get('content-length')) || null,
          responseType: response.headers.get('content-type'),
          redirected: response.redirected,
          responseUrl: safeUrl(response.url),
        })
        return response
      } catch (cause) {
        const durationMs = +(this.now() - started).toFixed(1)
        this.pushDetailed('network', 'fetch-error', {
          name: 'fetch', summary: `${method} ${url} failed after ${durationMs} ms`, method, url, durationMs, level: 'error',
        }, { method, url, durationMs, requestBytes, error: errorDetail(cause) })
        throw cause
      }
    }
    this.disposers.push(() => {
      if (this.originalFetch) window.fetch = this.originalFetch
      this.originalFetch = null
    })
  }

  private installPerformanceRecorder(): void {
    if (typeof window === 'undefined') return
    let observer: PerformanceObserver | null = null
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTasks += 1
            this.maxLongTaskMs = Math.max(this.maxLongTaskMs, entry.duration)
            this.pushDetailed('perf', 'long-task', {
              name: 'long-task',
              summary: `main thread blocked for ${entry.duration.toFixed(1)} ms`,
              durationMs: +entry.duration.toFixed(1),
              level: entry.duration >= 100 ? 'warn' : 'info',
            }, {
              name: entry.name,
              entryType: entry.entryType,
              startTime: entry.startTime,
              durationMs: entry.duration,
              attribution: 'attribution' in entry ? (entry as PerformanceEntry & { attribution?: unknown }).attribution : undefined,
            })
          }
        })
        observer.observe({ type: 'longtask', buffered: false })
      } catch {
        observer = null
      }
    }

    let frame = 0
    let previous = this.now()
    const monitor = () => {
      const current = this.now()
      const gap = current - previous
      previous = current
      if (gap >= 80 && document.visibilityState === 'visible') {
        this.rafStalls += 1
        this.maxRafGapMs = Math.max(this.maxRafGapMs, gap)
        this.push('perf', {
          name: 'raf-stall',
          summary: `animation frame gap ${gap.toFixed(1)} ms`,
          durationMs: +gap.toFixed(1),
          level: gap >= 150 ? 'warn' : 'info',
        })
      }
      frame = requestAnimationFrame(monitor)
    }
    frame = requestAnimationFrame(monitor)
    this.disposers.push(() => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
    })
  }

  private recordDiagnostic(event: RecorderDiagnosticEvent): void {
    const compact = {
      name: event.name,
      summary: event.summary,
      level: event.level ?? 'info',
    }
    if (event.detail) this.pushDetailed(event.lane, event.name, compact, event.detail)
    else this.push(event.lane, compact)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    for (const dispose of this.disposers.splice(0)) dispose()
    this.take = null
  }

  mark(text: string): void {
    if (!this.running) return
    this.push('mark', { text })
  }

  /** Begin an explicit take: the window now starts here rather than N s ago. */
  beginTake(): void {
    if (!this.running) return
    this.take = {
      t: this.elapsed(),
      wall: this.wallNow(),
      snapshot: this.editor.store.getStoreSnapshot('all'),
      path: this.editor.getPath(),
      selected: this.editor.getSelectedShapeIds() as string[],
    }
    this.push('mark', { text: 'take started' })
  }

  get takeStartedAtWall(): number | null {
    return this.take?.wall ?? null
  }

  get isTaking(): boolean {
    return this.take !== null
  }

  /** Assemble what the host will write. Ends a take if one is running. */
  collect(mode: RecorderMode, note = ''): RecordingPayload {
    if (!this.running) throw new Error('the recorder is not running')
    this.trim()
    const endT = this.elapsed()
    const endWall = this.wallNow()
    const endSnapshot = this.editor.store.getStoreSnapshot('all')
    const take = mode === 'take' ? this.take : null
    const startT = take ? take.t : Math.max(0, endT - this.windowMs)
    const startWall = take ? take.wall : endWall - (endT - startT)
    const rows: RecorderRow[] = this.rows
      .filter((row) => row.t >= startT)
      .map((row) => ({ ...row, t: +(row.t - startT).toFixed(1) }))
    const details: RecorderDetail[] = this.details
      .filter((detail) => detail.t >= startT)
      .map((detail) => ({ ...detail, t: +(detail.t - startT).toFixed(1) }))
    const storeDiffs: RecorderStoreDiff[] = this.diffs
      .filter((diff) => diff.t >= startT)
      .map((diff) => ({ ...diff, t: +(diff.t - startT).toFixed(1) }))
    const diffsInWindow = storeDiffs.map((diff) => diff.changes)
    const startSnapshot = take ? take.snapshot : rewindSnapshot(endSnapshot, diffsInWindow)
    const firstState = rows.find((row) => row.lane === 'state')
    const editor = this.editor
    const instance = editor.getInstanceState()
    const header: RecorderHeader = {
      mode,
      startedAt: new Date(startWall).toISOString(),
      endedAt: new Date(endWall).toISOString(),
      startedAtWall: startWall,
      endedAtWall: endWall,
      durationMs: +(endT - startT).toFixed(1),
      windowMs: this.windowMs,
      note,
      url: typeof location === 'undefined' ? '' : location.href,
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      devicePixelRatio: typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio,
      viewport: typeof innerWidth === 'undefined' ? { w: 0, h: 0 } : { w: innerWidth, h: innerHeight },
      screenBounds: instance.screenBounds,
      camera: editor.getCamera(),
      pageId: editor.getCurrentPageId(),
      shapeCount: editor.getCurrentPageShapeIds().size,
      pathAtStart: take ? take.path : typeof firstState?.from === 'string' ? firstState.from : editor.getPath(),
      pathAtEnd: editor.getPath(),
      selectedAtStart: take ? take.selected : [],
      selectedAtEnd: editor.getSelectedShapeIds() as string[],
      recorderUptimeMs: +endT.toFixed(1),
      recorderCostMs: +this.costMs.toFixed(1),
      rowsDropped: this.dropped,
      windowId: safeWindowId(),
      environment: {
        locale: typeof navigator === 'undefined' ? '' : navigator.language,
        languages: typeof navigator === 'undefined' ? [] : navigator.languages,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: typeof navigator === 'undefined' ? '' : navigator.platform,
        hardwareConcurrency: typeof navigator === 'undefined' ? null : navigator.hardwareConcurrency || null,
        colorScheme: typeof document === 'undefined'
          ? ''
          : document.querySelector<HTMLElement>('.systemsketch-theme-root')?.dataset.ssColorScheme ?? '',
        theme: typeof document === 'undefined'
          ? ''
          : document.querySelector<HTMLElement>('.systemsketch-theme-root')?.dataset.ssTheme ?? '',
        interfaceScale: typeof document === 'undefined'
          ? ''
          : document.querySelector<HTMLElement>('[data-interface-scale]')?.dataset.interfaceScale ?? '',
        visibilityState: typeof document === 'undefined' ? '' : document.visibilityState,
      },
      performance: {
        longTasks: this.longTasks,
        maxLongTaskMs: +this.maxLongTaskMs.toFixed(1),
        rafStalls: this.rafStalls,
        maxRafGapMs: +this.maxRafGapMs.toFixed(1),
      },
    }
    this.take = null
    return { header, rows, details, storeDiffs, startSnapshot, endSnapshot }
  }

  /** Everything currently buffered, for tests and the indicator. */
  size(): { rows: number; diffs: number } {
    return { rows: this.rows.length, diffs: this.diffs.length }
  }

  private push(lane: RecorderLane, data: Record<string, unknown>): number {
    const t = +this.elapsed().toFixed(1)
    this.rows.push({ t, lane, ...data })
    if (this.rows.length % 64 === 0) this.trim()
    return t
  }

  private nextId(prefix: string): string {
    this.sequence += 1
    return `${prefix}-${String(this.sequence).padStart(6, '0')}`
  }

  private pushDetailed(
    lane: RecorderLane,
    kind: string,
    compact: Record<string, unknown>,
    data: Record<string, unknown>,
  ): number {
    const id = this.nextId(kind)
    const t = this.push(lane, { ...compact, detail: id })
    this.details.push({ id, t, lane, kind, data })
    return t
  }

  private trim(): void {
    // A take must keep its own start even when it is older than the window;
    // the UI caps a take at the window so this only matters at the boundary.
    const cutoff = Math.min(this.elapsed() - this.windowMs, this.take?.t ?? Number.POSITIVE_INFINITY)
    this.dropped += trimBefore(this.rows, cutoff)
    trimBefore(this.details, cutoff)
    trimBefore(this.diffs, cutoff)
  }

  private checkDerived(trigger: string): void {
    const path = this.editor.getPath()
    if (path !== this.lastPath) {
      this.push('state', { from: this.lastPath, to: path, trigger })
      this.lastPath = path
    }
    const menus = this.editor.menus.getOpenMenus().join(',')
    if (menus !== this.lastMenus) {
      this.push('menu', { open: menus ? menus.split(',') : [], trigger })
      this.lastMenus = menus
    }
  }

  private timed<T extends unknown[]>(fn: (...args: T) => void): (...args: T) => void {
    return (...args: T) => {
      const started = this.now()
      try {
        fn(...args)
      } finally {
        this.costMs += this.now() - started
      }
    }
  }
}

function stringifyArgument(value: unknown, limit = 400): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`.slice(0, limit)
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text.length > limit ? `${text.slice(0, limit - 1)}…` : text
  } catch {
    return String(value).slice(0, limit)
  }
}
